/**
 * Drawing Summary sheet parser (.xlsx / .csv).
 *
 * Finds the header row, maps columns by name (tolerant of spelling, case and
 * punctuation), reads the dimension unit from the L/W header ("L (in)",
 * "Length (mm)"), validates every row and, when the sheet carries its own
 * calculated columns (Cutting LF, DE&P LF, Sqft/Pc …), checks them against
 * the engine and reads each piece's DE&P edge rule back from them.
 *
 * Pure (no DB): the same function serves the preview and the final import.
 */
import ExcelJS from "exceljs";
import type { EdgeRule, LengthUnit } from "@/lib/engine/types";
import { FIELD_LABEL, type DrawingField, type ParseResult, type ParsedPiece, type ParsedRow } from "./drawing-fields";

export { FIELD_LABEL };
export type { DrawingField, ParseResult, ParsedPiece, ParsedRow };

/** Header spellings accepted for each field (compared after normalizing). */
const ALIASES: Record<DrawingField, string[]> = {
  dwgNo: ["dwg", "dwgno", "dwgnumber", "drawing", "drawingno", "drawingnumber"],
  group: ["group", "plangroup", "plan", "plans"],
  area: ["area", "room", "location"],
  pieceNo: ["piece", "pieceno", "pc", "pcno", "piecenumber"],
  description: ["description", "desc", "piecedescription"],
  length: ["l", "length", "len"],
  width: ["w", "width", "depth"],
  thickness: ["thickness", "thk"],
  color: ["color", "colour"],
  sinkModel: ["sinkmodel", "sinktype"],
  sinkCuts: ["sinkcuts", "sinkcut", "sinkcutouts", "sinkcutout", "sinks"],
  faucetHoles: ["faucetholes", "faucethole", "faucet", "faucets"],
  rCorners: ["rcorners", "rcorner", "radiuscorners", "radiuscorner"],
  joints: ["joints", "joint", "seams"],
  unitsQty: ["unitsqty", "unitqty", "qty", "quantity", "units"],
  notes: ["notes", "note", "remarks", "remark", "comments"],
  cuttingLf: ["cuttinglf", "cutting"],
  depLf: ["deplf", "dep", "edgepolishlf", "polishlf"],
  sqftPerPc: ["sqftpc", "sqftperpc", "sqftperpiece", "sqft"],
  totalPcs: ["totalpcs", "totalpieces"],
  totalSqft: ["totalsqft"],
};

const REQUIRED: DrawingField[] = ["dwgNo", "pieceNo", "description", "length", "width", "unitsQty"];

const UNIT_PATTERNS: [RegExp, LengthUnit][] = [
  [/\(\s*(in|inch|inches|")\s*\)/i, "IN"],
  [/\(\s*mm\s*\)/i, "MM"],
  [/\(\s*cm\s*\)/i, "CM"],
  [/\(\s*(ft|feet|')\s*\)/i, "FT"],
  [/\(\s*m\s*\)/i, "M"],
];

/** Length-unit divisor to feet, for checking the sheet's own LF/sqft columns. */
const FT_DIVISOR: Record<LengthUnit, number> = { IN: 12, MM: 304.8, CM: 30.48, FT: 1, M: 0.3048 };

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/\(.*?\)/g, "") // drop "(in)"
    .replace(/[^a-z0-9]/g, "");

type Grid = { name: string; cells: unknown[][] };

// ─── Reading ────────────────────────────────────────────────────────────────

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o || "formula" in o || "sharedFormula" in o) {
      // ExcelJS omits `result` when the cached value is 0.
      return o.result === undefined ? (o.formula || o.sharedFormula ? "0" : "") : cellText(o.result);
    }
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("").trim();
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return "";
  }
  return String(v).trim();
}

async function readXlsx(buffer: ArrayBuffer): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const cells: unknown[][] = [];
    const maxRow = Math.min(ws.rowCount, 5000);
    for (let r = 1; r <= maxRow; r++) {
      const row = ws.getRow(r);
      const values: unknown[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 60); c++) values.push(row.getCell(c).value);
      cells.push(values);
    }
    return { name: ws.name, cells };
  });
}

/** Minimal RFC-4180 CSV reader (quoted fields, "" escapes, CRLF). */
function readCsv(text: string): Grid[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return [{ name: "CSV", cells: rows }];
}

// ─── Header detection ───────────────────────────────────────────────────────

function matchField(header: string): DrawingField | null {
  const n = normalize(header);
  if (!n) return null;
  // Exact alias first, then longer aliases before short ones ("sqftpc" before "sqft").
  for (const [field, aliases] of Object.entries(ALIASES) as [DrawingField, string[]][]) {
    if (aliases.includes(n)) return field;
  }
  return null;
}

function findHeader(grid: Grid) {
  let best: { row: number; map: Map<number, DrawingField>; score: number } | null = null;
  for (let r = 0; r < Math.min(grid.cells.length, 30); r++) {
    const map = new Map<number, DrawingField>();
    const used = new Set<DrawingField>();
    grid.cells[r].forEach((v, c) => {
      const f = matchField(cellText(v));
      if (f && !used.has(f)) {
        map.set(c, f);
        used.add(f);
      }
    });
    const score = REQUIRED.filter((f) => used.has(f)).length * 10 + used.size;
    if (!best || score > best.score) best = { row: r, map, score };
  }
  return best;
}

// ─── Value parsing ──────────────────────────────────────────────────────────

/** Accepts 93.25, "93.25", "93 1/4", "1,234". */
function parseNumber(s: string): number | null {
  const t = s.replace(/,/g, "").replace(/["']/g, "").trim();
  if (t === "" || t === "-") return null;
  const mixed = /^(-?\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const optionalText = (s: string | undefined) => {
  const t = (s ?? "").trim();
  return t === "" ? null : t;
};

const near = (a: number, b: number) => Math.abs(a - b) <= 0.005 + 1e-6 * Math.abs(b);

// ─── Main ───────────────────────────────────────────────────────────────────

export async function parseDrawingSheet(fileName: string, data: ArrayBuffer): Promise<ParseResult> {
  const empty = (msg: string): ParseResult => ({
    ok: false,
    sheetName: null,
    headerRow: null,
    dimUnit: "IN",
    mapping: {},
    unmappedHeaders: [],
    rows: [],
    fileErrors: [msg],
    fileWarnings: [],
    validCount: 0,
    errorCount: 0,
  });

  let grids: Grid[];
  try {
    if (/\.csv$/i.test(fileName)) grids = readCsv(new TextDecoder("utf-8").decode(data).replace(/^﻿/, ""));
    else if (/\.xlsx$/i.test(fileName)) grids = await readXlsx(data);
    else return empty("Only .xlsx and .csv files can be imported. Save .xls files as .xlsx first.");
  } catch {
    return empty("The file could not be read. Check it is a valid, unprotected .xlsx or .csv file.");
  }

  // Prefer a sheet named like "Drawing Summary", else the best-scoring one.
  let chosen: { grid: Grid; header: NonNullable<ReturnType<typeof findHeader>> } | null = null;
  for (const grid of grids) {
    const header = findHeader(grid);
    if (!header) continue;
    const named = /drawing\s*summary/i.test(grid.name);
    if (!chosen || named || header.score > chosen.header.score) {
      chosen = { grid, header };
      if (named) break;
    }
  }
  if (!chosen) return empty("No sheet with a header row was found.");

  const { grid, header } = chosen;
  const fields = new Set(header.map.values());
  const missing = REQUIRED.filter((f) => !fields.has(f));
  const headerCells = grid.cells[header.row].map(cellText);
  const mapping: Partial<Record<DrawingField, string>> = {};
  for (const [c, f] of header.map) mapping[f] = headerCells[c];
  const unmappedHeaders = headerCells.filter((h, c) => h && !header.map.has(c));

  if (missing.length) {
    return {
      ...empty(
        `Required column(s) not found: ${missing.map((f) => FIELD_LABEL[f]).join(", ")}. ` +
          `The header row must contain Dwg#, Piece, Description, L, W and Units Qty.`,
      ),
      sheetName: grid.name,
      headerRow: header.row + 1,
      mapping,
      unmappedHeaders,
    };
  }

  // Dimension unit from the L / W headers.
  const fileWarnings: string[] = [];
  const unitOf = (h: string | undefined) => UNIT_PATTERNS.find(([re]) => re.test(h ?? ""))?.[1] ?? null;
  const lUnit = unitOf(mapping.length);
  const wUnit = unitOf(mapping.width);
  let dimUnit: LengthUnit = lUnit ?? wUnit ?? "IN";
  if (!lUnit && !wUnit) fileWarnings.push('No unit in the L / W headers — assumed inches. Write e.g. "L (mm)" for millimetres.');
  if (lUnit && wUnit && lUnit !== wUnit) {
    return { ...empty(`L is in ${lUnit} but W is in ${wUnit}; both must use the same unit.`), sheetName: grid.name, mapping };
  }
  dimUnit = lUnit ?? wUnit ?? "IN";
  const ftDiv = FT_DIVISOR[dimUnit];

  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();

  for (let r = header.row + 1; r < grid.cells.length; r++) {
    const raw: Partial<Record<DrawingField, string>> = {};
    for (const [c, f] of header.map) raw[f] = cellText(grid.cells[r][c]);
    const values = Object.values(raw).filter(Boolean);
    if (values.length === 0) continue; // blank row
    const isTotal = Object.values(raw).some((v) => /^total\b/i.test(v ?? "")) && !raw.pieceNo;
    if (isTotal) continue; // totals row
    if (!raw.dwgNo && !raw.pieceNo && !raw.description && !raw.length) continue; // stray note line

    const errors: string[] = [];
    const warnings: string[] = [];
    const rowNumber = r + 1;

    const req = (f: DrawingField) => {
      if (!raw[f]) errors.push(`${FIELD_LABEL[f]} is empty.`);
      return raw[f] ?? "";
    };
    const dwgNo = req("dwgNo");
    const pieceNo = req("pieceNo");
    const description = req("description");

    const positive = (f: "length" | "width") => {
      const n = parseNumber(raw[f] ?? "");
      if (n === null) errors.push(`${FIELD_LABEL[f]} "${raw[f] ?? ""}" is not a number.`);
      else if (n <= 0) errors.push(`${FIELD_LABEL[f]} must be greater than 0.`);
      else if (n > 100000) errors.push(`${FIELD_LABEL[f]} ${n} looks wrong (too large).`);
      return n ?? 0;
    };
    const length = positive("length");
    const width = positive("width");

    const count = (f: "sinkCuts" | "faucetHoles" | "rCorners" | "joints" | "unitsQty", required = false) => {
      const s = raw[f] ?? "";
      if (s === "" || s === "-") {
        if (required) errors.push(`${FIELD_LABEL[f]} is empty.`);
        return 0;
      }
      const n = parseNumber(s);
      if (n === null || !Number.isInteger(n) || n < 0) {
        errors.push(`${FIELD_LABEL[f]} "${s}" must be a whole number, 0 or more.`);
        return 0;
      }
      return n;
    };
    const unitsQty = count("unitsQty", true);
    if (raw.unitsQty && unitsQty === 0 && errors.length === 0) warnings.push("Units Qty is 0 — this piece adds nothing.");
    const sinkCuts = count("sinkCuts");
    const faucetHoles = count("faucetHoles");
    const rCorners = count("rCorners");
    const joints = count("joints");

    // DE&P rule: read back from the sheet's own DE&P LF when present.
    let depRule: EdgeRule = "ONE_LENGTH_ONE_WIDTH";
    const sheetDep = raw.depLf ? parseNumber(raw.depLf) : null;
    if (errors.length === 0) {
      if (sheetDep !== null) {
        if (near(sheetDep, (2 * (length + width)) / ftDiv)) depRule = "FULL_PERIMETER";
        else if (near(sheetDep, (length + width) / ftDiv)) depRule = "ONE_LENGTH_ONE_WIDTH";
        else if (near(sheetDep, 0)) depRule = "NONE";
        else
          warnings.push(
            `DE&P LF in the sheet (${sheetDep}) is neither full perimeter nor one L + one W — set to one L + one W; check the edge rule.`,
          );
      } else if (/island/i.test(description)) {
        depRule = "FULL_PERIMETER";
        warnings.push("No DE&P LF column — island top set to full-perimeter DE&P (sheet rule). Check.");
      }

      // Check the sheet's other calculated columns.
      const checks: [DrawingField, number][] = [
        ["cuttingLf", (2 * (length + width)) / ftDiv],
        ["sqftPerPc", (length * width) / (ftDiv * ftDiv)],
        ["totalPcs", unitsQty],
        ["totalSqft", ((length * width) / (ftDiv * ftDiv)) * unitsQty],
      ];
      for (const [f, expected] of checks) {
        const s = raw[f];
        if (!s) continue;
        const got = parseNumber(s);
        if (got !== null && !near(got, expected)) {
          warnings.push(`${FIELD_LABEL[f]} in the sheet is ${got}, the system calculates ${+expected.toFixed(4)}. The system value is used.`);
        }
      }
    }

    const key = `${raw.group ?? ""}|${dwgNo}|${pieceNo}`.toLowerCase();
    if (seen.has(key)) warnings.push(`Same Group / Dwg# / Piece as row ${seen.get(key)}.`);
    else seen.set(key, rowNumber);

    rows.push({
      rowNumber,
      raw,
      errors,
      warnings,
      piece:
        errors.length > 0
          ? null
          : {
              dwgNo,
              group: optionalText(raw.group),
              area: optionalText(raw.area),
              pieceNo,
              description,
              length,
              width,
              dimUnit,
              thickness: optionalText(raw.thickness),
              color: optionalText(raw.color),
              sinkModel: optionalText(raw.sinkModel),
              sinkCuts,
              faucetHoles,
              rCorners,
              joints,
              unitsQty,
              cuttingRule: "FULL_PERIMETER",
              depRule,
              notes: optionalText(raw.notes),
            },
    });
  }

  const validCount = rows.filter((r) => r.piece).length;
  const fileErrors: string[] = [];
  if (rows.length === 0) fileErrors.push("The sheet has a header row but no data rows.");

  return {
    ok: fileErrors.length === 0 && validCount > 0,
    sheetName: grid.name,
    headerRow: header.row + 1,
    dimUnit,
    mapping,
    unmappedHeaders,
    rows,
    fileErrors,
    fileWarnings,
    validCount,
    errorCount: rows.length - validCount,
  };
}

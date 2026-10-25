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
import { DEFAULT_EDGE_RULES, type EdgeDefaults } from "@/lib/reference/standard-formulas";
import {
  CALC_FIELDS,
  FIELD_LABEL,
  GENERATABLE_FIELDS,
  REQUIRED_FIELDS,
  type CalcField,
  type DrawingField,
  type GeneratableField,
  type MappingOverrides,
  type ParseResult,
  type ParsedPiece,
  type ParsedRow,
  type SheetColumn,
} from "./drawing-fields";

export { FIELD_LABEL };
export type { DrawingField, MappingOverrides, ParseResult, ParsedPiece, ParsedRow, SheetColumn };

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

export type Grid = { name: string; cells: unknown[][] };

// ─── Reading ────────────────────────────────────────────────────────────────

export function cellText(v: unknown): string {
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

export async function readXlsx(buffer: ArrayBuffer): Promise<Grid[]> {
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
export function readCsv(text: string): Grid[] {
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

// ─── Header detection & column mapping ──────────────────────────────────────

/**
 * Word sets that identify a field when the header is not a known spelling,
 * e.g. "Unit Type / Group" → group, "Sqft / Piece" → Sqft/Pc. The most
 * specific match wins; a tie means the column is ambiguous and the user is asked.
 */
const TOKEN_ALTS: Record<DrawingField, string[][]> = {
  dwgNo: [["dwg"], ["drawing"], ["drg"], ["dwg", "no"], ["drawing", "no"], ["drawing", "number"], ["sheet", "no"]],
  group: [["group"], ["plan"], ["unit", "type"], ["plan", "type"], ["plan", "group"]],
  area: [["area"], ["room"], ["location"], ["space"]],
  pieceNo: [["piece"], ["pc"], ["piece", "no"], ["pc", "no"], ["piece", "id"], ["piece", "number"], ["mark"]],
  description: [["description"], ["desc"], ["item"], ["piece", "description"], ["item", "description"]],
  length: [["l"], ["length"], ["len"]],
  width: [["w"], ["width"], ["depth"]],
  thickness: [["thickness"], ["thk"], ["thick"]],
  color: [["color"], ["colour"], ["material", "color"]],
  sinkModel: [["sink", "model"], ["sink", "type"], ["sink", "make"]],
  sinkCuts: [["sinks"], ["sink", "cut"], ["sink", "cuts"], ["sink", "cutout"], ["sink", "cutouts"]],
  faucetHoles: [["faucet"], ["faucets"], ["faucet", "hole"], ["faucet", "holes"]],
  rCorners: [["r", "corner"], ["r", "corners"], ["rcorner"], ["rcorners"], ["radius"], ["radius", "corners"], ["corners"]],
  joints: [["joint"], ["joints"], ["seam"], ["seams"]],
  unitsQty: [["qty"], ["quantity"], ["units"], ["units", "qty"], ["unit", "qty"], ["no", "of", "units"]],
  notes: [["notes"], ["note"], ["remarks"], ["remark"], ["comments"], ["comment"]],
  cuttingLf: [["cutting"], ["cutting", "lf"], ["cut", "lf"]],
  depLf: [["dep"], ["dep", "lf"], ["edge", "polish"], ["polish"], ["polish", "lf"]],
  sqftPerPc: [["sqft", "pc"], ["sqft", "piece"], ["sqft", "per", "pc"], ["sqft", "per", "piece"], ["sq", "ft", "pc"], ["sq", "ft", "piece"]],
  totalPcs: [["total", "pcs"], ["total", "pieces"], ["total", "pc"]],
  totalSqft: [["total", "sqft"], ["total", "sq", "ft"], ["total", "area"]],
};

const tokens = (header: string) =>
  header
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop "(in)"
    .replace(/de\s*&\s*p/g, "dep")
    .replace(/sq\.?\s*ft/g, "sqft")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

function matchField(header: string): DrawingField | null {
  const n = normalize(header);
  if (!n) return null;
  for (const [field, aliases] of Object.entries(ALIASES) as [DrawingField, string[]][]) {
    if (aliases.includes(n)) return field;
  }
  return null;
}

/**
 * Fields whose word set appears in the header. The most specific match wins
 * ("Sqft / Piece" is Sqft/Pc, not Piece). When the best matches tie — or one
 * of them is a field another column already holds ("Joint DE&P (in)" next to
 * "Joints") — the header mentions more than one thing: `ambiguous` is set and
 * the user is asked. Fields already held are never offered again.
 */
function fuzzyCandidates(header: string, taken: Set<DrawingField>): { fields: DrawingField[]; ambiguous: boolean } {
  const t = new Set(tokens(header));
  const scored: { field: DrawingField; score: number }[] = [];
  for (const [field, alts] of Object.entries(TOKEN_ALTS) as [DrawingField, string[][]][]) {
    const best = Math.max(0, ...alts.filter((a) => a.every((w) => t.has(w))).map((a) => a.length));
    if (best > 0) scored.push({ field, score: best });
  }
  if (scored.length === 0) return { fields: [], ambiguous: false };
  const top = Math.max(...scored.map((s) => s.score));
  const best = scored.filter((s) => s.score === top).map((s) => s.field);
  const free = best.filter((f) => !taken.has(f));
  return { fields: free, ambiguous: best.length > 1 && free.length > 0 };
}

function findHeader(grid: Grid) {
  let best: { row: number; score: number } | null = null;
  for (let r = 0; r < Math.min(grid.cells.length, 30); r++) {
    const used = new Set<DrawingField>();
    let fuzzy = 0;
    for (const v of grid.cells[r]) {
      const h = cellText(v);
      const f = matchField(h);
      if (f) used.add(f);
      else if (h && h.length < 40 && fuzzyCandidates(h, used).fields.length) fuzzy++;
    }
    const score = REQUIRED_FIELDS.filter((f) => used.has(f)).length * 10 + used.size + fuzzy * 0.5;
    if (used.size + fuzzy >= 2 && (!best || score > best.score)) best = { row: r, score };
  }
  return best;
}

/** Map every header cell to a field, apply the user's answers, and list what is still open. */
function mapColumns(headerCells: string[], overrides: MappingOverrides) {
  const columns: SheetColumn[] = [];
  const taken = new Set<DrawingField>();
  headerCells.forEach((header, index) => {
    if (!header) return;
    const f = matchField(header);
    if (f && !taken.has(f)) {
      taken.add(f);
      columns.push({ index, header, field: f, match: "exact", candidates: [] });
    } else columns.push({ index, header, field: null, match: "extra", candidates: [] });
  });
  // Words-based recognition for the rest; two columns claiming one field are both ambiguous.
  const claims = new Map<DrawingField, SheetColumn[]>();
  for (const c of columns) {
    if (c.field) continue;
    const { fields, ambiguous } = fuzzyCandidates(c.header, taken);
    c.candidates = fields;
    if (ambiguous) c.match = "ambiguous";
    else if (fields.length === 1) claims.set(fields[0], [...(claims.get(fields[0]) ?? []), c]);
  }
  for (const [field, cols] of claims) {
    if (cols.length === 1) {
      cols[0].field = field;
      cols[0].match = "auto";
      taken.add(field);
    } else cols.forEach((c) => ((c.match = "ambiguous"), (c.candidates = [...new Set([...c.candidates, field])])));
  }
  // User's answers win.
  for (const [key, choice] of Object.entries(overrides.columns ?? {})) {
    const col = columns.find((c) => c.index === Number(key));
    if (!col) continue;
    if (choice === "extra") {
      col.field = null;
      col.match = "extra";
      continue;
    }
    for (const other of columns) {
      if (other !== col && other.field === choice) {
        other.field = null;
        other.match = "extra";
      }
    }
    col.field = choice;
    col.match = "manual";
  }
  return columns;
}

// ─── Value parsing ──────────────────────────────────────────────────────────

/** Accepts 93.25, "93.25", "93 1/4", "1,234". */
export function parseNumber(s: string): number | null {
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

export interface ParseOptions {
  overrides?: MappingOverrides;
  /** Edge rules from the stored standard formulas (Cutting LF, DE&P LF, island DE&P). */
  edgeDefaults?: EdgeDefaults;
}

const OPTIONAL_STANDARD: DrawingField[] = ["group", "area", "thickness", "color", "sinkModel", "sinkCuts", "faucetHoles", "rCorners", "joints", "notes"];

export async function parseDrawingSheet(fileName: string, data: ArrayBuffer, options: ParseOptions = {}): Promise<ParseResult> {
  const overrides = options.overrides ?? {};
  const edge = options.edgeDefaults ?? DEFAULT_EDGE_RULES;
  const empty = (msg: string): ParseResult => ({
    ok: false,
    sheetName: null,
    headerRow: null,
    dimUnit: "IN",
    mapping: {},
    unmappedHeaders: [],
    columns: [],
    missingRequired: [],
    generated: [],
    addedDefaults: [],
    needsMapping: false,
    rows: [],
    fileErrors: msg ? [msg] : [],
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
  const headerCells = grid.cells[header.row].map(cellText);
  const columns = mapColumns(headerCells, overrides);
  const byField = new Map<DrawingField, SheetColumn>();
  for (const c of columns) if (c.field) byField.set(c.field, c);
  const mapping: Partial<Record<DrawingField, string>> = {};
  for (const [f, c] of byField) mapping[f] = c.header;

  // Extra columns keep their own header; repeated headers get " (2)", " (3)".
  const extraCols = columns.filter((c) => !c.field);
  const extraKey = new Map<number, string>();
  const seenKeys = new Map<string, number>();
  for (const c of extraCols) {
    const n = (seenKeys.get(c.header) ?? 0) + 1;
    seenKeys.set(c.header, n);
    extraKey.set(c.index, n === 1 ? c.header : `${c.header} (${n})`);
  }
  const unmappedHeaders = extraCols.map((c) => extraKey.get(c.index)!);

  // Required fields: Units Qty can come from the sheet's Total Pcs (S = O);
  // Piece and Description can be generated when the user agrees.
  const fileWarnings: string[] = [];
  const generated = GENERATABLE_FIELDS.filter((f) => !byField.has(f) && overrides.generate?.includes(f));
  let qtyFromTotalPcs = false;
  if (!byField.has("unitsQty") && byField.has("totalPcs")) {
    qtyFromTotalPcs = true;
    fileWarnings.push(`No Units Qty column — Units Qty taken from "${mapping.totalPcs}" (Total Pcs = Units Qty). Check.`);
  }
  const missingRequired = REQUIRED_FIELDS.filter(
    (f) => !byField.has(f) && !(f === "unitsQty" && qtyFromTotalPcs) && !generated.includes(f as GeneratableField),
  );
  const ambiguous = columns.filter((c) => c.match === "ambiguous");
  const needsMapping = missingRequired.length > 0 || ambiguous.length > 0;
  const addedDefaults = OPTIONAL_STANDARD.filter((f) => !byField.has(f));
  for (const f of generated) {
    fileWarnings.push(
      f === "pieceNo"
        ? "No Piece column — pieces are numbered 1, 2, 3 … within each Dwg#. Check against the drawings."
        : "No Description column — description set from Area (or “Piece n”). Check against the drawings.",
    );
  }

  const base = {
    sheetName: grid.name,
    headerRow: header.row + 1,
    mapping,
    unmappedHeaders,
    columns,
    missingRequired,
    generated,
    addedDefaults,
    needsMapping,
  };
  if (missingRequired.length) return { ...empty(""), ...base, fileWarnings };

  // Dimension unit from the L / W headers.
  const unitOf = (h: string | undefined) => UNIT_PATTERNS.find(([re]) => re.test(h ?? ""))?.[1] ?? null;
  const lUnit = unitOf(mapping.length);
  const wUnit = unitOf(mapping.width);
  if (!lUnit && !wUnit) fileWarnings.push('No unit in the L / W headers — assumed inches. Write e.g. "L (mm)" for millimetres.');
  if (lUnit && wUnit && lUnit !== wUnit) {
    return { ...empty(`L is in ${lUnit} but W is in ${wUnit}; both must use the same unit.`), ...base };
  }
  const dimUnit: LengthUnit = lUnit ?? wUnit ?? "IN";
  const ftDiv = FT_DIVISOR[dimUnit];

  const rows: ParsedRow[] = [];
  const seen = new Map<string, number>();
  const pieceSeq = new Map<string, number>();

  for (let r = header.row + 1; r < grid.cells.length; r++) {
    const raw: Partial<Record<DrawingField, string>> = {};
    for (const [f, c] of byField) raw[f] = cellText(grid.cells[r][c.index]);
    const extra: Record<string, string> = {};
    for (const c of extraCols) {
      const v = cellText(grid.cells[r][c.index]);
      if (v) extra[extraKey.get(c.index)!] = v;
    }
    const all = [...Object.values(raw), ...Object.values(extra)];
    if (all.filter(Boolean).length === 0) continue; // blank row
    if (all.some((v) => /^total\b/i.test(v ?? "")) && !raw.pieceNo) continue; // totals row
    if (!raw.dwgNo && !raw.pieceNo && !raw.description && !raw.length) continue; // stray note line
    if (qtyFromTotalPcs) raw.unitsQty = raw.totalPcs;

    const errors: string[] = [];
    const warnings: string[] = [];
    const rowNumber = r + 1;

    const req = (f: DrawingField) => {
      if (!raw[f]) errors.push(`${FIELD_LABEL[f]} is empty.`);
      return raw[f] ?? "";
    };
    const dwgNo = req("dwgNo");
    let pieceNo: string;
    if (generated.includes("pieceNo")) {
      const n = (pieceSeq.get(dwgNo) ?? 0) + 1;
      pieceSeq.set(dwgNo, n);
      pieceNo = String(n);
    } else pieceNo = req("pieceNo");
    const description = generated.includes("description") ? raw.area || `Piece ${pieceNo}` : req("description");

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

    // The sheet's own calculated columns, kept per piece for traceability.
    const sheetValues: Partial<Record<CalcField, number>> = {};
    for (const f of CALC_FIELDS) {
      if (f === "totalPcs" && qtyFromTotalPcs) continue;
      const v = raw[f] ? parseNumber(raw[f]!) : null;
      if (v !== null) sheetValues[f] = v;
    }

    // DE&P rule: read back from the sheet's own DE&P LF when present, else the
    // stored standard formula (island tops use the island DE&P formula).
    const isIsland = /island/i.test(description);
    const cuttingRule: EdgeRule = edge.cuttingRule;
    let depRule: EdgeRule = isIsland ? edge.islandDepRule : edge.depRule;
    const sheetDep = sheetValues.depLf ?? null;
    if (errors.length === 0) {
      if (sheetDep !== null) {
        if (near(sheetDep, (2 * (length + width)) / ftDiv)) depRule = "FULL_PERIMETER";
        else if (near(sheetDep, (length + width) / ftDiv)) depRule = "ONE_LENGTH_ONE_WIDTH";
        else if (near(sheetDep, 0)) depRule = "NONE";
        else
          warnings.push(
            `DE&P LF in the sheet (${sheetDep}) is neither full perimeter nor one L + one W — the standard formula is used; check the edge rule.`,
          );
      } else if (isIsland && depRule === "FULL_PERIMETER") {
        warnings.push("No DE&P LF column — island top set to full-perimeter DE&P (standard formula). Check.");
      }

      // Check the sheet's other calculated columns against the standard formulas.
      const cutExpected =
        cuttingRule === "FULL_PERIMETER" ? (2 * (length + width)) / ftDiv : cuttingRule === "ONE_LENGTH_ONE_WIDTH" ? (length + width) / ftDiv : 0;
      const checks: [CalcField, number][] = [
        ["cuttingLf", cutExpected],
        ["sqftPerPc", (length * width) / (ftDiv * ftDiv)],
        ["totalPcs", unitsQty],
        ["totalSqft", ((length * width) / (ftDiv * ftDiv)) * unitsQty],
      ];
      for (const [f, expected] of checks) {
        const got = sheetValues[f];
        if (got !== undefined && !near(got, expected)) {
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
              cuttingRule,
              depRule,
              notes: optionalText(raw.notes),
              extra: Object.keys(extra).length ? extra : null,
              sheetValues: Object.keys(sheetValues).length ? sheetValues : null,
            },
    });
  }

  const validCount = rows.filter((r) => r.piece).length;
  const fileErrors: string[] = [];
  if (rows.length === 0) fileErrors.push("The sheet has a header row but no data rows.");

  return {
    ...base,
    ok: fileErrors.length === 0 && validCount > 0 && !needsMapping,
    dimUnit,
    rows,
    fileErrors,
    fileWarnings,
    validCount,
    errorCount: rows.length - validCount,
  };
}

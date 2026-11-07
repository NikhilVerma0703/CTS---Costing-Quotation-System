/**
 * Reads uploaded sheets (.xlsx / .csv) into a project.
 *
 * Everything is found by header or label, not by fixed cell, because the
 * reference workbooks arrange the same data differently: "Unit Type" vs "Group",
 * "Width/Depth" vs "L/W", one rate table vs two, slab results in Variables vs in
 * Slab Calculation. A full workbook works too: Slab Calculation and Project
 * Summary are read when they are there.
 *
 * Only inputs are taken. Calculated cells are used just to learn a rule (which
 * edges a typed LF runs along), never as results.
 */
import ExcelJS from "exceljs";
import { calculate } from "./engine";
import { parseNumber } from "./format";
import { COST_KEYS, COST_LABEL, UNITS_PER_FOOT, emptyProject, newId, type ColumnKey, type Container, type CostKey, type DimUnit, type EdgeRule, type Piece, type ProjectData, type RateRow, type SheetKey, type SlabDriver, type Variables } from "./model";
import { differentProjects, projectTitle, tellsProject } from "./quote-details";

export { parseNumber };

export interface UploadFile {
  name: string;
  data: ArrayBuffer;
}

export type Required = "length" | "width" | "qty";

export interface ImportResult {
  data?: ProjectData;
  errors: string[];
  /** The sheet is readable but a needed column could not be recognised: the user picks it. */
  mappingNeeded?: { headers: { index: number; text: string }[]; missing: Required[] };
  /** The upload held no Variables sheet, so options.fallback was used. */
  usedFallback?: boolean;
}

export interface ImportOptions {
  name?: string;
  /** Used when no Variables sheet is uploaded. */
  fallback: Variables;
  fallbackLabel?: string;
  /** The fallback is this same project's own variables: use them as they are, slab inputs and all. */
  fallbackFits?: boolean;
  /** Answers to mappingNeeded: required field → column index. */
  mapping?: Partial<Record<Required, number>>;
}

// ─── Reading cells ──────────────────────────────────────────────────────────

/** `edited`: this tool's own export marked the cell as typed over by hand. */
type Cell = { v: string | number | null; f: string | null; edited?: boolean };
/** `clipped`: the sheet was larger than what is read (MAX_ROWS, MAX_COLS). */
type Grid = { name: string; rows: Cell[][]; clipped?: boolean };
const EMPTY: Cell = { v: null, f: null };
const MAX_ROWS = 5000;
const MAX_COLS = 60;

function primitive(raw: unknown): string | number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") return raw.trim() === "" ? null : raw.trim();
  if (typeof raw === "boolean") return raw ? "TRUE" : "FALSE";
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.richText)) return primitive((o.richText as { text: string }[]).map((t) => t.text).join(""));
    if ("text" in o) return primitive(o.text);
    if ("result" in o) return primitive(o.result);
  }
  return null;
}

function readCell(c: ExcelJS.Cell): Cell {
  if (c.type === ExcelJS.ValueType.Merge) return EMPTY;
  const raw = c.value as unknown;
  if (raw && typeof raw === "object" && ("formula" in raw || "sharedFormula" in raw)) {
    return { v: primitive((raw as { result?: unknown }).result), f: String(c.formula ?? "") };
  }
  const note = c.note as unknown;
  const noteText = typeof note === "string" ? note : ((note as { texts?: { text: string }[] } | undefined)?.texts ?? []).map((t) => t.text).join("");
  return { v: primitive(raw), f: null, ...(noteText.startsWith("Edited by hand") ? { edited: true } : {}) };
}

async function readXlsx(data: ArrayBuffer): Promise<Grid[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);
  return wb.worksheets.map((ws) => {
    const rows: Cell[][] = [];
    const maxCol = Math.min(ws.columnCount, MAX_COLS);
    for (let r = 1; r <= Math.min(ws.rowCount, MAX_ROWS); r++) {
      const row = ws.getRow(r);
      const cells: Cell[] = [];
      for (let c = 1; c <= maxCol; c++) cells.push(readCell(row.getCell(c)));
      rows.push(cells);
    }
    return { name: ws.name, rows, clipped: ws.rowCount > MAX_ROWS || ws.columnCount > MAX_COLS };
  });
}

/** Minimal RFC-4180 CSV reader: quoted fields, "" escapes, CRLF. */
function readCsv(text: string): Grid[] {
  const rows: Cell[][] = [];
  let field = "";
  let row: Cell[] = [];
  let quoted = false;
  const push = () => {
    const t = field.trim();
    const n = t === "" ? NaN : Number(t.replace(/,/g, ""));
    row.push({ v: t === "" ? null : Number.isFinite(n) ? n : t, f: null });
    field = "";
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") push();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length) {
    push();
    rows.push(row);
  }
  return [{ name: "CSV", rows }];
}

async function readFile(file: UploadFile): Promise<Grid[]> {
  if (/\.csv$/i.test(file.name)) return readCsv(new TextDecoder("utf-8").decode(file.data).replace(/^﻿/, ""));
  if (/\.xlsx$/i.test(file.name)) return readXlsx(file.data);
  throw new Error(`${file.name}: only .xlsx and .csv files can be read. Save .xls files as .xlsx first.`);
}

const textOf = (c: Cell | undefined) => (c?.v === null || c?.v === undefined ? "" : String(c.v));

const numOf = (c: Cell | undefined) => parseNumber(c?.v ?? null);
/** A typed number: a formula's result is not an input. */
const typedNum = (c: Cell | undefined) => (c && !c.f ? numOf(c) : null);

function titleOf(g: Grid | undefined) {
  return g ? textOf(g.rows[0]?.find((c) => c.v !== null)) : "";
}

/** The explanatory line under a sheet's title. */
function subtitleOf(g: Grid | undefined) {
  const row = g?.rows[1];
  if (!row) return "";
  const cells = row.filter((c) => c.v !== null);
  return cells.length === 1 && typeof cells[0].v === "string" ? cells[0].v : "";
}

// ─── Drawing Summary ────────────────────────────────────────────────────────

type DrawingField = Exclude<ColumnKey, "depIn" | "jointDepIn"> | "depth" | "depIn" | "jointDepIn" | "cutLf" | "depLf" | "sqftPerPc" | "totalPcs" | "totalSqft";

function fieldOfHeader(header: string): DrawingField | null {
  const h = header.toLowerCase().replace(/\s+/g, " ").trim();
  const bare = h.replace(/\(.*?\)/g, "").trim();
  if (!bare) return null;
  if (/joint\s*de\s*&\s*p/.test(h)) return "jointDepIn";
  if (/^de\s*&\s*p\b/.test(h)) return /\((in|inch|inches|mm|cm)\)/.test(h) ? "depIn" : "depLf";
  if (/edge\s*polish|^polish/.test(h)) return "depLf";
  if (/^cut(ting)?\b/.test(h)) return "cutLf";
  if (/^sq\.?\s*ft\s*\/?\s*(per\s*)?(pc|piece)/.test(bare)) return "sqftPerPc";
  if (/^total\s*sq/.test(bare)) return "totalSqft";
  if (/^total\s*(pcs|pieces|pc)\b/.test(bare)) return "totalPcs";
  if (/^(dwg|drg|drawing)\b/.test(bare)) return "dwg";
  if (/^(group|unit\s*type|plan(\s*(group|type))?|plans)\b/.test(bare)) return "group";
  if (/^(area|room|location|space)$/.test(bare)) return "area";
  if (/^(piece|pc|mark)(\s*(no\.?|#|id|number))?$/.test(bare)) return "piece";
  if (/^(description|desc|item)\b/.test(bare)) return "description";
  if (/^(l|len|length)$/.test(bare)) return "length";
  if (/^(w|width)$/.test(bare)) return "width";
  if (/^depth$/.test(bare)) return "depth";
  if (/^(thickness|thick|thk)$/.test(bare)) return "thickness";
  if (/^(material\s*)?colou?r$/.test(bare)) return "color";
  if (/^sink\s*(model|type|make)/.test(bare)) return "sinkModel";
  if (/^sinks?(\s*(cut|cuts|cutout|cutouts))?$/.test(bare)) return "sinkCuts";
  if (/^faucet/.test(bare)) return "faucetHoles";
  if (/^r\s*-?\s*corners?$|^radius/.test(bare)) return "rCorners";
  if (/^(joints?|seams?)$/.test(bare)) return "joints";
  if (/^(units?\s*qty|qty|quantity|units|no\.?\s*of\s*units)$/.test(bare)) return "qty";
  if (/^(notes?|remarks?|comments?)$/.test(bare)) return "notes";
  return null;
}

function findHeaderRow(g: Grid): { row: number; fields: Map<DrawingField, number>; score: number } | null {
  let best: { row: number; fields: Map<DrawingField, number>; score: number } | null = null;
  for (let r = 0; r < Math.min(g.rows.length, 30); r++) {
    const fields = new Map<DrawingField, number>();
    g.rows[r].forEach((c, i) => {
      if (typeof c.v !== "string") return;
      const f = fieldOfHeader(c.v);
      if (f && !fields.has(f)) fields.set(f, i);
    });
    const hasSize = fields.has("length") || fields.has("width") || fields.has("depth");
    if (fields.size >= 3 && (!best || fields.size + (hasSize ? 10 : 0) > best.score)) best = { row: r, fields, score: fields.size + (hasSize ? 10 : 0) };
  }
  return best;
}

const unitFromHeader = (h: string): DimUnit | null =>
  /\(\s*(in|inch|inches|")\s*\)/i.test(h) ? "in" : /\(\s*mm\s*\)/i.test(h) ? "mm" : /\(\s*cm\s*\)/i.test(h) ? "cm" : /\(\s*(ft|feet)\s*\)/i.test(h) ? "ft" : /\(\s*m\s*\)/i.test(h) ? "m" : null;

/** Which edges a typed LF runs along. A figure rounded in the sheet is kept as typed, so costs reproduce exactly. */
export function inferEdge(lf: number, L: number, W: number, perFoot: number): { rule: EdgeRule; typed: number | null } {
  const candidates: [EdgeRule, number][] = [
    ["perimeter", (2 * (L + W)) / perFoot],
    ["l+w", (L + W) / perFoot],
    ["l", L / perFoot],
    ["w", W / perFoot],
  ];
  for (const [rule, x] of candidates) if (Math.abs(lf - x) < 1e-9) return { rule, typed: null };
  for (const [rule, x] of candidates) if (Math.abs(lf - x) <= 0.006) return { rule, typed: lf };
  return { rule: "manual", typed: lf };
}

function edgeFromCell(c: Cell | undefined, L: number, W: number, perFoot: number, fallback: EdgeRule): { rule: EdgeRule; typed: number | null } {
  if (!c) return { rule: fallback, typed: null };
  const n = numOf(c);
  if (n !== null) return inferEdge(n, L, W, perFoot);
  // A formula saved without its result: read the shape of the formula.
  if (c.f) return { rule: /^=?\s*2\s*\*/.test(c.f) ? "perimeter" : /\+/.test(c.f) ? "l+w" : fallback, typed: null };
  return { rule: fallback, typed: null };
}

interface ParsedDrawing {
  pieces: Piece[];
  dimUnit: DimUnit;
  labels: ProjectData["labels"];
  show: ProjectData["show"];
  extraColumns: string[];
  warnings: string[];
}

function parseDrawing(g: Grid, mapping: ImportOptions["mapping"]): ParsedDrawing | { mappingNeeded: NonNullable<ImportResult["mappingNeeded"]> } | { error: string } {
  const header = findHeaderRow(g);
  if (!header) return { error: `No Drawing Summary header row was found on sheet "${g.name}".` };
  const fields = new Map(header.fields);
  for (const [f, i] of Object.entries(mapping ?? {})) if (i !== undefined) fields.set(f as DrawingField, i);
  // Width × Depth sheets: Width is the long side, in the L position.
  if (!fields.has("length") && fields.has("width") && fields.has("depth")) {
    fields.set("length", fields.get("width")!);
    fields.set("width", fields.get("depth")!);
  } else if (fields.has("length") && !fields.has("width") && fields.has("depth")) fields.set("width", fields.get("depth")!);

  const missing: Required[] = [];
  if (!fields.has("length")) missing.push("length");
  if (!fields.has("width")) missing.push("width");
  if (!fields.has("qty") && !fields.has("totalPcs")) missing.push("qty");
  const headerRow = g.rows[header.row];
  if (missing.length) {
    return { mappingNeeded: { headers: headerRow.flatMap((c, index) => (c.v === null ? [] : [{ index, text: String(c.v) }])), missing } };
  }

  const claimed = new Set(fields.values());
  const headerOf = (f: DrawingField) => textOf(headerRow[fields.get(f)!]);
  const dimUnit = unitFromHeader(headerOf("length")) ?? unitFromHeader(headerOf("width")) ?? "in";
  const perFoot = UNITS_PER_FOOT[dimUnit];
  const labels: ProjectData["labels"] = {};
  for (const key of ["dwg", "group", "area", "piece", "description", "length", "width", "thickness", "color", "sinkModel", "sinkCuts", "faucetHoles", "rCorners", "joints", "qty", "depIn", "jointDepIn", "notes"] as ColumnKey[]) {
    if (fields.has(key)) labels[key] = headerOf(key);
  }
  // A DE&P length column has its own unit. It is converted on the way in, and shown in the unit of the sizes.
  const depInUnit = fields.has("depIn") ? unitFromHeader(headerOf("depIn")) ?? dimUnit : dimUnit;
  if (depInUnit !== dimUnit) labels.depIn = `DE&P (${dimUnit})`;
  const extras = headerRow.flatMap((c, i) => (c.v !== null && !claimed.has(i) ? [{ i, name: String(c.v) }] : []));

  const warnings: string[] = [];
  if (g.clipped) warnings.push(`"${g.name}" is larger than ${MAX_ROWS} rows or ${MAX_COLS} columns: only that much was read.`);
  if (!fields.has("cutLf")) warnings.push("No Cutting LF column in this sheet, so Cutting LF is taken as 2(L+W) on every piece. Change the Cut rule where that is wrong.");
  if (!fields.has("depLf") && !fields.has("depIn")) warnings.push("No DE&P LF column in this sheet, so DE&P LF is taken as L+W, and 2(L+W) on island tops. Change the DE&P rule where that is wrong.");
  const pieces: Piece[] = [];
  for (let r = header.row + 1; r < g.rows.length; r++) {
    const row = g.rows[r];
    if (row.every((c) => c.v === null && !c.f)) continue;
    const cell = (f: DrawingField) => (fields.has(f) ? row[fields.get(f)!] : undefined);
    const text = (f: DrawingField) => textOf(cell(f));
    const count = (f: DrawingField) => {
      const c = cell(f);
      const n = numOf(c);
      if (n === null && text(f) && text(f) !== "-") warnings.push(`Row ${r + 1} of "${g.name}": "${text(f)}" under ${headerRow[fields.get(f)!].v} is not a number, so it counts as 0.`);
      return n ?? 0;
    };
    const L = numOf(cell("length"));
    const W = numOf(cell("width"));
    if (L === null || W === null) {
      // The sheet's own total row has no size; anything else without one is worth saying.
      const isTotal = row.some((c) => typeof c.v === "string" && /^totals?\b/i.test(c.v));
      if (!isTotal && (text("dwg") || text("piece") || text("description"))) warnings.push(`Row ${r + 1} of "${g.name}" was skipped: it has no ${L === null ? labels.length : labels.width} value.`);
      continue;
    }
    const description = text("description");
    const cut = edgeFromCell(cell("cutLf"), L, W, perFoot, "perimeter");
    const depFallback: EdgeRule = /island/i.test(description) ? "perimeter" : "l+w";
    const depInCell = cell("depIn");
    const depInches = numOf(depInCell);
    const dep = cell("depLf")
      ? edgeFromCell(cell("depLf"), L, W, perFoot, depFallback)
      : depInches !== null
        ? inferEdge(depInches / UNITS_PER_FOOT[depInUnit], L, W, perFoot)
        : { rule: depFallback, typed: null };
    const extra: Record<string, string> = {};
    for (const x of extras) {
      const value = textOf(row[x.i]);
      if (value) extra[x.name] = value;
    }
    pieces.push({
      id: newId("p"),
      dwg: text("dwg"),
      group: text("group"),
      area: text("area"),
      piece: text("piece"),
      description,
      length: L,
      width: W,
      thickness: text("thickness"),
      color: text("color"),
      sinkModel: text("sinkModel"),
      sinkCuts: count("sinkCuts"),
      faucetHoles: count("faucetHoles"),
      rCorners: count("rCorners"),
      joints: count("joints"),
      qty: numOf(cell("qty")) ?? numOf(cell("totalPcs")) ?? (fields.has("qty") ? count("qty") : 0),
      cutRule: cut.rule,
      cutLf: cut.typed,
      depRule: dep.rule,
      depLf: dep.typed,
      jointDepIn: numOf(cell("jointDepIn")),
      notes: text("notes"),
      ...(Object.keys(extra).length ? { extra } : {}),
    });
  }
  return {
    pieces,
    dimUnit,
    labels,
    show: { color: fields.has("color"), depIn: fields.has("depIn"), jointDepIn: fields.has("jointDepIn"), notes: fields.has("notes") },
    extraColumns: extras.map((x) => x.name),
    warnings,
  };
}

// ─── Variables ──────────────────────────────────────────────────────────────

const KIND_RULES: [CostKey, RegExp][] = [
  ["packing", /packing/i],
  ["sink", /sink/i],
  ["faucet", /faucet/i],
  ["rcorner", /r\s*-?\s*corner|radius/i],
  ["joint", /joint|seam/i],
  ["dep", /de\s*&\s*p|edge|polish/i],
  ["cutting", /cutting/i],
  ["material", /material|slab|stone|quartz|granite|marble/i],
];

const colLetter = (c: number) => {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

interface ParsedVariables {
  slabWidth: number | null;
  slabDepth: number | null;
  slabUnit: DimUnit | null;
  materialBasis: string;
  rates: RateRow[];
  containers: Container[];
  exchangeRate: number | null;
  typedSqft: number | null;
  packingNote: string;
  /** "3cm" → its CutList results (some sheets keep them in Variables). */
  cutList: Map<string, { slabs?: number; usedPct?: number }>;
  pieceMode: boolean;
  wastageExtra: number | null;
  warnings: string[];
  recognised: boolean;
}

function parseVariables(g: Grid): ParsedVariables {
  const out: ParsedVariables = { slabWidth: null, slabDepth: null, slabUnit: null, materialBasis: "", rates: [], containers: [], exchangeRate: null, typedSqft: null, packingNote: "", cutList: new Map(), pieceMode: false, wastageExtra: null, warnings: [], recognised: false };
  const bySize = new Map<string, Container>();
  const containerFor = (label: string) => {
    const size = /(\d+)\s*(?:ft|'|foot)/i.exec(label)?.[1];
    const key = size ? `${size}ft` : "Container";
    if (!bySize.has(key)) bySize.set(key, { id: newId("c"), label: key, cost: 0, count: 1 });
    return bySize.get(key)!;
  };
  const cutListFor = (token: string) => {
    const key = token.trim().toLowerCase();
    if (!out.cutList.has(key)) out.cutList.set(key, {});
    return out.cutList.get(key)!;
  };

  type Table = { item: number; unit: number; my: number; customer: number; applies: number; defaultKind: CostKey | null };
  let table: Table | null = null;
  let afterPacking = false;
  g.rows.forEach((row, r) => {
    const filled = row.flatMap((c, i) => (c.v !== null || c.f ? [i] : []));
    if (filled.length === 0) {
      table = null;
      return;
    }
    const lower = row.map((c) => (typeof c.v === "string" ? c.v.toLowerCase() : ""));
    const my = lower.findIndex((t) => /my\s*cost|our\s*cost|internal\s*cost/.test(t));
    const customer = lower.findIndex((t) => /customer|client|selling/.test(t));
    if (my >= 0 && customer >= 0) {
      const item = filled[0];
      table = { item, unit: lower.findIndex((t) => /^unit/.test(t)), my, customer, applies: lower.findIndex((t) => /^applies/.test(t)), defaultKind: /material/.test(lower[item]) ? "material" : null };
      out.recognised = true;
      return;
    }

    if (table) {
      const t: Table = table;
      const label = textOf(row[t.item]);
      const myCell = row[t.my] ?? EMPTY;
      const cuCell = row[t.customer] ?? EMPTY;
      // A remark inside the table, e.g. "(Wastage embedded in material)".
      if (myCell.v === null && !myCell.f && cuCell.v === null && !cuCell.f) return;
      // A row named after a stone ("Calacatta Gold 2cm") is known by its unit: only material and packing go per sqft.
      const perSqft = t.unit >= 0 && /sq\s*ft/i.test(textOf(row[t.unit]));
      const kind = KIND_RULES.find(([, re]) => re.test(label))?.[0] ?? t.defaultKind ?? (perSqft ? "material" : null);
      if (!kind) {
        out.warnings.push(`"${label}" in the Variables sheet matches no cost column, so it is not priced.`);
        return;
      }
      if (out.rates.some((x) => x.kind === kind) && !["material", "dep", "sink"].includes(kind)) {
        out.warnings.push(`"${label}" repeats a ${kind} rate already read, so it is ignored.`);
        return;
      }
      const myAddr = `${colLetter(t.my)}${r + 1}`;
      const clean = (f: string | null) => (f ?? "").replace(/^=/, "").replace(/\$/g, "").trim().toUpperCase();
      const myLinked = kind === "packing" && Boolean(myCell.f);
      if (myCell.f && !myLinked) out.warnings.push(`${label}: My Cost is a formula (${myCell.f}); its value is used as a typed rate.`);
      const followsMy = Boolean(cuCell.f) && (clean(cuCell.f) === myAddr || kind === "packing");
      if (cuCell.f && !followsMy) out.warnings.push(`${label}: Customer Charge is a formula (${cuCell.f}); its value is used as a typed rate.`);
      if (!myLinked && numOf(myCell) === null) out.warnings.push(`${label}: My Cost is empty, so it counts as $0.`);
      if (!followsMy && numOf(cuCell) === null) out.warnings.push(`${label}: Customer Charge is empty, so it follows My Cost.`);
      const note = row.flatMap((c, i) => (i > t.customer && i !== t.applies ? [textOf(c)] : [])).find(Boolean);
      const rate: RateRow = {
        id: newId("r"),
        kind,
        label,
        unit: t.unit >= 0 ? textOf(row[t.unit]) : "",
        match: t.applies >= 0 ? textOf(row[t.applies]) || null : null,
        myCost: myLinked ? null : numOf(myCell),
        customer: followsMy ? null : numOf(cuCell),
        ...(note ? { note } : {}),
      };
      if (kind === "material") Object.assign(rate, { slabs: null, slabAdjust: 0, usedSqft: null, usedPct: null });
      out.rates.push(rate);
      return;
    }

    // Label / value rows.
    const label = textOf(row[filled[0]]);
    if (!label || typeof row[filled[0]].v !== "string") return;
    const valueIndex = filled[1];
    const value = valueIndex === undefined ? EMPTY : row[valueIndex];
    const trailing = valueIndex === undefined ? "" : filled.slice(2).map((i) => textOf(row[i])).find(Boolean) ?? "";
    let m: RegExpExecArray | null;
    if (/^slab\s*width/i.test(label)) {
      out.slabWidth = numOf(value);
      out.slabUnit = /\bmm\b/i.test(label) ? "mm" : /\bcm\b/i.test(label) ? "cm" : /\b(ft|feet)\b/i.test(label) ? "ft" : "in";
    } else if (/^slab\s*(depth|length|height)/i.test(label)) out.slabDepth = numOf(value);
    else if (/^material(\s*basis)?$/i.test(label)) out.materialBasis = textOf(value);
    else if (/container/i.test(label) && !/^total/i.test(label) && label.length <= 60) {
      const c = containerFor(label);
      if (/number|no\.|count|qty|nos\b/i.test(label)) c.count = numOf(value) ?? 1;
      else if (numOf(value) !== null) c.cost = numOf(value)!;
      if (trailing) out.packingNote = trailing;
      out.recognised = true;
    } else if (/^packing\s*per\s*sq/i.test(label)) afterPacking = true;
    else if (afterPacking && valueIndex === undefined && label.length > 20) out.packingNote ||= label;
    else if (/exchange\s*rate/i.test(label)) out.exchangeRate = numOf(value);
    else if (/^total.*(sq\s*ft|sqft)/i.test(label)) {
      // This tool's export keeps a typed figure as =IF(ABS(total-typed)<=0.01,typed,total), so it still follows the drawing.
      const kept = /^=?IF\(ABS\(.*-([\d.]+)\)<=0\.01,/i.exec(value.f ?? "")?.[1];
      out.typedSqft = kept ? Number(kept) : typedNum(value);
    }
    else if ((m = /^(.+?)\s+wastage\s*markup/i.exec(label))) {
      out.pieceMode = true;
      const extra = /\+\s*([\d.]+)\s*$/.exec(value.f ?? "")?.[1];
      const fromLabel = /\+\s*([\d.]+)\s*%/.exec(label)?.[1];
      if (extra) out.wastageExtra = Number(extra);
      else if (fromLabel) out.wastageExtra = Number(fromLabel) / 100;
    } else if ((m = /^(.+?)\s+used\s*area/i.exec(label))) {
      const n = numOf(value);
      if (n !== null) cutListFor(m[1]).usedPct = n > 1 ? n / 100 : n;
    } else if ((m = /^(.+?)\s+slabs?\b/i.exec(label)) && !/^total/i.test(m[1])) {
      const n = numOf(value);
      if (n !== null) cutListFor(m[1]).slabs = n;
    }
  });
  out.containers = [...bySize.values()];
  return out;
}

/** Works out which pieces each rate row prices when a kind has several rows. */
function assignMatches(rates: RateRow[], pieces: Piece[]) {
  const distinct = (f: (p: Piece) => string) => [...new Set(pieces.map(f).filter((x) => x && x !== "-"))];
  const colors = distinct((p) => p.color);
  const thicknesses = distinct((p) => p.thickness);
  const models = distinct((p) => p.sinkModel);
  const within = (label: string, list: string[]) => list.find((x) => label.toLowerCase().includes(x.toLowerCase())) ?? null;
  const cm = (label: string) => {
    const m = /(\d+(?:\.\d+)?)\s*cm/i.exec(label);
    return m ? `${m[1]}cm` : null;
  };
  for (const kind of ["material", "dep", "sink"] as CostKey[]) {
    const rows = rates.filter((r) => r.kind === kind);
    if (rows.length < 2) continue;
    for (const r of rows) {
      if (r.match) continue;
      if (kind === "material") r.match = within(r.label, colors) ?? within(r.label, thicknesses) ?? cm(r.label);
      if (kind === "dep") r.match = within(r.label, thicknesses) ?? cm(r.label);
      if (kind === "sink") r.match = within(r.label, models) ?? (/-\s*(.+)$/.exec(r.label)?.[1] ?? null);
    }
  }
}

/** Stored rates on a new drawing: one material row per color (or thickness) the drawing actually uses. */
function fitMaterialRows(v: Variables, pieces: Piece[]) {
  const distinct = (f: (p: Piece) => string) => [...new Set(pieces.map(f).filter((x) => x && !/^(-|tbd)$/i.test(x)))];
  const colors = distinct((p) => p.color);
  const keys = colors.length > 1 ? colors : distinct((p) => p.thickness);
  const existing = v.rates.filter((r) => r.kind === "material");
  const base = existing[0];
  if (!base) return;
  const rest = v.rates.filter((r) => r.kind !== "material");
  let rows: RateRow[];
  if (keys.length > 1) {
    rows = keys.map((key) => existing.find((r) => r.match?.toLowerCase() === key.toLowerCase()) ?? { ...base, id: newId("r"), label: `${key} Material`, match: key, needsConfirm: true });
  } else {
    const onlyKey = keys[0]?.toLowerCase();
    const best = existing.find((r) => r.match?.toLowerCase() === onlyKey) ?? base;
    rows = [{ ...best, match: null }];
  }
  v.rates = [...rows, ...rest];
}

function buildVariables(parsed: ParsedVariables, fallback: Variables, pieces: Piece[], warnings: string[]): Variables {
  const v = structuredClone(fallback);
  if (parsed.slabWidth && parsed.slabDepth) {
    v.slabWidth = parsed.slabWidth;
    v.slabDepth = parsed.slabDepth;
    v.slabUnit = parsed.slabUnit ?? "in";
  } else warnings.push(`The Variables sheet has no slab size, so the stored ${fallback.slabWidth} x ${fallback.slabDepth} is used.`);
  v.materialBasis = parsed.materialBasis;
  if (parsed.containers.length) v.containers = parsed.containers;
  else warnings.push("The Variables sheet has no container cost, so the stored packing figures are used.");
  if (parsed.exchangeRate) v.exchangeRate = parsed.exchangeRate;
  else warnings.push(`The Variables sheet has no exchange rate, so the stored ${fallback.exchangeRate} is used.`);
  v.packingNote = parsed.packingNote;
  v.packingSqftTyped = parsed.typedSqft;
  v.pricing = parsed.pieceMode ? "piece" : "slab";
  if (parsed.wastageExtra !== null) v.wastageExtra = parsed.wastageExtra;

  const rates = [...parsed.rates];
  for (const stored of fallback.rates) {
    if (rates.some((r) => r.kind === stored.kind)) continue;
    rates.push({ ...structuredClone(stored), id: newId("r"), needsConfirm: stored.kind === "material" || undefined });
    if (parsed.rates.length) warnings.push(`The Variables sheet has no ${stored.label} rate, so the stored rate is used.`);
  }
  // Keep the sheets' order: material first, packing last.
  v.rates = rates.sort((a, b) => order(a.kind) - order(b.kind));
  assignMatches(v.rates, pieces);

  for (const [token, results] of parsed.cutList) {
    const row = materialRowByText(v.rates, token);
    if (!row) {
      warnings.push(`CutList results for "${token}" match no material rate.`);
      continue;
    }
    if (results.slabs !== undefined) row.slabs = results.slabs;
    if (results.usedPct !== undefined) row.usedPct = results.usedPct;
  }
  return v;
}

const KIND_ORDER: CostKey[] = ["material", "cutting", "dep", "sink", "faucet", "rcorner", "joint", "packing"];
const order = (k: CostKey) => KIND_ORDER.indexOf(k);

function materialRowByText(rates: RateRow[], text: string): RateRow | undefined {
  const rows = rates.filter((r) => r.kind === "material");
  if (rows.length === 1) return rows[0];
  const t = text.toLowerCase();
  return rows.find((r) => r.match && t.includes(r.match.toLowerCase())) ?? rows.find((r) => t.includes(r.label.toLowerCase()));
}

// ─── Slab Calculation ───────────────────────────────────────────────────────

function parseSlab(g: Grid, v: Variables) {
  const notes: string[] = [];
  const firstText = (row: Cell[]) => textOf(row.find((c) => c.v !== null));
  const filledOf = (row: Cell[]) => row.flatMap((c, i) => (c.v !== null || c.f ? [i] : []));
  const isSetting = (label: string) => /^material priced on|^extra wastage|^estimate utilization/i.test(label);
  const isDriver = (label: string) => /\bdriver\b/i.test(label);
  const usedInput = (rate: RateRow, label: string, n: number) => {
    if (/^(used\s*area\s*%|usage\s*%)/i.test(label)) rate.usedPct = n > 1 ? n / 100 : n;
    else if (/^used\s*area/i.test(label)) rate.usedSqft = n;
  };
  const headerRow = g.rows.findIndex((row) => row.some((c, i) => i > 0 && typeof c.v === "string" && /^total$/i.test(c.v)));

  if (headerRow >= 0) {
    // One column per material, as in Project 1633 and this tool's own export.
    const columns = g.rows[headerRow].flatMap((c, i) => (i > 0 && typeof c.v === "string" && !/^total$/i.test(c.v) ? [{ i, row: materialRowByText(v.rates, c.v) }] : []));
    for (const row of g.rows.slice(headerRow + 1)) {
      const label = textOf(row[0]);
      if (isDriver(label) || isSetting(label)) break;
      for (const { i, row: rate } of columns) {
        const n = typedNum(row[i]);
        if (!rate || n === null) continue;
        if (/^slabs\b/i.test(label)) rate.slabs = n;
        else if (/^adjust|^less\b|^add\b/i.test(label)) rate.slabAdjust = n;
        else usedInput(rate, label, n);
      }
    }
  } else {
    // One block per material, as in Lennar and Peoria.
    let current = materialRowByText(v.rates, "");
    for (const row of g.rows.slice(2)) {
      const filled = filledOf(row);
      if (filled.length === 0) continue;
      const label = textOf(row[filled[0]]);
      if (isDriver(label) || isSetting(label)) break;
      if (filled.length === 1) {
        current = materialRowByText(v.rates, label) ?? current;
        continue;
      }
      const n = typedNum(row[filled[1]]);
      if (!current || n === null) continue;
      if (/^slabs\b/i.test(label)) {
        current.slabs = n;
        const standard = /^slabs from cutlist optimizer$/i.test(label) || label.length <= 16;
        if (!standard) notes.push(v.rates.filter((r) => r.kind === "material").length > 1 ? `${current.label}: ${label}` : label);
      } else if (/^adjust|^less\b|^add\b/i.test(label)) {
        current.slabAdjust = (current.slabAdjust ?? 0) + n;
        if (!/^adjustment \(/i.test(label)) notes.push(`${label}: ${n > 0 ? "+" : ""}${n}`);
      } else usedInput(current, label, n);
    }
  }

  // Settings, driver analysis and remarks below the table.
  const drivers: SlabDriver[] = [];
  let driver: SlabDriver | null = null;
  let remarks: string[] = [];
  let settingsSeen = false;
  const closeDriver = () => {
    if (driver) {
      driver.note = driver.note || remarks.join("; ");
      drivers.push(driver);
    }
    driver = null;
    remarks = [];
  };
  for (const row of g.rows.slice(2)) {
    const filled = filledOf(row);
    if (filled.length === 0) {
      if (settingsSeen || (driver as SlabDriver | null)?.dedicatedSlabs) closeDriver();
      continue;
    }
    const label = firstText(row);
    const value = filled.length > 1 ? row[filled[1]] : EMPTY;
    if (/^material priced on/i.test(label)) v.pricing = /piece/i.test(textOf(value)) ? "piece" : "slab";
    else if (/^extra wastage/i.test(label) && numOf(value) !== null) v.wastageExtra = numOf(value)!;
    else if (/^estimate utilization/i.test(label) && numOf(value) !== null) v.estimateUtilization = numOf(value)!;
    if (isSetting(label)) {
      settingsSeen = true;
      continue;
    }
    if (isDriver(label)) {
      closeDriver();
      driver = { id: newId("d"), label: label.replace(/^slab\s*driver\s*[-:]\s*/i, ""), pieces: 0, piecesPerSlab: 0, dedicatedSlabs: 0, wastePerSlabSqIn: 0, note: "" };
      continue;
    }
    const open = driver as SlabDriver | null;
    if (open) {
      if (filled.length < 2) {
        open.note = label;
        continue;
      }
      if (/pieces per slab/i.test(label)) open.piecesPerSlab = numOf(value) ?? 0;
      else if (/dedicated/i.test(label)) open.dedicatedSlabs = numOf(value) ?? 0;
      else if (/^share/i.test(label)) continue;
      else if (/waste/i.test(label)) {
        const fromFormula = /\*\s*([\d.]+)\s*\/\s*144/.exec(value.f ?? "")?.[1];
        const fromLabel = /([\d,]+(?:\.\d+)?)\s*sq\s*in/i.exec(label)?.[1];
        open.wastePerSlabSqIn = Number(fromFormula ?? fromLabel?.replace(/,/g, "") ?? 0);
        continue;
      } else if (/pieces/i.test(label)) open.pieces = numOf(value) ?? 0;
      if (label.includes("(")) remarks.push(label);
    } else if (settingsSeen && filled.length === 1) notes.push(label);
  }
  closeDriver();
  if (drivers.length) v.drivers = drivers;
  if (notes.length) v.slabNotes = notes.join("\n");
}

function parseNotes(g: Grid | undefined): string[] {
  if (!g) return [];
  const start = g.rows.findIndex((row) => /^notes?\b/i.test(textOf(row.find((c) => c.v !== null))));
  if (start < 0) return [];
  return g.rows
    .slice(start + 1)
    .map((row) => textOf(row.find((c) => c.v !== null)))
    .filter(Boolean);
}

// ─── Putting it together ────────────────────────────────────────────────────

const findSheet = (grids: Grid[], re: RegExp) => grids.find((g) => re.test(g.name));

async function readAll(file: UploadFile | undefined, errors: string[]): Promise<Grid[]> {
  if (!file) return [];
  try {
    return await readFile(file);
  } catch (e) {
    errors.push(e instanceof Error && e.message.includes(file.name) ? e.message : `${file.name} could not be read. Check it is a valid, unprotected .xlsx or .csv file.`);
    return [];
  }
}

function findVariablesGrid(grids: Grid[]): Grid | undefined {
  const named = findSheet(grids, /variable|rate\s*card/i);
  if (named) return named;
  return grids.find((g) => parseVariables(g).rates.length >= 2);
}

function findDrawingGrid(grids: Grid[]): Grid | undefined {
  const named = findSheet(grids, /drawing/i);
  if (named) return named;
  return grids
    .map((g) => ({ g, h: findHeaderRow(g) }))
    .filter((x) => x.h && (x.h.fields.has("length") || x.h.fields.has("width") || x.h.fields.has("depth")))
    .sort((a, b) => b.h!.score - a.h!.score)[0]?.g;
}

function nameFromTitle(title: string) {
  return title.replace(/\s*-\s*(drawing summary|internal costing|customer quote|quote summary|slab calculation|project summary|variables).*$/i, "").trim();
}

/** The two sheets of one project should say so. If they clearly don't, this is the one place the mix-up can be caught. */
const mismatchNote = (first: string, a: string, second: string, b: string) => `The ${first} is titled "${a}" and the ${second} "${b}". They look like different projects, so check you have the right files.`;

/** Cells this tool's own export marked as typed over by hand go back to being hand-edited cells. */
function readEdits(all: Grid[], data: ProjectData) {
  for (const [side, name] of [["internal", /internal/i], ["customer", /customer/i]] as const) {
    const g = findSheet(all, name);
    const at = g?.rows.findIndex((row) => row.some((c) => c.v === COST_LABEL.material)) ?? -1;
    if (!g || at < 0) continue;
    const cols = COST_KEYS.map((key) => [key, g.rows[at].findIndex((c) => c.v === COST_LABEL[key])] as const);
    data.pieces.forEach((p, i) => {
      for (const [key, col] of cols) {
        const cell = g.rows[at + 1 + i]?.[col];
        if (cell?.edited && typeof cell.v === "number") data.overrides[side][p.id] = { ...data.overrides[side][p.id], [key]: cell.v };
      }
    });
  }
}

/**
 * A workbook that carries its own results is checked against what the engine gives from the same inputs.
 * A difference means something in the file isn't following its formulas, such as a figure typed over a formula.
 */
function reconcile(all: Grid[], data: ProjectData): string[] {
  const r = calculate(data);
  const notes: string[] = [];
  const compare = (what: string, theirs: number | null, ours: number, tolerance = 0.005, digits = 2) => {
    if (theirs && Math.abs(theirs - ours) > tolerance) notes.push(`The uploaded workbook shows ${what} as ${theirs.toLocaleString("en-US", { maximumFractionDigits: digits })}, but its inputs calculate to ${ours.toLocaleString("en-US", { maximumFractionDigits: digits })}. Check that sheet: the tool uses the calculated figure.`);
  };
  /** The figure under `header` in the row whose label starts with "total". */
  const sheetTotal = (name: RegExp, header: RegExp) => {
    const g = findSheet(all, name);
    if (!g) return null;
    for (let at = 0; at < Math.min(g.rows.length, 30); at++) {
      const col = g.rows[at].findIndex((c) => typeof c.v === "string" && header.test(c.v));
      if (col < 0) continue;
      const row = g.rows.slice(at + 1).find((x) => x.some((c) => typeof c.v === "string" && /^totals?\b/i.test(c.v)));
      return row ? numOf(row[col]) : null;
    }
    return null;
  };
  /** The figure beside a label. */
  const line = (sheet: RegExp, label: RegExp) => {
    const row = findSheet(all, sheet)?.rows.find((x) => typeof x[0]?.v === "string" && label.test(x[0].v));
    return row ? numOf(row[1]) : null;
  };
  compare("Slab Area on Variables", line(/variable|rate\s*card/i, /^slab\s*area/i), r.slabArea, 0.00005, 4);
  compare("Total Packing (USD) on Variables", line(/variable|rate\s*card/i, /^total\s*packing\s*\(?usd/i), r.packing.usd);
  compare("Packing per Sqft on Variables", line(/variable|rate\s*card/i, /^packing\s*per\s*sq/i), r.packing.perSqft, 0.00005, 4);
  compare("Total Sqft on Drawing Summary", sheetTotal(/drawing/i, /^total\s*sq/i), r.drawing.sqft);
  compare("Total Cost on Internal Costing", sheetTotal(/internal/i, /^total\s*cost/i), r.internal.total);
  compare("Total Price on Customer Quote", sheetTotal(/customer/i, /^total\s*price/i), r.customer.total);
  compare("Total Internal Cost on Project Summary", line(/project\s*summary/i, /^total internal cost/i), r.summary.totalInternal);
  compare("Total Customer Quote on Project Summary", line(/project\s*summary/i, /^total customer quote/i), r.summary.totalCustomer);
  return notes;
}

const drawingSqft = (pieces: Piece[], unit: DimUnit) => pieces.reduce((s, p) => s + ((p.length * p.width) / UNITS_PER_FOOT[unit] ** 2) * p.qty, 0);

/** A new project from a Drawing Summary (required) and a Variables sheet (optional). */
export async function importProject(files: { drawing: UploadFile; variables?: UploadFile }, options: ImportOptions): Promise<ImportResult> {
  const errors: string[] = [];
  const drawingGrids = await readAll(files.drawing, errors);
  const variableGrids = await readAll(files.variables, errors);
  if (errors.length) return { errors };

  const drawingGrid = findDrawingGrid(drawingGrids);
  if (!drawingGrid && !options.mapping) return { errors: [`${files.drawing.name} has no Drawing Summary: no sheet with Length, Width and Quantity columns was found.`] };
  const parsed = parseDrawing(drawingGrid ?? drawingGrids[0], options.mapping);
  if ("error" in parsed) return { errors: [parsed.error] };
  if ("mappingNeeded" in parsed) return { errors: [], mappingNeeded: parsed.mappingNeeded };
  if (parsed.pieces.length === 0) return { errors: [`"${(drawingGrid ?? drawingGrids[0]).name}" has a header row but no pieces with a length and width.`] };

  const all = [...variableGrids, ...drawingGrids];
  const varsGrid = variableGrids.length ? findVariablesGrid(variableGrids) : findVariablesGrid(drawingGrids);
  const notes: string[] = [...parsed.warnings];
  const data = emptyProject();

  let variables: Variables;
  const varsParsed = varsGrid ? parseVariables(varsGrid) : null;
  if (files.variables && (!varsParsed || !varsParsed.recognised)) {
    return { errors: [`${files.variables.name} doesn't look like a Variables sheet: no My Cost / Customer Charge table or container cost was found.`] };
  }
  if (varsParsed) {
    notes.push(...varsParsed.warnings);
    variables = buildVariables(varsParsed, options.fallback, parsed.pieces, notes);
  } else {
    variables = structuredClone(options.fallback);
    if (!options.fallbackFits) fitMaterialRows(variables, parsed.pieces);
    const confirm = variables.rates.some((r) => r.needsConfirm) ? " Confirm the material rate." : "";
    notes.push(`No Variables sheet was uploaded, so this costing uses ${options.fallbackLabel ?? "the stored rate card"}.${confirm}`);
  }

  const slabGrid = findSheet(all, /slab/i);
  if (slabGrid) parseSlab(slabGrid, variables);

  variables.packingSqftRoundedCopy = variables.packingSqftTyped !== null && Math.abs(variables.packingSqftTyped - drawingSqft(parsed.pieces, parsed.dimUnit)) <= 0.01;

  const summaryGrid = findSheet(all, /project\s*summary/i);
  const sheetGrids: [SheetKey, Grid | undefined][] = [
    ["variables", varsGrid],
    ["drawing", drawingGrid],
    ["internal", findSheet(all, /internal/i)],
    ["customer", findSheet(all, /customer/i)],
    ["quote", findSheet(all, /quote\s*summary/i)],
    ["slab", slabGrid],
    ["summary", summaryGrid],
  ];
  for (const [key, g] of sheetGrids) {
    const sub = subtitleOf(g);
    if (sub) data.sheetNotes[key] = sub;
  }

  const drawingTitle = drawingGrid && drawingGrid.name !== "CSV" ? nameFromTitle(titleOf(drawingGrid)) : "";
  const otherTitle = nameFromTitle(titleOf(summaryGrid) || titleOf(varsGrid));
  // Separate files can come from two projects. The pieces are the job, so the Drawing Summary's title then stands.
  const mismatch = Boolean(files.variables) && differentProjects(drawingTitle, otherTitle);
  if (mismatch) notes.push(mismatchNote("Drawing Summary", drawingTitle, "Variables sheet", otherTitle));
  const sheetTitle = mismatch ? drawingTitle : otherTitle || drawingTitle;
  // "Drawing Summary" alone says nothing about the project: the file name says more, and it mustn't reach the customer PDF.
  const title = tellsProject(sheetTitle) ? sheetTitle : "";
  const fileBase = files.drawing.name.replace(/\.[^.]+$/, "");
  data.meta.name = options.name?.trim() || title || fileBase;
  // A typed name labels the project here; the customer PDF prints the sheet's own title.
  if (title && title !== data.meta.name) data.meta.quoteTitle = title;
  data.meta.code = /#\s*(\d+)/.exec(`${data.meta.name} ${title}`)?.[1] ?? /(?:project|proj)[_\s-]*(\d+)/i.exec(fileBase)?.[1] ?? "";
  data.meta.version = /\bver\.?\s*(\d+)/i.exec(`${data.sheetNotes.summary ?? ""} ${fileBase}`)?.[0] ?? "";
  data.dimUnit = parsed.dimUnit;
  data.labels = parsed.labels;
  data.show = parsed.show;
  data.extraColumns = parsed.extraColumns;
  data.pieces = parsed.pieces;
  data.variables = variables;
  data.notes = parseNotes(summaryGrid);
  readEdits(all, data);
  data.importNotes = [...notes, ...reconcile(all, data)];
  return { data, errors: [], usedFallback: !varsParsed };
}

/** A replacement sheet that names another project. The project's own short name counts too: a tool export is titled with it. */
function otherProject(current: ProjectData, grid: Grid | undefined, kind: string): string[] {
  const title = grid && grid.name !== "CSV" ? nameFromTitle(titleOf(grid)) : "";
  const names = [current.meta.name, current.meta.quoteTitle].filter(Boolean);
  if (!names.every((name) => differentProjects(name, title))) return [];
  return [mismatchNote(`new ${kind} sheet`, title, "project", projectTitle(current.meta))];
}

/** A replacement sheet starts the cost cells from the calculation again: say so if that dropped any typed figures. */
function clearedEdits(current: ProjectData): string[] {
  const count = [current.overrides.internal, current.overrides.customer].flatMap((side) => Object.values(side)).reduce((n, cells) => n + Object.keys(cells).length, 0);
  return count ? [`${count} hand-edited cost cell${count === 1 ? " was" : "s were"} cleared by this upload. Undo brings ${count === 1 ? "it" : "them"} back.`] : [];
}

/** A new Drawing Summary for an existing project: rates, slab inputs and notes stay. */
export async function replaceDrawing(current: ProjectData, file: UploadFile, mapping?: ImportOptions["mapping"]): Promise<ImportResult> {
  const errors: string[] = [];
  const grids = await readAll(file, errors);
  if (errors.length) return { errors };
  const grid = findDrawingGrid(grids);
  if (!grid && !mapping) return { errors: [`${file.name} has no Drawing Summary: no sheet with Length, Width and Quantity columns was found.`] };
  const parsed = parseDrawing(grid ?? grids[0], mapping);
  if ("error" in parsed) return { errors: [parsed.error] };
  if ("mappingNeeded" in parsed) return { errors: [], mappingNeeded: parsed.mappingNeeded };
  if (parsed.pieces.length === 0) return { errors: [`"${(grid ?? grids[0]).name}" has a header row but no pieces with a length and width.`] };
  const data = structuredClone(current);
  data.dimUnit = parsed.dimUnit;
  data.labels = parsed.labels;
  data.show = parsed.show;
  data.extraColumns = parsed.extraColumns;
  data.pieces = parsed.pieces;
  data.overrides = { internal: {}, customer: {} };
  // A typed project sqft that only rounds the drawing total stays, and the engine drops it if the new drawing moves on. One typed by hand was for the old drawing.
  if (!data.variables.packingSqftRoundedCopy) data.variables.packingSqftTyped = null;
  assignMatches(data.variables.rates, parsed.pieces);
  const hadSlabs = data.variables.rates.some((r) => r.kind === "material" && (r.slabs ?? null) !== null);
  const moved = Math.abs(drawingSqft(parsed.pieces, parsed.dimUnit) - drawingSqft(current.pieces, current.dimUnit)) > 0.01;
  data.importNotes = [...otherProject(current, grid, "Drawing Summary"), ...parsed.warnings, ...(hadSlabs && moved ? ["The drawing changed: re-run CutList Optimizer and update the slab counts."] : []), ...reconcile(grid ? [grid] : [], data), ...clearedEdits(current)];
  return { data, errors: [] };
}

/** A new Variables sheet for an existing project: pieces and notes stay; slab counts stay unless the sheet has its own. */
export async function replaceVariables(current: ProjectData, file: UploadFile): Promise<ImportResult> {
  const errors: string[] = [];
  const grids = await readAll(file, errors);
  if (errors.length) return { errors };
  const grid = findVariablesGrid(grids);
  const parsed = grid ? parseVariables(grid) : null;
  if (!parsed || !parsed.recognised) return { errors: [`${file.name} doesn't look like a Variables sheet: no My Cost / Customer Charge table or container cost was found.`] };
  const data = structuredClone(current);
  const notes = [...parsed.warnings];
  const previous = current.variables;
  const next = buildVariables(parsed, previous, current.pieces, notes);
  const oldMaterial = previous.rates.filter((r) => r.kind === "material");
  for (const r of next.rates.filter((x) => x.kind === "material")) {
    const before = oldMaterial.length === 1 ? oldMaterial[0] : oldMaterial.find((o) => (o.match && o.match === r.match) || o.label === r.label);
    if (before && (r.slabs ?? null) === null) {
      r.slabs = before.slabs ?? null;
      r.slabAdjust = before.slabAdjust ?? 0;
      r.usedSqft = before.usedSqft ?? null;
      if ((r.usedPct ?? null) === null) r.usedPct = before.usedPct ?? null;
    }
  }
  next.drivers = previous.drivers;
  next.slabNotes = previous.slabNotes;
  next.estimateUtilization = previous.estimateUtilization;
  const slabGrid = findSheet(grids, /slab/i);
  if (slabGrid) parseSlab(slabGrid, next);
  next.packingSqftRoundedCopy = next.packingSqftTyped !== null && Math.abs(next.packingSqftTyped - drawingSqft(current.pieces, current.dimUnit)) <= 0.01;
  data.variables = next;
  data.overrides = { internal: {}, customer: {} };
  const sub = subtitleOf(grid);
  if (sub) data.sheetNotes.variables = sub;
  data.importNotes = [...otherProject(current, grid, "Variables"), ...notes, ...reconcile(grid ? [grid] : [], data), ...clearedEdits(current)];
  return { data, errors: [] };
}

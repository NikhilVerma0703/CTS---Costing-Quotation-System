/**
 * Writes a project as the seven-sheet workbook, with live Excel formulas linking
 * the sheets the way the original workbooks do. Each formula also carries the
 * engine's result, so the file shows values in any viewer before Excel recalculates.
 */
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { calculate, type Result, type RowResult, type Side, type SlabGroup } from "./engine";
import { num, pct } from "./format";
import { COST_KEYS, COST_LABEL, UNITS_PER_FOOT, labelOf, type ColumnKey, type CostKey, type Piece, type ProjectData, type RateRow } from "./model";

const FONT = "Arial";
const C = { head: "FF1F4E79", band: "FFDEEAF1", total: "FFFFF2CC", confirm: "FFFFFF00", edited: "FFFFE699", line: "FFBFBFBF", input: "FF0000FF", link: "FF008000", note: "FF555555", remark: "FF9C5700" };
const FMT = { money: '"$"#,##0.00', rate: '"$"#,##0.000', rate4: '"$"#,##0.0000', num2: "#,##0.00", num3: "0.000", int: "#,##0", pct: "0.0%", pct2: "0.00%", area: "0.0000" };

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const BORDER: Partial<ExcelJS.Borders> = (() => {
  const side = { style: "thin", color: { argb: C.line } } as ExcelJS.Border;
  return { top: side, left: side, bottom: side, right: side };
})();

type Kind = "text" | "input" | "formula" | "link";
const quote = (name: string) => `'${name}'`;
const SHEET = { variables: "Variables", drawing: "Drawing Summary", internal: "Internal Costing", customer: "Customer Quote", quote: "Quote Summary", slab: "Slab Calculation", summary: "Project Summary" };
const DRAW = quote(SHEET.drawing);
const SLAB = quote(SHEET.slab);

function colName(n: number) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** "1" goes in as the number 1, as in the workbooks; "007" and "1.50" stay as typed. */
const asNumberIfWhole = (s: string): string | number => (/^\d+(\.\d+)?$/.test(s) && String(Number(s)) === s ? Number(s) : s);

/** A typed figure that only rounds its formula: exact until the inputs move, then the formula takes over, as in the app. */
const keepTyped = (f: string, typed: number, tolerance: number) => `IF(ABS(${f}-${typed})<=${tolerance},${typed},${f})`;

interface CellOptions {
  kind?: Kind;
  fmt?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  fillArgb?: string;
  wrap?: boolean;
  note?: string;
}

function put(ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue, o: CellOptions = {}) {
  const cell = ws.getCell(addr);
  cell.value = value;
  const color = o.kind === "input" ? C.input : o.kind === "link" ? C.link : undefined;
  cell.font = { name: FONT, size: 9, bold: o.bold, ...(color ? { color: { argb: color } } : {}) };
  cell.border = BORDER;
  cell.alignment = { vertical: "middle", horizontal: o.align, wrapText: o.wrap, ...(o.align === "right" ? { indent: 1 } : {}) };
  if (o.fmt) cell.numFmt = o.fmt;
  if (o.fillArgb) cell.fill = fill(o.fillArgb);
  if (o.note) cell.note = o.note;
  return cell;
}

const formula = (f: string, result: number | string | null): ExcelJS.CellFormulaValue => ({ formula: f, result: (result ?? 0) as number | string, date1904: false });

/** A formula over the piece rows. With no pieces there is no range to point at: it would loop onto its own total row. */
const overRows = (d: ProjectData, f: string, result: number): ExcelJS.CellValue => (d.pieces.length ? formula(f, result) : 0);

/** Title and subtitle. `fit` keeps a long subtitle inside the table, so it can't shrink the printed page. */
function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle?: string, fit?: { lastCol: string; widthChars: number }) {
  const a1 = ws.getCell("A1");
  a1.value = title;
  a1.font = { name: FONT, size: 13, bold: true };
  a1.alignment = { vertical: "middle" };
  ws.getRow(1).height = 22;
  ws.getRow(2).height = 16;
  if (!subtitle) return;
  const a2 = ws.getCell("A2");
  a2.value = subtitle;
  a2.font = { name: FONT, size: 9, italic: true, color: { argb: C.note } };
  a2.alignment = { vertical: "middle" };
  if (fit) {
    ws.mergeCells(`A2:${fit.lastCol}2`);
    a2.alignment = { vertical: "middle", wrapText: true };
    ws.getRow(2).height = 13 * Math.ceil((subtitle.length * 0.85) / fit.widthChars) + 3;
  }
}

/** Wide enough for the longest group name on two lines, within reason. */
const groupWidth = (d: ProjectData) => Math.min(42, Math.max(24, Math.ceil(Math.max(0, ...d.pieces.map((p) => p.group.length)) * 0.95)));

function headerCell(ws: ExcelJS.Worksheet, addr: string, text: string, align: "center" | "left" = "center") {
  const cell = ws.getCell(addr);
  cell.value = text;
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = fill(C.head);
  cell.border = BORDER;
  cell.alignment = { vertical: "middle", horizontal: align, wrapText: true };
}

function sectionBar(ws: ExcelJS.Worksheet, row: number, text: string, lastCol: number) {
  for (let c = 1; c <= lastCol; c++) headerCell(ws, `${colName(c)}${row}`, c === 1 ? text : "", "left");
  ws.getRow(row).height = 16;
}

function pageSetup(ws: ExcelJS.Worksheet, landscape: boolean, onePage: boolean, titleRow?: number) {
  ws.pageSetup = {
    orientation: landscape ? "landscape" : "portrait",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: onePage ? 1 : 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 },
    ...(titleRow ? { printTitlesRow: `${titleRow}:${titleRow}` } : {}),
  };
  if (!onePage) ws.headerFooter = { oddFooter: "&C&8&A - Page &P" };
}

function widths(ws: ExcelJS.Worksheet, list: number[]) {
  list.forEach((w, i) => (ws.getColumn(i + 1).width = w));
}

// ─── Column layouts ─────────────────────────────────────────────────────────

const WIDTH: Partial<Record<ColumnKey, number>> = { dwg: 6, group: 28, area: 15, piece: 7, description: 34, thickness: 10, color: 14 };

/** Identity columns of the three table sheets, in order. */
function identityColumns(d: ProjectData): ColumnKey[] {
  return ["dwg", "group", "area", "piece", "description", "thickness", ...(d.show.color ? (["color"] as ColumnKey[]) : [])];
}

/** Each rate row's cells on the Variables sheet. */
interface VariablesMap {
  my: Record<string, string>;
  customer: Record<string, string>;
  slabArea: string;
  packingPerSqft: string;
  rows: number;
}

/** Where everything is, worked out before writing so the sheets can refer to each other. */
function layoutVariables(d: ProjectData): VariablesMap {
  const my: Record<string, string> = {};
  const customer: Record<string, string> = {};
  d.variables.rates.forEach((r, i) => {
    my[r.id] = `Variables!$C$${12 + i}`;
    customer[r.id] = `Variables!$D$${12 + i}`;
  });
  const packStart = 12 + d.variables.rates.length + 1; // section bar
  const containerRows = d.variables.containers.length * 2;
  const totalRs = packStart + 1 + containerRows;
  const perSqftRow = totalRs + 4;
  return { my, customer, slabArea: "Variables!$B$7", packingPerSqft: `$B$${perSqftRow}`, rows: perSqftRow };
}

// ─── Variables ──────────────────────────────────────────────────────────────

function writeVariables(wb: ExcelJS.Workbook, d: ProjectData, r: Result, map: VariablesMap) {
  const ws = wb.addWorksheet(SHEET.variables, { views: [{ state: "frozen", ySplit: 3, topLeftCell: "A4", activeCell: "A1", showGridLines: false }] });
  const v = d.variables;
  titleBlock(ws, `${d.meta.name} - Variables`, d.sheetNotes.variables ?? "Countertop Costing Template - Rate Card");
  const legend = ws.getCell("A3");
  legend.value = "Legend: blue = editable input | yellow fill = assumption to confirm | black = formula | green = link to another sheet";
  legend.font = { name: FONT, size: 9, color: { argb: C.note } };
  ws.getRow(3).height = 15;

  sectionBar(ws, 4, "SLAB SPECIFICATIONS", 2);
  const unitWord = v.slabUnit === "in" ? "inches" : v.slabUnit;
  const pair = (row: number, label: string, value: ExcelJS.CellValue, o: CellOptions) => {
    put(ws, `A${row}`, label, { align: "left" });
    put(ws, `B${row}`, value, { align: "right", ...o });
  };
  pair(5, `Slab Width (${unitWord})`, v.slabWidth, { kind: "input" });
  pair(6, `Slab Depth (${unitWord})`, v.slabDepth, { kind: "input" });
  pair(7, "Slab Area (sqft)", formula(`B5*B6/${UNITS_PER_FOOT[v.slabUnit] ** 2}`, r.slabArea), { fmt: FMT.area });
  pair(8, "Material Basis", v.materialBasis, { kind: "input", align: "left", wrap: true });

  sectionBar(ws, 10, "COST INPUTS", 6);
  ["Cost Item", "Unit", "My Cost", "Customer Charge", "Applies to", "Note"].forEach((t, i) => headerCell(ws, `${colName(i + 1)}11`, t));
  v.rates.forEach((rate, i) => {
    const row = 12 + i;
    const values = r.rates[rate.id];
    const packing = rate.kind === "packing";
    const fmt = packing ? FMT.rate4 : FMT.rate;
    put(ws, `A${row}`, rate.label, { align: "left", wrap: true });
    put(ws, `B${row}`, rate.unit, { align: "center" });
    const confirm = rate.needsConfirm ? C.confirm : undefined;
    if (rate.myCost === null) put(ws, `C${row}`, formula(map.packingPerSqft.replace(/\$/g, ""), values.my), { align: "right", fmt });
    else put(ws, `C${row}`, rate.myCost, { kind: "input", align: "right", fmt, fillArgb: confirm });
    if (rate.customer === null) put(ws, `D${row}`, formula(packing ? map.packingPerSqft.replace(/\$/g, "") : `C${row}`, values.customer), { align: "right", fmt });
    else put(ws, `D${row}`, rate.customer, { kind: "input", align: "right", fmt, fillArgb: confirm });
    put(ws, `E${row}`, rate.match ?? "", { align: "center" });
    const note = put(ws, `F${row}`, rate.note ?? "", { align: "left", wrap: true });
    note.font = { name: FONT, size: 8, italic: true, color: { argb: C.remark } };
  });

  let row = 12 + v.rates.length + 1;
  sectionBar(ws, row++, "PACKING CALCULATION", 2);
  const costCells: string[] = [];
  for (const c of v.containers) {
    pair(row, `${c.label} Container cost (Rs per container)`, c.cost, { kind: "input", fmt: FMT.int });
    pair(row + 1, `Number of ${c.label} containers`, c.count, { kind: "input", fmt: FMT.int });
    costCells.push(`B${row}*B${row + 1}`);
    row += 2;
  }
  pair(row, "Total Packing (Rs)", formula(costCells.join("+") || "0", r.packing.totalLocal), { fmt: FMT.int });
  const totalRs = row++;
  pair(row, "Exchange Rate (Rs per USD)", v.exchangeRate, { kind: "input" });
  const fx = row++;
  pair(row, "Total Packing (USD)", formula(`IF(B${fx}<>0,B${totalRs}/B${fx},0)`, r.packing.usd), { fmt: FMT.money });
  const usd = row++;
  const lastDrawingRow = 4 + d.pieces.length;
  const drawingTotal = `${DRAW}!${drawingColumns(d).col.totalSqft}${lastDrawingRow + 1}`;
  if (r.packing.sqftIsTyped && v.packingSqftRoundedCopy) pair(row, "Total Project Sqft (typed; follows the drawing once it changes)", formula(keepTyped(drawingTotal, v.packingSqftTyped as number, 0.01), r.packing.sqftBasis), { kind: "link", fmt: FMT.num2 });
  else if (r.packing.sqftIsTyped) pair(row, "Total Project Sqft (typed)", v.packingSqftTyped, { kind: "input", fmt: FMT.num2 });
  else pair(row, "Total Project Sqft (Drawing Summary)", formula(drawingTotal, r.packing.sqftBasis), { kind: "link", fmt: FMT.num2 });
  const sqft = row++;
  pair(row, "Packing per Sqft (USD)", formula(`IF(B${sqft}<>0,B${usd}/B${sqft},0)`, r.packing.perSqft), { fmt: FMT.rate4 });
  if (v.packingNote) {
    const note = ws.getCell(`A${row + 2}`);
    note.value = v.packingNote;
    note.font = { name: FONT, size: 8, italic: true, color: { argb: C.remark } };
  }
  widths(ws, [42, 26, 14, 16, 14, 60]);
  pageSetup(ws, true, true);
}

// ─── Drawing Summary ────────────────────────────────────────────────────────

interface DrawingLayout {
  keys: string[];
  col: Record<string, string>;
}

function drawingColumns(d: ProjectData): DrawingLayout {
  const keys: string[] = ["dwg", "group", "area", "piece", "description", "length", "width", "thickness"];
  if (d.show.color) keys.push("color");
  keys.push("sinkModel", "sinkCuts", "faucetHoles", "rCorners", "joints", "qty");
  if (d.show.depIn) keys.push("depIn");
  if (d.show.jointDepIn) keys.push("jointDepIn");
  keys.push("cutLf", "depLfCalc", "sqftPerPc", "totalPcs", "totalSqft");
  if (d.show.notes) keys.push("notes");
  d.extraColumns.forEach((_, i) => keys.push(`extra${i}`));
  const col: Record<string, string> = {};
  keys.forEach((k, i) => (col[k] = colName(i + 1)));
  return { keys, col };
}

const edgeFormula = (rule: Piece["cutRule"], L: string, W: string, perFoot: number) =>
  rule === "perimeter" ? `2*(${L}+${W})/${perFoot}` : rule === "l+w" ? `(${L}+${W})/${perFoot}` : rule === "l" ? `${L}/${perFoot}` : rule === "w" ? `${W}/${perFoot}` : "";

function writeDrawing(wb: ExcelJS.Workbook, d: ProjectData, r: Result, layout: DrawingLayout) {
  const ws = wb.addWorksheet(SHEET.drawing, { views: [{ state: "frozen", ySplit: 4, topLeftCell: "A5", activeCell: "A1", showGridLines: false }] });
  titleBlock(ws, `${d.meta.name} - Drawing Summary`, d.sheetNotes.drawing);
  const { keys, col } = layout;
  const perFoot = UNITS_PER_FOOT[d.dimUnit];
  const labels: Record<string, string> = { cutLf: "Cutting LF", depLfCalc: "DE&P LF", sqftPerPc: "Sqft/Pc", totalPcs: "Total Pcs", totalSqft: "Total Sqft" };
  keys.forEach((k) => {
    const text = k.startsWith("extra") ? d.extraColumns[Number(k.slice(5))] : labels[k] ?? labelOf(d, k as ColumnKey);
    headerCell(ws, `${col[k]}4`, text);
  });
  ws.getRow(4).height = 28;
  const first = 5;
  const last = 4 + d.pieces.length;
  let band = false;
  let previous: string | null = null;
  r.rows.forEach((row, i) => {
    const x = first + i;
    const p = row.piece;
    const key = `${p.dwg}|${p.group}`;
    if (previous !== null && key !== previous) band = !band;
    previous = key;
    const fillArgb = band ? C.band : undefined;
    const base = { fillArgb };
    const L = `${col.length}${x}`;
    const W = `${col.width}${x}`;
    const text = (k: string, value: string, align: "left" | "center") => put(ws, `${col[k]}${x}`, asNumberIfWhole(value), { ...base, align, wrap: k === "group" });
    const num = (k: string, value: number | null, fmt?: string, align: "right" | "center" = "center") => put(ws, `${col[k]}${x}`, value, { ...base, kind: "input", align, fmt });
    text("dwg", p.dwg, "center");
    text("group", p.group, "left");
    text("area", p.area, "left");
    text("piece", p.piece, "center");
    text("description", p.description, "left");
    num("length", p.length, FMT.num3, "right");
    num("width", p.width, FMT.num3, "right");
    text("thickness", p.thickness, "center");
    if (d.show.color) text("color", p.color, "center");
    text("sinkModel", p.sinkModel, "center");
    num("sinkCuts", p.sinkCuts);
    num("faucetHoles", p.faucetHoles);
    num("rCorners", p.rCorners);
    num("joints", p.joints);
    num("qty", p.qty);
    if (d.show.jointDepIn) num("jointDepIn", p.jointDepIn, FMT.num3, "right");
    // Cutting LF and DE&P LF: the rule as a formula. A rounded typed figure stays until L or W changes; a figure that follows no rule is an input.
    const ruled = (k: string, f: string, typed: number | null, value: number, tolerance: number) => put(ws, `${col[k]}${x}`, formula(typed === null ? f : keepTyped(f, typed, tolerance), value), { ...base, align: "right", fmt: FMT.num3 });
    if (p.cutRule === "manual") num("cutLf", row.cutLf, FMT.num3, "right");
    else ruled("cutLf", edgeFormula(p.cutRule, L, W, perFoot), p.cutLf, row.cutLf, 0.006);
    // With a DE&P (in) column the inches are shown too and LF reads from them.
    if (d.show.depIn) {
      const inches = row.depLf * perFoot;
      if (p.depRule === "manual") num("depIn", inches, FMT.num3, "right");
      else {
        const f = p.depRule === "perimeter" ? `2*(${L}+${W})` : p.depRule === "l+w" ? `${L}+${W}` : p.depRule === "l" ? L : W;
        ruled("depIn", f, p.depLf === null ? null : inches, inches, 0.006 * perFoot);
      }
      put(ws, `${col.depLfCalc}${x}`, formula(`${col.depIn}${x}/${perFoot}`, row.depLf), { ...base, align: "right", fmt: FMT.num3 });
    } else if (p.depRule === "manual") num("depLfCalc", row.depLf, FMT.num3, "right");
    else ruled("depLfCalc", edgeFormula(p.depRule, L, W, perFoot), p.depLf, row.depLf, 0.006);
    put(ws, `${col.sqftPerPc}${x}`, formula(`${L}*${W}/${perFoot * perFoot}`, row.sqftPerPc), { ...base, align: "right", fmt: FMT.num2 });
    put(ws, `${col.totalPcs}${x}`, formula(`${col.qty}${x}`, row.totalPcs), { ...base, align: "right", fmt: FMT.int });
    put(ws, `${col.totalSqft}${x}`, formula(`${col.sqftPerPc}${x}*${col.totalPcs}${x}`, row.totalSqft), { ...base, align: "right", fmt: FMT.num2 });
    if (d.show.notes) {
      const note = put(ws, `${col.notes}${x}`, p.notes, { ...base, align: "left", wrap: true });
      note.font = { name: FONT, size: 8, italic: true, color: { argb: C.remark } };
    }
    d.extraColumns.forEach((name, n) => put(ws, `${col[`extra${n}`]}${x}`, p.extra?.[name] ?? "", { ...base, align: "left" }));
  });

  const t = last + 1;
  keys.forEach((k) => put(ws, `${col[k]}${t}`, null, { fillArgb: C.total, bold: true }));
  put(ws, `${col.group}${t}`, "TOTAL", { fillArgb: C.total, bold: true, align: "left" });
  const sumProduct = (k: string, result: number, align: "center" | "right" = "center", fmt = FMT.int) => put(ws, `${col[k]}${t}`, overRows(d, `SUMPRODUCT(${col[k]}${first}:${col[k]}${last},${col.qty}${first}:${col.qty}${last})`, result), { fillArgb: C.total, bold: true, align, fmt });
  sumProduct("sinkCuts", r.drawing.sinkCuts);
  sumProduct("faucetHoles", r.drawing.faucetHoles);
  sumProduct("rCorners", r.drawing.rCorners);
  sumProduct("joints", r.drawing.joints);
  sumProduct("cutLf", r.drawing.cutLf, "right", FMT.num2);
  sumProduct("depLfCalc", r.drawing.depLf, "right", FMT.num2);
  put(ws, `${col.totalPcs}${t}`, overRows(d, `SUM(${col.totalPcs}${first}:${col.totalPcs}${last})`, r.drawing.pcs), { fillArgb: C.total, bold: true, align: "right", fmt: FMT.int });
  put(ws, `${col.totalSqft}${t}`, overRows(d, `SUM(${col.totalSqft}${first}:${col.totalSqft}${last})`, r.drawing.sqft), { fillArgb: C.total, bold: true, align: "right", fmt: FMT.num2 });

  const sized: Record<string, number> = { length: 9, width: 9, sinkModel: 11, sinkCuts: 7, faucetHoles: 8, rCorners: 10, joints: 7, qty: 8, depIn: 9, jointDepIn: 9, cutLf: 9, depLfCalc: 9, sqftPerPc: 9, totalPcs: 8, totalSqft: 11, notes: 50, ...WIDTH, group: groupWidth(d) };
  keys.forEach((k, i) => (ws.getColumn(i + 1).width = sized[k] ?? 16));
  pageSetup(ws, true, false, 4);
}

// ─── Internal Costing / Customer Quote ──────────────────────────────────────

interface CostLayout {
  col: Record<string, string>;
  first: number;
  last: number;
  total: number;
}

function costLayout(d: ProjectData, side: Side): CostLayout {
  const ids = identityColumns(d);
  const keys: string[] = [...ids, "sqft", "qty", ...COST_KEYS, "perPc", "lineTotal", ...(side === "customer" ? ["perSqft"] : [])];
  const col: Record<string, string> = {};
  keys.forEach((k, i) => (col[k] = colName(i + 1)));
  return { col, first: 5, last: 4 + d.pieces.length, total: 5 + d.pieces.length };
}

/**
 * Which rate a piece takes, as a formula: the engine's rateRowFor(), so editing a color, thickness or sink model
 * in Excel picks the right rate there too (the original's =IF(D4="Pure White",C12,C13), for any number of rows).
 */
function pickRate(d: ProjectData, kind: CostKey, drawCol: Record<string, string>, x: number, cellOf: (rate: RateRow) => string): string {
  const list = d.variables.rates.filter((rate) => rate.kind === kind);
  if (list.length === 0) return "0";
  if (list.length === 1) return cellOf(list[0]);
  const fields = kind === "sink" ? ["sinkModel"] : kind === "material" ? ["color", "thickness"] : ["thickness", "color"];
  let expr = cellOf(list.find((rate) => !rate.match) ?? list[list.length - 1]);
  for (const field of [...fields].reverse()) {
    if (!drawCol[field]) continue;
    for (const rate of list.filter((row) => row.match).reverse()) expr = `IF(${DRAW}!${drawCol[field]}${x}&""="${(rate.match as string).replace(/"/g, '""')}",${cellOf(rate)},${expr})`;
  }
  return expr;
}

function writeCost(wb: ExcelJS.Workbook, d: ProjectData, r: Result, side: Side, drawing: DrawingLayout, map: VariablesMap, slabCells: SlabCells) {
  const name = side === "internal" ? SHEET.internal : SHEET.customer;
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4, topLeftCell: "A5", activeCell: "A1", showGridLines: false }] });
  const isSlab = d.variables.pricing === "slab";
  const defaultNote = isSlab ? "Material here is piece-sqft basis for reference only; the firm quote uses slab-basis material (Project Summary)." : "Material includes the wastage markup from Slab Calculation.";
  titleBlock(ws, `${d.meta.name} - ${side === "internal" ? "Internal Costing (My Cost)" : "Customer Quote"}`, d.sheetNotes[side] ?? defaultNote);
  const layout = costLayout(d, side);
  const { col, first, last, total } = layout;
  const ids = identityColumns(d);
  const drawCol = drawing.col;
  ids.forEach((k) => headerCell(ws, `${col[k]}4`, labelOf(d, k)));
  headerCell(ws, `${col.sqft}4`, "Sqft/Pc");
  headerCell(ws, `${col.qty}4`, labelOf(d, "qty"));
  COST_KEYS.forEach((k) => headerCell(ws, `${col[k]}4`, COST_LABEL[k]));
  headerCell(ws, `${col.perPc}4`, side === "internal" ? "Cost/Pc" : "Price/Pc");
  headerCell(ws, `${col.lineTotal}4`, side === "internal" ? "Total Cost" : "Total Price");
  if (side === "customer") headerCell(ws, `${col.perSqft}4`, "Price/Sqft");
  ws.getRow(4).height = 28;

  const rateCell = (row: RateRow) => (side === "internal" ? map.my[row.id] : map.customer[row.id]);
  const driver: Record<CostKey, (x: number) => string> = {
    material: (x) => `${col.sqft}${x}`,
    cutting: (x) => `${DRAW}!${drawCol.cutLf}${x}`,
    dep: (x) => `${DRAW}!${drawCol.depLfCalc}${x}`,
    sink: (x) => `${DRAW}!${drawCol.sinkCuts}${x}`,
    faucet: (x) => `${DRAW}!${drawCol.faucetHoles}${x}`,
    rcorner: (x) => `${DRAW}!${drawCol.rCorners}${x}`,
    joint: (x) => `${DRAW}!${drawCol.joints}${x}`,
    packing: (x) => `${col.sqft}${x}`,
  };

  let band = false;
  let previous: string | null = null;
  r.rows.forEach((row: RowResult, i) => {
    const x = first + i;
    const p = row.piece;
    const key = `${p.dwg}|${p.group}`;
    if (previous !== null && key !== previous) band = !band;
    previous = key;
    const base = { fillArgb: band ? C.band : undefined };
    ids.forEach((k) => {
      const value = String(p[k as keyof Piece] ?? "");
      const align = k === "group" || k === "area" || k === "description" ? "left" : "center";
      if (value === "") put(ws, `${col[k]}${x}`, null, base);
      else put(ws, `${col[k]}${x}`, formula(`${DRAW}!${drawCol[k]}${x}`, asNumberIfWhole(value)), { ...base, kind: "link", align, wrap: k === "group" });
    });
    put(ws, `${col.sqft}${x}`, formula(`${DRAW}!${drawCol.sqftPerPc}${x}`, row.sqftPerPc), { ...base, kind: "link", align: "right", fmt: FMT.num2 });
    put(ws, `${col.qty}${x}`, formula(`${DRAW}!${drawCol.qty}${x}`, p.qty), { ...base, kind: "link", align: "center", fmt: FMT.int });
    const line = row[side];
    for (const k of COST_KEYS) {
      const addr = `${col[k]}${x}`;
      const calculated = line.edited[k];
      if (calculated !== undefined) {
        put(ws, addr, line.costs[k], { kind: "input", align: "right", fmt: FMT.money, fillArgb: C.edited, note: `Edited by hand. Calculated value: ${num(calculated)}` });
        continue;
      }
      let f = `${driver[k](x)}*${pickRate(d, k, drawCol, x, rateCell)}`;
      if (k === "material" && !isSlab && d.variables.rates.some((rate) => rate.kind === "material")) f += `*(1+${pickRate(d, k, drawCol, x, (rate) => `${SLAB}!${slabCells.markup[rate.id]}`)})`;
      put(ws, addr, formula(f, line.costs[k]), { ...base, align: "right", fmt: FMT.money });
    }
    put(ws, `${col.perPc}${x}`, formula(`SUM(${col[COST_KEYS[0]]}${x}:${col[COST_KEYS[COST_KEYS.length - 1]]}${x})`, line.perPc), { ...base, align: "right", fmt: FMT.money });
    put(ws, `${col.lineTotal}${x}`, formula(`${col.perPc}${x}*${col.qty}${x}`, line.total), { ...base, align: "right", fmt: FMT.money });
    if (side === "customer") put(ws, `${col.perSqft}${x}`, formula(`IF(${col.sqft}${x}>0,${col.perPc}${x}/${col.sqft}${x},0)`, row.pricePerSqft), { ...base, align: "right", fmt: FMT.money });
  });

  const totals = r[side];
  const tb = { fillArgb: C.total, bold: true };
  Object.values(col).forEach((c) => put(ws, `${c}${total}`, null, tb));
  put(ws, `${col.group}${total}`, isSlab ? "TOTAL (qty-weighted - see Slab Calculation for the firm material figure)" : "TOTAL (qty-weighted)", { ...tb, align: "left" });
  put(ws, `${col.qty}${total}`, overRows(d, `SUM(${col.qty}${first}:${col.qty}${last})`, totals.qty), { ...tb, align: "center", fmt: FMT.int });
  for (const k of COST_KEYS) {
    put(ws, `${col[k]}${total}`, overRows(d, `SUMPRODUCT(${col[k]}${first}:${col[k]}${last},$${col.qty}$${first}:$${col.qty}$${last})`, totals.components[k]), { ...tb, align: "right", fmt: FMT.money });
  }
  put(ws, `${col.perPc}${total}`, "n/a", { ...tb, align: "right" });
  put(ws, `${col.lineTotal}${total}`, overRows(d, `SUM(${col.lineTotal}${first}:${col.lineTotal}${last})`, totals.total), { ...tb, align: "right", fmt: FMT.money });

  const sized: Record<string, number> = { ...WIDTH, group: groupWidth(d), sqft: 9, qty: 8, material: 12, cutting: 11, dep: 10, sink: 10, faucet: 10, rcorner: 11, joint: 9, packing: 11, perPc: 11, lineTotal: 14, perSqft: 10 };
  Object.entries(col).forEach(([k, c]) => (ws.getColumn(c).width = sized[k] ?? 10));
  pageSetup(ws, true, false, 4);
  return layout;
}

// ─── Quote Summary ──────────────────────────────────────────────────────────

function writeQuoteSummary(wb: ExcelJS.Workbook, d: ProjectData, r: Result, drawing: DrawingLayout, customer: CostLayout) {
  const ws = wb.addWorksheet(SHEET.quote, { views: [{ state: "frozen", ySplit: 4, topLeftCell: "A5", activeCell: "A1", showGridLines: false }] });
  titleBlock(ws, `${d.meta.name} - Quote Summary`, d.sheetNotes.quote);
  const ids = identityColumns(d);
  const keys = [...ids, "qty", "sqft", "totalSqft", "perPc", "lineTotal"];
  const col: Record<string, string> = {};
  keys.forEach((k, i) => (col[k] = colName(i + 1)));
  ids.forEach((k) => headerCell(ws, `${col[k]}4`, labelOf(d, k)));
  headerCell(ws, `${col.qty}4`, labelOf(d, "qty"));
  headerCell(ws, `${col.sqft}4`, "Sqft/Pc");
  headerCell(ws, `${col.totalSqft}4`, "Total Sqft");
  headerCell(ws, `${col.perPc}4`, "Price/Pc");
  headerCell(ws, `${col.lineTotal}4`, "Total Price");
  ws.getRow(4).height = 28;
  const CUST = quote(SHEET.customer);
  const first = 5;
  const last = 4 + d.pieces.length;
  let band = false;
  let previous: string | null = null;
  r.rows.forEach((row, i) => {
    const x = first + i;
    const p = row.piece;
    const key = `${p.dwg}|${p.group}`;
    if (previous !== null && key !== previous) band = !band;
    previous = key;
    const base = { fillArgb: band ? C.band : undefined, kind: "link" as Kind };
    ids.forEach((k) => {
      const value = String(p[k as keyof Piece] ?? "");
      const align = k === "group" || k === "area" || k === "description" ? "left" : "center";
      if (value === "") put(ws, `${col[k]}${x}`, null, { fillArgb: base.fillArgb });
      else put(ws, `${col[k]}${x}`, formula(`${DRAW}!${drawing.col[k]}${x}`, asNumberIfWhole(value)), { ...base, align, wrap: k === "group" });
    });
    put(ws, `${col.qty}${x}`, formula(`${DRAW}!${drawing.col.qty}${x}`, p.qty), { ...base, align: "center", fmt: FMT.int });
    put(ws, `${col.sqft}${x}`, formula(`${DRAW}!${drawing.col.sqftPerPc}${x}`, row.sqftPerPc), { ...base, align: "right", fmt: FMT.num2 });
    put(ws, `${col.totalSqft}${x}`, formula(`${DRAW}!${drawing.col.totalSqft}${x}`, row.totalSqft), { ...base, align: "right", fmt: FMT.num2 });
    put(ws, `${col.perPc}${x}`, formula(`${CUST}!${customer.col.perPc}${x}`, row.customer.perPc), { ...base, align: "right", fmt: FMT.money });
    put(ws, `${col.lineTotal}${x}`, formula(`${CUST}!${customer.col.lineTotal}${x}`, row.customer.total), { ...base, align: "right", fmt: FMT.money });
  });
  const t = last + 1;
  const tb = { fillArgb: C.total, bold: true };
  keys.forEach((k) => put(ws, `${col[k]}${t}`, null, tb));
  put(ws, `${col.group}${t}`, d.variables.pricing === "slab" ? "TOTAL (piece-basis material)" : "TOTAL", { ...tb, align: "left" });
  put(ws, `${col.qty}${t}`, overRows(d, `SUM(${col.qty}${first}:${col.qty}${last})`, r.customer.qty), { ...tb, align: "center", fmt: FMT.int });
  put(ws, `${col.totalSqft}${t}`, overRows(d, `SUM(${col.totalSqft}${first}:${col.totalSqft}${last})`, r.drawing.sqft), { ...tb, align: "right", fmt: FMT.num2 });
  put(ws, `${col.lineTotal}${t}`, overRows(d, `SUM(${col.lineTotal}${first}:${col.lineTotal}${last})`, r.customer.total), { ...tb, align: "right", fmt: FMT.money });
  const sized: Record<string, number> = { ...WIDTH, group: groupWidth(d), qty: 8, sqft: 9, totalSqft: 11, perPc: 11, lineTotal: 14 };
  keys.forEach((k, i) => (ws.getColumn(i + 1).width = sized[k] ?? 10));
  pageSetup(ws, true, false, 4);
}

// ─── Slab Calculation ───────────────────────────────────────────────────────

/** Slab Calculation's rows and columns, known up front because the cost sheets refer to the markup row. */
interface SlabCells {
  columns: Record<string, string>;
  totalCol: string;
  hasTotalCol: boolean;
  rows: Record<string, number>;
  /** $C$12 style address of each material's wastage markup. */
  markup: Record<string, string>;
}

function slabLayout(d: ProjectData, r: Result): SlabCells {
  const rows: Record<string, number> = {};
  let row = 5;
  const add = (k: string) => (rows[k] = row++);
  add("slabs");
  add("adjust");
  add("totalSlabs");
  add("area");
  add("purchased");
  if (r.slabs.some((g) => g.usedSource === "percent")) add("usedPct");
  add("used");
  add("wasted");
  add("utilization");
  add("wastage");
  if (d.variables.pricing === "piece") add("markup");
  add("cost");
  add("charge");
  row++;
  add("pricing");
  add("extra");
  if (r.slabs.some((g) => g.estimated)) add("estimate");
  rows.next = row;
  const columns: Record<string, string> = {};
  const markup: Record<string, string> = {};
  r.slabs.forEach((g, i) => {
    columns[g.rate.id] = colName(i + 2);
    markup[g.rate.id] = `$${colName(i + 2)}$${rows.markup ?? 0}`;
  });
  return { columns, totalCol: colName(r.slabs.length + 2), hasTotalCol: r.slabs.length > 1, rows, markup };
}

/** The drawing sqft a material prices, as a formula. */
function groupSqftFormula(d: ProjectData, r: Result, g: SlabGroup, drawing: DrawingLayout): string {
  const first = 5;
  const last = 4 + d.pieces.length;
  const c = drawing.col;
  if (r.slabs.length === 1) return `${DRAW}!${c.totalSqft}${last + 1}`;
  const mine = r.rows.map((row, i) => ({ row, x: first + i })).filter(({ row }) => row.rateRows.material?.id === g.rate.id);
  if (mine.length === 0) return "0";
  const match = g.rate.match?.trim().toLowerCase();
  const range = (k: string) => `${DRAW}!$${c[k]}$${first}:$${c[k]}$${last}`;
  const allMatch = (f: (p: Piece) => string) => match && r.rows.every((row) => (row.rateRows.material?.id === g.rate.id) === (f(row.piece).trim().toLowerCase() === match));
  const escaped = (g.rate.match ?? "").replace(/"/g, '""');
  if (d.show.color && allMatch((p) => p.color)) return `SUMIF(${range("color")},"${escaped}",${range("totalSqft")})`;
  if (allMatch((p) => p.thickness)) return `SUMIF(${range("thickness")},"${escaped}",${range("totalSqft")})`;
  return mine.map(({ x }) => `${DRAW}!${c.totalSqft}${x}`).join("+");
}

/** One material's part of a cost sheet's Material column, qty-weighted, as a formula. */
function materialShare(d: ProjectData, r: Result, g: SlabGroup, drawing: DrawingLayout, sheet: CostLayout, name: string): string {
  const c = drawing.col;
  const { first, last, total, col } = sheet;
  if (r.slabs.length === 1) return `${name}!${col.material}${total}`;
  const mine = r.rows.map((row, i) => ({ row, x: first + i })).filter(({ row }) => row.rateRows.material?.id === g.rate.id);
  if (mine.length === 0) return "0";
  const match = g.rate.match?.trim().toLowerCase();
  const allMatch = (f: (p: Piece) => string) => match && r.rows.every((row) => (row.rateRows.material?.id === g.rate.id) === (f(row.piece).trim().toLowerCase() === match));
  const costs = `${name}!$${col.material}$${first}:$${col.material}$${last}`;
  const qty = `${name}!$${col.qty}$${first}:$${col.qty}$${last}`;
  const escaped = (g.rate.match ?? "").replace(/"/g, '""');
  const by = (k: string) => `SUMPRODUCT((${DRAW}!$${c[k]}$${first}:$${c[k]}$${last}="${escaped}")*${costs}*${qty})`;
  if (d.show.color && allMatch((p) => p.color)) return by("color");
  if (allMatch((p) => p.thickness)) return by("thickness");
  return mine.map(({ x }) => `${name}!${col.material}${x}*${name}!${col.qty}${x}`).join("+");
}

function writeSlab(wb: ExcelJS.Workbook, d: ProjectData, r: Result, cells: SlabCells, drawing: DrawingLayout, map: VariablesMap) {
  const ws = wb.addWorksheet(SHEET.slab, { views: [{ state: "frozen", ySplit: 4, topLeftCell: "A5", activeCell: "A1", showGridLines: false }] });
  const { rows, columns, totalCol, hasTotalCol } = cells;
  const lastCol = r.slabs.length + 1 + (hasTotalCol ? 1 : 0);
  titleBlock(ws, `${d.meta.name} - Slab Calculation`, d.sheetNotes.slab ?? "Slab counts and used area from CutList Optimizer.", { lastCol: colName(Math.max(lastCol, 2)), widthChars: 58 + 18 * Math.max(lastCol - 1, 1) });
  headerCell(ws, "A4", "");
  r.slabs.forEach((g) => headerCell(ws, `${columns[g.rate.id]}4`, g.rate.label));
  if (hasTotalCol) headerCell(ws, `${totalCol}4`, "TOTAL");
  ws.getRow(4).height = 28;

  const label = (k: string, text: string, bold = false) => put(ws, `A${rows[k]}`, text, { align: "left", bold, fillArgb: bold ? C.total : undefined });
  label("slabs", "Slabs from CutList Optimizer");
  label("adjust", "Adjustment (+/-)");
  label("totalSlabs", "Total slabs");
  label("area", "Slab area each (sqft)");
  label("purchased", "Total slab area purchased (sqft)");
  if (rows.usedPct) label("usedPct", "Used area % (from CutList)");
  label("used", "Used area (sqft)");
  label("wasted", "Wasted area (sqft)");
  label("utilization", "Utilization %");
  label("wastage", "Wastage %");
  if (rows.markup) label("markup", "Wastage markup % (wastage + extra %)");
  const reference = d.variables.pricing === "piece" ? ", for reference" : "";
  label("cost", `Slab-basis material cost (My Cost)${reference}`, true);
  label("charge", `Slab-basis material charge (Customer)${reference}`, true);

  const extraCell = `$B$${rows.extra}`;
  const estimateCell = `$B$${rows.estimate ?? 0}`;
  r.slabs.forEach((g) => {
    const c = columns[g.rate.id];
    const cell = (k: string) => `${c}${rows[k]}`;
    const sqft = groupSqftFormula(d, r, g, drawing);
    if (g.estimated) {
      put(ws, cell("slabs"), formula(`ROUNDUP((${sqft})/(${cell("area")}*${estimateCell}),0)`, g.slabs), { align: "right", fmt: FMT.int, fillArgb: C.confirm, note: "Estimate: enter the CutList Optimizer count here." });
    } else put(ws, cell("slabs"), g.slabs, { kind: "input", align: "right", fmt: FMT.int });
    put(ws, cell("adjust"), g.adjustment, { kind: "input", align: "right", fmt: FMT.int });
    put(ws, cell("totalSlabs"), formula(`${cell("slabs")}+${cell("adjust")}`, g.totalSlabs), { align: "right", fmt: FMT.int });
    put(ws, cell("area"), formula(map.slabArea, r.slabArea), { kind: "link", align: "right", fmt: FMT.num2 });
    put(ws, cell("purchased"), formula(`${cell("totalSlabs")}*${cell("area")}`, g.purchased), { align: "right", fmt: FMT.num2 });
    if (rows.usedPct) {
      if (g.usedSource === "percent") put(ws, cell("usedPct"), g.rate.usedPct ?? 0, { kind: "input", align: "right", fmt: FMT.pct });
      else put(ws, cell("usedPct"), null, {});
    }
    if (g.usedSource === "percent") put(ws, cell("used"), formula(`${cell("purchased")}*${cell("usedPct")}`, g.used), { align: "right", fmt: FMT.num2 });
    else if (g.usedSource === "typed") put(ws, cell("used"), g.used, { kind: "input", align: "right", fmt: FMT.num2 });
    else put(ws, cell("used"), formula(sqft, g.used), { kind: "link", align: "right", fmt: FMT.num2 });
    put(ws, cell("wasted"), formula(`${cell("purchased")}-${cell("used")}`, g.wasted), { align: "right", fmt: FMT.num2 });
    // A typed used % stands on its own, whatever the slab count, as on 1633's Variables and Slab sheets.
    if (g.usedSource === "percent") {
      put(ws, cell("utilization"), formula(cell("usedPct"), g.utilization ?? 0), { align: "right", fmt: FMT.pct });
      put(ws, cell("wastage"), formula(`1-${cell("utilization")}`, g.wastagePct ?? 0), { align: "right", fmt: FMT.pct });
    } else {
      put(ws, cell("utilization"), formula(`IF(${cell("purchased")}<>0,${cell("used")}/${cell("purchased")},0)`, g.utilization ?? 0), { align: "right", fmt: FMT.pct });
      put(ws, cell("wastage"), formula(`IF(${cell("purchased")}<>0,1-${cell("utilization")},0)`, g.wastagePct ?? 0), { align: "right", fmt: FMT.pct });
    }
    if (rows.markup) put(ws, cell("markup"), formula(`${cell("wastage")}+${extraCell}`, g.markup), { align: "right", fmt: FMT.pct });
    put(ws, cell("cost"), formula(`${cell("purchased")}*${map.my[g.rate.id]}`, g.materialCost), { align: "right", fmt: FMT.money, bold: true, fillArgb: C.total });
    put(ws, cell("charge"), formula(`${cell("purchased")}*${map.my[g.rate.id]}`, g.materialCharge), { align: "right", fmt: FMT.money, bold: true, fillArgb: C.total });
  });

  if (hasTotalCol) {
    const firstC = columns[r.slabs[0].rate.id];
    const lastC = columns[r.slabs[r.slabs.length - 1].rate.id];
    const sum = (k: string, result: number, fmt: string, extra: CellOptions = {}) => put(ws, `${totalCol}${rows[k]}`, formula(`SUM(${firstC}${rows[k]}:${lastC}${rows[k]})`, result), { align: "right", fmt, bold: true, ...extra });
    const t = r.slabTotals;
    sum("slabs", t.slabs, FMT.int);
    sum("adjust", t.adjustment, FMT.int);
    sum("totalSlabs", t.totalSlabs, FMT.int);
    put(ws, `${totalCol}${rows.area}`, null, {});
    sum("purchased", t.purchased, FMT.num2);
    if (rows.usedPct) put(ws, `${totalCol}${rows.usedPct}`, null, {});
    sum("used", t.used, FMT.num2);
    sum("wasted", t.wasted, FMT.num2);
    put(ws, `${totalCol}${rows.wastage}`, formula(`IF(${totalCol}${rows.purchased}>0,${totalCol}${rows.wasted}/${totalCol}${rows.purchased},0)`, t.wastagePct ?? 0), { align: "right", fmt: FMT.pct, bold: true });
    put(ws, `${totalCol}${rows.utilization}`, formula(`1-${totalCol}${rows.wastage}`, t.utilization ?? 0), { align: "right", fmt: FMT.pct, bold: true });
    if (rows.markup) put(ws, `${totalCol}${rows.markup}`, null, {});
    sum("cost", t.materialCost, FMT.money, { fillArgb: C.total });
    sum("charge", t.materialCharge, FMT.money, { fillArgb: C.total });
  }

  put(ws, `A${rows.pricing}`, "Material priced on", { align: "left" });
  // Not marked as an input: the formulas are written for this setting, so changing it takes a re-upload.
  put(ws, `B${rows.pricing}`, d.variables.pricing === "slab" ? "Slabs purchased" : "Piece sqft + wastage %", { align: "right" });
  put(ws, `A${rows.extra}`, "Extra wastage % (added to wasted % for the markup)", { align: "left" });
  put(ws, `B${rows.extra}`, d.variables.wastageExtra, { kind: "input", align: "right", fmt: FMT.pct });
  if (rows.estimate) {
    put(ws, `A${rows.estimate}`, "Estimate utilization % (until a CutList count is entered)", { align: "left" });
    put(ws, `B${rows.estimate}`, d.variables.estimateUtilization, { kind: "input", align: "right", fmt: FMT.pct });
  }

  let row = rows.next + 1;
  for (const dr of r.drivers) {
    sectionBar(ws, row++, `SLAB DRIVER - ${dr.label}`, 2);
    const line = (text: string, value: ExcelJS.CellValue, o: CellOptions) => {
      put(ws, `A${row}`, text, { align: "left" });
      put(ws, `B${row}`, value, { align: "right", ...o });
      return row++;
    };
    const totalSlabsCell = `${hasTotalCol ? totalCol : "B"}${rows.totalSlabs}`;
    const wastedCell = `${hasTotalCol ? totalCol : "B"}${rows.wasted}`;
    line("Pieces", dr.pieces, { kind: "input", fmt: FMT.int });
    line("Pieces per slab", dr.piecesPerSlab, { kind: "input", fmt: FMT.int });
    const dedicated = line("Dedicated slabs", dr.dedicatedSlabs, { kind: "input", fmt: FMT.int });
    line("Share of total slabs", formula(`IF(${totalSlabsCell}<>0,B${dedicated}/${totalSlabsCell},0)`, dr.shareOfSlabs ?? 0), { fmt: FMT.pct });
    const waste = line(`Waste on these slabs (sqft) - ${dr.wastePerSlabSqIn.toLocaleString("en-US")} sq in each`, formula(`B${dedicated}*${dr.wastePerSlabSqIn}/144`, dr.wasteSqft), { fmt: FMT.num2 });
    line("Share of total waste", formula(`IF(${wastedCell}<>0,B${waste}/${wastedCell},0)`, dr.shareOfWaste ?? 0), { fmt: FMT.pct });
    if (dr.note) {
      const note = ws.getCell(`A${row++}`);
      note.value = dr.note;
      note.font = { name: FONT, size: 8, italic: true, color: { argb: C.remark } };
      note.alignment = { wrapText: true, vertical: "top" };
    }
    row++;
  }
  for (const text of d.variables.slabNotes.split("\n").filter(Boolean)) {
    const note = ws.getCell(`A${row++}`);
    note.value = text;
    note.font = { name: FONT, size: 8, italic: true, color: { argb: C.remark } };
    note.alignment = { wrapText: true, vertical: "top" };
  }
  widths(ws, [58, ...Array(Math.max(lastCol - 1, 1)).fill(18)]);
  pageSetup(ws, r.slabs.length > 3, true);
}

// ─── Project Summary ────────────────────────────────────────────────────────

function writeSummary(wb: ExcelJS.Workbook, d: ProjectData, r: Result, drawing: DrawingLayout, internal: CostLayout, customer: CostLayout, slab: SlabCells, map: VariablesMap) {
  const ws = wb.addWorksheet(SHEET.summary, { views: [{ state: "frozen", ySplit: 3, topLeftCell: "A4", activeCell: "A1", showGridLines: false }] });
  titleBlock(ws, `${d.meta.name} - Project Summary`, d.sheetNotes.summary, { lastCol: "C", widthChars: 131 });
  const s = r.summary;
  const c = drawing.col;
  const first = 5;
  const last = 4 + d.pieces.length;
  const t = last + 1;
  const dr = (k: string) => `${DRAW}!${c[k]}${t}`;
  const range = (k: string) => `${DRAW}!${c[k]}${first}:${c[k]}${last}`;
  const slabTotal = slab.hasTotalCol ? slab.totalCol : "B";
  const sl = (k: string) => `${SLAB}!${slabTotal}${slab.rows[k]}`;
  const INT = quote(SHEET.internal);
  const CUST = quote(SHEET.customer);

  let row = 4;
  const section = (text: string) => {
    if (row > 4) row++;
    sectionBar(ws, row++, text, 2);
  };
  const line = (text: string, value: ExcelJS.CellValue, o: CellOptions & { strong?: boolean }) => {
    const fillArgb = o.strong ? C.total : undefined;
    put(ws, `A${row}`, text, { align: "left", bold: o.strong, fillArgb, wrap: true });
    put(ws, `B${row}`, value, { align: "right", bold: o.strong, fillArgb, ...o });
    return row++;
  };
  const isSlab = d.variables.pricing === "slab";

  section("SCOPE");
  line("Pieces (Drawing Summary)", formula(dr("totalPcs"), r.drawing.pcs), { kind: "link", fmt: FMT.int });
  const sqft = line("Piece sqft", formula(dr("totalSqft"), r.drawing.sqft), { kind: "link", fmt: FMT.num2 });
  const slabsRow = line(s.slabsEstimated ? "Slabs required (estimate: enter the CutList count on Slab Calculation)" : "Slabs required", formula(sl("totalSlabs"), r.slabTotals.totalSlabs), { kind: "link", fmt: FMT.int });
  line("Sink cutouts", formula(dr("sinkCuts"), r.drawing.sinkCuts), { kind: "link", fmt: FMT.int });
  line("Total unit types", overRows(d, `ROUND(SUMPRODUCT((${range("group")}<>"")/COUNTIF(${range("group")},${range("group")}&"")),0)`, s.unitTypes), { fmt: FMT.int });
  if (s.totalUnits !== null) line("Total units (all types)", overRows(d, `ROUND(SUMPRODUCT((${range("group")}<>"")*${range("qty")}/COUNTIF(${range("group")},${range("group")}&"")),0)`, s.totalUnits), { fmt: FMT.int });
  line("Total pieces (non-vanity areas)", overRows(d, `SUMPRODUCT((NOT(ISNUMBER(SEARCH("Vanity",${range("area")}))))*${range("totalPcs")})`, s.nonVanityPcs), { fmt: FMT.int });
  line("Total pieces (vanity areas)", overRows(d, `SUMPRODUCT((ISNUMBER(SEARCH("Vanity",${range("area")})))*${range("totalPcs")})`, s.vanityPcs), { fmt: FMT.int });
  line("Total slab sqft", formula(sl("purchased"), r.slabTotals.purchased), { kind: "link", fmt: FMT.num2 });
  line("Total wastage sqft", formula(sl("wasted"), r.slabTotals.wasted), { kind: "link", fmt: FMT.num2 });
  line("Overall wastage %", formula(sl("wastage"), r.slabTotals.wastagePct ?? 0), { kind: "link", fmt: FMT.pct });

  section(isSlab ? "COST BUILD-UP (piece-basis fabrication + slab-basis material)" : "COST BUILD-UP (fabrication + piece-basis material with wastage)");
  const iTotal = `${INT}!${internal.col.lineTotal}${internal.total}`;
  const iMat = `${INT}!${internal.col.material}${internal.total}`;
  const cTotal = `${CUST}!${customer.col.lineTotal}${customer.total}`;
  const cMat = `${CUST}!${customer.col.material}${customer.total}`;
  const f1 = line("Fabrication cost (Cutting+DE&P+Sink+Faucet+R-Corner+Joint+Packing) - My Cost", formula(`${iTotal}-${iMat}`, r.internal.fabrication), { fmt: FMT.money });
  const m1 = line(isSlab ? "Slab-basis Material Cost" : "Material Cost (piece sqft + wastage)", formula(isSlab ? sl("cost") : iMat, s.internalMaterial), { kind: "link", fmt: FMT.money });
  const tot1 = line("TOTAL INTERNAL COST (My Cost)", formula(`B${f1}+B${m1}`, s.totalInternal), { fmt: FMT.money, strong: true });
  const f2 = line("Fabrication cost (Customer side)", formula(`${cTotal}-${cMat}`, r.customer.fabrication), { fmt: FMT.money });
  const m2 = line(isSlab ? "Material charge to customer (slab-basis)" : "Material charge to customer (piece sqft + wastage)", formula(isSlab ? sl("charge") : cMat, s.customerMaterial), { kind: "link", fmt: FMT.money });
  const tot2 = line("TOTAL CUSTOMER QUOTE", formula(`B${f2}+B${m2}`, s.totalCustomer), { fmt: FMT.money, strong: true });

  section("MARGIN");
  const margin = line("Gross Margin $", formula(`B${tot2}-B${tot1}`, s.margin), { fmt: FMT.money });
  line("Gross Margin %", formula(`IF(B${tot2}<>0,B${margin}/B${tot2},0)`, s.marginPct ?? 0), { fmt: FMT.pct2 });
  line("Customer price per slab", formula(`IF(B${slabsRow}<>0,B${tot2}/B${slabsRow},0)`, s.pricePerSlab ?? 0), { fmt: FMT.money });

  row++;
  headerCell(ws, `A${row}`, "FINAL RATE PER SQFT (on piece sqft)", "left");
  headerCell(ws, `B${row}`, "My Cost $/sqft");
  headerCell(ws, `C${row}`, "Customer $/sqft");
  row++;
  put(ws, `A${row}`, "Rate per sqft (Total / piece sqft)", { align: "left", bold: true, fillArgb: C.total });
  put(ws, `B${row}`, formula(`IF(B${sqft}<>0,B${tot1}/B${sqft},0)`, s.myCostPerSqft ?? 0), { align: "right", bold: true, fillArgb: C.total, fmt: FMT.money });
  put(ws, `C${row}`, formula(`IF(B${sqft}<>0,B${tot2}/B${sqft},0)`, s.customerPerSqft ?? 0), { align: "right", bold: true, fillArgb: C.total, fmt: FMT.money });
  row++;

  row++;
  headerCell(ws, `A${row}`, "MATERIAL COST SPLIT", "left");
  headerCell(ws, `B${row}`, "My Cost");
  headerCell(ws, `C${row}`, "Customer");
  row++;
  r.materialSplit.forEach((m, i) => {
    const g = r.slabs[i];
    const col = slab.columns[g.rate.id];
    const name = g.rate.label.replace(/"/g, '""');
    // The wording follows the sheets, so it can't go stale when a rate or a slab count is edited in Excel.
    if (isSlab) {
      const wording = `"${name} - "&${SLAB}!${col}${slab.rows.totalSlabs}&" slabs @ $"&${map.my[g.rate.id]}&"/sqft"`;
      put(ws, `A${row}`, formula(wording, `${g.rate.label} - ${g.totalSlabs} slabs @ $${r.rates[g.rate.id].my}/sqft`), { align: "left" });
      put(ws, `B${row}`, formula(`${SLAB}!${col}${slab.rows.cost}`, m.internal), { kind: "link", align: "right", fmt: FMT.money });
      put(ws, `C${row}`, formula(`${SLAB}!${col}${slab.rows.charge}`, m.customer), { kind: "link", align: "right", fmt: FMT.money });
    } else {
      const wording = `"${name} - "&TEXT(${groupSqftFormula(d, r, g, drawing)},"#,##0.00")&" sqft @ $"&${map.my[g.rate.id]}&"/sqft + "&TEXT(${SLAB}!${col}${slab.rows.markup},"0.0%")&" wastage"`;
      put(ws, `A${row}`, formula(wording, `${g.rate.label} - ${num(m.sqft)} sqft @ $${r.rates[g.rate.id].my}/sqft + ${pct(m.markup)} wastage`), { align: "left" });
      put(ws, `B${row}`, formula(materialShare(d, r, g, drawing, internal, INT), m.internal), { align: "right", fmt: FMT.money });
      put(ws, `C${row}`, formula(materialShare(d, r, g, drawing, customer, CUST), m.customer), { align: "right", fmt: FMT.money });
    }
    row++;
  });

  if (d.notes.length) {
    row++;
    sectionBar(ws, row++, "NOTES / ASSUMPTIONS", 2);
    for (const text of d.notes) {
      const note = ws.getCell(`A${row++}`);
      note.value = text;
      note.font = { name: FONT, size: 9, color: { argb: C.note } };
      note.alignment = { wrapText: true, vertical: "top" };
    }
  }
  widths(ws, [95, 18, 18]);
  pageSetup(ws, false, true);
}

// ─── Workbook ───────────────────────────────────────────────────────────────

export async function buildWorkbook(d: ProjectData): Promise<Buffer> {
  const r = calculate(d);
  const wb = new ExcelJS.Workbook();
  wb.creator = "CTS Costing Tool";
  wb.created = new Date();
  wb.calcProperties = { fullCalcOnLoad: true };
  const drawing = drawingColumns(d);
  const map = layoutVariables(d);
  const slab = slabLayout(d, r);
  writeVariables(wb, d, r, map);
  writeDrawing(wb, d, r, drawing);
  const internal = writeCost(wb, d, r, "internal", drawing, map, slab);
  const customer = writeCost(wb, d, r, "customer", drawing, map, slab);
  writeQuoteSummary(wb, d, r, drawing, customer);
  writeSlab(wb, d, r, slab, drawing, map);
  writeSummary(wb, d, r, drawing, internal, customer, slab, map);
  return withoutErrorPrompts(await wb.xlsx.writeBuffer());
}

/**
 * Excel's green-triangle prompts ("Ignore Error") would appear where the sheets
 * are different on purpose, e.g. a typed LF next to a calculated one. ExcelJS
 * can't write this setting, so it is added to each sheet's XML here.
 */
async function withoutErrorPrompts(file: ExcelJS.Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(file as ArrayBuffer);
  const setting = '<ignoredErrors><ignoredError sqref="A1:XFD1048576" numberStoredAsText="1" formula="1" formulaRange="1"/></ignoredErrors>';
  for (const name of Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const xml = await zip.file(name)!.async("string");
    // The schema fixes the order: this goes before any drawing, legacy drawing, table or extension.
    const at = xml.search(/<(drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst)\b|<\/worksheet>/);
    zip.file(name, xml.slice(0, at) + setting + xml.slice(at));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export const workbookFileName = (d: ProjectData) => `${d.meta.name.replace(/[^A-Za-z0-9 ._#-]+/g, "").trim().replace(/\s+/g, "_") || "Costing"}.xlsx`;

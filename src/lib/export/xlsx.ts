import "server-only";
import ExcelJS from "exceljs";
import { AUDIENCE_LABEL, type ColFormat, type ExportDoc } from "./types";

const BRAND = "FF0F4C5C";
const INTERNAL = "FF7C3AED";

function numFmt(f: ColFormat | undefined, currency: string): string | undefined {
  const cur = currency === "USD" ? '"$"' : `"${currency} "`;
  switch (f) {
    case "int":
      return "#,##0";
    case "dec2":
      return "#,##0.00";
    case "dec4":
      return "#,##0.0000";
    case "money":
      return `${cur}#,##0.00;-${cur}#,##0.00`;
    case "rate":
      return `${cur}#,##0.0000`;
    case "pct":
      return "0.00%";
    default:
      return undefined;
  }
}

/** One worksheet per table, each with the document heading, a styled header row, filters and frozen panes. */
export async function exportToXlsx(doc: ExportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CTS — Costing & Quotation";
  wb.created = new Date(doc.generatedAt);
  const used = new Set<string>();

  for (const table of doc.tables) {
    let name = table.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${table.title.slice(0, 27)} (${i})`;
    used.add(name.toLowerCase());
    const ws = wb.addWorksheet(name);
    const span = Math.max(table.columns.length, 2);

    const title = ws.addRow([doc.title]);
    title.font = { bold: true, size: 14, color: { argb: BRAND } };
    ws.mergeCells(title.number, 1, title.number, span);
    if (doc.subtitle) ws.addRow([doc.subtitle]).font = { color: { argb: "FF475467" } };
    if (doc.audience !== "general") {
      const a = ws.addRow([AUDIENCE_LABEL[doc.audience]]);
      a.font = { bold: true, color: { argb: doc.audience === "internal" ? INTERNAL : "FF047857" } };
    }
    for (const [k, v] of doc.meta) ws.addRow([k, v]).getCell(1).font = { color: { argb: "FF667085" } };
    ws.addRow([]);
    const tt = ws.addRow([table.title]);
    tt.font = { bold: true, size: 12 };

    const header = ws.addRow(table.columns.map((c) => c.header));
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FFD0D5DD" } } };
    });
    header.height = 30;
    const headerRow = header.number;

    for (const r of table.rows) ws.addRow(r.map((v) => (v === null ? "" : v)));
    if (table.footer) {
      const f = ws.addRow(table.footer.map((v) => (v === null ? "" : v)));
      f.font = { bold: true };
      f.eachCell((cell) => (cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F4F7" } }));
    }
    if (table.note) ws.addRow([table.note]).font = { italic: true, color: { argb: "FF667085" } };

    table.columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      const fmt = numFmt(c.format, doc.currency);
      if (fmt) col.numFmt = fmt;
      const longest = Math.max(c.header.length, ...table.rows.slice(0, 300).map((r) => String(r[i] ?? "").length));
      col.width = Math.min(Math.max(longest + 2, c.format && c.format !== "text" ? 11 : 8), 48);
      if (c.format && c.format !== "text") col.alignment = { horizontal: "right" };
    });
    ws.views = [{ state: "frozen", ySplit: headerRow }];
    if (table.rows.length) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow + table.rows.length, column: table.columns.length } };
    ws.pageSetup = { orientation: table.columns.length > 8 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

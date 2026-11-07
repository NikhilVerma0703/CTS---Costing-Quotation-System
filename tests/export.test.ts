/**
 * The Excel export: seven sheets, live formulas, and re-uploading the file gives
 * back the same project. That Excel itself calculates the same numbers from
 * those formulas was checked separately with Excel (see docs/VERIFICATION.md).
 */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/engine";
import { buildWorkbook } from "@/lib/export-xlsx";
import { importProject } from "@/lib/import";
import { COST_KEYS, DEFAULT_VARIABLES } from "@/lib/model";
import { importFile } from "./helpers";

const FILES = ["Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx", "Project_1633_The_Approach_Quote.xlsx", "Peoria_Gateway_Quote_Ver10.xlsx"];
const SHEETS = ["Variables", "Drawing Summary", "Internal Costing", "Customer Quote", "Quote Summary", "Slab Calculation", "Project Summary"];

describe.each(FILES)("export of %s", (file) => {
  it("has the seven sheets, and formulas instead of typed results", async () => {
    const d = await importFile(file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(d)) as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(SHEETS);
    let formulas = 0;
    for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => void (c.type === ExcelJS.ValueType.Formula && formulas++)));
    expect(formulas).toBeGreaterThan(d.pieces.length * 20);
    const internal = wb.getWorksheet("Internal Costing")!;
    let cuttingCol = 0;
    internal.getRow(4).eachCell((c, i) => {
      if (c.value === "Cutting $") cuttingCol = i;
    });
    const cell = internal.getRow(5).getCell(cuttingCol).value as ExcelJS.CellFormulaValue;
    expect(cell.formula).toMatch(/^'Drawing Summary'![A-Z]+5\*Variables!\$C\$\d+$/);
  });

  it("uploading the exported file gives back the same numbers", async () => {
    const d = await importFile(file);
    const before = calculate(d);
    const buffer = await buildWorkbook(d);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    const back = await importProject({ drawing: { name: "export.xlsx", data } }, { fallback: DEFAULT_VARIABLES });
    expect(back.errors).toEqual([]);
    const after = calculate(back.data!);
    expect(after.rows.length).toBe(before.rows.length);
    expect(back.data!.variables.pricing).toBe(d.variables.pricing);
    expect(back.data!.variables.rates.map((r) => [r.kind, r.label, r.match, r.myCost, r.customer])).toEqual(d.variables.rates.map((r) => [r.kind, r.label, r.match, r.myCost, r.customer]));
    expect(back.data!.notes).toEqual(d.notes);
    expect(back.data!.variables.packingNote).toBe(d.variables.packingNote);
    expect(back.data!.variables.drivers.map((x) => [x.label, x.pieces, x.piecesPerSlab, x.dedicatedSlabs, x.wastePerSlabSqIn, x.note])).toEqual(d.variables.drivers.map((x) => [x.label, x.pieces, x.piecesPerSlab, x.dedicatedSlabs, x.wastePerSlabSqIn, x.note]));
    expect(after.summary.totalInternal).toBeCloseTo(before.summary.totalInternal, 6);
    expect(after.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer, 6);
    expect(after.slabTotals.purchased).toBeCloseTo(before.slabTotals.purchased, 6);
    after.rows.forEach((row, i) => {
      const was = before.rows[i];
      expect(row.piece.description).toBe(was.piece.description);
      expect(row.piece.piece).toBe(was.piece.piece);
      for (const key of COST_KEYS) {
        expect(row.internal.costs[key]).toBeCloseTo(was.internal.costs[key], 6);
        expect(row.customer.costs[key]).toBeCloseTo(was.customer.costs[key], 6);
      }
    });
  });
});

describe("cells that link to others in the export", () => {
  const load = async (d: Awaited<ReturnType<typeof importFile>>) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(d)) as never);
    return wb;
  };
  const packingRow = (ws: ExcelJS.Worksheet) => {
    for (let row = 12; row < 40; row++) if (/^packing$/i.test(String(ws.getCell(`A${row}`).value))) return row;
    throw new Error("no packing row");
  };
  const formulaOf = (cell: ExcelJS.Cell) => (cell.value as { formula?: string } | null)?.formula;

  it("a typed packing My Cost leaves the Customer Charge on the calculation, as on the sheets (=B28 in both)", async () => {
    const d = await importFile(FILES[0]);
    const linked = await load(d);
    const ws = linked.getWorksheet("Variables")!;
    const row = packingRow(ws);
    const calculation = formulaOf(ws.getCell(`C${row}`));
    expect(calculation).toMatch(/^B\d+$/);
    expect(formulaOf(ws.getCell(`D${row}`))).toBe(calculation);

    const before = calculate(d).packing.perSqft;
    d.variables.rates.find((r) => r.kind === "packing")!.myCost = 0.5;
    const typed = (await load(d)).getWorksheet("Variables")!;
    expect(typed.getCell(`C${row}`).value).toBe(0.5);
    expect(formulaOf(typed.getCell(`D${row}`))).toBe(calculation);
    expect(calculate(d).rates[d.variables.rates.find((r) => r.kind === "packing")!.id].customer).toBeCloseTo(before, 10);
  });

  it("the customer's slab material reads the My Cost cell, as Lennar's B15 and Peoria's B14 do", async () => {
    const ws = (await load(await importFile(FILES[0]))).getWorksheet("Slab Calculation")!;
    let charge = "";
    ws.eachRow((row) => {
      if (/material charge/i.test(String(row.getCell(1).value))) charge = formulaOf(row.getCell(2)) ?? "";
    });
    expect(charge).toMatch(/Variables!\$C\$12$/);
  });

  it("a piece's rate is picked by its color, thickness or sink model in Excel too, as the engine does", async () => {
    const peoria = (await load(await importFile(FILES[2]))).getWorksheet("Internal Costing")!;
    const header = peoria.getRow(4);
    let material = 0;
    header.eachCell((c, i) => {
      if (c.value === "Material $") material = i;
    });
    const f = formulaOf(peoria.getRow(5).getCell(material))!;
    expect(f).toMatch(/IF\('Drawing Summary'![A-Z]+5&""="Pure White",Variables!\$C\$12,IF\('Drawing Summary'![A-Z]+5&""="Calacatta Gold",Variables!\$C\$13/);

    const lennar = (await load(await importFile(FILES[0]))).getWorksheet("Internal Costing")!;
    expect(formulaOf(lennar.getRow(5).getCell(material))).toMatch(/\*Variables!\$C\$12$/);
  });

  it("the exchange rate at zero doesn't fill the workbook with #DIV/0!", async () => {
    const ws = (await load(await importFile(FILES[0]))).getWorksheet("Variables")!;
    const rows: Record<string, string> = {};
    ws.eachRow((row) => {
      const f = formulaOf(row.getCell(2));
      if (f) rows[String(row.getCell(1).value)] = f;
    });
    expect(rows["Total Packing (USD)"]).toMatch(/^IF\(B\d+<>0,B\d+\/B\d+,0\)$/);
    expect(rows["Packing per Sqft (USD)"]).toMatch(/^IF\(B\d+<>0,B\d+\/B\d+,0\)$/);
  });

  it("a figure that only rounds its formula stays exact, and gives way when its inputs change", async () => {
    const wb = await load(await importFile(FILES[2]));
    const d = wb.getWorksheet("Drawing Summary")!;
    let cut = 0;
    d.getRow(4).eachCell((c, i) => {
      if (c.value === "Cutting LF") cut = i;
    });
    expect(formulaOf(d.getRow(5).getCell(cut))).toMatch(/^IF\(ABS\(2\*\(F5\+G5\)\/12-20\.2083\)<=0\.006,20\.2083,2\*\(F5\+G5\)\/12\)$/);
    const v = wb.getWorksheet("Variables")!;
    const typed: string[] = [];
    v.eachRow((row) => {
      if (/^Total Project Sqft/.test(String(row.getCell(1).value))) typed.push(formulaOf(row.getCell(2)) ?? "");
    });
    expect(typed[0]).toMatch(/^IF\(ABS\('Drawing Summary'![A-Z]+\d+-2761\.33\)<=0\.01,2761\.33,'Drawing Summary'![A-Z]+\d+\)$/);
  });

  it("priced on pieces, the material split on Project Summary adds up to the Material Cost line", async () => {
    const d = await importFile(FILES[1]);
    const ws = (await load(d)).getWorksheet("Project Summary")!;
    const split: number[] = [];
    let material = 0;
    ws.eachRow((row) => {
      const a = row.getCell(1).value as { result?: string; formula?: string } | string | null;
      const text = typeof a === "object" && a ? a.result ?? "" : String(a ?? "");
      // ExcelJS leaves `result` empty when the saved result is 0.
      if (/sqft @ \$.*wastage$/.test(text)) split.push((row.getCell(2).value as { result?: number }).result ?? 0);
      if (/^Material Cost \(piece sqft/.test(text)) material = (row.getCell(2).value as { result: number }).result;
    });
    expect(split.length).toBe(2);
    expect(split[0] + split[1]).toBeCloseTo(material, 6);
    expect(material).toBeCloseTo(calculate(d).summary.internalMaterial, 6);
  });

  it("the material split's wording follows the sheets, so it can't go stale in Excel", async () => {
    const wb = await load(await importFile(FILES[2]));
    const ws = wb.getWorksheet("Project Summary")!;
    const cells: ExcelJS.Cell[] = [];
    ws.eachRow((row) => {
      const cell = row.getCell(1);
      if (formulaOf(cell)?.includes("slabs @")) cells.push(cell);
    });
    expect(cells.length).toBe(2);
    expect(formulaOf(cells[0])).toMatch(/'Slab Calculation'!B\d+.*Variables!\$C\$12/);
    expect((cells[0].value as { result?: string }).result).toMatch(/Pure White.* - 39 slabs @ \$4\.5\/sqft/);
  });
});

describe("hand-edited cells in the export", () => {
  it("are written as typed values, marked, and included in the totals' formula results", async () => {
    const d = await importFile(FILES[0]);
    d.overrides.internal[d.pieces[0].id] = { sink: 9 };
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await buildWorkbook(d)) as never);
    const ws = wb.getWorksheet("Internal Costing")!;
    const header = ws.getRow(4);
    let sinkCol = 0;
    header.eachCell((c, i) => {
      if (c.value === "Sink $") sinkCol = i;
    });
    const cell = ws.getRow(5).getCell(sinkCol);
    expect(cell.value).toBe(9);
    expect(String(cell.note)).toMatch(/Edited by hand/);
  });

  it("come back as hand-edited cells when the exported file is uploaded again", async () => {
    const d = await importFile(FILES[0]);
    d.overrides.internal[d.pieces[0].id] = { sink: 9 };
    d.overrides.customer[d.pieces[2].id] = { cutting: 7.5, joint: 1 };
    const buf = await buildWorkbook(d);
    const back = await importProject({ drawing: { name: "export.xlsx", data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer } }, { fallback: DEFAULT_VARIABLES });
    const again = back.data!;
    expect(again.overrides.internal[again.pieces[0].id]).toEqual({ sink: 9 });
    expect(again.overrides.customer[again.pieces[2].id]).toEqual({ cutting: 7.5, joint: 1 });
    expect(calculate(again).summary.totalCustomer).toBeCloseTo(calculate(d).summary.totalCustomer, 6);
    expect(again.importNotes.join(" ")).not.toMatch(/uploaded workbook shows/);
  });
});

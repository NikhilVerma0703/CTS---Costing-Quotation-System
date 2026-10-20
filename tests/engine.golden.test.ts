/**
 * Golden test: the engine must reproduce every calculated cell of the seven
 * uploaded workbooks (reference-sheets/). Expected values are read from the
 * workbooks' own cached formula results, not typed in by hand.
 */
import path from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { calculateProject } from "@/lib/engine/calculate";
import type { EngineResult } from "@/lib/engine/types";
import { referenceEngineInput } from "./helpers/reference-input";

const DIR = path.resolve(__dirname, "..", "reference-sheets");
const sheets: Record<string, ExcelJS.Worksheet> = {};

async function load(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(DIR, file));
  return wb.worksheets[0];
}

/** Cached value of a cell (formula result or literal). */
function v(ws: ExcelJS.Worksheet, ref: string): number {
  const cell = ws.getCell(ref).value as unknown;
  let raw = cell;
  if (cell && typeof cell === "object" && "formula" in (cell as object)) {
    // ExcelJS leaves `result` undefined when the cached value is 0.
    raw = (cell as { result?: unknown }).result ?? 0;
  }
  if (typeof raw !== "number") throw new Error(`${ws.name}!${ref} is not a number: ${JSON.stringify(cell)}`);
  return raw;
}

const close = (actual: number | null | undefined, expected: number, label: string) => {
  expect(actual, label).not.toBeNull();
  expect(Math.abs((actual as number) - expected), `${label}: ${actual} vs ${expected}`).toBeLessThan(1e-9 * Math.max(1, Math.abs(expected)));
};

let r: EngineResult;

beforeAll(async () => {
  sheets.vars = await load("1_Variables.xlsx");
  sheets.draw = await load("2_Drawing_Summary.xlsx");
  sheets.internal = await load("3_Internal_Costing_My_Cost.xlsx");
  sheets.quote = await load("4_Customer_Quote.xlsx");
  sheets.qsum = await load("5_Quote_Summary.xlsx");
  sheets.slab = await load("6_Slab_Calculation.xlsx");
  sheets.proj = await load("7_Project_Summary.xlsx");
  r = calculateProject(referenceEngineInput());
});

describe("engine vs reference workbooks", () => {
  it("has no blocking issues for the reference project", () => {
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.ready).toBe(true);
  });

  it("2. Drawing Summary — P..T per piece and row 27 totals", () => {
    expect(r.measurements).toHaveLength(22);
    r.measurements.forEach((m, i) => {
      const row = 5 + i;
      close(m.cuttingLf, v(sheets.draw, `P${row}`), `Cutting LF row ${row}`);
      close(m.depLf, v(sheets.draw, `Q${row}`), `DE&P LF row ${row}`);
      close(m.sqftPerPc, v(sheets.draw, `R${row}`), `Sqft/Pc row ${row}`);
      close(m.totalPcs, v(sheets.draw, `S${row}`), `Total Pcs row ${row}`);
      close(m.totalSqft, v(sheets.draw, `T${row}`), `Total Sqft row ${row}`);
    });
    close(r.drawingTotals.sinkCutouts, v(sheets.draw, "K27"), "K27 sink cutouts");
    close(r.drawingTotals.totalPcs, v(sheets.draw, "S27"), "S27 pieces");
    close(r.drawingTotals.totalSqft, v(sheets.draw, "T27"), "T27 sqft");
  });

  it("1. Variables — slab area and packing", () => {
    close(r.slab!.slabAreaSqft, v(sheets.vars, "B7"), "B7 slab sqft");
    close(r.packing!.totalQuoteCurrency, v(sheets.vars, "B26"), "B26 packing USD");
    close(r.packing!.perSqft, v(sheets.vars, "B28"), "B28 packing/sqft");
    const rate = (code: string) => r.rates.find((x) => x.code === code)!;
    const rows: [string, number][] = [
      ["MATERIAL", 12], ["CUTTING", 13], ["DEP", 14], ["SINK", 15],
      ["FAUCET", 16], ["RCORNER", 17], ["JOINT", 18], ["PACKING", 19],
    ];
    for (const [code, row] of rows) {
      close(rate(code).myCost, v(sheets.vars, `C${row}`), `C${row} ${code} my cost`);
      close(rate(code).customerCharge, v(sheets.vars, `D${row}`), `D${row} ${code} customer`);
    }
  });

  const COMPONENT_COLS: [string, string][] = [
    ["MATERIAL", "G"], ["CUTTING", "H"], ["DEP", "I"], ["SINK", "J"],
    ["FAUCET", "K"], ["RCORNER", "L"], ["JOINT", "M"], ["PACKING", "N"],
  ];

  for (const [label, key, sheetKey] of [
    ["3. Internal Costing", "internal", "internal"],
    ["4. Customer Quote", "customer", "quote"],
  ] as const) {
    it(`${label} — every component, per-pc, total and row 26`, () => {
      const sheet = r[key];
      const ws = sheets[sheetKey];
      sheet.lines.forEach((line, i) => {
        const row = 4 + i;
        for (const [code, col] of COMPONENT_COLS) close(line.components[code], v(ws, `${col}${row}`), `${col}${row}`);
        close(line.perPc, v(ws, `O${row}`), `O${row}`);
        close(line.total, v(ws, `P${row}`), `P${row}`);
      });
      for (const [code, col] of COMPONENT_COLS) close(sheet.componentTotals[code], v(ws, `${col}26`), `${col}26`);
      close(sheet.totalQty, v(ws, "F26"), "F26");
      close(sheet.grandTotal, v(ws, "P26"), "P26");
    });
  }

  it("5. Quote Summary — per piece price and totals", () => {
    r.customer.lines.forEach((line, i) => {
      const row = 4 + i;
      close(line.unitsQty, v(sheets.qsum, `F${row}`), `F${row}`);
      close(line.sqftPerPc, v(sheets.qsum, `G${row}`), `G${row}`);
      close(r.measurements[i].totalSqft, v(sheets.qsum, `H${row}`), `H${row}`);
      close(line.perPc, v(sheets.qsum, `I${row}`), `I${row}`);
      close(line.total, v(sheets.qsum, `J${row}`), `J${row}`);
    });
    close(r.drawingTotals.totalSqft, v(sheets.qsum, "H26"), "H26");
    close(r.customer.grandTotal, v(sheets.qsum, "J26"), "J26");
  });

  it("6. Slab Calculation — B7..B12 and driver rows B18..B20", () => {
    const s = r.slab!;
    close(s.totalSlabs, v(sheets.slab, "B7"), "B7");
    close(s.purchasedSqft, v(sheets.slab, "B8"), "B8");
    close(s.usedSqft, v(sheets.slab, "B9"), "B9");
    close(s.wasteSqft, v(sheets.slab, "B10"), "B10");
    close(s.utilization, v(sheets.slab, "B11"), "B11");
    close(s.materialCost, v(sheets.slab, "B12"), "B12");
    close(s.drivers[0].shareOfSlabs, v(sheets.slab, "B18"), "B18");
    close(s.drivers[0].wasteSqft, v(sheets.slab, "B19"), "B19");
    close(s.drivers[0].shareOfWaste, v(sheets.slab, "B20"), "B20");
  });

  it("7. Project Summary — every figure", () => {
    const s = r.summary;
    close(s.totalPcs, v(sheets.proj, "B5"), "B5");
    close(s.totalSqft, v(sheets.proj, "B6"), "B6");
    close(s.totalSlabs, v(sheets.proj, "B7"), "B7");
    close(s.sinkCutouts, v(sheets.proj, "B8"), "B8");
    close(s.fabricationMyCost, v(sheets.proj, "B11"), "B11");
    close(s.slabMaterialMyCost, v(sheets.proj, "B12"), "B12");
    close(s.totalInternalCost, v(sheets.proj, "B13"), "B13");
    close(s.fabricationCustomer, v(sheets.proj, "B14"), "B14");
    close(s.slabMaterialCustomer, v(sheets.proj, "B15"), "B15");
    close(s.totalQuote, v(sheets.proj, "B16"), "B16");
    close(s.grossMargin, v(sheets.proj, "B19"), "B19");
    close(s.grossMarginPct, v(sheets.proj, "B20"), "B20");
    close(s.pricePerSlab, v(sheets.proj, "B21"), "B21");
    close(s.myCostPerSqft, v(sheets.proj, "B25"), "B25");
    close(s.customerPerSqft, v(sheets.proj, "C25"), "C25");
  });
});

describe("recalculation behaviour", () => {
  it("changing a customer charge updates customer side only", () => {
    const input = referenceEngineInput();
    input.costInputs.find((c) => c.code === "CUTTING")!.customerCharge = 0.35;
    const after = calculateProject(input);
    expect(after.internal.grandTotal).toBeCloseTo(r.internal.grandTotal, 9);
    expect(after.summary.totalInternalCost).toBeCloseTo(r.summary.totalInternalCost, 9);
    // + 0.05 × total cutting LF
    expect(after.summary.totalQuote - r.summary.totalQuote).toBeCloseTo(0.05 * r.drawingTotals.cuttingLf, 6);
  });

  it("material customer rate follows My Cost when set to 'same as My Cost'", () => {
    const input = referenceEngineInput();
    input.costInputs.find((c) => c.code === "MATERIAL")!.myCost = 4;
    const after = calculateProject(input);
    expect(after.rates.find((x) => x.code === "MATERIAL")!.customerCharge).toBe(4);
    expect(after.slab!.materialCharge).toBeCloseTo(after.slab!.purchasedSqft * 4, 6);
  });

  it("drawing qty change re-spreads packing per sqft", () => {
    const input = referenceEngineInput();
    input.pieces[0].unitsQty = 0;
    const after = calculateProject(input);
    expect(after.packing!.totalQuoteCurrency).toBeCloseTo(r.packing!.totalQuoteCurrency, 9);
    expect(after.packing!.perSqft!).toBeGreaterThan(r.packing!.perSqft!);
    // packing still sums to the fixed container total
    expect(after.internal.componentTotals.PACKING).toBeCloseTo(r.packing!.totalQuoteCurrency, 6);
  });

  it("millimetre pieces convert to the same sqft as inches", () => {
    const input = referenceEngineInput();
    const p = input.pieces[0];
    input.pieces = [{ ...p, length: p.length * 25.4, width: p.width * 25.4, dimUnit: "MM" }];
    const mm = calculateProject(input);
    expect(mm.measurements[0].sqftPerPc).toBeCloseTo(r.measurements[0].sqftPerPc, 9);
    expect(mm.measurements[0].cuttingLf).toBeCloseTo(r.measurements[0].cuttingLf, 9);
  });

  it("flags missing inputs instead of silently pricing at zero", () => {
    const input = referenceEngineInput();
    input.costInputs.find((c) => c.code === "SINK")!.customerCharge = null;
    input.slab = null;
    const bad = calculateProject(input);
    expect(bad.ready).toBe(false);
    const codes = bad.issues.map((i) => i.code);
    expect(codes).toContain("MISSING_CUSTOMER_CHARGE");
    expect(codes).toContain("NO_SLAB_COUNT");
  });
});

/**
 * Golden test: upload each reference workbook through the real importer, run
 * the real engine, and compare the result with every calculated cell the
 * workbook itself holds. Expected values come from the workbooks, never typed.
 */
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { calculate, type Line, type Result, type RowResult, type SideTotals } from "@/lib/engine";
import { COST_KEYS, type CostKey, type ProjectData } from "@/lib/model";
import { cached, importFile, loadBook } from "./helpers";

/** Compares one engine value with one workbook cell, and counts it. */
class Compare {
  count = 0;
  constructor(
    private ws: ExcelJS.Worksheet,
    private tally: Map<string, number>,
  ) {}
  num(ref: string, actual: number | null | undefined) {
    const expected = cached(this.ws, ref);
    expect(typeof expected, `${this.ws.name}!${ref} should hold a number, holds ${JSON.stringify(expected)}`).toBe("number");
    expect(actual, `${this.ws.name}!${ref} has no engine value`).not.toBeNull();
    const diff = Math.abs((actual as number) - (expected as number));
    expect(diff, `${this.ws.name}!${ref}: engine ${actual}, workbook ${expected}`).toBeLessThan(1e-7 * Math.max(1, Math.abs(expected as number)));
    this.count++;
    this.tally.set(this.ws.name, (this.tally.get(this.ws.name) ?? 0) + 1);
  }
  text(ref: string, actual: string) {
    const expected = cached(this.ws, ref);
    expect(String(actual), `${this.ws.name}!${ref}`).toBe(String(expected ?? ""));
    this.count++;
    this.tally.set(this.ws.name, (this.tally.get(this.ws.name) ?? 0) + 1);
  }
}

type ColMap = Partial<Record<CostKey, string>> & { sqft: string; qty: string; perPc: string; total: string };

function compareCostSheet(c: Compare, first: number, rows: RowResult[], side: "internal" | "customer", cols: ColMap, totalRow: number, totals: SideTotals, opts: { componentTotals: boolean; qtyTotal: boolean; pricePerSqft?: string }) {
  rows.forEach((r, i) => {
    const row = first + i;
    const line: Line = r[side];
    c.num(`${cols.sqft}${row}`, r.sqftPerPc);
    c.num(`${cols.qty}${row}`, r.piece.qty);
    for (const key of COST_KEYS) c.num(`${cols[key]}${row}`, line.costs[key]);
    c.num(`${cols.perPc}${row}`, line.perPc);
    c.num(`${cols.total}${row}`, line.total);
    if (opts.pricePerSqft) c.num(`${opts.pricePerSqft}${row}`, r.pricePerSqft);
  });
  c.num(`${cols.total}${totalRow}`, totals.total);
  if (opts.qtyTotal) c.num(`${cols.qty}${totalRow}`, totals.qty);
  if (opts.componentTotals) for (const key of COST_KEYS) c.num(`${cols[key]}${totalRow}`, totals.components[key]);
}

const report = new Map<string, Map<string, number>>();

describe.each([["Lennar"], ["Peoria"]])("%s: full comparison", (which) => {
  const file = which === "Lennar" ? "Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx" : "Peoria_Gateway_Quote_Ver10.xlsx";
  const shape = which === "Lennar" ? { n: 22, totalRow: 26, dTotal: 27 } : { n: 83, totalRow: 87, dTotal: 88 };
  let d: ProjectData;
  let r: Result;
  let wb: ExcelJS.Workbook;
  const tally = new Map<string, number>();
  const cmp = (sheet: string) => new Compare(wb.getWorksheet(sheet)!, tally);

  beforeAll(async () => {
    d = await importFile(file);
    r = calculate(d);
    wb = await loadBook(file);
    report.set(which, tally);
  });

  it("reads every piece", () => {
    expect(d.pieces.length).toBe(shape.n);
    expect(d.variables.pricing).toBe("slab");
  });

  it("Drawing Summary: inputs and calculated columns", () => {
    const c = cmp("Drawing Summary");
    r.rows.forEach((row, i) => {
      const x = 5 + i;
      const p = row.piece;
      c.text(`D${x}`, p.piece);
      c.text(`E${x}`, p.description);
      c.text(`C${x}`, p.area);
      c.text(`B${x}`, p.group);
      c.num(`A${x}`, Number(p.dwg));
      c.num(`F${x}`, p.length);
      c.num(`G${x}`, p.width);
      c.num(`K${x}`, p.sinkCuts);
      c.num(`L${x}`, p.faucetHoles);
      c.num(`M${x}`, p.rCorners);
      c.num(`N${x}`, p.joints);
      c.num(`O${x}`, p.qty);
      c.num(`P${x}`, row.cutLf);
      c.num(`Q${x}`, row.depLf);
      c.num(`R${x}`, row.sqftPerPc);
      c.num(`S${x}`, row.totalPcs);
      c.num(`T${x}`, row.totalSqft);
    });
    c.num(`S${shape.dTotal}`, r.drawing.pcs);
    c.num(`T${shape.dTotal}`, r.drawing.sqft);
    if (which === "Lennar") c.num(`K${shape.dTotal}`, r.drawing.sinkCuts);
  });

  const cols: ColMap = { sqft: "E", qty: "F", material: "G", cutting: "H", dep: "I", sink: "J", faucet: "K", rcorner: "L", joint: "M", packing: "N", perPc: "O", total: "P" };

  it("Internal Costing: every row and total", () => {
    compareCostSheet(cmp("Internal Costing"), 4, r.rows, "internal", cols, shape.totalRow, r.internal, { componentTotals: true, qtyTotal: which === "Lennar" });
  });

  it("Customer Quote: every row and total", () => {
    compareCostSheet(cmp("Customer Quote"), 4, r.rows, "customer", cols, shape.totalRow, r.customer, { componentTotals: true, qtyTotal: which === "Lennar" });
  });

  it("Quote Summary: every row and total", () => {
    const c = cmp("Quote Summary");
    r.rows.forEach((row, i) => {
      const x = 4 + i;
      c.num(`F${x}`, row.piece.qty);
      c.num(`G${x}`, row.sqftPerPc);
      c.num(`H${x}`, row.totalSqft);
      c.num(`I${x}`, row.customer.perPc);
      c.num(`J${x}`, row.customer.total);
    });
    if (which === "Lennar") c.num(`F${shape.totalRow}`, r.customer.qty);
    c.num(`H${shape.totalRow}`, r.drawing.sqft);
    c.num(`J${shape.totalRow}`, r.customer.total);
  });

  it("Variables: slab area and packing", () => {
    const c = cmp("Variables");
    c.num("B7", r.slabArea);
    if (which === "Lennar") {
      c.num("C12", r.rates[d.variables.rates[0].id].my);
      c.num("D12", r.rates[d.variables.rates[0].id].customer);
      const pack = d.variables.rates.find((x) => x.kind === "packing")!;
      c.num("C19", r.rates[pack.id].my);
      c.num("D19", r.rates[pack.id].customer);
      c.num("B26", r.packing.usd);
      c.num("B27", r.packing.sqftBasis);
      c.num("B28", r.packing.perSqft);
    } else {
      const pack = d.variables.rates.find((x) => x.kind === "packing")!;
      c.num("C23", r.rates[pack.id].my);
      c.num("D23", r.rates[pack.id].customer);
      c.num("B28", r.packing.usd);
      c.num("B29", r.packing.sqftBasis);
      c.num("B30", r.packing.perSqft);
    }
  });

  it("Slab Calculation and Project Summary", () => {
    const s = cmp("Slab Calculation");
    const p = cmp("Project Summary");
    if (which === "Lennar") {
      const g = r.slabs[0];
      s.num("B5", g.slabs);
      s.num("B6", g.adjustment);
      s.num("B7", g.totalSlabs);
      s.num("B8", g.purchased);
      s.num("B9", g.used);
      s.num("B10", g.wasted);
      s.num("B11", g.utilization);
      s.num("B12", g.materialCost);
      const dr = r.drivers[0];
      s.num("B15", dr.pieces);
      s.num("B16", dr.piecesPerSlab);
      s.num("B17", dr.dedicatedSlabs);
      s.num("B18", dr.shareOfSlabs);
      s.num("B19", dr.wasteSqft);
      s.num("B20", dr.shareOfWaste);
      p.num("B5", r.drawing.pcs);
      p.num("B6", r.drawing.sqft);
      p.num("B7", r.slabTotals.totalSlabs);
      p.num("B8", r.drawing.sinkCuts);
      p.num("B11", r.internal.fabrication);
      p.num("B12", r.summary.internalMaterial);
      p.num("B13", r.summary.totalInternal);
      p.num("B14", r.customer.fabrication);
      p.num("B15", r.summary.customerMaterial);
      p.num("B16", r.summary.totalCustomer);
      p.num("B19", r.summary.margin);
      p.num("B20", r.summary.marginPct);
      p.num("B21", r.summary.pricePerSlab);
      p.num("B25", r.summary.myCostPerSqft);
      p.num("C25", r.summary.customerPerSqft);
    } else {
      const [white, gold] = r.slabs;
      expect(white.rate.label).toMatch(/Pure White/);
      expect(gold.rate.label).toMatch(/Calacatta/);
      s.num("B5", white.slabs);
      s.num("B6", white.used);
      s.num("B7", white.wasted);
      s.num("B8", white.purchased);
      s.num("B9", white.utilization);
      s.num("B10", white.wastagePct);
      s.num("B11", white.materialCost);
      s.num("B14", gold.slabs);
      s.num("B15", gold.used);
      s.num("B16", gold.wasted);
      s.num("B17", gold.purchased);
      s.num("B18", gold.utilization);
      s.num("B19", gold.wastagePct);
      s.num("B20", gold.materialCost);
      s.num("B22", r.slabTotals.totalSlabs);
      s.num("B23", r.slabTotals.materialCost);
      p.num("B5", r.drawing.pcs);
      p.num("B6", r.drawing.sqft);
      p.num("B7", r.slabTotals.totalSlabs);
      p.num("B10", r.internal.fabrication);
      p.num("B11", r.summary.internalMaterial);
      p.num("B12", r.summary.totalInternal);
      p.num("B13", r.customer.fabrication);
      p.num("B14", r.summary.customerMaterial);
      p.num("B15", r.summary.totalCustomer);
      p.num("B18", r.summary.margin);
      p.num("B19", r.summary.marginPct);
      p.num("B22", white.materialCost);
      p.num("B23", gold.materialCost);
    }
  });

  it("keeps the notes and sheet wording", () => {
    expect(d.notes.length).toBeGreaterThan(10);
    expect(d.sheetNotes.summary).toMatch(/Ver/);
    expect(d.sheetNotes.drawing).toBeTruthy();
    if (which === "Lennar") {
      expect(d.variables.rates[0].note).toMatch(/CONFIRMED/);
      expect(d.variables.packingNote).toMatch(/CONFIRMED/);
      expect(d.variables.drivers[0].wastePerSlabSqIn).toBe(2114);
    }
  });
});

describe("Project 1633: full comparison", () => {
  // The original was saved without results, so expected values come from an
  // untouched copy calculated by Excel; the upload itself is the raw original.
  const raw = "Project_1633_The_Approach_Quote.xlsx";
  const calc = "Project_1633_The_Approach_Quote.calculated.xlsx";
  let d: ProjectData;
  let r: Result;
  let wb: ExcelJS.Workbook;
  const tally = new Map<string, number>();
  const cmp = (sheet: string) => new Compare(wb.getWorksheet(sheet)!, tally);

  beforeAll(async () => {
    d = await importFile(raw);
    r = calculate(d);
    wb = await loadBook(calc);
    report.set("1633", tally);
  });

  it("reads the Width x Depth layout, wastage pricing and per-model rates", () => {
    expect(d.pieces.length).toBe(187);
    expect(d.variables.pricing).toBe("piece");
    expect(d.labels.group).toBe("Unit Type");
    expect(d.labels.length).toBe("Width (in)");
    expect(d.labels.width).toBe("Depth (in)");
    expect(d.labels.qty).toBe("Units");
    expect(d.variables.wastageExtra).toBe(0.02);
    expect(d.variables.rates.filter((x) => x.kind === "sink").map((x) => x.match)).toEqual(["M2510", "M2505 ADA", "VBM8006", "LS-C6ADA"]);
    expect(d.variables.rates.filter((x) => x.kind === "material").map((x) => x.match)).toEqual(["3cm", "2cm"]);
    expect(d.variables.rates.filter((x) => x.kind === "dep").map((x) => x.match)).toEqual(["3cm", "2cm"]);
    // Width is what DE&P runs along here.
    expect(d.pieces.every((p) => p.depRule === "l" && p.depLf === null)).toBe(true);
  });

  it("Drawing Summary", () => {
    const c = cmp("Drawing Summary");
    r.rows.forEach((row, i) => {
      const x = 5 + i;
      const p = row.piece;
      c.num(`A${x}`, Number(p.dwg));
      c.text(`B${x}`, p.group);
      c.num(`C${x}`, p.qty);
      c.text(`D${x}`, p.area);
      c.text(`E${x}`, p.piece);
      c.text(`F${x}`, p.description);
      c.num(`G${x}`, p.length);
      c.num(`H${x}`, p.width);
      c.text(`I${x}`, p.thickness);
      c.num(`K${x}`, p.sinkCuts);
      c.num(`L${x}`, p.faucetHoles);
      c.num(`M${x}`, row.depLf * 12);
      c.num(`N${x}`, p.joints);
      c.num(`O${x}`, p.jointDepIn);
      c.num(`P${x}`, p.rCorners);
      c.num(`Q${x}`, row.sqftPerPc);
      c.num(`R${x}`, row.totalPcs);
      c.num(`S${x}`, row.totalSqft);
    });
    c.num("R192", r.drawing.pcs);
    c.num("S192", r.drawing.sqft);
  });

  const internal: ColMap = { sqft: "G", qty: "B", material: "H", cutting: "I", dep: "J", sink: "K", faucet: "L", joint: "M", rcorner: "N", packing: "O", perPc: "P", total: "Q" };
  const customer: ColMap = { sqft: "G", qty: "B", material: "H", cutting: "I", sink: "J", faucet: "K", dep: "L", joint: "M", rcorner: "N", packing: "O", perPc: "P", total: "Q" };

  it("Internal Costing: every row and the total", () => {
    compareCostSheet(cmp("Internal Costing"), 4, r.rows, "internal", internal, 191, r.internal, { componentTotals: false, qtyTotal: false });
  });

  it("Customer Quote: every row, the total and the price per sqft column", () => {
    const c = cmp("Customer Quote");
    compareCostSheet(c, 5, r.rows, "customer", customer, 192, r.customer, { componentTotals: false, qtyTotal: true, pricePerSqft: "S" });
  });

  it("Quote Summary", () => {
    const c = cmp("Quote Summary");
    r.rows.forEach((row, i) => {
      const x = 5 + i;
      c.num(`B${x}`, row.piece.qty);
      c.num(`G${x}`, row.sqftPerPc);
      c.num(`H${x}`, row.totalSqft);
      c.num(`I${x}`, row.customer.perPc);
      c.num(`J${x}`, row.customer.total);
    });
    c.num("H192", r.drawing.sqft);
    c.num("J192", r.customer.total);
  });

  it("Variables: packing and wastage", () => {
    const c = cmp("Variables");
    const [m3, m2] = r.slabs;
    const pack = d.variables.rates.find((x) => x.kind === "packing")!;
    c.num("B7", r.slabArea);
    c.num("C24", r.rates[pack.id].my);
    c.num("D24", r.rates[pack.id].customer);
    c.num("B32", r.slabTotals.totalSlabs);
    c.num("B35", m3.wastagePct);
    c.num("B36", m2.wastagePct);
    c.num("B37", m3.markup);
    c.num("B38", m2.markup);
    c.num("B43", r.packing.totalLocal);
    c.num("B45", r.packing.usd);
    c.num("B46", r.packing.sqftBasis);
    c.num("B47", r.packing.perSqft);
  });

  it("Slab Calculation", () => {
    const c = cmp("Slab Calculation");
    const [m3, m2] = r.slabs;
    c.num("B5", m3.slabs);
    c.num("C5", m2.slabs);
    c.num("D5", r.slabTotals.slabs);
    c.num("B6", r.slabArea);
    c.num("C6", r.slabArea);
    // D6 adds the two per-slab areas (147.33): not a meaningful figure, so the tool leaves it out.
    c.num("B7", m3.purchased);
    c.num("C7", m2.purchased);
    c.num("D7", r.slabTotals.purchased);
    c.num("B8", m3.utilization);
    c.num("C8", m2.utilization);
    c.num("D8", r.slabTotals.utilization);
    c.num("B9", m3.used);
    c.num("C9", m2.used);
    c.num("D9", r.slabTotals.used);
    c.num("B10", m3.wastagePct);
    c.num("C10", m2.wastagePct);
    c.num("D10", r.slabTotals.wastagePct);
    c.num("B11", m3.wasted);
    c.num("C11", m2.wasted);
    c.num("D11", r.slabTotals.wasted);
  });

  it("Project Summary: quantities match, and the financials show what the sheet meant", () => {
    const c = cmp("Project Summary");
    c.num("B5", r.summary.unitTypes);
    c.num("B6", r.summary.totalUnits);
    c.num("B7", r.summary.nonVanityPcs);
    c.num("B8", r.summary.vanityPcs);
    c.num("B9", r.drawing.sqft);
    c.num("B10", r.slabTotals.totalSlabs);
    c.num("B11", r.slabTotals.purchased);
    c.num("B12", r.slabTotals.wasted);
    c.num("B13", r.slabTotals.wastagePct);
    // The sheet's B17:B20 point at empty rows 202 and 203 and show $0. Its real
    // totals are Internal Costing Q191 and Customer Quote Q192; the tool uses those.
    expect(cached(wb.getWorksheet("Project Summary")!, "B17")).toBe(0);
    const q = (sheet: string, ref: string) => cached(wb.getWorksheet(sheet)!, ref) as number;
    expect(r.summary.totalInternal).toBeCloseTo(q("Internal Costing", "Q191"), 6);
    expect(r.summary.totalCustomer).toBeCloseTo(q("Customer Quote", "Q192"), 6);
    expect(r.summary.margin).toBeCloseTo(q("Customer Quote", "Q192") - q("Internal Costing", "Q191"), 6);
  });
});

describe("comparison report", () => {
  it("prints how many cells were compared", () => {
    let all = 0;
    for (const [book, tally] of report) {
      const sum = [...tally.values()].reduce((a, b) => a + b, 0);
      all += sum;
      console.log(`${book}: ${sum} cells  ${[...tally].map(([k, v]) => `${k} ${v}`).join(" | ")}`);
    }
    console.log(`TOTAL compared: ${all}`);
    expect(all).toBeGreaterThan(5000);
  });
});

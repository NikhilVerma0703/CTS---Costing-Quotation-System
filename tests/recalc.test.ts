/**
 * Dynamic recalculation: change one input and every dependent number follows,
 * while nothing unrelated moves. Each expected value is worked out here by hand
 * from the sheet formulas, independently of the engine.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { calculate, type Result } from "@/lib/engine";
import type { ProjectData, RateRow } from "@/lib/model";
import { importFile } from "./helpers";

const rate = (d: ProjectData, kind: RateRow["kind"], match?: string) => d.variables.rates.find((r) => r.kind === kind && (match === undefined || r.match === match))!;
const sum = (r: Result, f: (row: Result["rows"][number]) => number) => r.rows.reduce((s, row) => s + f(row), 0);

describe("Lennar (slab-basis, one material)", () => {
  let d: ProjectData;
  let before: Result;
  beforeEach(async () => {
    d = await importFile("Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx");
    before = calculate(d);
  });

  it("Cutting My Cost flows to Internal only, and Customer stays put", () => {
    const cut = rate(d, "cutting");
    cut.myCost = 0.42;
    const r = calculate(d);
    const lf = sum(before, (x) => x.cutLf * x.piece.qty);
    expect(r.internal.components.cutting).toBeCloseTo(lf * 0.42, 6);
    expect(r.summary.totalInternal - before.summary.totalInternal).toBeCloseTo(lf * (0.42 - 0.21), 6);
    expect(r.customer.total).toBeCloseTo(before.customer.total, 8);
    expect(r.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer, 8);
    expect(r.summary.margin).toBeCloseTo(before.summary.margin - lf * 0.21, 6);
  });

  it("Cutting Customer Charge flows to Customer Quote, Quote Summary and the margin", () => {
    rate(d, "cutting").customer = 1;
    const r = calculate(d);
    const lf = sum(before, (x) => x.cutLf * x.piece.qty);
    expect(r.customer.components.cutting).toBeCloseTo(lf, 6);
    expect(r.rows[0].customer.perPc).toBeCloseTo(before.rows[0].customer.perPc + before.rows[0].cutLf * 0.7, 8);
    expect(r.summary.totalCustomer - before.summary.totalCustomer).toBeCloseTo(lf * 0.7, 6);
    expect(r.internal.total).toBeCloseTo(before.internal.total, 8);
  });

  it("Material My Cost: the Customer Charge that follows it moves too (=C12), and slab material on both sides", () => {
    const m = rate(d, "material");
    expect(m.customer).toBeNull();
    m.myCost = 4;
    const r = calculate(d);
    expect(r.rates[m.id].customer).toBe(4);
    expect(r.slabs[0].materialCost).toBeCloseTo(before.slabs[0].purchased * 4, 6);
    expect(r.summary.customerMaterial).toBeCloseTo(before.slabs[0].purchased * 4, 6);
    expect(r.rows[0].internal.costs.material).toBeCloseTo(before.rows[0].sqftPerPc * 4, 8);
    expect(r.rows[0].customer.costs.material).toBeCloseTo(before.rows[0].sqftPerPc * 4, 8);
    // Fabrication is unaffected: material is taken out of it.
    expect(r.internal.fabrication).toBeCloseTo(before.internal.fabrication, 6);
  });

  it("A typed Customer material charge moves the reference Material column, not the firm quote: B15 reads Slab Calculation's My Cost cell", () => {
    const m = rate(d, "material");
    m.customer = 5;
    const r = calculate(d);
    expect(r.rows[0].customer.costs.material).toBeCloseTo(before.rows[0].sqftPerPc * 5, 8);
    expect(r.summary.customerMaterial).toBeCloseTo(before.summary.customerMaterial, 6);
    expect(r.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer, 6);
    expect(r.summary.internalMaterial).toBeCloseTo(before.summary.internalMaterial, 6);
    expect(r.checks.some((c) => /only moves the Material column/.test(c.text))).toBe(true);
  });

  it("Slab count flows to purchased, waste, utilization, material and $/slab", () => {
    rate(d, "material").slabs = 300;
    const r = calculate(d);
    const purchased = 299 * before.slabArea; // 300 less the -1 adjustment
    expect(r.slabs[0].totalSlabs).toBe(299);
    expect(r.slabs[0].purchased).toBeCloseTo(purchased, 6);
    expect(r.slabs[0].wasted).toBeCloseTo(purchased - before.drawing.sqft, 6);
    expect(r.slabs[0].utilization).toBeCloseTo(before.drawing.sqft / purchased, 10);
    expect(r.summary.internalMaterial).toBeCloseTo(purchased * 3.5, 6);
    expect(r.summary.pricePerSlab).toBeCloseTo(r.summary.totalCustomer / 299, 8);
    expect(r.drivers[0].shareOfSlabs).toBeCloseTo(104 / 299, 10);
  });

  it("Packing: containers, exchange rate and drawing size all move the per-sqft rate", () => {
    d.variables.containers[0].count = 4;
    let r = calculate(d);
    expect(r.packing.usd).toBeCloseTo((200000 * 4) / 95, 8);
    expect(r.packing.perSqft).toBeCloseTo(((200000 * 4) / 95) / before.drawing.sqft, 10);
    expect(r.internal.components.packing).toBeCloseTo((200000 * 4) / 95, 6);
    expect(r.customer.components.packing).toBeCloseTo((200000 * 4) / 95, 6);
    d.variables.exchangeRate = 100;
    r = calculate(d);
    expect(r.packing.usd).toBeCloseTo((200000 * 4) / 100, 8);
    // Packing stays the same total when the drawing grows: the rate per sqft falls.
    d.pieces[0].qty += 10;
    r = calculate(d);
    expect(r.internal.components.packing).toBeCloseTo((200000 * 4) / 100, 6);
    expect(r.packing.perSqft).toBeLessThan((200000 * 4) / 100 / before.drawing.sqft);
  });

  it("A typed packing rate replaces the linked one on its own side: C19 and D19 each link to B28", () => {
    const p = rate(d, "packing");
    p.myCost = 1;
    let r = calculate(d);
    expect(r.rates[p.id]).toEqual({ my: 1, customer: before.packing.perSqft });
    expect(r.internal.components.packing).toBeCloseTo(before.drawing.sqft, 6);
    expect(r.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer, 6);
    p.myCost = null;
    p.customer = 2;
    r = calculate(d);
    expect(r.rates[p.id]).toEqual({ my: before.packing.perSqft, customer: 2 });
    expect(r.summary.totalInternal).toBeCloseTo(before.summary.totalInternal, 6);
  });

  it("A drawing edit reaches every sheet", () => {
    const p = d.pieces[0];
    p.length = 100;
    const r = calculate(d);
    const row = r.rows[0];
    expect(row.sqftPerPc).toBeCloseTo((100 * p.width) / 144, 10);
    expect(row.cutLf).toBeCloseTo((2 * (100 + p.width)) / 12, 10);
    expect(row.depLf).toBeCloseTo((2 * (100 + p.width)) / 12, 10); // this one is the island top
    expect(row.totalSqft).toBeCloseTo(row.sqftPerPc * p.qty, 10);
    expect(r.drawing.sqft).not.toBeCloseTo(before.drawing.sqft, 2);
    expect(r.slabs[0].used).toBeCloseTo(r.drawing.sqft, 8);
    expect(r.rows[0].customer.total).toBeCloseTo(r.rows[0].customer.perPc * p.qty, 8);
    expect(r.summary.customerPerSqft).toBeCloseTo(r.summary.totalCustomer / r.drawing.sqft, 10);
  });

  it("An edited cost cell flows to Cost/Pc, totals, Quote Summary and Project Summary, and can be reset", () => {
    const p = d.pieces[0];
    d.overrides.customer[p.id] = { sink: 10 };
    let r = calculate(d);
    const delta = 10 - before.rows[0].customer.costs.sink;
    expect(r.rows[0].customer.costs.sink).toBe(10);
    expect(r.rows[0].customer.edited.sink).toBe(before.rows[0].customer.costs.sink);
    expect(r.rows[0].customer.perPc).toBeCloseTo(before.rows[0].customer.perPc + delta, 8);
    expect(r.rows[0].customer.total).toBeCloseTo(before.rows[0].customer.total + delta * p.qty, 6);
    expect(r.customer.components.sink).toBeCloseTo(before.customer.components.sink + delta * p.qty, 6);
    expect(r.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer + delta * p.qty, 6);
    expect(r.summary.margin).toBeCloseTo(before.summary.margin + delta * p.qty, 6);
    expect(r.rows[0].internal.costs.sink).toBe(before.rows[0].internal.costs.sink);
    d.overrides.customer = {};
    r = calculate(d);
    expect(r.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer, 8);
  });
});

describe("Project 1633 (piece sqft + wastage, thickness and model rates)", () => {
  let d: ProjectData;
  let before: Result;
  beforeEach(async () => {
    d = await importFile("Project_1633_The_Approach_Quote.xlsx");
    before = calculate(d);
  });

  it("Used % moves the wastage markup, the Material column and the totals", () => {
    rate(d, "material", "2cm").usedPct = 0.8;
    const r = calculate(d);
    const m2 = r.slabs.find((g) => g.rate.match === "2cm")!;
    expect(m2.markup).toBeCloseTo(0.22, 10);
    expect(r.rows[0].internal.costs.material).toBeCloseTo(r.rows[0].sqftPerPc * 4.7 * 1.22, 8);
    expect(r.rows[0].customer.costs.material).toBeCloseTo(r.rows[0].sqftPerPc * 4.7 * 1.22, 8);
    expect(r.summary.totalInternal).toBeGreaterThan(before.summary.totalInternal);
  });

  it("A typed used % sets the markup whatever the slab count, as Variables B35 = 1 - B33 does", () => {
    const m2 = rate(d, "material", "2cm");
    m2.slabs = 0;
    const r = calculate(d);
    const g = r.slabs.find((x) => x.rate.id === m2.id)!;
    expect(g.purchased).toBe(0);
    expect(g.utilization).toBe(0.9);
    expect(g.markup).toBeCloseTo(0.12, 12);
    // No slabs doesn't change the charge: material stays piece sqft x rate x 1.12.
    expect(r.summary.totalCustomer).toBeCloseTo(before.summary.totalCustomer, 6);
    expect(r.rows[0].internal.costs.material).toBeCloseTo(before.rows[0].internal.costs.material, 8);
  });

  it("The material split adds up to the material in the totals, and follows the rate", () => {
    const sum = (r: Result, side: "internal" | "customer") => r.materialSplit.reduce((s, m) => s + m[side], 0);
    expect(sum(before, "internal")).toBeCloseTo(before.summary.internalMaterial, 6);
    expect(sum(before, "customer")).toBeCloseTo(before.summary.customerMaterial, 6);
    rate(d, "material", "2cm").myCost = 6;
    const r = calculate(d);
    expect(sum(r, "internal")).toBeCloseTo(r.summary.internalMaterial, 6);
    expect(r.materialSplit.find((m) => m.rate.match === "2cm")!.internal).toBeCloseTo(before.drawing.sqft * 6 * 1.12, 6);
    expect(r.materialSplit.find((m) => m.rate.match === "3cm")!.internal).toBe(0);
    d.variables.pricing = "slab";
    const slab = calculate(d);
    expect(sum(slab, "internal")).toBeCloseTo(slab.summary.internalMaterial, 6);
    expect(sum(slab, "customer")).toBeCloseTo(slab.summary.customerMaterial, 6);
  });

  it("A sink model's rate moves only the pieces with that model", () => {
    rate(d, "sink", "M2510").myCost = 12;
    const r = calculate(d);
    for (const row of r.rows) {
      const expected = row.piece.sinkModel === "M2510" ? row.piece.sinkCuts * 12 : row.piece.sinkCuts * 2;
      expect(row.internal.costs.sink).toBeCloseTo(expected, 10);
    }
  });

  it("The thickness of a piece picks its material and DE&P rate", () => {
    d.pieces[0].thickness = "3cm";
    rate(d, "dep", "3cm").myCost = 1;
    const r = calculate(d);
    expect(r.rows[0].internal.costs.material).toBeCloseTo(r.rows[0].sqftPerPc * 3.8 * 1.12, 8);
    expect(r.rows[0].internal.costs.dep).toBeCloseTo(r.rows[0].depLf * 1, 8);
    expect(r.rows[1].internal.costs.dep).toBeCloseTo(r.rows[1].depLf * 0.25, 8);
    expect(r.slabs.find((g) => g.rate.match === "3cm")!.drawingSqft).toBeCloseTo(r.rows[0].totalSqft, 8);
  });

  it("Switching to slab pricing removes the markup and prices material on slabs", () => {
    d.variables.pricing = "slab";
    const r = calculate(d);
    expect(r.rows[0].internal.costs.material).toBeCloseTo(r.rows[0].sqftPerPc * 4.7, 8);
    expect(r.summary.internalMaterial).toBeCloseTo(r.slabTotals.materialCost, 8);
    expect(r.summary.totalInternal).toBeCloseTo(r.internal.fabrication + r.slabTotals.materialCost, 8);
  });
});

describe("Peoria (two colors)", () => {
  let d: ProjectData;
  let before: Result;
  beforeEach(async () => {
    d = await importFile("Peoria_Gateway_Quote_Ver10.xlsx");
    before = calculate(d);
  });

  it("A color's rate moves only that color", () => {
    const gold = d.variables.rates.find((r) => r.match === "Calacatta Gold")!;
    gold.myCost = 10;
    const r = calculate(d);
    for (const row of r.rows) {
      const expected = row.piece.color === "Calacatta Gold" ? row.sqftPerPc * 10 : row.sqftPerPc * 4.5;
      expect(row.internal.costs.material).toBeCloseTo(expected, 8);
    }
    expect(r.slabs[1].materialCost).toBeCloseTo(221 * 10, 6);
    expect(r.slabs[0].materialCost).toBeCloseTo(before.slabs[0].materialCost, 8);
  });

  it("A rounded typed LF is replaced by its rule once L or W changes", () => {
    const p = d.pieces[0];
    expect(p.cutLf).toBe(20.2083);
    expect(p.cutRule).toBe("perimeter");
    expect(calculate(d).rows[0].cutLf).toBe(20.2083);
    p.length = 90;
    p.cutLf = null; // what the UI does on an L or W edit, unless the rule is "manual"
    expect(calculate(d).rows[0].cutLf).toBeCloseTo((2 * (90 + p.width)) / 12, 10);
  });

  it("The typed project sqft is exact until the drawing moves, then the live total takes over", () => {
    expect(before.packing.sqftBasis).toBe(2761.33);
    expect(before.packing.sqftIsTyped).toBe(true);
    d.pieces[0].qty += 1;
    const r = calculate(d);
    expect(r.packing.sqftIsTyped).toBe(false);
    expect(r.packing.sqftBasis).toBeCloseTo(r.drawing.sqft, 8);
    expect(r.internal.components.packing).toBeCloseTo(r.packing.usd, 6);
  });
});

describe("New project with stored variables", () => {
  it("prices from the stored rates and estimates slabs until a CutList count is entered", async () => {
    const d = await importFile("Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx");
    const m = rate(d, "material");
    m.slabs = null;
    m.slabAdjust = 0;
    const r = calculate(d);
    expect(r.slabs[0].estimated).toBe(true);
    expect(r.slabs[0].totalSlabs).toBe(Math.ceil(r.drawing.sqft / (r.slabArea * 0.85)));
    expect(r.checks.some((c) => /estimate/.test(c.text))).toBe(true);
    m.slabs = 261;
    expect(calculate(d).slabs[0].estimated).toBe(false);
  });
});

describe("Edge cases do not break the numbers", () => {
  it("an empty project calculates to zeros with no errors", async () => {
    const d = await importFile("Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx");
    d.pieces = [];
    const r = calculate(d);
    expect(r.drawing.sqft).toBe(0);
    expect(r.packing.perSqft).toBe(0);
    expect(r.summary.totalInternal).toBeCloseTo(r.slabTotals.materialCost, 8);
    expect(r.summary.myCostPerSqft).toBeNull();
    expect(Number.isFinite(r.summary.totalCustomer)).toBe(true);
  });

  it("a zero exchange rate flags it instead of dividing by zero", async () => {
    const d = await importFile("Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx");
    d.variables.exchangeRate = 0;
    const r = calculate(d);
    expect(r.packing.usd).toBe(0);
    expect(r.checks.some((c) => /Exchange rate/.test(c.text))).toBe(true);
    expect(Number.isFinite(r.summary.totalInternal)).toBe(true);
  });
});

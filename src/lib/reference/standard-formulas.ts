/**
 * The standard formulas, as taken from the reference workbooks
 * (docs/SHEET-ANALYSIS.md). Stored permanently in StandardFormula so every
 * project uses the same, versioned set. The engine (src/lib/engine/calculate.ts)
 * implements each one; `tests/formulas.test.ts` keeps the two in step.
 *
 * Only the edge-length formulas carry a parameter (which edges are measured);
 * that parameter is what new uploads and manual entries take as their default.
 */
import type { EdgeRule } from "@/lib/engine/types";

export type FormulaCategory = "MEASUREMENT" | "COSTING" | "SLAB" | "SUMMARY";

export interface StandardFormulaDef {
  code: string;
  name: string;
  category: FormulaCategory;
  expression: string;
  description: string;
  edgeRule?: EdgeRule;
  sortOrder: number;
}

export const STANDARD_FORMULAS: StandardFormulaDef[] = [
  // Drawing Summary P–T
  { code: "CUTTING_LF", name: "Cutting LF", category: "MEASUREMENT", expression: "2 × (L + W) ÷ 12", description: "Cutting edge length per piece, in linear feet (Drawing Summary P).", edgeRule: "FULL_PERIMETER", sortOrder: 10 },
  { code: "DEP_LF", name: "DE&P LF", category: "MEASUREMENT", expression: "(L + W) ÷ 12", description: "Edge polish per piece — one length and one width edge (Drawing Summary Q).", edgeRule: "ONE_LENGTH_ONE_WIDTH", sortOrder: 20 },
  { code: "DEP_LF_ISLAND", name: "DE&P LF — island top", category: "MEASUREMENT", expression: "2 × (L + W) ÷ 12", description: "Pieces whose description contains “Island” are polished on the full perimeter (Drawing Summary Q5).", edgeRule: "FULL_PERIMETER", sortOrder: 30 },
  { code: "SQFT_PER_PC", name: "Sqft/Pc", category: "MEASUREMENT", expression: "L × W ÷ 144", description: "Area of one piece in square feet (Drawing Summary R).", sortOrder: 40 },
  { code: "TOTAL_PCS", name: "Total Pcs", category: "MEASUREMENT", expression: "Units Qty", description: "Drawing Summary S = O.", sortOrder: 50 },
  { code: "TOTAL_SQFT", name: "Total Sqft", category: "MEASUREMENT", expression: "Sqft/Pc × Total Pcs", description: "Drawing Summary T; the project total is Σ Total Sqft (T27).", sortOrder: 60 },
  // Variables + costing sheets
  { code: "PACKING_USD", name: "Total packing", category: "COSTING", expression: "Container cost × Containers ÷ Exchange rate", description: "Variables B26 = B23 × B24 ÷ B25.", sortOrder: 110 },
  { code: "PACKING_PER_SQFT", name: "Packing per sqft", category: "COSTING", expression: "Total packing ÷ Total project sqft", description: "Variables B28 = B26 ÷ B27 — changes whenever drawing quantities change.", sortOrder: 120 },
  { code: "COST_COMPONENT", name: "Cost component", category: "COSTING", expression: "Driver × Rate", description: "Sqft/Pc × Material, Cutting LF × Cutting, DE&P LF × DE&P, Sink Cuts × Sink Cutout …", sortOrder: 130 },
  { code: "COST_PER_PC", name: "Cost/Pc · Price/Pc", category: "COSTING", expression: "Σ cost components", description: "Internal Costing / Customer Quote column O.", sortOrder: 140 },
  { code: "LINE_TOTAL", name: "Total Cost · Total Price", category: "COSTING", expression: "Cost/Pc × Units Qty", description: "Column P; sheet total = Σ P.", sortOrder: 150 },
  { code: "FABRICATION", name: "Fabrication", category: "COSTING", expression: "Sheet total − piece-basis material", description: "Project Summary B11 / B14.", sortOrder: 160 },
  // Slab Calculation
  { code: "SLAB_AREA", name: "Slab area", category: "SLAB", expression: "Slab width × Slab depth ÷ 144", description: "Variables B7.", sortOrder: 210 },
  { code: "TOTAL_SLABS", name: "Total slabs", category: "SLAB", expression: "Optimizer slabs + Adjustments", description: "Slab Calculation B7.", sortOrder: 220 },
  { code: "PURCHASED_SQFT", name: "Slab area purchased", category: "SLAB", expression: "Total slabs × Slab area", description: "Slab Calculation B8.", sortOrder: 230 },
  { code: "WASTE_SQFT", name: "Waste", category: "SLAB", expression: "Purchased sqft − Used sqft", description: "Slab Calculation B10 (used = Σ Total Sqft).", sortOrder: 240 },
  { code: "UTILIZATION", name: "Utilization", category: "SLAB", expression: "Used sqft ÷ Purchased sqft", description: "Slab Calculation B11.", sortOrder: 250 },
  { code: "SLAB_MATERIAL", name: "Slab-basis material", category: "SLAB", expression: "Purchased sqft × Material rate", description: "Slab Calculation B12 (My Cost) and its customer equivalent.", sortOrder: 260 },
  // Project Summary
  { code: "TOTAL_INTERNAL", name: "Total internal cost", category: "SUMMARY", expression: "Fabrication (My Cost) + Slab material (My Cost)", description: "Project Summary B13.", sortOrder: 310 },
  { code: "TOTAL_QUOTE", name: "Total customer quote", category: "SUMMARY", expression: "Fabrication (customer) + Slab material (customer)", description: "Project Summary B16.", sortOrder: 320 },
  { code: "GROSS_MARGIN", name: "Gross margin", category: "SUMMARY", expression: "Total quote − Total internal cost", description: "Project Summary B19; margin % = margin ÷ quote (B20).", sortOrder: 330 },
  { code: "PRICE_PER_SLAB", name: "Price per slab", category: "SUMMARY", expression: "Total quote ÷ Total slabs", description: "Project Summary B21.", sortOrder: 340 },
  { code: "RATE_PER_SQFT", name: "Rate per sqft", category: "SUMMARY", expression: "Total ÷ Total project sqft", description: "Project Summary B25 / C25 (My Cost and customer).", sortOrder: 350 },
];

/** Formula codes whose edge rule can be changed (with a reason). */
export const EDGE_FORMULA_CODES = ["CUTTING_LF", "DEP_LF", "DEP_LF_ISLAND"] as const;

export interface EdgeDefaults {
  cuttingRule: EdgeRule;
  depRule: EdgeRule;
  islandDepRule: EdgeRule;
}

export const DEFAULT_EDGE_RULES: EdgeDefaults = {
  cuttingRule: "FULL_PERIMETER",
  depRule: "ONE_LENGTH_ONE_WIDTH",
  islandDepRule: "FULL_PERIMETER",
};

/** Expression text for an edge rule, as the formula table shows it. */
export function edgeExpression(rule: EdgeRule): string {
  return rule === "FULL_PERIMETER" ? "2 × (L + W) ÷ 12" : rule === "ONE_LENGTH_ONE_WIDTH" ? "(L + W) ÷ 12" : "0";
}

/**
 * Variables sheet parser (.xlsx / .csv) — the project's rate card.
 *
 * Reads by label, not by fixed cell, so a re-arranged copy of the template
 * still imports: "Slab Width (inches)", "Material Basis", the Cost Item /
 * Unit / My Cost / Customer Charge table, and the packing block. Formula
 * cells keep their meaning: My Cost = packing per sqft (=B28) becomes "from
 * packing", a Customer Charge equal to its own My Cost (=C12) becomes "same
 * as My Cost". Pure (no DB): the preview and the import use the same function.
 */
import type { CustomerChargeMode, LengthUnit, MyCostMode } from "@/lib/engine/types";
import { cellText, parseNumber, readCsv, readXlsx, type Grid } from "./drawing-sheet";
import { EMPTY_VARIABLES, type VariablesData, type VariablesParseResult, type VariablesRate } from "./variables-fields";

export type { VariablesData, VariablesParseResult, VariablesRate };

/** Sheet cost-item name → catalog code. Order matters ("Sink Cutout" is a sink, not cutting). */
const CATALOG: [string, RegExp][] = [
  ["PACKING", /packing/i],
  ["SINK", /sink/i],
  ["FAUCET", /faucet/i],
  ["RCORNER", /r\s*-?\s*corner|radius/i],
  ["JOINT", /joint|seam/i],
  ["DEP", /de\s*&\s*p|edge|polish/i],
  ["CUTTING", /cutting/i],
  ["MATERIAL", /material|slab|stone|quartz|granite|marble/i],
];

export function catalogCode(label: string): string | null {
  return CATALOG.find(([, re]) => re.test(label))?.[0] ?? null;
}

const colLetter = (c: number) => {
  let s = "";
  for (let n = c + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const addr = (r: number, c: number) => `${colLetter(c)}${r + 1}`;

function formulaOf(v: unknown): string | null {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.formula === "string") return o.formula.replace(/^=/, "").replace(/\$/g, "").trim();
  }
  if (typeof v === "string" && v.startsWith("=")) return v.slice(1).replace(/\$/g, "").trim();
  return null;
}

function numberOf(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in (v as object)) return numberOf((v as { result: unknown }).result);
  const t = cellText(v);
  return t ? parseNumber(t.replace(/[$₹]|rs\.?|usd|inr/gi, "")) : null;
}

const unitFromLabel = (label: string): LengthUnit | null =>
  /\((in|inch|inches|")\)/i.test(label) ? "IN" : /\(mm\)/i.test(label) ? "MM" : /\(cm\)/i.test(label) ? "CM" : /\((ft|feet)\)/i.test(label) ? "FT" : /\(m\)/i.test(label) ? "M" : null;

const near = (a: number, b: number) => Math.abs(a - b) <= 0.005 + 1e-6 * Math.abs(b);

function readGrid(grid: Grid): VariablesParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const data: VariablesData = structuredClone(EMPTY_VARIABLES);
  const kv: Record<string, { value: unknown; label: string; r: number }> = {};

  // Label / value pairs: first non-empty text cell, then the next non-empty cell.
  const KEYS: [string, RegExp][] = [
    ["slabWidth", /slab\s*width/i],
    ["slabDepth", /slab\s*(depth|length|height)/i],
    ["slabArea", /slab\s*area/i],
    ["materialBasis", /material\s*basis/i],
    ["containerCost", /container.*cost|cost.*container/i],
    ["containerCount", /(number|no\.?|#|count).*container|containers?\s*(count|qty|nos?)\b/i],
    ["exchangeRate", /exchange\s*rate/i],
    ["packingUsd", /total\s*packing/i],
    ["totalSqft", /total.*sq\s*ft|total.*sqft/i],
    ["packingPerSqft", /packing.*per\s*sq/i],
  ];
  grid.cells.forEach((row, r) => {
    const c0 = row.findIndex((v) => cellText(v) !== "");
    if (c0 < 0) return;
    const label = cellText(row[c0]);
    const valueIdx = row.findIndex((v, c) => c > c0 && cellText(v) !== "");
    if (valueIdx < 0) return;
    const key = KEYS.find(([, re]) => re.test(label))?.[0];
    if (key && !kv[key]) kv[key] = { value: row[valueIdx], label, r };
  });

  // Slab specification.
  const w = kv.slabWidth ? numberOf(kv.slabWidth.value) : null;
  const d = kv.slabDepth ? numberOf(kv.slabDepth.value) : null;
  if (w && d && w > 0 && d > 0) {
    const unit = unitFromLabel(kv.slabWidth.label) ?? unitFromLabel(kv.slabDepth.label) ?? "IN";
    data.slabSpec = { width: w, depth: d, unit, materialBasis: kv.materialBasis ? cellText(kv.materialBasis.value) || null : null };
    if (!unitFromLabel(kv.slabWidth.label)) warnings.push("Slab size unit not given — assumed inches.");
  } else if (kv.slabWidth || kv.slabDepth) {
    warnings.push("Slab width / depth found but not both as numbers — slab size not taken.");
  }
  data.checks.slabAreaSqft = kv.slabArea ? numberOf(kv.slabArea.value) : null;

  // Packing.
  const cost = kv.containerCost ? numberOf(kv.containerCost.value) : null;
  const count = kv.containerCount ? numberOf(kv.containerCount.value) : null;
  const fx = kv.exchangeRate ? numberOf(kv.exchangeRate.value) : null;
  if (cost !== null && count !== null && fx !== null && fx > 0) {
    const sizeMatch = /(\d+\s*ft)\s*container/i.exec(kv.containerCost.label);
    data.packing = {
      containerLabel: sizeMatch ? `${sizeMatch[1].replace(/\s+/g, "")} container` : "Container",
      containerCostLocal: cost,
      containerCount: count,
      // The template's container cost is in rupees ("Rs per container", "Rs per USD").
      localCurrency: /\b(usd|\$)\b/i.test(kv.containerCost.label) && !/\brs\b|inr|₹/i.test(kv.containerCost.label) ? "USD" : "INR",
      exchangeRate: fx,
    };
  } else if (kv.containerCost || kv.exchangeRate) {
    warnings.push("Packing block incomplete (container cost, number of containers and exchange rate are all needed) — packing not taken.");
  }
  data.checks.packingUsd = kv.packingUsd ? numberOf(kv.packingUsd.value) : null;
  data.checks.totalSqft = kv.totalSqft ? numberOf(kv.totalSqft.value) : null;
  data.checks.packingPerSqft = kv.packingPerSqft ? numberOf(kv.packingPerSqft.value) : null;
  const packingCell = kv.packingPerSqft
    ? addr(kv.packingPerSqft.r, grid.cells[kv.packingPerSqft.r].findIndex((v, c) => c > 0 && cellText(v) !== ""))
    : null;

  // Cost inputs table.
  let headerRow = -1;
  let cols = { item: -1, unit: -1, my: -1, customer: -1, note: -1 };
  for (let r = 0; r < grid.cells.length && headerRow < 0; r++) {
    const t = grid.cells[r].map((v) => cellText(v).toLowerCase());
    const item = t.findIndex((x) => /cost\s*item|^item$|description/.test(x));
    const my = t.findIndex((x) => /my\s*cost|our\s*cost|internal/.test(x));
    const customer = t.findIndex((x) => /customer|client|selling|charge/.test(x) && !/my\s*cost/.test(x));
    if (item >= 0 && my >= 0 && customer >= 0) {
      headerRow = r;
      cols = { item, unit: t.findIndex((x) => /^unit/.test(x)), my, customer, note: -1 };
      const noteIdx = t.findIndex((x, c) => c > customer && /note|remark|comment/.test(x));
      cols.note = noteIdx >= 0 ? noteIdx : customer + 1;
    }
  }
  if (headerRow < 0) {
    if (!data.slabSpec && !data.packing) errors.push("This doesn't look like a Variables sheet: no Cost Item / My Cost / Customer Charge table, slab size or packing block found.");
    else warnings.push("No Cost Item / My Cost / Customer Charge table found — rates not taken.");
  } else {
    const seen = new Set<string>();
    for (let r = headerRow + 1; r < grid.cells.length; r++) {
      const row = grid.cells[r];
      const label = cellText(row[cols.item]);
      if (!label) break;
      const myRaw = row[cols.my];
      const cuRaw = row[cols.customer];
      const unitLabel = cols.unit >= 0 ? cellText(row[cols.unit]) : "";
      const note = cellText(row[cols.note]) || null;
      const code = catalogCode(label);
      const myF = formulaOf(myRaw);
      const cuF = formulaOf(cuRaw);
      const myNum = numberOf(myRaw);
      const cuNum = numberOf(cuRaw);
      if (!code) {
        data.unmatched.push({ label, unitLabel: unitLabel || null, myCost: myNum, customerCharge: cuNum });
        warnings.push(`Row ${r + 1} "${label}" matches no cost item in the catalog — kept for reference, not priced. Add it in Cost Inputs if it should be charged.`);
        continue;
      }
      if (seen.has(code)) {
        warnings.push(`Row ${r + 1} "${label}" repeats a cost item already read — ignored.`);
        continue;
      }
      seen.add(code);
      let myCostMode: MyCostMode = "MANUAL";
      let myCost: number | null = myNum;
      if (myF && ((packingCell && myF.toUpperCase() === packingCell) || (code === "PACKING" && /^[A-Z]+\d+$/i.test(myF)))) {
        myCostMode = "PACKING_PER_SQFT";
        myCost = null;
      } else if (myF) warnings.push(`${label}: My Cost is a formula (=${myF}); its value ${myNum ?? "—"} is used.`);
      let customerChargeMode: CustomerChargeMode = "MANUAL";
      let customerCharge: number | null = cuNum;
      const myAddr = addr(r, cols.my);
      if (cuF && (cuF.toUpperCase() === myAddr || (myCostMode === "PACKING_PER_SQFT" && packingCell && cuF.toUpperCase() === packingCell))) {
        customerChargeMode = "SAME_AS_MY_COST";
        customerCharge = null;
      } else if (cuF) warnings.push(`${label}: Customer Charge is a formula (=${cuF}); its value ${cuNum ?? "—"} is used.`);
      if (myCostMode === "MANUAL" && myCost === null) warnings.push(`${label}: My Cost is empty.`);
      if (customerChargeMode === "MANUAL" && customerCharge === null) warnings.push(`${label}: Customer Charge is empty.`);
      data.rates.push({ code, label, unitLabel, myCostMode, myCost, customerChargeMode, customerCharge, note });
    }
  }

  // The sheet's own calculated cells, against the standard formulas.
  if (data.slabSpec?.unit === "IN" && data.checks.slabAreaSqft !== null && !near(data.checks.slabAreaSqft, (data.slabSpec.width * data.slabSpec.depth) / 144)) {
    warnings.push(`Slab area in the sheet (${data.checks.slabAreaSqft}) differs from W × D ÷ 144 (${+((data.slabSpec.width * data.slabSpec.depth) / 144).toFixed(4)}). The formula is used.`);
  }
  if (data.packing && data.checks.packingUsd !== null) {
    const expected = (data.packing.containerCostLocal * data.packing.containerCount) / data.packing.exchangeRate;
    if (!near(data.checks.packingUsd, expected)) warnings.push(`Total packing in the sheet (${data.checks.packingUsd}) differs from cost × containers ÷ rate (${+expected.toFixed(2)}). The formula is used.`);
  }

  const material = data.rates.find((r) => r.code === "MATERIAL");
  return {
    ok: errors.length === 0,
    sheetName: grid.name,
    data,
    materialLabel: material?.label ?? data.slabSpec?.materialBasis ?? null,
    errors,
    warnings,
  };
}

export async function parseVariablesSheet(fileName: string, buf: ArrayBuffer): Promise<VariablesParseResult> {
  const fail = (msg: string): VariablesParseResult => ({ ok: false, sheetName: null, data: structuredClone(EMPTY_VARIABLES), materialLabel: null, errors: [msg], warnings: [] });
  let grids: Grid[];
  try {
    if (/\.csv$/i.test(fileName)) grids = readCsv(new TextDecoder("utf-8").decode(buf).replace(/^﻿/, ""));
    else if (/\.xlsx$/i.test(fileName)) grids = await readXlsx(buf);
    else return fail("Only .xlsx and .csv files can be imported. Save .xls files as .xlsx first.");
  } catch {
    return fail("The file could not be read. Check it is a valid, unprotected .xlsx or .csv file.");
  }
  // A sheet named "Variables" / "Rate card" first, then the one that yields the most.
  const ordered = [...grids].sort((a, b) => Number(/variable|rate\s*card/i.test(b.name)) - Number(/variable|rate\s*card/i.test(a.name)));
  let best: VariablesParseResult | null = null;
  const score = (r: VariablesParseResult) => r.data.rates.length * 3 + (r.data.slabSpec ? 2 : 0) + (r.data.packing ? 2 : 0);
  for (const g of ordered) {
    const r = readGrid(g);
    if (!best || score(r) > score(best)) best = r;
    if (/variable|rate\s*card/i.test(g.name) && r.ok) break;
  }
  return best ?? fail("The file has no sheets.");
}

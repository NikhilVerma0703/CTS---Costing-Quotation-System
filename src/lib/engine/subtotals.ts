import type { CostSheet, EngineResult } from "./types";

export interface Subtotal {
  key: string;
  rows: number;
  pcs: number;
  sqft: number;
  total: number;
  share: number | null;
}

/** Per-piece totals grouped by plan group or area, in drawing order. */
export function subtotals(result: EngineResult, sheet: CostSheet, by: "group" | "area"): Subtotal[] {
  const map = new Map<string, Subtotal>();
  sheet.lines.forEach((l, i) => {
    const key = (by === "group" ? l.piece.group : l.piece.area) || "(none)";
    const e = map.get(key) ?? { key, rows: 0, pcs: 0, sqft: 0, total: 0, share: null };
    e.pcs += l.unitsQty;
    e.sqft += result.measurements[i].totalSqft;
    e.total += l.total;
    e.rows += 1;
    map.set(key, e);
  });
  const grand = sheet.grandTotal;
  return [...map.values()].map((e) => ({ ...e, share: grand ? e.total / grand : null }));
}

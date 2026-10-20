/**
 * The customer view: the ONLY data the Final Quote page and the PDF receive.
 *
 * It is a separate type with no internal fields (no My Cost rates, internal
 * totals, margin or slab waste), so internal costing cannot leak into the
 * customer document by accident.
 */
import type { EngineResult, LengthUnit } from "./types";

export interface CustomerQuoteView {
  currency: string;
  materialBasis: string | null;
  pieces: {
    dwgNo: string;
    group: string | null;
    area: string | null;
    pieceNo: string;
    description: string;
    length: number;
    width: number;
    dimUnit: LengthUnit;
    sinkModel: string | null;
    sinkCuts: number;
    unitsQty: number;
    sqftPerPc: number;
    totalSqft: number;
  }[];
  scope: {
    pieceRows: number;
    totalPcs: number;
    totalSqft: number;
    sinkCutouts: number;
    totalSlabs: number;
  };
  pricing: {
    fabrication: number;
    material: number;
    totalQuote: number;
    ratePerSqft: number | null;
  };
  ready: boolean;
  /** Only the customer-safe blocking messages (no internal numbers). */
  blockingIssues: string[];
}

export function toCustomerView(
  result: EngineResult,
  meta: { currency: string; materialBasis: string | null },
): CustomerQuoteView {
  return {
    currency: meta.currency,
    materialBasis: meta.materialBasis,
    pieces: result.measurements.map((m) => ({
      dwgNo: m.piece.dwgNo,
      group: m.piece.group,
      area: m.piece.area,
      pieceNo: m.piece.pieceNo,
      description: m.piece.description,
      length: m.piece.length,
      width: m.piece.width,
      dimUnit: m.piece.dimUnit,
      sinkModel: m.piece.sinkModel,
      sinkCuts: m.piece.sinkCuts,
      unitsQty: m.piece.unitsQty,
      sqftPerPc: m.sqftPerPc,
      totalSqft: m.totalSqft,
    })),
    scope: {
      pieceRows: result.drawingTotals.pieceRows,
      totalPcs: result.drawingTotals.totalPcs,
      totalSqft: result.drawingTotals.totalSqft,
      sinkCutouts: result.drawingTotals.sinkCutouts,
      totalSlabs: result.slab?.totalSlabs ?? 0,
    },
    pricing: {
      fabrication: result.summary.fabricationCustomer,
      material: result.summary.slabMaterialCustomer,
      totalQuote: result.summary.totalQuote,
      ratePerSqft: result.summary.customerPerSqft,
    },
    ready: result.ready,
    blockingIssues: result.issues.filter((i) => i.severity === "error").map((i) => i.message),
  };
}

/** Variables-sheet data types (no ExcelJS — safe for the browser bundle). */
import type { CustomerChargeMode, LengthUnit, MyCostMode } from "@/lib/engine/types";

export interface VariablesRate {
  /** Cost item catalog code (MATERIAL, CUTTING, DEP …). */
  code: string;
  label: string;
  unitLabel: string;
  myCostMode: MyCostMode;
  myCost: number | null;
  customerChargeMode: CustomerChargeMode;
  customerCharge: number | null;
  note: string | null;
}

/** What a Variables sheet holds — the project's rate card, slab size and packing. */
export interface VariablesData {
  slabSpec: { width: number; depth: number; unit: LengthUnit; materialBasis: string | null } | null;
  packing: {
    containerLabel: string;
    containerCostLocal: number;
    containerCount: number;
    localCurrency: string;
    exchangeRate: number;
  } | null;
  rates: VariablesRate[];
  /** The sheet's own calculated figures, kept to compare with the system. */
  checks: { slabAreaSqft: number | null; packingUsd: number | null; totalSqft: number | null; packingPerSqft: number | null };
  /** Cost rows that match no catalog item: kept for reference, not priced. */
  unmatched: { label: string; unitLabel: string | null; myCost: number | null; customerCharge: number | null }[];
}

export interface VariablesParseResult {
  ok: boolean;
  sheetName: string | null;
  data: VariablesData;
  materialLabel: string | null;
  errors: string[];
  warnings: string[];
}

export const EMPTY_VARIABLES: VariablesData = {
  slabSpec: null,
  packing: null,
  rates: [],
  checks: { slabAreaSqft: null, packingUsd: null, totalSqft: null, packingPerSqft: null },
  unmatched: [],
};

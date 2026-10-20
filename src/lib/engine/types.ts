/**
 * Calculation engine types.
 *
 * The engine is a pure function: plain numbers in, plain numbers out. No
 * Prisma, no React, no I/O — so it runs the same on the server, in tests and
 * on a frozen revision snapshot.
 */

export type LengthUnit = "IN" | "MM" | "CM" | "FT" | "M";
export type EdgeRule = "FULL_PERIMETER" | "ONE_LENGTH_ONE_WIDTH" | "NONE";
export type CostDriver =
  | "PIECE_SQFT"
  | "CUTTING_LF"
  | "DEP_LF"
  | "SINK_CUTS"
  | "FAUCET_HOLES"
  | "R_CORNERS"
  | "JOINTS";
export type MyCostMode = "MANUAL" | "PACKING_PER_SQFT";
export type CustomerChargeMode = "MANUAL" | "SAME_AS_MY_COST";
export type MeasurementType = "LENGTH" | "AREA";

/** Short unit symbols used by the conversion rules. */
export const UNIT_SYMBOL: Record<LengthUnit, string> = {
  IN: "in",
  MM: "mm",
  CM: "cm",
  FT: "ft",
  M: "m",
};
export const AREA_SYMBOL: Record<LengthUnit, string> = {
  IN: "sq in",
  MM: "sq mm",
  CM: "sq cm",
  FT: "sqft",
  M: "sq m",
};

export interface ConversionRuleInput {
  measurementType: MeasurementType;
  fromUnit: string;
  toUnit: string;
  multiplier: number;
  divisor: number;
}

export interface CostInputRow {
  code: string;
  name: string;
  unitLabel: string;
  driver: CostDriver;
  isMaterial: boolean;
  sortOrder: number;
  myCostMode: MyCostMode;
  myCost: number | null;
  customerChargeMode: CustomerChargeMode;
  customerCharge: number | null;
}

export interface PieceInput {
  id: string;
  dwgNo: string;
  group: string | null;
  area: string | null;
  pieceNo: string;
  description: string;
  length: number;
  width: number;
  dimUnit: LengthUnit;
  thickness: string | null;
  color: string | null;
  sinkModel: string | null;
  sinkCuts: number;
  faucetHoles: number;
  rCorners: number;
  joints: number;
  unitsQty: number;
  cuttingRule: EdgeRule;
  depRule: EdgeRule;
  notes: string | null;
}

export interface SlabDriverInput {
  label: string;
  pieces: number;
  piecesPerSlab: number;
  dedicatedSlabs: number;
  wastePerSlabSqIn: number;
  note: string | null;
}

export interface EngineInput {
  currency: string;
  slabSpec: { width: number; depth: number; unit: LengthUnit; materialBasis: string | null } | null;
  packing: {
    containerLabel: string;
    containerCostLocal: number;
    containerCount: number;
    localCurrency: string;
    exchangeRate: number;
  } | null;
  slab: {
    optimizerSlabs: number;
    sourceNote: string | null;
    adjustments: { slabs: number; reason: string }[];
    drivers: SlabDriverInput[];
  } | null;
  conversionRules: ConversionRuleInput[];
  costInputs: CostInputRow[];
  pieces: PieceInput[];
}

// ─── Results ────────────────────────────────────────────────────────────────

export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  /** Section the user should go to, to fix it. */
  fixAt?: "import-drawing" | "unit-conversion" | "cost-inputs" | "slab-calculation";
}

export interface AppliedConversion {
  unit: LengthUnit;
  length: ConversionRuleInput;
  area: ConversionRuleInput;
}

export interface PieceMeasurement {
  piece: PieceInput;
  lengthFt: number;
  widthFt: number;
  cuttingLf: number;
  depLf: number;
  sqftPerPc: number;
  totalPcs: number;
  totalSqft: number;
}

export interface DrawingTotals {
  pieceRows: number;
  totalPcs: number;
  totalSqft: number;
  sinkCutouts: number;
  faucetHoles: number;
  rCorners: number;
  joints: number;
  cuttingLf: number;
  depLf: number;
}

export interface ResolvedRate {
  code: string;
  name: string;
  unitLabel: string;
  driver: CostDriver;
  isMaterial: boolean;
  myCost: number | null;
  myCostMode: MyCostMode;
  customerCharge: number | null;
  customerChargeMode: CustomerChargeMode;
}

export interface CostLine {
  piece: PieceInput;
  sqftPerPc: number;
  unitsQty: number;
  /** Amount per piece for each cost item code, in rate order. */
  components: Record<string, number>;
  perPc: number;
  total: number;
}

export interface CostSheet {
  side: "internal" | "customer";
  lines: CostLine[];
  /** SUMPRODUCT(component, qty) per cost item code. */
  componentTotals: Record<string, number>;
  materialTotal: number;
  fabricationTotal: number;
  grandTotal: number;
  totalQty: number;
}

export interface SlabResult {
  slabAreaSqft: number;
  optimizerSlabs: number;
  adjustmentTotal: number;
  totalSlabs: number;
  purchasedSqft: number;
  usedSqft: number;
  wasteSqft: number;
  utilization: number | null;
  materialRateMyCost: number;
  materialRateCustomer: number;
  materialCost: number;
  materialCharge: number;
  drivers: (SlabDriverInput & {
    shareOfSlabs: number | null;
    wasteSqft: number;
    shareOfWaste: number | null;
  })[];
}

export interface PackingResult {
  totalLocal: number;
  totalQuoteCurrency: number;
  perSqft: number | null;
}

export interface ProjectSummaryResult {
  totalPcs: number;
  totalSqft: number;
  totalSlabs: number;
  sinkCutouts: number;
  fabricationMyCost: number;
  slabMaterialMyCost: number;
  totalInternalCost: number;
  fabricationCustomer: number;
  slabMaterialCustomer: number;
  totalQuote: number;
  grossMargin: number;
  grossMarginPct: number | null;
  pricePerSlab: number | null;
  myCostPerSqft: number | null;
  customerPerSqft: number | null;
}

export interface EngineResult {
  conversions: AppliedConversion[];
  measurements: PieceMeasurement[];
  drawingTotals: DrawingTotals;
  packing: PackingResult | null;
  rates: ResolvedRate[];
  internal: CostSheet;
  customer: CostSheet;
  slab: SlabResult | null;
  summary: ProjectSummaryResult;
  issues: Issue[];
  /** True when there is no error-level issue: the quote can be issued. */
  ready: boolean;
}

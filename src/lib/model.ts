/**
 * The data model. A project is one JSON document holding only what people
 * upload or type. Every derived number comes from calculate() in engine.ts, so
 * nothing calculated is ever stored and nothing can go stale.
 *
 * No server or browser code here: the engine, importer, exporter and UI all
 * share these types.
 */

export type DimUnit = "in" | "mm" | "cm" | "ft" | "m";
export const UNITS_PER_FOOT: Record<DimUnit, number> = { in: 12, mm: 304.8, cm: 30.48, ft: 1, m: 0.3048 };

/** The eight cost columns of Internal Costing and Customer Quote. */
export const COST_KEYS = ["material", "cutting", "dep", "sink", "faucet", "rcorner", "joint", "packing"] as const;
export type CostKey = (typeof COST_KEYS)[number];
export const COST_LABEL: Record<CostKey, string> = {
  material: "Material $",
  cutting: "Cutting $",
  dep: "DE&P $",
  sink: "Sink $",
  faucet: "Faucet $",
  rcorner: "R-Corner $",
  joint: "Joint $",
  packing: "Packing $",
};

/** Which edges an edge operation runs along. "manual" = the typed LF, whatever L and W are. */
export type EdgeRule = "perimeter" | "l+w" | "l" | "w" | "manual";
export const EDGE_RULE_LABEL: Record<EdgeRule, string> = {
  perimeter: "2(L+W)",
  "l+w": "L+W",
  l: "L",
  w: "W",
  manual: "Typed",
};

export interface Piece {
  id: string;
  dwg: string;
  group: string;
  area: string;
  piece: string;
  description: string;
  length: number;
  width: number;
  thickness: string;
  color: string;
  sinkModel: string;
  sinkCuts: number;
  faucetHoles: number;
  rCorners: number;
  joints: number;
  qty: number;
  cutRule: EdgeRule;
  /** Typed Cutting LF. Kept when a sheet typed a rounded figure, so the sheet's numbers reproduce exactly. */
  cutLf: number | null;
  depRule: EdgeRule;
  /** Typed DE&P LF, as for cutLf. */
  depLf: number | null;
  /** Information column in some sheets; the workbooks never charge for it. */
  jointDepIn: number | null;
  notes: string;
  /** Sheet columns the tool has no field for, kept as read. */
  extra?: Record<string, string>;
}

export interface RateRow {
  id: string;
  kind: CostKey;
  label: string;
  unit: string;
  /**
   * Which pieces this row prices when a kind has several rows: a color or
   * thickness for material, a thickness for DE&P, a sink model for sinks.
   * null = every piece.
   */
  match: string | null;
  /** null only on the packing row: follows the packing calculation. */
  myCost: number | null;
  /** null = follows My Cost (=C12); on the packing row, follows the packing calculation (=B28). */
  customer: number | null;
  note?: string;
  /** Came from stored variables and has not been looked at for this project. */
  needsConfirm?: boolean;
  // Material rows only: this material's slab inputs (from CutList Optimizer).
  /** null = not entered yet, so an estimate is shown. */
  slabs?: number | null;
  slabAdjust?: number;
  /** Used area typed from the optimizer report. */
  usedSqft?: number | null;
  /** Used % typed from the optimizer report (0.9 = 90%). */
  usedPct?: number | null;
}

export interface Container {
  id: string;
  label: string;
  /** Cost per container, local currency (Rs). */
  cost: number;
  count: number;
}

/** Optional analysis block: how much of the slabs and waste one big repeated piece drives. */
export interface SlabDriver {
  id: string;
  label: string;
  pieces: number;
  piecesPerSlab: number;
  dedicatedSlabs: number;
  wastePerSlabSqIn: number;
  note: string;
}

export interface Variables {
  slabWidth: number;
  slabDepth: number;
  slabUnit: DimUnit;
  materialBasis: string;
  rates: RateRow[];
  containers: Container[];
  exchangeRate: number;
  /** A sheet's typed "Total Project Sqft". null = follow the Drawing Summary total. */
  packingSqftTyped: number | null;
  /** The typed figure was only a rounded copy of the drawing total: dropped once the drawing moves on. */
  packingSqftRoundedCopy: boolean;
  packingNote: string;
  /**
   * How material reaches the totals.
   * slab:  slabs purchased × rate; the Material column is piece-sqft reference only.
   * piece: piece sqft × rate × (1 + wastage markup); the Material column is the charge.
   */
  pricing: "slab" | "piece";
  /** Added to the wasted % to give the wastage markup (the "+ 2%"). */
  wastageExtra: number;
  /** Utilization assumed for the slab estimate until a CutList count is entered. */
  estimateUtilization: number;
  drivers: SlabDriver[];
  slabNotes: string;
}

export interface ProjectMeta {
  name: string;
  /** The project's title on the customer PDF, from its sheet. Blank = the project name. */
  quoteTitle: string;
  code: string;
  customerName: string;
  contactName: string;
  contactEmail: string;
  siteAddress: string;
  version: string;
  /** Printed on the customer PDF. Blank = "Q-" + the reference. */
  quoteNumber: string;
  validityDays: number;
  /** Printed on the customer PDF. Empty = the terms its sheets support (defaultTerms in quote-details.ts). */
  terms: string[];
  /** Printed on the customer PDF, under the terms. */
  remarks: string;
}

/** Columns whose header can differ between sheets; the upload's own wording is kept. */
export type ColumnKey =
  | "dwg"
  | "group"
  | "area"
  | "piece"
  | "description"
  | "length"
  | "width"
  | "thickness"
  | "color"
  | "sinkModel"
  | "sinkCuts"
  | "faucetHoles"
  | "rCorners"
  | "joints"
  | "qty"
  | "depIn"
  | "jointDepIn"
  | "notes";

export const DEFAULT_LABELS: Record<ColumnKey, string> = {
  dwg: "Dwg#",
  group: "Group",
  area: "Area",
  piece: "Piece",
  description: "Description",
  length: "L (in)",
  width: "W (in)",
  thickness: "Thickness",
  color: "Color",
  sinkModel: "Sink Model",
  sinkCuts: "Sink Cuts",
  faucetHoles: "Faucet Holes",
  rCorners: "R-Corners",
  joints: "Joints",
  qty: "Units Qty",
  depIn: "DE&P (in)",
  jointDepIn: "Joint DE&P (in)",
  notes: "Notes",
};

export type SheetKey = "variables" | "drawing" | "internal" | "customer" | "quote" | "slab" | "summary";

export interface ProjectData {
  meta: ProjectMeta;
  dimUnit: DimUnit;
  labels: Partial<Record<ColumnKey, string>>;
  /** Optional Drawing Summary columns this project shows. */
  show: { color: boolean; depIn: boolean; jointDepIn: boolean; notes: boolean };
  extraColumns: string[];
  pieces: Piece[];
  variables: Variables;
  /** Hand-edited cost cells, per piece. A cell not listed here is calculated. */
  overrides: { internal: Record<string, Partial<Record<CostKey, number>>>; customer: Record<string, Partial<Record<CostKey, number>>> };
  /** The sheets' notes / assumptions and version log. */
  notes: string[];
  /** The line under each sheet's title. */
  sheetNotes: Partial<Record<SheetKey, string>>;
  /** What the importer wants the user to know; dismissible. */
  importNotes: string[];
}

export const newId = (prefix = "x") => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

/** The rates shared by all three reference workbooks; the starting stored rate card. */
export const DEFAULT_VARIABLES: Variables = {
  slabWidth: 136,
  slabDepth: 78,
  slabUnit: "in",
  materialBasis: "",
  rates: [
    { id: "material", kind: "material", label: "Material", unit: "per sqft", match: null, myCost: 3.5, customer: null, slabs: null, slabAdjust: 0, usedSqft: null, usedPct: null },
    { id: "cutting", kind: "cutting", label: "Cutting", unit: "per linear ft", match: null, myCost: 0.21, customer: 0.3 },
    { id: "dep", kind: "dep", label: "DE&P (Edge Polish)", unit: "per linear ft", match: null, myCost: 0.25, customer: 0.4 },
    { id: "sink", kind: "sink", label: "Sink Cutout", unit: "per cutout", match: null, myCost: 2, customer: 4 },
    { id: "faucet", kind: "faucet", label: "Faucet Hole", unit: "per hole", match: null, myCost: 2, customer: 3 },
    { id: "rcorner", kind: "rcorner", label: "R-Corner", unit: "per corner", match: null, myCost: 2, customer: 3 },
    { id: "joint", kind: "joint", label: "Joint", unit: "per joint", match: null, myCost: 0, customer: 0 },
    { id: "packing", kind: "packing", label: "Packing", unit: "per sqft", match: null, myCost: null, customer: null },
  ],
  containers: [{ id: "c40", label: "40ft", cost: 200000, count: 1 }],
  exchangeRate: 95,
  packingSqftTyped: null,
  packingSqftRoundedCopy: false,
  packingNote: "",
  pricing: "slab",
  wastageExtra: 0.02,
  estimateUtilization: 0.85,
  drivers: [],
  slabNotes: "",
};

export function emptyProject(name = "New costing"): ProjectData {
  return {
    meta: { name, quoteTitle: "", code: "", customerName: "", contactName: "", contactEmail: "", siteAddress: "", version: "", quoteNumber: "", validityDays: 30, terms: [], remarks: "" },
    dimUnit: "in",
    labels: {},
    show: { color: true, depIn: false, jointDepIn: false, notes: true },
    extraColumns: [],
    pieces: [],
    variables: structuredClone(DEFAULT_VARIABLES),
    overrides: { internal: {}, customer: {} },
    notes: [],
    sheetNotes: {},
    importNotes: [],
  };
}

export function labelOf(d: Pick<ProjectData, "labels">, key: ColumnKey): string {
  return d.labels[key] || DEFAULT_LABELS[key];
}

/** A project's own variables on a drawing that has changed: everything carries over except what the old drawing's CutList run gave. */
export function variablesForNewDrawing(v: Variables): Variables {
  const c = structuredClone(v);
  c.packingSqftTyped = null;
  c.packingSqftRoundedCopy = false;
  c.drivers = [];
  c.slabNotes = "";
  for (const r of c.rates) {
    if (r.kind === "material") {
      r.slabs = null;
      r.slabAdjust = 0;
      r.usedSqft = null;
      r.usedPct = null;
    }
  }
  return c;
}

/** Variables taken to another project: rates carry over, this project's slab results don't. */
export function variablesForReuse(v: Variables): Variables {
  const c = structuredClone(v);
  c.packingSqftTyped = null;
  c.packingSqftRoundedCopy = false;
  c.packingNote = "";
  c.drivers = [];
  c.slabNotes = "";
  c.materialBasis = "";
  for (const r of c.rates) {
    delete r.note;
    if (r.kind === "material") {
      r.slabs = null;
      r.slabAdjust = 0;
      r.usedSqft = null;
      r.usedPct = null;
      r.needsConfirm = true;
    }
  }
  return c;
}

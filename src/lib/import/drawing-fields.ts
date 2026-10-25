/** Drawing-sheet field names and parse-result types (no ExcelJS — safe for the browser bundle). */
import type { EdgeRule, LengthUnit } from "@/lib/engine/types";

export type DrawingField =
  | "dwgNo"
  | "group"
  | "area"
  | "pieceNo"
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
  | "unitsQty"
  | "notes"
  // calculated in the sheet — used only to check and to infer the DE&P rule
  | "cuttingLf"
  | "depLf"
  | "sqftPerPc"
  | "totalPcs"
  | "totalSqft";

export const FIELD_LABEL: Record<DrawingField, string> = {
  dwgNo: "Dwg#",
  group: "Group",
  area: "Area",
  pieceNo: "Piece",
  description: "Description",
  length: "L",
  width: "W",
  thickness: "Thickness",
  color: "Color",
  sinkModel: "Sink Model",
  sinkCuts: "Sink Cuts",
  faucetHoles: "Faucet Holes",
  rCorners: "R-Corners",
  joints: "Joints",
  unitsQty: "Units Qty",
  notes: "Notes",
  cuttingLf: "Cutting LF",
  depLf: "DE&P LF",
  sqftPerPc: "Sqft/Pc",
  totalPcs: "Total Pcs",
  totalSqft: "Total Sqft",
};

/** Calculated columns a sheet may carry; kept per piece to check against the system. */
export const CALC_FIELDS = ["cuttingLf", "depLf", "sqftPerPc", "totalPcs", "totalSqft"] as const;
export type CalcField = (typeof CALC_FIELDS)[number];

/** Standard fields that can't be left out (L/W unit comes from their headers). */
export const REQUIRED_FIELDS: DrawingField[] = ["dwgNo", "pieceNo", "description", "length", "width", "unitsQty"];
/** Required fields the system can fill in when the sheet has no column for them (flagged). */
export const GENERATABLE_FIELDS = ["pieceNo", "description"] as const;
export type GeneratableField = (typeof GENERATABLE_FIELDS)[number];

/**
 * How a sheet column was matched:
 * exact — header is a known spelling; auto — recognised by its words (shown to check);
 * manual — chosen by the user; ambiguous — could be more than one field, needs a choice;
 * extra — not a standard field, kept as an extra column.
 */
export type ColumnMatch = "exact" | "auto" | "manual" | "ambiguous" | "extra";

export interface SheetColumn {
  index: number;
  header: string;
  field: DrawingField | null;
  match: ColumnMatch;
  candidates: DrawingField[];
}

/** The user's answers to the mapping questions, sent back with the file. */
export interface MappingOverrides {
  /** column index → standard field, or "extra" to keep it as an extra column. */
  columns?: Record<string, DrawingField | "extra">;
  /** Required fields with no column that the user agreed to have generated. */
  generate?: GeneratableField[];
}

export interface ParsedPiece {
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
  extra: Record<string, string> | null;
  sheetValues: Partial<Record<CalcField, number>> | null;
}

export interface ParsedRow {
  rowNumber: number;
  /** null when the row has errors and can't be imported. */
  piece: ParsedPiece | null;
  /** Raw values as read, for showing a rejected row. */
  raw: Partial<Record<DrawingField, string>>;
  errors: string[];
  warnings: string[];
}

export interface ParseResult {
  ok: boolean;
  sheetName: string | null;
  headerRow: number | null;
  dimUnit: LengthUnit;
  mapping: Partial<Record<DrawingField, string>>;
  /** Headers kept as extra columns. */
  unmappedHeaders: string[];
  columns: SheetColumn[];
  /** Required fields with no column (and not resolved). */
  missingRequired: DrawingField[];
  /** Required fields the system generates because the user agreed to. */
  generated: GeneratableField[];
  /** Optional standard fields not in the sheet, added with their default (0 / blank). */
  addedDefaults: DrawingField[];
  /** True while a column is ambiguous or a required field is missing: the user must answer first. */
  needsMapping: boolean;
  rows: ParsedRow[];
  fileErrors: string[];
  fileWarnings: string[];
  validCount: number;
  errorCount: number;
}


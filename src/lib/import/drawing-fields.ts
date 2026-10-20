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
  unmappedHeaders: string[];
  rows: ParsedRow[];
  fileErrors: string[];
  fileWarnings: string[];
  validCount: number;
  errorCount: number;
}


/**
 * Section exports. Every section builds one ExportDoc from the live
 * calculation; the same doc is written as Excel (xlsx.ts) or PDF (pdf.tsx),
 * so both formats always carry the same figures.
 */
export type ColFormat = "text" | "int" | "dec2" | "dec4" | "money" | "rate" | "pct";

export interface ExportColumn {
  header: string;
  format?: ColFormat;
  /** Relative width (text columns default 2, numbers 1). */
  width?: number;
}

export type Cell = string | number | null;

export interface ExportTable {
  title: string;
  columns: ExportColumn[];
  rows: Cell[][];
  footer?: Cell[];
  note?: string;
}

/**
 * internal — contains My Cost / margin, marked "Internal — not for customer";
 * customer — built only from customer-facing values; general — neither.
 */
export type Audience = "internal" | "customer" | "general";

export interface ExportDoc {
  fileBase: string;
  title: string;
  subtitle?: string;
  audience: Audience;
  currency: string;
  meta: [string, string][];
  tables: ExportTable[];
  generatedAt: string;
}

export const AUDIENCE_LABEL: Record<Audience, string> = {
  internal: "INTERNAL — NOT FOR CUSTOMER",
  customer: "Customer copy",
  general: "",
};

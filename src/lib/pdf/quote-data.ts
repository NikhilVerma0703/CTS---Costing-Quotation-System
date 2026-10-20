import type { CustomerQuoteView } from "@/lib/engine/customer-view";

/**
 * Everything the customer PDF prints — and nothing else. Built only from the
 * customer view, so internal costing can't reach the document. Frozen as JSON
 * in QuoteRevision.quoteSnapshot when a revision is issued.
 */
export interface QuoteDocData {
  company: { name: string; address: string; email: string; phone: string };
  project: {
    code: string;
    name: string;
    customerName: string | null;
    siteAddress: string | null;
    contactName: string | null;
    contactEmail: string | null;
    versionLabel: string | null;
  };
  quoteNumber: string;
  revisionNo: number | null;
  isDraft: boolean;
  issuedAt: string; // ISO
  validUntil: string; // ISO
  view: CustomerQuoteView;
  notes: string[];
  options: QuoteOptions;
}

export interface QuoteOptions {
  /** Piece schedule with sizes, quantities and sqft. */
  pieceSchedule: boolean;
  /** Show fabrication and material as separate lines above the total. */
  priceSplit: boolean;
}

export const DEFAULT_OPTIONS: QuoteOptions = { pieceSchedule: true, priceSplit: false };

export function companyFromEnv(): QuoteDocData["company"] {
  return {
    name: process.env.COMPANY_NAME?.trim() || "Pacific Surfaces",
    address: process.env.COMPANY_ADDRESS?.trim() || "",
    email: process.env.COMPANY_EMAIL?.trim() || "",
    phone: process.env.COMPANY_PHONE?.trim() || "",
  };
}

export function quoteNumberFor(code: string, revisionNo: number) {
  return `Q-${code}-R${revisionNo}`;
}

export function parseOptions(sp: URLSearchParams | Record<string, string | string[] | undefined>): QuoteOptions {
  const get = (k: string) => (sp instanceof URLSearchParams ? sp.get(k) : (sp[k] as string | undefined));
  return {
    pieceSchedule: get("schedule") !== "0",
    priceSplit: get("split") === "1",
  };
}

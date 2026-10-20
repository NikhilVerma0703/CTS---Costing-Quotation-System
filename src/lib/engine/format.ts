/** Display formatting. Calculations never use these — only the UI and PDF. */

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

const n0 = nf(0, 0);
const n2 = nf(2, 2);
const n4 = nf(4, 4);

export function money(v: number | null | undefined, currency = "USD", digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(v);
}

/** Rates like $0.3990/sqft need 4 decimals. */
export function rate(v: number | null | undefined, currency = "USD"): string {
  return money(v, currency, 4);
}

export function qty(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : n0.format(v);
}

export function dec2(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : n2.format(v);
}

export function dec4(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : n4.format(v);
}

export function pct(v: number | null | undefined, digits = 2): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(digits)}%`;
}

/** Trim trailing zeros for dimensions: 93.25, 44.75, 136. */
export function dim(v: number): string {
  return Number.isInteger(v) ? String(v) : String(+v.toFixed(4));
}

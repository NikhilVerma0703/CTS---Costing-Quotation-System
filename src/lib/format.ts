/** Number parsing and display, shared by the browser and the importer. */

const VULGAR: Record<string, string> = { "¼": " 1/4", "½": " 1/2", "¾": " 3/4", "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8", "⅓": " 1/3", "⅔": " 2/3" };

/** Accepts 93.25, "93.25", "93 1/4", "102¾", "-1 1/2", "1,234", "$3.50", "Rs 200,000". */
export function parseNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  const t = value
    .replace(/[¼½¾⅛⅜⅝⅞⅓⅔]/g, (c) => VULGAR[c])
    .replace(/[$₹,"']|rs\.?|usd|inr/gi, "")
    .trim();
  if (t === "" || t === "-") return null;
  const fraction = /^(-?)(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(t);
  const n = fraction ? (fraction[1] ? -1 : 1) * (Number(fraction[2] ?? 0) + Number(fraction[3]) / Number(fraction[4])) : Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rounds for display the way Excel does: to 15 significant digits first, then half up. 10.25 x 0.30 is held in
 * binary as 3.0749999999999997; Excel treats that as 3.075 and shows $3.08, so a plain rounding would be a cent out.
 * Display only: calculations never round, as in the workbooks.
 */
const fixed = (v: number, d: number) => Number(v.toPrecision(15)).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const dash = "–";

export const money = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? dash : `${v < 0 ? "-" : ""}$${fixed(Math.abs(v), d)}`);
export const num = (v: number | null | undefined, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? dash : fixed(v, d));
export const int = (v: number | null | undefined) => num(v, 0);
export const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? dash : `${fixed(v * 100, d)}%`);

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function underThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
  const rest = n % 100;
  if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(" ");
}

function integerWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  for (let scale = 0; n > 0; scale++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${underThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
  }
  return parts.join(" ");
}

/** 86151.15 → "US Dollars Eighty-Six Thousand One Hundred Fifty-One and Fifteen Cents Only." */
export function amountInWords(value: number): string {
  // Rounded the way the printed figure is, so the words and the digits can't differ by a cent.
  const cents = Math.round(Number(fixed(Math.abs(value), 2).replace(/,/g, "")) * 100);
  const fraction = cents % 100;
  return `US Dollars ${integerWords(Math.floor(cents / 100))}${fraction ? ` and ${integerWords(fraction)} Cents` : ""} Only.`;
}

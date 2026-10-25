/**
 * Project status and customer-quote status, worked out from the project's
 * actual state rather than read from a stored label.
 *
 * Why: `Project.status` used to be shown as-is. It defaults to DRAFT and only
 * "Issue revision" ever changed it, so a fully costed project stayed "Draft",
 * and the seed marked the reference project QUOTED with no revision issued.
 * The quote column showed "incomplete" for any blocking issue without saying
 * which. Now the stored value is used only for outcomes a person decides
 * (Won / Lost / Archived); everything else follows the data.
 */
import type { Issue } from "@/lib/engine/types";

export type ProjectStage = "SETUP" | "IN_PROGRESS" | "READY" | "QUOTED" | "WON" | "LOST" | "ARCHIVED";
export type Tone = "mute" | "info" | "ok" | "warn" | "bad";

export const STAGE_LABEL: Record<ProjectStage, string> = {
  SETUP: "Setup",
  IN_PROGRESS: "In costing",
  READY: "Ready to quote",
  QUOTED: "Quoted",
  WON: "Won",
  LOST: "Lost",
  ARCHIVED: "Archived",
};

export const STAGE_TONE: Record<ProjectStage, Tone> = {
  SETUP: "mute",
  IN_PROGRESS: "warn",
  READY: "info",
  QUOTED: "ok",
  WON: "ok",
  LOST: "bad",
  ARCHIVED: "mute",
};

export const TONE_CLASS: Record<Tone, string> = {
  mute: "bg-mute-bg text-mute-fg",
  info: "bg-info-bg text-info-fg",
  ok: "bg-ok-bg text-ok-fg",
  warn: "bg-warn-bg text-warn-fg",
  bad: "bg-bad-bg text-bad-fg",
};

/** Short reason for the first blocking issue, for a table cell. */
const ISSUE_SHORT: Record<string, string> = {
  NO_PIECES: "No drawing sheet",
  NO_RATES: "No rates",
  MISSING_MY_COST: "Rates missing",
  MISSING_CUSTOMER_CHARGE: "Rates missing",
  PACKING_UNAVAILABLE: "Packing missing",
  BAD_EXCHANGE_RATE: "Exchange rate missing",
  NO_SLAB_SPEC: "Slab size missing",
  NO_SLAB_COUNT: "Slab count missing",
  NO_SLABS: "Slab count missing",
  SLABS_TOO_FEW: "Slab count too low",
  NO_MATERIAL_RATE: "Material rate missing",
  MISSING_CONVERSION: "Unit rule missing",
  BAD_DIMENSION: "Bad dimensions",
  NEGATIVE_RATE: "Negative rate",
};

export interface StatusInput {
  stored: "DRAFT" | "QUOTED" | "WON" | "LOST" | "ARCHIVED";
  pieceRows: number;
  issues: Issue[];
  ready: boolean;
  liveQuote: number;
  currency?: string;
  latestRevision: { revisionNo: number; quoteNumber: string; totalQuote: number } | null;
}

export interface ProjectStatus {
  stage: ProjectStage;
  label: string;
  tone: Tone;
  quote: {
    label: string;
    tone: Tone;
    /** Amount to show: the issued total when issued and unchanged, else the live total (null while blocked). */
    value: number | null;
    detail: string | null;
  };
  blocking: string[];
}

export function projectStatus(s: StatusInput): ProjectStatus {
  const errors = s.issues.filter((i) => i.severity === "error");
  const blocking = errors.map((i) => i.message);
  const rev = s.latestRevision;
  const changed = rev ? Math.abs(rev.totalQuote - Math.round(s.liveQuote * 100) / 100) >= 0.005 : false;

  let stage: ProjectStage;
  if (s.stored === "WON" || s.stored === "LOST" || s.stored === "ARCHIVED") stage = s.stored;
  else if (rev) stage = "QUOTED";
  else if (s.pieceRows === 0) stage = "SETUP";
  else if (!s.ready) stage = "IN_PROGRESS";
  else stage = "READY";

  let quote: ProjectStatus["quote"];
  if (s.pieceRows === 0 && !rev) {
    quote = { label: "Not started", tone: "mute", value: null, detail: "Upload the drawing summary sheet" };
  } else if (!s.ready && !rev) {
    const reasons = [...new Set(errors.map((i) => ISSUE_SHORT[i.code] ?? "Needs input"))];
    quote = { label: reasons[0], tone: "warn", value: null, detail: reasons.length > 1 ? `+${reasons.length - 1} more` : null };
  } else if (!rev) {
    quote = { label: "Draft — not issued", tone: "info", value: s.liveQuote, detail: null };
  } else if (!changed) {
    quote = { label: `Issued ${rev.quoteNumber}`, tone: "ok", value: rev.totalQuote, detail: null };
  } else {
    quote = {
      label: s.ready ? `Changed since R${rev.revisionNo}` : `R${rev.revisionNo} issued · inputs incomplete`,
      tone: "warn",
      value: s.ready ? s.liveQuote : rev.totalQuote,
      detail: `${rev.quoteNumber} was ${rev.totalQuote.toLocaleString("en-US", { style: "currency", currency: s.currency ?? "USD" })}`,
    };
  }
  return { stage, label: STAGE_LABEL[stage], tone: STAGE_TONE[stage], quote, blocking };
}

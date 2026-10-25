import "server-only";
import { getProjectsOverview } from "@/lib/projects-overview";
import { STAGE_LABEL, STAGE_TONE, type ProjectStage, type Tone } from "@/lib/status";

const STAGE_ORDER: ProjectStage[] = ["SETUP", "IN_PROGRESS", "READY", "QUOTED", "WON", "LOST", "ARCHIVED"];

/**
 * Dashboard figures, all from the live calculation of every project.
 * Money is summed only where it is real: issued revisions for "quoted",
 * complete (no blocking issue) costings for cost, quote and margin.
 */
export async function dashboardData() {
  const all = await getProjectsOverview();
  const live = all.filter((p) => p.status.stage !== "ARCHIVED");

  const complete = (p: (typeof all)[number]) => p.result.ready;
  const quoteOf = (p: (typeof all)[number]) => p.status.quote.value;

  const byStatus = STAGE_ORDER.map((stage) => {
    const ps = all.filter((p) => p.status.stage === stage);
    return {
      stage,
      label: STAGE_LABEL[stage],
      tone: STAGE_TONE[stage] as Tone,
      count: ps.length,
      value: ps.reduce((s, p) => s + (quoteOf(p) ?? 0), 0),
    };
  }).filter((s) => s.count > 0);

  const issued = live.filter((p) => p.latestRevision && p.status.stage !== "LOST");
  const ready = live.filter((p) => p.status.stage === "READY");
  const done = live.filter(complete);
  const sumQuote = done.reduce((s, p) => s + p.result.summary.totalQuote, 0);
  const sumCost = done.reduce((s, p) => s + p.result.summary.totalInternalCost, 0);
  const sumSqft = done.reduce((s, p) => s + p.result.summary.totalSqft, 0);

  const kpis = {
    totalProjects: all.length,
    activeProjects: live.filter((p) => p.status.stage !== "LOST" && p.status.stage !== "WON").length,
    issuedValue: issued.reduce((s, p) => s + p.latestRevision!.totalQuote, 0),
    issuedCount: issued.length,
    pipelineValue: ready.reduce((s, p) => s + p.result.summary.totalQuote, 0),
    pipelineCount: ready.length,
    wonValue: all.filter((p) => p.status.stage === "WON").reduce((s, p) => s + (quoteOf(p) ?? 0), 0),
    needsInput: live.filter((p) => !p.result.ready).length,
    totalSqft: live.reduce((s, p) => s + p.result.drawingTotals.totalSqft, 0),
    totalSlabs: done.reduce((s, p) => s + p.result.summary.totalSlabs, 0),
    marginPct: sumQuote ? (sumQuote - sumCost) / sumQuote : null,
    margin: sumQuote - sumCost,
    avgPerSqft: sumSqft ? sumQuote / sumSqft : null,
    completeCount: done.length,
  };

  const customerMap = new Map<string, { customer: string; projects: number; sqft: number; internalCost: number; quote: number; issued: number }>();
  for (const p of live) {
    const key = p.customerName?.trim() || "(no customer)";
    const e = customerMap.get(key) ?? { customer: key, projects: 0, sqft: 0, internalCost: 0, quote: 0, issued: 0 };
    e.projects += 1;
    e.sqft += p.result.drawingTotals.totalSqft;
    if (complete(p)) {
      e.internalCost += p.result.summary.totalInternalCost;
      e.quote += p.result.summary.totalQuote;
    }
    if (p.latestRevision) e.issued += p.latestRevision.totalQuote;
    customerMap.set(key, e);
  }
  const customers = [...customerMap.values()]
    .map((c) => ({ ...c, margin: c.quote - c.internalCost, marginPct: c.quote ? (c.quote - c.internalCost) / c.quote : null }))
    .sort((a, b) => b.quote - a.quote || b.projects - a.projects);

  const projects = all.map((p) => {
    const s = p.result.summary;
    const ok = complete(p);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      customer: p.customerName,
      status: p.status.label,
      tone: p.status.tone,
      quoteLabel: p.status.quote.label,
      sqft: p.result.drawingTotals.totalSqft,
      slabs: ok ? s.totalSlabs : null,
      internalCost: ok ? s.totalInternalCost : null,
      quote: ok ? s.totalQuote : null,
      marginPct: ok ? s.grossMarginPct : null,
      perSqft: ok ? s.customerPerSqft : null,
      revision: p.latestRevision?.quoteNumber ?? null,
      checks: p.result.issues.filter((i) => i.check).length,
      blocking: p.status.blocking,
    };
  });

  const attention = projects
    .filter((p) => p.blocking.length || p.checks)
    .map((p) => ({ id: p.id, code: p.code, name: p.name, blocking: p.blocking, checks: p.checks }));

  return { kpis, byStatus, customers, projects, attention };
}

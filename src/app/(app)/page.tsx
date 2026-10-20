import Link from "next/link";
import {
  ArrowRight,
  BadgeDollarSign,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LayoutGrid,
  PieChart,
  Receipt,
  Ruler,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { dec2, money, pct, qty, rate } from "@/lib/engine/format";
import type { EngineResult } from "@/lib/engine/types";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { SECTIONS, SECTION_GROUPS, sectionHref, type SectionDef } from "@/modules/registry";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ICONS: Record<SectionDef["icon"], typeof Ruler> = {
  FileSpreadsheet,
  Ruler,
  BadgeDollarSign,
  Calculator,
  Receipt,
  ClipboardList,
  ClipboardCheck,
  LayoutGrid,
  PieChart,
  FileText,
};

const STATUS_STYLE: Record<string, string> = {
  DRAFT: "bg-mute-bg text-mute-fg",
  QUOTED: "bg-info-bg text-info-fg",
  WON: "bg-ok-bg text-ok-fg",
  LOST: "bg-bad-bg text-bad-fg",
  ARCHIVED: "bg-mute-bg text-mute-fg",
};

/** What each section does, and its live headline figure for the selected project. */
function sectionInfo(slug: string, r: EngineResult, cur: string, revisions: number): { what: string; figure: string } {
  const s = r.summary;
  switch (slug) {
    case "import-drawing":
      return { what: "Upload the drawing summary sheet, check every row, or enter pieces by hand.", figure: `${r.drawingTotals.pieceRows} rows · ${qty(r.drawingTotals.totalPcs)} pcs` };
    case "unit-conversion":
      return { what: "Inches / mm → feet and sqft. Rules, formulas and every piece's LF and sqft.", figure: `${dec2(r.drawingTotals.totalSqft)} sqft` };
    case "cost-inputs":
      return { what: "Unit · Cost Item · My Cost · Customer Charges, plus slab size and packing.", figure: `${r.rates.length} cost items` };
    case "internal-costing":
      return { what: "Every piece costed at My Cost rates.", figure: money(r.internal.grandTotal, cur) };
    case "customer-charges":
      return { what: "Every piece priced at Customer Charge rates.", figure: money(r.customer.grandTotal, cur) };
    case "internal-summary":
      return { what: "Total internal project cost with build-up and subtotals.", figure: money(s.totalInternalCost, cur) };
    case "customer-summary":
      return { what: "Total quotation value with build-up and subtotals.", figure: money(s.totalQuote, cur) };
    case "slab-calculation":
      return { what: "Slab count, purchased / used / waste area, slab-basis material.", figure: r.slab ? `${r.slab.totalSlabs} slabs · ${pct(r.slab.utilization, 1)} used` : "slab count not entered" };
    case "project-summary":
      return { what: "Scope, cost build-up, margin and final rate per sqft.", figure: `Margin ${money(s.grossMargin, cur)} (${pct(s.grossMarginPct, 1)})` };
    case "final-quote":
      return { what: "Customer PDF — preview, download, issue numbered revisions.", figure: r.ready ? `${rate(s.customerPerSqft, cur)}/sqft · ${revisions} issued` : "issues to fix first" };
    default:
      return { what: "", figure: "" };
  }
}

export default async function Home({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project: selectedId } = await searchParams;
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { revisions: true } } },
  });
  const rows = await Promise.all(projects.map(async (p) => ({ p, r: (await getProjectCalculation(p.id)).result })));
  const active = rows.find((x) => x.p.id === selectedId) ?? rows[0];

  return (
    <>
      <PageHeader
        title="Projects"
        description="Pick a project, then work through its sections — inputs first, then costing & calculations, then the customer quote. Every section is also in the left sidebar."
        actions={<NewProjectButton copyOptions={projects.map((p) => ({ id: p.id, label: `${p.code} — ${p.name}` }))} />}
      />

        {rows.length === 0 ? (
          <div className="card px-6 py-12 text-center text-ink-2">No projects yet. Create one, then import its drawing summary sheet.</div>
        ) : (
          <div className="card mb-8 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="th">Project</th>
                  <th className="th">Customer</th>
                  <th className="th">Status</th>
                  <th className="th num">Pieces</th>
                  <th className="th num">Sqft</th>
                  <th className="th num">Customer quote</th>
                  <th className="th num">Revisions</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, r }) => {
                  const isActive = p.id === active?.p.id;
                  return (
                    <tr key={p.id} className={cn(isActive ? "bg-info-bg/60" : "hover:bg-shell")}>
                      <td className="td">
                        <Link href={`/?project=${p.id}`} className="font-semibold text-brand hover:underline">
                          {p.name}
                        </Link>
                        <p className="text-xs text-ink-3">
                          {p.code}
                          {p.versionLabel ? ` · ${p.versionLabel}` : ""}
                        </p>
                      </td>
                      <td className="td">{p.customerName ?? "—"}</td>
                      <td className="td">
                        <span className={`badge ${STATUS_STYLE[p.status]}`}>{p.status[0] + p.status.slice(1).toLowerCase()}</span>
                      </td>
                      <td className="td num">{qty(r.drawingTotals.totalPcs)}</td>
                      <td className="td num">{dec2(r.drawingTotals.totalSqft)}</td>
                      <td className="td num font-semibold">
                        {r.ready ? money(r.summary.totalQuote, p.currency) : <span className="text-xs font-semibold text-bad-fg">incomplete</span>}
                      </td>
                      <td className="td num">{p._count.revisions}</td>
                      <td className="td text-right whitespace-nowrap">
                        {isActive ? (
                          <span className="text-xs font-semibold text-info-fg">Sections shown below ↓</span>
                        ) : (
                          <Link href={`/?project=${p.id}`} className="btn-secondary btn-sm">
                            Show sections
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {active && (
          <>
            <div className="mb-4">
              <h2 className="text-xl font-bold tracking-tight">Sections — {active.p.name}</h2>
              <p className="mt-1 text-sm text-ink-2">
                Click any section to open it. Figures are live: change a drawing, conversion rule or rate and every section updates.
              </p>
            </div>
            {SECTION_GROUPS.map((group) => (
              <section key={group} className="mb-6">
                <h3 className="mb-2 text-[11px] font-bold tracking-widest text-ink-3 uppercase">
                  {group}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {SECTIONS.filter((s) => s.group === group).map((s) => {
                    const Icon = ICONS[s.icon];
                    const info = sectionInfo(s.slug, active.r, active.p.currency, active.p._count.revisions);
                    return (
                      <Link
                        key={s.slug}
                        href={sectionHref(active.p.id, s.slug)}
                        className="card group flex flex-col p-4 transition-shadow hover:border-brand-2 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-lg",
                              s.internal ? "bg-internal-bg text-internal" : "bg-customer-bg text-customer",
                            )}
                          >
                            <Icon className="size-[18px]" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-snug">{s.short}</p>
                            <p className="mt-0.5 text-xs text-ink-2">{info.what}</p>
                          </div>
                          <ArrowRight className="size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                        </div>
                        <p className="mt-3 border-t border-line pt-2 text-[13px] font-semibold tabular-nums text-ink">{info.figure}</p>
                        <p className="mt-0.5 text-[11px] text-ink-3">{s.internal ? "Internal · not for customer" : "Customer-facing / shared"}</p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </>
        )}
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { dec2, money, pct, qty, rate } from "@/lib/engine/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { SideTag } from "@/components/ui/SideTag";
import { NotesEditor } from "@/components/notes/NotesEditor";
import { EditProjectButton } from "@/components/projects/EditProjectButton";
import { sectionHref } from "@/modules/registry";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { extraFieldsOf, projectFormValues } from "@/lib/project-fields";
import { projectStatus, TONE_CLASS } from "@/lib/status";
import { cn, num } from "@/lib/utils";

export const metadata: Metadata = { title: "Project Summary" };

export default async function ProjectSummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, notes, activity, latestRev, { result }] = await Promise.all([
    getProject(projectId),
    prisma.projectNote.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.auditLog.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 12 }),
    prisma.quoteRevision.findFirst({ where: { projectId }, orderBy: { revisionNo: "desc" } }),
    getProjectCalculation(projectId),
  ]);
  const extras = extraFieldsOf(project);
  const status = projectStatus({
    stored: project.status,
    pieceRows: result.drawingTotals.pieceRows,
    issues: result.issues,
    ready: result.ready,
    liveQuote: result.summary.totalQuote,
    currency: project.currency,
    latestRevision: latestRev ? { revisionNo: latestRev.revisionNo, quoteNumber: latestRev.quoteNumber, totalQuote: num(latestRev.totalQuote)! } : null,
  });
  const s = result.summary;
  const cur = project.currency;
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";

  const Row = ({ label, value, strong, tone, href }: { label: string; value: string; strong?: boolean; tone?: "internal" | "customer"; href?: string }) => (
    <tr className={strong ? "bg-mute-bg font-bold" : ""}>
      <td className="td">{href ? <Link href={href} className="hover:underline">{label}</Link> : label}</td>
      <td className={`td num ${strong ? "text-[15px]" : ""} ${tone === "internal" ? "text-internal" : tone === "customer" ? "text-customer" : ""}`}>{value}</td>
    </tr>
  );

  return (
    <>
      <PageHeader
        side="internal"
        title="Project Summary"
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn("badge", TONE_CLASS[status.tone])}>{status.label}</span>
            <span className={cn("badge", TONE_CLASS[status.quote.tone])}>{status.quote.label}</span>
            <span>
              {project.code}
              {project.customerName ? ` · ${project.customerName}` : ""}
              {project.versionLabel ? ` · ${project.versionLabel}` : ""}
            </span>
          </span>
        }
        actions={
          <>
            <ExportButtons scope="project-summary" projectId={projectId} />
            <EditProjectButton projectId={projectId} initial={projectFormValues(project)} />
          </>
        }
      />
      {(project.description || extras.length > 0) && (
        <div className="card mb-5 grid gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {project.description && (
            <div className="sm:col-span-2 lg:col-span-4">
              <p className="text-[11px] font-semibold text-ink-3 uppercase">Description</p>
              <p className="mt-0.5 text-ink-2">{project.description}</p>
            </div>
          )}
          {extras.map((f) => (
            <div key={f.label}>
              <p className="text-[11px] font-semibold text-ink-3 uppercase">{f.label}</p>
              <p className="mt-0.5 font-semibold">{f.value || "—"}</p>
            </div>
          ))}
        </div>
      )}
      <IssuesBanner issues={result.issues} projectId={projectId} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total internal cost (My Cost)" value={money(s.totalInternalCost, cur)} tone="internal" emphasis hint={`${rate(s.myCostPerSqft, cur)} / sqft`} />
        <StatTile label="Total customer quote" value={money(s.totalQuote, cur)} tone="customer" emphasis hint={`${rate(s.customerPerSqft, cur)} / sqft`} />
        <StatTile label="Gross margin" value={money(s.grossMargin, cur)} hint={pct(s.grossMarginPct)} tone={s.grossMargin < 0 ? "warn" : "neutral"} />
        <StatTile label="Customer price per slab" value={money(s.pricePerSlab, cur)} hint={`${s.totalSlabs} slabs`} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <div>
          <Section title="Scope" bodyClassName="p-0">
            <table className="w-full text-[13.5px]">
              <tbody>
                <Row label="Pieces (Drawing Summary)" value={qty(s.totalPcs)} href={sectionHref(projectId, "import-drawing")} />
                <Row label="Piece sqft" value={dec2(s.totalSqft)} href={sectionHref(projectId, "unit-conversion")} />
                <Row label="Slabs required" value={qty(s.totalSlabs)} href={sectionHref(projectId, "slab-calculation")} />
                <Row label="Sink cutouts" value={qty(s.sinkCutouts)} />
              </tbody>
            </table>
          </Section>

          <Section title="Final rate per sqft (on piece sqft)" bodyClassName="p-0">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr>
                  <th className="th" />
                  <th className="th num text-internal">My Cost $/sqft</th>
                  <th className="th num text-customer">Customer $/sqft</th>
                </tr>
              </thead>
              <tbody>
                <tr className="font-bold">
                  <td className="td">Rate per sqft (total / piece sqft)</td>
                  <td className="td num text-internal">{rate(s.myCostPerSqft, cur)}</td>
                  <td className="td num text-customer">{rate(s.customerPerSqft, cur)}</td>
                </tr>
              </tbody>
            </table>
          </Section>
        </div>

        <Section title="Cost build-up" bodyClassName="p-0">
          <table className="w-full text-[13.5px]">
            <tbody>
              <Row label="Fabrication — My Cost" value={money(s.fabricationMyCost, cur)} href={sectionHref(projectId, "internal-costing")} />
              <Row label={`Slab-basis material cost (${s.totalSlabs} slabs, from Slab Calculation)`} value={money(s.slabMaterialMyCost, cur)} href={sectionHref(projectId, "slab-calculation")} />
              <Row label="TOTAL INTERNAL COST (My Cost)" value={money(s.totalInternalCost, cur)} strong tone="internal" />
              <Row label="Fabrication (customer side)" value={money(s.fabricationCustomer, cur)} href={sectionHref(projectId, "customer-charges")} />
              <Row label="Material charge to customer (slab basis)" value={money(s.slabMaterialCustomer, cur)} />
              <Row label="TOTAL CUSTOMER QUOTE" value={money(s.totalQuote, cur)} strong tone="customer" />
              <tr>
                <td className="td pt-4 text-[11px] font-bold tracking-wide text-ink-2 uppercase" colSpan={2}>
                  Margin
                </td>
              </tr>
              <Row label="Gross margin $" value={money(s.grossMargin, cur)} />
              <Row label="Gross margin %" value={pct(s.grossMarginPct)} />
              <Row label="Customer price per slab" value={money(s.pricePerSlab, cur)} />
            </tbody>
          </table>
        </Section>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
        <Section title={<span className="flex items-center gap-2">Notes / assumptions <SideTag side="internal" /></span>}>
          <NotesEditor projectId={projectId} notes={notes} visibility="INTERNAL" />
        </Section>
        <Section title={<span className="flex items-center gap-2">Quote notes <SideTag side="customer" /></span>} description="Printed on the customer PDF.">
          <NotesEditor projectId={projectId} notes={notes} visibility="CUSTOMER" />
        </Section>
      </div>

      <Section title="Recent activity" bodyClassName="p-0">
        <ul className="divide-y divide-line text-sm">
          {activity.map((a) => (
            <li key={a.id} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:gap-4">
              <span className="w-40 shrink-0 text-xs text-ink-3">{a.createdAt.toLocaleString("en-IN", { timeZone: tz })}</span>
              <span className="flex-1">{a.summary}</span>
              <span className="text-xs text-ink-3">{a.userName}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

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

export const metadata: Metadata = { title: "Project Summary" };

export default async function ProjectSummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, notes, activity, { result }] = await Promise.all([
    getProject(projectId),
    prisma.projectNote.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.auditLog.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 12 }),
    getProjectCalculation(projectId),
  ]);
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
          <>
            {project.name}
            {project.versionLabel ? ` · ${project.versionLabel}` : ""}. Piece-basis fabrication plus slab-basis material, for both My Cost and the customer quote.
          </>
        }
        actions={
          <EditProjectButton
            projectId={projectId}
            initial={{
              code: project.code,
              name: project.name,
              customerName: project.customerName ?? "",
              siteAddress: project.siteAddress ?? "",
              contactName: project.contactName ?? "",
              contactEmail: project.contactEmail ?? "",
              versionLabel: project.versionLabel ?? "",
              validityDays: project.validityDays,
              status: project.status,
              description: project.description ?? "",
            }}
          />
        }
      />
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

        <Section title="Cost build-up" description="Piece-basis fabrication + slab-basis material" bodyClassName="p-0">
          <table className="w-full text-[13.5px]">
            <tbody>
              <Row label="Fabrication cost (Cutting + DE&P + Sink + Faucet + R-Corner + Joint + Packing) — My Cost" value={money(s.fabricationMyCost, cur)} href={sectionHref(projectId, "internal-costing")} />
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
        <Section title={<span className="flex items-center gap-2">Notes / assumptions <SideTag side="internal" /></span>} description="Version log and costing assumptions. Never printed on the quote.">
          <NotesEditor projectId={projectId} notes={notes} visibility="INTERNAL" />
        </Section>
        <Section title={<span className="flex items-center gap-2">Quote notes <SideTag side="customer" /></span>} description="Scope, inclusions and exclusions printed on the customer PDF.">
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

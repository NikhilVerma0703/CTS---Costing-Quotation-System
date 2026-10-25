import Link from "next/link";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { dec2, money, rate } from "@/lib/engine/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { ComponentBreakdown, CostSheetTable } from "./CostSheetTable";
import { GroupSubtotals, PieceSummaryTable } from "./SummaryTables";
import { cn } from "@/lib/utils";

/**
 * Internal Costing and Customer Charges share one layout: the per-piece sheet
 * (workbook sheets 3 / 4) and, on the Summary tab, its consolidation
 * (sheet 5 and the internal equivalent).
 */
export async function CostingView({ projectId, side, view }: { projectId: string; side: "internal" | "customer"; view: string | undefined }) {
  const [project, { result }] = await Promise.all([getProject(projectId), getProjectCalculation(projectId)]);
  const internal = side === "internal";
  const sheet = internal ? result.internal : result.customer;
  const s = result.summary;
  const cur = project.currency;
  const firm = internal ? s.totalInternalCost : s.totalQuote;
  const perSqft = internal ? s.myCostPerSqft : s.customerPerSqft;
  const fab = internal ? s.fabricationMyCost : s.fabricationCustomer;
  const mat = internal ? s.slabMaterialMyCost : s.slabMaterialCustomer;
  const slug = internal ? "internal-costing" : "customer-charges";
  const summary = view === "summary";
  const tone = internal ? "internal" : "customer";

  return (
    <>
      <PageHeader
        side={side}
        title={internal ? "Internal Costing" : "Customer Charges"}
        actions={<ExportButtons scope={slug} projectId={projectId} />}
      />
      <IssuesBanner issues={result.issues} projectId={projectId} only="error" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={internal ? "Total internal cost" : "Total quotation"} value={money(firm, cur)} tone={tone} emphasis hint="Fabrication + slab-basis material" />
        <StatTile label="Rate per sqft" value={rate(perSqft, cur)} hint={`on ${dec2(s.totalSqft)} sqft`} tone={tone} />
        <StatTile label="Fabrication" value={money(fab, cur)} hint="All items except material" />
        <StatTile label="Material (slab basis)" value={money(mat, cur)} hint={`${s.totalSlabs} slabs`} />
      </div>

      <div className="mb-3 flex gap-1 border-b border-line">
        {[
          { key: "piece", label: "Per piece", on: !summary, href: `/projects/${projectId}/${slug}` },
          { key: "summary", label: "Summary", on: summary, href: `/projects/${projectId}/${slug}?view=summary` },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            scroll={false}
            className={cn(
              "-mb-px border-b-2 px-4 py-2 text-sm font-semibold",
              t.on ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-brand",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {!summary ? (
        <Section bodyClassName="p-0">
          <CostSheetTable sheet={sheet} rates={result.rates} currency={cur} />
          <p className="border-t border-line px-4 py-2 text-xs text-ink-3">Material here is piece-sqft basis for reference; the quote uses slab-basis material.</p>
        </Section>
      ) : (
        <>
          <Section title="Per piece" bodyClassName="p-0">
            <PieceSummaryTable result={result} sheet={sheet} currency={cur} />
          </Section>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <Section title="Build-up" bodyClassName="p-0 overflow-x-auto">
              <table className="w-full text-[13px]">
                <tbody>
                  <tr>
                    <td className="td">Total, piece-basis material</td>
                    <td className="td num">{money(sheet.grandTotal, cur)}</td>
                  </tr>
                  <tr>
                    <td className="td">Less: piece-basis material</td>
                    <td className="td num">− {money(sheet.materialTotal, cur)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="td">Fabrication</td>
                    <td className="td num">{money(fab, cur)}</td>
                  </tr>
                  <tr>
                    <td className="td">Add: slab-basis material ({s.totalSlabs} slabs)</td>
                    <td className="td num">+ {money(mat, cur)}</td>
                  </tr>
                  <tr className="bg-mute-bg font-bold">
                    <td className="td">{internal ? "Total internal cost" : "Total quotation value"}</td>
                    <td className="td num text-[14px]">{money(firm, cur)}</td>
                  </tr>
                </tbody>
              </table>
            </Section>
            <Section title="By cost item" bodyClassName="p-0 overflow-x-auto">
              <ComponentBreakdown sheet={sheet} rates={result.rates} currency={cur} />
            </Section>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Section title="By group" bodyClassName="p-0 overflow-x-auto">
              <GroupSubtotals result={result} sheet={sheet} currency={cur} by="group" />
            </Section>
            <Section title="By area" bodyClassName="p-0 overflow-x-auto">
              <GroupSubtotals result={result} sheet={sheet} currency={cur} by="area" />
            </Section>
          </div>
        </>
      )}
    </>
  );
}

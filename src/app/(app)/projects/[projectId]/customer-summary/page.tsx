import type { Metadata } from "next";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { dec2, money, rate } from "@/lib/engine/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { ComponentBreakdown } from "@/components/costing/CostSheetTable";
import { GroupSubtotals, PieceSummaryTable } from "@/components/costing/SummaryTables";

export const metadata: Metadata = { title: "Customer Charges Summary" };

export default async function CustomerSummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, { result }] = await Promise.all([getProject(projectId), getProjectCalculation(projectId)]);
  const sheet = result.customer;
  const s = result.summary;
  const internal = sheet.side === "internal";
  const cur = project.currency;
  const fab = internal ? s.fabricationMyCost : s.fabricationCustomer;
  const mat = internal ? s.slabMaterialMyCost : s.slabMaterialCustomer;
  const firm = internal ? s.totalInternalCost : s.totalQuote;
  const perSqft = internal ? s.myCostPerSqft : s.customerPerSqft;

  return (
    <>
      <PageHeader side="customer" title="Customer Charges Summary" description="Consolidated customer charges (the Quote Summary sheet): per-piece price, subtotals and the total quotation value. The firm quote uses slab-basis material (see Project Summary)." />
      <IssuesBanner issues={result.issues} projectId={projectId} only="error" />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label={internal ? "Total internal project cost" : "Total quotation value"} value={money(firm, cur)} tone="customer" emphasis hint="Fabrication + slab-basis material" />
        <StatTile label="Rate per sqft" value={rate(perSqft, cur)} hint={`on ${dec2(s.totalSqft)} piece sqft`} tone="customer" />
        <StatTile label="Fabrication" value={money(fab, cur)} hint="Cutting, DE&P, cutouts, joints, packing…" />
        <StatTile label="Material (slab basis)" value={money(mat, cur)} hint={`${s.totalSlabs} slabs`} />
      </div>

      <Section title="Per piece" description="Piece-basis material (as in the Quote Summary sheet). Its total differs from the firm quotation value above, which prices material per slab purchased." bodyClassName="p-0">
        <PieceSummaryTable result={result} sheet={sheet} currency={cur} />
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
  );
}

import type { Metadata } from "next";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { money } from "@/lib/engine/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { CostSheetTable } from "@/components/costing/CostSheetTable";

export const metadata: Metadata = { title: "Internal Costing (My Cost)" };

export default async function InternalCostingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, { result }] = await Promise.all([getProject(projectId), getProjectCalculation(projectId)]);
  const sheet = result.internal;
  const material = result.rates.filter((r) => r.isMaterial);
  return (
    <>
      <PageHeader side="internal" title="Internal Costing (My Cost)" description="Each piece costed at My Cost rates: every cost column is the drawing quantity × its My Cost rate (Sqft/Pc × Material, Cutting LF × Cutting, DE&P LF × DE&P, Sink Cuts × Sink Cutout …). Cost/Pc is the sum; Total Cost = Cost/Pc × Units Qty." />
      <IssuesBanner issues={result.issues} projectId={projectId} only="error" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total (piece-basis material)" value={money(sheet.grandTotal, project.currency)} tone="internal" emphasis />
        <StatTile label="Fabrication (excl. material)" value={money(sheet.fabricationTotal, project.currency)} tone="internal" hint="Used in the Project Summary" />
        <StatTile label="Material, piece basis" value={money(sheet.materialTotal, project.currency)} hint="Reference only — the quote uses slab-basis material" />
        <StatTile label="Pieces" value={sheet.totalQty.toLocaleString("en-US")} hint={`${sheet.lines.length} drawing rows`} />
      </div>
      <Section
        title="Per piece"
        description={
          material.length
            ? "Material here is piece-sqft basis for reference only; the firm quote uses slab-basis material (Project Summary)."
            : undefined
        }
        bodyClassName="p-0"
      >
        <CostSheetTable sheet={sheet} rates={result.rates} currency={project.currency} />
      </Section>
    </>
  );
}

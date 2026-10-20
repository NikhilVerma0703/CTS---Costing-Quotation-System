import type { Metadata } from "next";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { money } from "@/lib/engine/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { CostSheetTable } from "@/components/costing/CostSheetTable";

export const metadata: Metadata = { title: "Customer Charges (Custom Quote)" };

export default async function CustomerChargesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, { result }] = await Promise.all([getProject(projectId), getProjectCalculation(projectId)]);
  const sheet = result.customer;
  const material = result.rates.filter((r) => r.isMaterial);
  return (
    <>
      <PageHeader side="customer" title="Customer Charges (Custom Quote)" description="Each piece priced at Customer Charge rates — same layout as Internal Costing, with the customer rate for every item. Price/Pc is the sum; Total Price = Price/Pc × Units Qty." />
      <IssuesBanner issues={result.issues} projectId={projectId} only="error" />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total (piece-basis material)" value={money(sheet.grandTotal, project.currency)} tone="customer" emphasis />
        <StatTile label="Fabrication (excl. material)" value={money(sheet.fabricationTotal, project.currency)} tone="customer" hint="Used in the Project Summary" />
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

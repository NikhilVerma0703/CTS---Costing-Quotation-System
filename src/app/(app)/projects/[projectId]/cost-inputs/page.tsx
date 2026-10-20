import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { DRIVER_LABEL } from "@/lib/engine/calculate";
import { dec2, dec4, money, rate } from "@/lib/engine/format";
import { num } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { Formula } from "@/components/ui/Formula";
import { CostInputsTable, type CostInputRowView } from "@/components/cost-inputs/CostInputsTable";
import { PackingForm, SlabSpecForm } from "@/components/cost-inputs/SettingsForms";

export const metadata: Metadata = { title: "Cost Inputs" };

export default async function CostInputsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [inputs, project, history, { result }] = await Promise.all([
    prisma.projectCostInput.findMany({ where: { projectId }, include: { costItem: true }, orderBy: { costItem: { sortOrder: "asc" } } }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { slabSpec: true, packing: true } }),
    prisma.auditLog.findMany({
      where: { projectId, entityType: { in: ["ProjectCostInput", "SlabSpec", "PackingConfig"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    getProjectCalculation(projectId),
  ]);

  const rows: CostInputRowView[] = inputs.map((c) => {
    const resolved = result.rates.find((r) => r.code === c.costItem.code);
    return {
      id: c.id,
      code: c.costItem.code,
      itemName: c.costItem.name,
      label: c.label ?? "",
      unitLabel: c.costItem.unitLabel,
      driverLabel: DRIVER_LABEL[c.costItem.driver],
      isMaterial: c.costItem.isMaterial,
      myCostMode: c.myCostMode,
      myCost: num(c.myCost),
      customerChargeMode: c.customerChargeMode,
      customerCharge: num(c.customerCharge),
      resolvedMy: resolved?.myCost ?? null,
      resolvedCustomer: resolved?.customerCharge ?? null,
      note: c.note ?? "",
      updatedAt: c.updatedAt.toISOString(),
      updatedBy: c.updatedBy,
    };
  });

  const s = result.summary;
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";

  return (
    <>
      <PageHeader
        side="internal"
        title="Cost Inputs"
        description="The rate card. Change any My Cost or Customer Charge (for example after a negotiation) and every costing page, summary and the customer PDF use the new value straight away — nothing else needs updating."
      />
      <IssuesBanner issues={result.issues.filter((i) => i.fixAt === "cost-inputs")} projectId={projectId} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total internal cost (My Cost)" value={money(s.totalInternalCost)} tone="internal" emphasis />
        <StatTile label="Total customer quote" value={money(s.totalQuote)} tone="customer" emphasis />
        <StatTile label="Gross margin" value={money(s.grossMargin)} hint={s.grossMarginPct !== null ? `${(s.grossMarginPct * 100).toFixed(2)}% of quote` : undefined} tone={s.grossMargin < 0 ? "warn" : "neutral"} />
        <StatTile label="Customer rate per sqft" value={rate(s.customerPerSqft)} hint={`My Cost ${rate(s.myCostPerSqft)}/sqft`} />
      </div>

      <Section title="Cost inputs" description="Unit · Cost Item · My Cost · Customer Charges. Material and Packing can follow other values automatically, as in the Variables sheet.">
        <CostInputsTable projectId={projectId} rows={rows} />
      </Section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
        <Section title="Slab specification" description={<>Slab area <Formula>W × D ÷ 144</Formula> = <b>{dec4(result.slab?.slabAreaSqft)} sqft</b></>}>
          <SlabSpecForm
            projectId={projectId}
            initial={{
              width: num(project.slabSpec?.width) ?? "",
              depth: num(project.slabSpec?.depth) ?? "",
              unit: project.slabSpec?.unit ?? "IN",
              materialBasis: project.slabSpec?.materialBasis ?? "",
            }}
          />
        </Section>

        <Section
          title="Packing calculation"
          description={
            result.packing ? (
              <>
                {money(result.packing.totalQuoteCurrency)} total ÷ {dec2(result.drawingTotals.totalSqft)} sqft = <b>{rate(result.packing.perSqft)} per sqft</b>
              </>
            ) : (
              "Not set"
            )
          }
        >
          <PackingForm
            projectId={projectId}
            initial={{
              containerLabel: project.packing?.containerLabel ?? "40ft container",
              containerCostLocal: num(project.packing?.containerCostLocal) ?? "",
              containerCount: num(project.packing?.containerCount) ?? "",
              localCurrency: project.packing?.localCurrency ?? "INR",
              exchangeRate: num(project.packing?.exchangeRate) ?? "",
            }}
          />
          <p className="mt-2 text-xs text-ink-3">
            Packing per sqft is spread over the total piece sqft from the drawings, so it changes whenever drawing quantities change.
          </p>
        </Section>
      </div>

      <Section title="Change history" description="Every rate, slab-size and packing change, newest first." bodyClassName="p-0">
        {history.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">No changes yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-col gap-0.5 px-4 py-2 sm:flex-row sm:gap-4">
                <span className="w-40 shrink-0 text-xs text-ink-3">{h.createdAt.toLocaleString("en-IN", { timeZone: tz })}</span>
                <span className="flex-1">{h.summary}</span>
                <span className="text-xs text-ink-3">{h.userName}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

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
import { ExportButtons } from "@/components/ui/ExportButtons";

export const metadata: Metadata = { title: "Cost Inputs" };

export default async function CostInputsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [inputs, project, history, otherInputs, { result }] = await Promise.all([
    prisma.projectCostInput.findMany({ where: { projectId }, include: { costItem: true }, orderBy: { costItem: { sortOrder: "asc" } } }),
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { slabSpec: true, packing: true } }),
    prisma.auditLog.findMany({
      where: { projectId, entityType: { in: ["ProjectCostInput", "SlabSpec", "PackingConfig", "VariablesSheet"] } },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.projectCostInput.findMany({
      where: { projectId: { not: projectId }, project: { deletedAt: null } },
      include: { costItem: true, project: { select: { code: true } } },
    }),
    getProjectCalculation(projectId),
  ]);

  // Previous records: the same item's rates on other projects, to flag unusual values.
  const compare = result.rates.map((r) => {
    const peers = otherInputs.filter((o) => o.costItem.code === r.code);
    const range = (vals: (number | null)[]) => {
      const v = vals.filter((x): x is number => x !== null);
      return v.length ? { min: Math.min(...v), max: Math.max(...v), n: v.length } : null;
    };
    const my = range(peers.filter((p) => p.myCostMode === "MANUAL").map((p) => num(p.myCost)));
    const cu = range(peers.filter((p) => p.customerChargeMode === "MANUAL").map((p) => num(p.customerCharge)));
    const outside = (v: number | null, rg: { min: number; max: number } | null) =>
      v !== null && rg !== null && (v < rg.min * 0.75 || v > rg.max * 1.25) && !(rg.max === 0 && v === 0);
    return {
      code: r.code,
      name: r.name,
      my: r.myCostMode === "MANUAL" ? r.myCost : null,
      cu: r.customerChargeMode === "MANUAL" ? r.customerCharge : null,
      myRange: my,
      cuRange: cu,
      flag: outside(r.myCostMode === "MANUAL" ? r.myCost : null, my) || outside(r.customerChargeMode === "MANUAL" ? r.customerCharge : null, cu),
    };
  });
  const comparable = compare.some((c) => c.myRange || c.cuRange);

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
      <PageHeader side="internal" title="Cost Inputs" actions={<ExportButtons scope="cost-inputs" projectId={projectId} />} />
      <IssuesBanner issues={result.issues.filter((i) => i.fixAt === "cost-inputs")} projectId={projectId} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total internal cost (My Cost)" value={money(s.totalInternalCost)} tone="internal" emphasis />
        <StatTile label="Total customer quote" value={money(s.totalQuote)} tone="customer" emphasis />
        <StatTile label="Gross margin" value={money(s.grossMargin)} hint={s.grossMarginPct !== null ? `${(s.grossMarginPct * 100).toFixed(2)}% of quote` : undefined} tone={s.grossMargin < 0 ? "warn" : "neutral"} />
        <StatTile label="Customer rate per sqft" value={rate(s.customerPerSqft)} hint={`My Cost ${rate(s.myCostPerSqft)}/sqft`} />
      </div>

      <Section title="Rates">
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

        </Section>
      </div>

      {comparable && (
        <Section title="Compared with other projects" bodyClassName="p-0 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="th">Cost item</th>
                <th className="th num">My Cost</th>
                <th className="th num">Other projects</th>
                <th className="th num">Customer</th>
                <th className="th num">Other projects</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {compare.map((c) => (
                <tr key={c.code} className={c.flag ? "bg-warn-bg/50" : ""}>
                  <td className="td">{c.name}</td>
                  <td className="td num">{c.my === null ? "—" : rate(c.my)}</td>
                  <td className="td num text-ink-2">{c.myRange ? `${rate(c.myRange.min)} – ${rate(c.myRange.max)}` : "—"}</td>
                  <td className="td num">{c.cu === null ? "—" : rate(c.cu)}</td>
                  <td className="td num text-ink-2">{c.cuRange ? `${rate(c.cuRange.min)} – ${rate(c.cuRange.max)}` : "—"}</td>
                  <td className="td text-xs font-semibold text-warn-fg">{c.flag ? "Outside the usual range — verify" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <Section title="Change history" bodyClassName="p-0">
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

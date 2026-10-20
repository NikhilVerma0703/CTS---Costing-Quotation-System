import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { dec2, dec4, dim, money, pct, rate } from "@/lib/engine/format";
import { num } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { Formula } from "@/components/ui/Formula";
import { AddDriverButton, AdjustmentsEditor, DriverActions, SlabBaseForm } from "@/components/slab/SlabInputs";

export const metadata: Metadata = { title: "Slab Calculation" };

export default async function SlabCalculationPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, slabInput, { input, result }] = await Promise.all([
    getProject(projectId),
    prisma.slabInput.findUnique({
      where: { projectId },
      include: {
        adjustments: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        drivers: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
    getProjectCalculation(projectId),
  ]);
  const s = result.slab;
  const cur = project.currency;
  const spec = input.slabSpec;

  const rows: [string, React.ReactNode, React.ReactNode][] = s
    ? [
        ["Slabs per optimizer run", <b key="a">{s.optimizerSlabs}</b>, "input"],
        ["Adjustments", s.adjustmentTotal > 0 ? `+${s.adjustmentTotal}` : s.adjustmentTotal, "Σ adjustments below"],
        ["Total slabs", <b key="b">{s.totalSlabs}</b>, <Formula key="f">optimizer + adjustments</Formula>],
        ["Slab size", spec ? `${dim(spec.width)} × ${dim(spec.depth)} ${spec.unit.toLowerCase()} = ${dec4(s.slabAreaSqft)} sqft` : "—", "Cost Inputs → slab specification"],
        ["Total slab area purchased (sqft)", dec2(s.purchasedSqft), <Formula key="f">total slabs × slab sqft</Formula>],
        ["Used area (sqft) = Drawing Summary piece sqft", dec2(s.usedSqft), <Formula key="f">Σ Total Sqft</Formula>],
        ["Wasted area (sqft)", dec2(s.wasteSqft), <Formula key="f">purchased − used</Formula>],
        ["Utilization", pct(s.utilization), <Formula key="f">used ÷ purchased</Formula>],
        [
          `Slab-basis material cost @ ${rate(s.materialRateMyCost, cur)}/sqft (My Cost)`,
          <b key="c" className="text-internal">{money(s.materialCost, cur)}</b>,
          <Formula key="f">purchased sqft × My Cost material rate</Formula>,
        ],
        [
          `Slab-basis material charge @ ${rate(s.materialRateCustomer, cur)}/sqft (customer)`,
          <b key="d" className="text-customer">{money(s.materialCharge, cur)}</b>,
          <Formula key="f">purchased sqft × customer material rate</Formula>,
        ],
      ]
    : [];

  return (
    <>
      <PageHeader
        side="internal"
        title="Slab Calculation"
        description="Slab quantity comes from the nesting optimizer (e.g. CutList Optimizer) — it is entered here, not calculated. The system works out purchased area, waste, utilization and slab-basis material."
      />
      <IssuesBanner issues={result.issues.filter((i) => i.fixAt === "slab-calculation" || i.code === "NO_SLAB_SPEC")} projectId={projectId} />

      {s && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Total slabs" value={s.totalSlabs} hint={`${s.optimizerSlabs} optimizer ${s.adjustmentTotal >= 0 ? "+" : "−"} ${Math.abs(s.adjustmentTotal)} adj.`} emphasis />
          <StatTile label="Utilization" value={pct(s.utilization)} hint={`${dec2(s.wasteSqft)} sqft waste`} tone={s.utilization !== null && s.utilization < 0.7 ? "warn" : "neutral"} />
          <StatTile label="Slab-basis material (My Cost)" value={money(s.materialCost, cur)} tone="internal" />
          <StatTile label="Slab-basis material (customer)" value={money(s.materialCharge, cur)} tone="customer" />
        </div>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Section title={spec ? `Slabs — ${spec.materialBasis ?? "all pieces"}` : "Slabs"} bodyClassName="p-0 overflow-x-auto">
          {s ? (
            <table className="w-full text-[13.5px]">
              <tbody>
                {rows.map(([label, value, how]) => (
                  <tr key={label}>
                    <td className="td">{label}</td>
                    <td className="td num">{value}</td>
                    <td className="td text-xs text-ink-3">{how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-4 text-sm text-ink-3">Enter the optimizer slab count to calculate.</p>
          )}
        </Section>

        <div>
          <Section title="Optimizer result" description="Re-run the optimizer after any quantity change and enter the new count here.">
            <SlabBaseForm
              projectId={projectId}
              initial={{
                optimizerSlabs: slabInput?.optimizerSlabs ?? "",
                sourceNote: slabInput?.sourceNote ?? "",
                kerfIn: num(slabInput?.kerfIn) ?? "",
              }}
            />
          </Section>
          <Section title="Adjustments" description="± slabs on top of the optimizer count, each with its reason (e.g. a quantity change made after the last optimizer run).">
            <AdjustmentsEditor projectId={projectId} rows={(slabInput?.adjustments ?? []).map((a) => ({ id: a.id, slabs: a.slabs, reason: a.reason }))} />
          </Section>
        </div>
      </div>

      <Section title="Slab drivers" description="Which pieces drive the slab count — analysis rows from the optimizer report." bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="th">Driver pieces</th>
                <th className="th num">Pieces</th>
                <th className="th num">Pieces / slab</th>
                <th className="th num">Dedicated slabs</th>
                <th className="th num">Share of total slabs</th>
                <th className="th num">Waste / slab (sq in)</th>
                <th className="th num">Waste on these slabs (sqft)</th>
                <th className="th num">Share of total waste</th>
                <th className="th">Note</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {(s?.drivers ?? []).map((d, i) => {
                const row = slabInput!.drivers[i];
                return (
                  <tr key={row.id} className="align-top">
                    <td className="td font-semibold">{d.label}</td>
                    <td className="td num">{d.pieces}</td>
                    <td className="td num">{dim(d.piecesPerSlab)}</td>
                    <td className="td num">{d.dedicatedSlabs}</td>
                    <td className="td num">{pct(d.shareOfSlabs)}</td>
                    <td className="td num">{d.wastePerSlabSqIn.toLocaleString("en-US")}</td>
                    <td className="td num" title="dedicated slabs × waste sq in ÷ 144">
                      {dec2(d.wasteSqft)}
                    </td>
                    <td className="td num">{pct(d.shareOfWaste)}</td>
                    <td className="td max-w-72 text-xs text-ink-2">{d.note}</td>
                    <td className="td">
                      <DriverActions
                        projectId={projectId}
                        row={{
                          id: row.id,
                          label: row.label,
                          pieces: row.pieces,
                          piecesPerSlab: num(row.piecesPerSlab)!,
                          dedicatedSlabs: row.dedicatedSlabs,
                          wastePerSlabSqIn: num(row.wastePerSlabSqIn)!,
                          note: row.note ?? "",
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line p-3">
          <AddDriverButton projectId={projectId} />
        </div>
      </Section>
    </>
  );
}

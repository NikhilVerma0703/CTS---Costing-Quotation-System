import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { AREA_SYMBOL, UNIT_SYMBOL, type EdgeRule } from "@/lib/engine/types";
import { dec2, dec4, dim, money, rate } from "@/lib/engine/format";
import { num } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { Formula } from "@/components/ui/Formula";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { RulesTable, type RuleRow } from "@/components/conversion/RulesTable";
import { EdgeRuleSelect } from "@/components/conversion/EdgeRuleSelect";

export const metadata: Metadata = { title: "Unit Conversion" };

const g = (n: number) => String(+n.toPrecision(10));

function edgeExpr(rule: EdgeRule, L: number, W: number, divisor: number, multiplier: number) {
  const m = multiplier !== 1 ? ` × ${g(multiplier)}` : "";
  if (rule === "NONE") return "0";
  const inner = `${dim(L)} + ${dim(W)}`;
  return rule === "FULL_PERIMETER" ? `2 × (${inner})${m} ÷ ${g(divisor)}` : `(${inner})${m} ÷ ${g(divisor)}`;
}

export default async function UnitConversionPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [rules, { input, result }] = await Promise.all([
    prisma.unitConversionRule.findMany({ orderBy: [{ measurementType: "desc" }, { isSystem: "desc" }, { fromUnit: "asc" }] }),
    getProjectCalculation(projectId),
  ]);

  const usedUnits = new Set(result.conversions.flatMap((c) => [`L:${c.length.fromUnit}`, `A:${c.area.fromUnit}`]));
  const unitsInUse = [...new Set(input.pieces.map((p) => p.dimUnit))];
  const rows: RuleRow[] = rules.map((r) => {
    const key = `${r.measurementType === "LENGTH" ? "L" : "A"}:${r.fromUnit}`;
    const used = usedUnits.has(key);
    return {
      id: r.id,
      measurementType: r.measurementType,
      fromUnit: r.fromUnit,
      toUnit: r.toUnit,
      multiplier: num(r.multiplier)!,
      divisor: num(r.divisor)!,
      description: r.description ?? "",
      isActive: r.isActive,
      isSystem: r.isSystem,
      usedBy: used
        ? r.measurementType === "LENGTH"
          ? "Cutting LF, DE&P LF"
          : r.fromUnit === "sq in"
            ? "Sqft/Pc, slab area, slab waste"
            : "Sqft/Pc"
        : null,
    };
  });

  const conv = result.conversions;
  const inch = conv.find((c) => c.unit === "IN");
  const slab = input.slabSpec;
  const slabConv = slab ? conv.find((c) => c.unit === slab.unit) : undefined;

  return (
    <>
      <PageHeader
        title="Unit Conversion"
        description="Drawing dimensions arrive in inches (or mm / cm). Costing is per linear foot and per square foot, so every measurement is converted here, using the rules below. Changing a rule recalculates every project."
      />
      <IssuesBanner issues={result.issues.filter((i) => i.fixAt === "unit-conversion")} projectId={projectId} />

      <Section title="Conversion rules" description="value in target unit = value × multiplier ÷ divisor. Kept as ÷12 and ÷144 so results match the workbook exactly.">
        <RulesTable rules={rows} />
        <p className="mt-2 text-xs text-ink-3">
          Units used by this project&apos;s drawings: {unitsInUse.length ? unitsInUse.map((u) => UNIT_SYMBOL[u]).join(", ") : "none yet"}.
          System rules can be corrected or disabled, but their units are fixed because the calculation looks them up by unit.
        </p>
      </Section>

      <Section title="Measurement formulas" description="How each calculated drawing column is produced (reference: Drawing Summary P–T, Variables B7 / B26 / B28).">
        <div className="grid gap-3 text-sm md:grid-cols-2">
          {[
            ["Cutting LF", "Cutting rule edge length × in→ft", "default 2 × (L + W) ÷ 12 — full perimeter on every piece"],
            ["DE&P LF", "DE&P rule edge length × in→ft", "Island Top: 2 × (L + W) ÷ 12 · other pieces: (L + W) ÷ 12"],
            ["Sqft/Pc", "L × W × sq in→sqft", "L × W ÷ 144"],
            ["Total Pcs", "Units Qty", "= Units Qty"],
            ["Total Sqft", "Sqft/Pc × Total Pcs", ""],
            ["Slab area (sqft)", "Slab width × depth × sq in→sqft", slab && slabConv ? `${dim(slab.width)} × ${dim(slab.depth)} ÷ ${g(slabConv.area.divisor)} = ${dec4(result.slab?.slabAreaSqft)}` : "slab size not set"],
            [
              "Packing (USD)",
              "Container cost (Rs) × containers ÷ Rs per USD",
              input.packing
                ? `${input.packing.containerCostLocal.toLocaleString("en-IN")} × ${input.packing.containerCount} ÷ ${input.packing.exchangeRate} = ${money(result.packing?.totalQuoteCurrency)}`
                : "packing not set",
            ],
            [
              "Packing per sqft",
              "Packing USD ÷ total project sqft",
              result.packing ? `${money(result.packing.totalQuoteCurrency)} ÷ ${dec2(result.drawingTotals.totalSqft)} = ${rate(result.packing.perSqft)}` : "",
            ],
          ].map(([name, formula, example]) => (
            <div key={name} className="rounded-lg border border-line px-3 py-2">
              <p className="font-semibold">{name}</p>
              <p className="mt-1">
                <Formula>{formula}</Formula>
              </p>
              {example && <p className="mt-1 font-mono text-xs text-ink-2">{example}</p>}
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Applied conversions — per piece"
        description="The actual values every costing page uses. The edge rules can be switched here (e.g. if 1A / 5A / 8A are confirmed as freestanding islands, set their DE&P to 2 × (L + W))."
        bodyClassName="p-0"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="th">Dwg#</th>
                <th className="th">Piece</th>
                <th className="th">Description</th>
                <th className="th num">L</th>
                <th className="th num">W</th>
                <th className="th">Unit</th>
                <th className="th">Cutting rule</th>
                <th className="th">Cutting LF</th>
                <th className="th">DE&amp;P rule</th>
                <th className="th">DE&amp;P LF</th>
                <th className="th">Sqft/Pc</th>
                <th className="th num">Qty</th>
                <th className="th num">Total Sqft</th>
              </tr>
            </thead>
            <tbody>
              {result.measurements.map((m) => {
                const p = m.piece;
                const c = conv.find((x) => x.unit === p.dimUnit)!;
                return (
                  <tr key={p.id} className="hover:bg-shell">
                    <td className="td">{p.dwgNo}</td>
                    <td className="td">{p.pieceNo}</td>
                    <td className="td min-w-36">{p.description}</td>
                    <td className="td num">{dim(p.length)}</td>
                    <td className="td num">{dim(p.width)}</td>
                    <td className="td">{UNIT_SYMBOL[p.dimUnit]}</td>
                    <td className="td">
                      <EdgeRuleSelect projectId={projectId} pieceId={p.id} cuttingRule={p.cuttingRule} depRule={p.depRule} which="cutting" />
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className="font-mono text-[11.5px] text-ink-3">{edgeExpr(p.cuttingRule, p.length, p.width, c.length.divisor, c.length.multiplier)} = </span>
                      <span className="font-semibold tabular-nums">{dec4(m.cuttingLf)}</span>
                    </td>
                    <td className="td">
                      <EdgeRuleSelect projectId={projectId} pieceId={p.id} cuttingRule={p.cuttingRule} depRule={p.depRule} which="dep" />
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className="font-mono text-[11.5px] text-ink-3">{edgeExpr(p.depRule, p.length, p.width, c.length.divisor, c.length.multiplier)} = </span>
                      <span className="font-semibold tabular-nums">{dec4(m.depLf)}</span>
                    </td>
                    <td className="td whitespace-nowrap">
                      <span className="font-mono text-[11.5px] text-ink-3">
                        {dim(p.length)} × {dim(p.width)} ÷ {g(c.area.divisor)} =
                      </span>{" "}
                      <span className="font-semibold tabular-nums">{dec4(m.sqftPerPc)}</span>
                    </td>
                    <td className="td num">{p.unitsQty}</td>
                    <td className="td num font-semibold">{dec2(m.totalSqft)}</td>
                  </tr>
                );
              })}
              {result.measurements.length === 0 && (
                <tr>
                  <td className="td py-8 text-center text-ink-3" colSpan={13}>
                    No drawing pieces yet.
                  </td>
                </tr>
              )}
            </tbody>
            {result.measurements.length > 0 && (
              <tfoot>
                <tr className="bg-mute-bg font-bold">
                  <td className="td" colSpan={7}>
                    TOTAL (× Units Qty)
                  </td>
                  <td className="td num">{dec2(result.drawingTotals.cuttingLf)} LF</td>
                  <td className="td" />
                  <td className="td num">{dec2(result.drawingTotals.depLf)} LF</td>
                  <td className="td" />
                  <td className="td num">{result.drawingTotals.totalPcs.toLocaleString("en-US")}</td>
                  <td className="td num">{dec2(result.drawingTotals.totalSqft)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        {inch && (
          <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
            {AREA_SYMBOL.IN} → sqft and in → ft rules in use: ÷ {g(inch.area.divisor)} and ÷ {g(inch.length.divisor)}.
          </p>
        )}
      </Section>
    </>
  );
}

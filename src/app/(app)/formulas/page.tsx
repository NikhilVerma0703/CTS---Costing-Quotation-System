import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getStandardFormulas } from "@/lib/formulas";
import { num } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { Formula } from "@/components/ui/Formula";
import { RulesTable, type RuleRow } from "@/components/conversion/RulesTable";
import { EdgeFormulaEdit } from "@/components/formulas/EdgeFormulaEdit";
import { EDGE_FORMULA_CODES } from "@/lib/reference/standard-formulas";

export const metadata: Metadata = { title: "Formulas & Units" };
export const dynamic = "force-dynamic";

const CATEGORY_LABEL = { MEASUREMENT: "Measurements", COSTING: "Costing", SLAB: "Slab", SUMMARY: "Project summary" } as const;
const USED_BY: Record<string, string> = { LENGTH: "Cutting LF, DE&P LF", AREA: "Sqft/Pc, slab area" };

export default async function FormulasPage() {
  const [formulas, rules] = await Promise.all([
    getStandardFormulas(),
    prisma.unitConversionRule.findMany({ orderBy: [{ measurementType: "desc" }, { isSystem: "desc" }, { fromUnit: "asc" }] }),
  ]);
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";
  const ruleRows: RuleRow[] = rules.map((r) => ({
    id: r.id,
    measurementType: r.measurementType,
    fromUnit: r.fromUnit,
    toUnit: r.toUnit,
    multiplier: num(r.multiplier)!,
    divisor: num(r.divisor)!,
    description: r.description ?? "",
    isActive: r.isActive,
    isSystem: r.isSystem,
    usedBy: r.isActive ? USED_BY[r.measurementType] : null,
  }));
  const categories = [...new Set(formulas.map((f) => f.category))];

  return (
    <>
      <PageHeader title="Formulas & Units" />

      <Section title="Standard formulas" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="th">Formula</th>
              <th className="th">Expression</th>
              <th className="th">Source</th>
              <th className="th num">Version</th>
              <th className="th">Last change</th>
              <th className="th" />
            </tr>
          </thead>
          {categories.map((cat) => (
            <tbody key={cat}>
              <tr>
                <td className="td bg-shell pt-3 text-[11px] font-bold tracking-wide text-ink-2 uppercase" colSpan={6}>
                  {CATEGORY_LABEL[cat]}
                </td>
              </tr>
              {formulas
                .filter((f) => f.category === cat)
                .map((f) => {
                  const editable = (EDGE_FORMULA_CODES as readonly string[]).includes(f.code) && f.edgeRule;
                  return (
                    <tr key={f.code}>
                      <td className="td font-semibold whitespace-nowrap">{f.name}</td>
                      <td className="td">
                        <Formula>{f.expression}</Formula>
                      </td>
                      <td className="td text-xs text-ink-2">{f.description}</td>
                      <td className="td num">v{f.version}</td>
                      <td className="td text-xs text-ink-2">
                        {f.version > 1 ? (
                          <>
                            {f.updatedAt.toLocaleDateString("en-IN", { timeZone: tz })} · {f.updatedBy}
                            {f.changeReason && <span className="block text-ink-3">{f.changeReason}</span>}
                          </>
                        ) : (
                          <span className="text-ink-3">Standard</span>
                        )}
                      </td>
                      <td className="td text-right">
                        {editable ? <EdgeFormulaEdit code={f.code as (typeof EDGE_FORMULA_CODES)[number]} name={f.name} edgeRule={f.edgeRule!} /> : <span className="text-xs text-ink-3">Locked</span>}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          ))}
        </table>
      </Section>

      <Section title="Unit conversion rules">
        <RulesTable rules={ruleRows} />
      </Section>
    </>
  );
}

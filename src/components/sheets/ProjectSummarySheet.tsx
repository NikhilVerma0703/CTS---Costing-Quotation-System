"use client";

import type { SheetProps } from "@/components/sheets/shared";
import { int, money, num, pct } from "@/lib/format";
import type { ProjectMeta } from "@/lib/model";
import { defaultTerms } from "@/lib/quote-details";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card overflow-hidden">
      <h3 className="section-title">{title}</h3>
      <table className="kv">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "internal" | "customer" }) {
  const color = tone === "internal" ? "text-internal" : tone === "customer" ? "text-customer" : "";
  return (
    <tr className={strong ? "strong" : undefined}>
      <td>{label}</td>
      <td className={`value ${color}`} style={{ width: 130 }} data-summary={label}>
        {value}
      </td>
    </tr>
  );
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

export function ProjectSummarySheet({ data, result, update }: SheetProps) {
  const s = result.summary;
  const t = result.slabTotals;
  const isSlab = data.variables.pricing === "slab";
  const meta = data.meta;
  const setMeta = (key: keyof ProjectMeta, value: string) => update((d) => void ((d.meta[key] as string) = value));
  const autoTerms = defaultTerms(data, result);
  const shownTerms = meta.terms.length ? meta.terms : autoTerms;
  const commitTerms = (box: HTMLTextAreaElement) => {
    const typed = lines(box.value);
    // An empty box means "the worked-out terms", which is what it already holds on a project with none of its own.
    if (typed.length === 0 && meta.terms.length === 0) {
      box.value = autoTerms.join("\n");
      return;
    }
    if (typed.join("\n") !== shownTerms.join("\n")) update((d) => void (d.meta.terms = typed.join("\n") === autoTerms.join("\n") ? [] : typed));
  };

  return (
    <div>
      <div className="grid items-start gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Block title="Scope">
            <Line label="Pieces (Drawing Summary)" value={int(result.drawing.pcs)} />
            <Line label="Piece sqft" value={num(result.drawing.sqft)} />
            <Line label={s.slabsEstimated ? "Slabs required (estimate)" : "Slabs required"} value={int(t.totalSlabs)} />
            <Line label="Sink cutouts" value={int(result.drawing.sinkCuts)} />
            <Line label="Total unit types" value={int(s.unitTypes)} />
            {s.totalUnits !== null && <Line label="Total units (all types)" value={int(s.totalUnits)} />}
            <Line label="Total pieces (non-vanity areas)" value={int(s.nonVanityPcs)} />
            <Line label="Total pieces (vanity areas)" value={int(s.vanityPcs)} />
            <Line label="Total slab sqft" value={num(t.purchased)} />
            <Line label="Total wastage sqft" value={num(t.wasted)} />
            <Line label="Overall wastage %" value={pct(t.wastagePct)} />
          </Block>
          <Block title="Material cost split">
            <tr>
              <th>{isSlab ? "Slabs purchased" : "Piece sqft + wastage"}</th>
              <th className="right">My Cost</th>
              <th className="right">Customer</th>
            </tr>
            {result.materialSplit.map((m) => (
              <tr key={m.rate.id}>
                <td>{isSlab ? `${m.rate.label} - ${int(m.totalSlabs)} slabs @ ${money(result.rates[m.rate.id].my)}/sqft` : `${m.rate.label} - ${num(m.sqft)} sqft @ ${money(result.rates[m.rate.id].my)}/sqft + ${pct(m.markup)} wastage`}</td>
                <td className="value text-internal" style={{ width: 110 }} data-split="internal">
                  {money(m.internal)}
                </td>
                <td className="value text-customer" style={{ width: 110 }} data-split="customer">
                  {money(m.customer)}
                </td>
              </tr>
            ))}
          </Block>
        </div>

        <div className="space-y-4">
          <Block title={isSlab ? "Cost build-up (piece-basis fabrication + slab-basis material)" : "Cost build-up (fabrication + piece-basis material with wastage)"}>
            <Line label="Fabrication cost (Cutting+DE&P+Sink+Faucet+R-Corner+Joint+Packing) - My Cost" value={money(result.internal.fabrication)} tone="internal" />
            <Line label={isSlab ? "Slab-basis Material Cost" : "Material Cost (piece sqft + wastage)"} value={money(s.internalMaterial)} tone="internal" />
            <Line label="TOTAL INTERNAL COST (My Cost)" value={money(s.totalInternal)} strong tone="internal" />
            <Line label="Fabrication cost (Customer side)" value={money(result.customer.fabrication)} tone="customer" />
            <Line label={isSlab ? "Material charge to customer (slab-basis)" : "Material charge to customer (piece sqft + wastage)"} value={money(s.customerMaterial)} tone="customer" />
            <Line label="TOTAL CUSTOMER QUOTE" value={money(s.totalCustomer)} strong tone="customer" />
          </Block>
          <Block title="Margin">
            <Line label="Gross Margin $" value={money(s.margin)} />
            <Line label="Gross Margin %" value={pct(s.marginPct, 2)} />
            <Line label="Customer price per slab" value={money(s.pricePerSlab)} />
          </Block>
          <Block title="Final rate per sqft (on piece sqft)">
            <Line label="My Cost $/sqft" value={money(s.myCostPerSqft)} tone="internal" />
            <Line label="Customer $/sqft" value={money(s.customerPerSqft)} tone="customer" />
          </Block>
        </div>

        <section className="lg:col-span-2">
          <label className="label" htmlFor="project-notes">
            Notes / assumptions (one per line)
          </label>
          <textarea id="project-notes" rows={Math.min(14, Math.max(4, data.notes.length + 1))} className="input text-[13px]" defaultValue={data.notes.join("\n")} key={data.notes.join("\n")} onBlur={(e) => update((d) => void (d.notes = lines(e.target.value)))} />
        </section>

        <section className="card p-4 lg:col-span-2">
          <h3 className="mb-3 text-[13px] font-semibold">Customer PDF details</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["customerName", "Customer"],
                ["contactName", "Contact"],
                ["contactEmail", "Email"],
                ["siteAddress", "Site"],
                ["quoteTitle", "Project title"],
                ["code", "Reference"],
                ["version", "Version"],
                ["quoteNumber", "Quotation no."],
                ["remarks", "Remarks"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="label" htmlFor={`meta-${key}`}>
                  {label}
                </label>
                <input id={`meta-${key}`} className="input" defaultValue={meta[key]} key={meta[key]} onBlur={(e) => e.target.value !== meta[key] && setMeta(key, e.target.value)} />
              </div>
            ))}
            <div>
              <label className="label" htmlFor="meta-validity">
                Valid for (days)
              </label>
              <input id="meta-validity" className="input" inputMode="numeric" defaultValue={meta.validityDays} key={meta.validityDays} onBlur={(e) => update((d) => void (d.meta.validityDays = Number(e.target.value) || 30))} />
            </div>
          </div>
          <label className="label mt-3" htmlFor="meta-terms">
            Terms &amp; notes (one per line)
          </label>
          <textarea id="meta-terms" rows={Math.max(3, shownTerms.length + 1)} className="input text-[13px]" defaultValue={shownTerms.join("\n")} key={shownTerms.join("\n")} onBlur={(e) => commitTerms(e.target)} />
        </section>
      </div>
    </div>
  );
}

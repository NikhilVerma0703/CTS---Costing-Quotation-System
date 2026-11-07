"use client";

import { Plus, Trash2 } from "lucide-react";
import { NumCell } from "@/components/cells";
import { Toolbar, type SheetProps } from "@/components/sheets/shared";
import type { SlabGroup } from "@/lib/engine";
import { int, money, num, pct } from "@/lib/format";
import { newId, type RateRow, type SlabDriver } from "@/lib/model";

export function SlabSheet({ data, result, update }: SheetProps) {
  const v = data.variables;
  const groups = result.slabs;
  const t = result.slabTotals;
  const showTotal = groups.length > 1;
  const editRate = (id: string, change: (r: RateRow) => void) =>
    update((d) => {
      const r = d.variables.rates.find((x) => x.id === id);
      if (r) change(r);
    });
  const editDriver = (id: string, change: (x: SlabDriver) => void) =>
    update((d) => {
      const x = d.variables.drivers.find((y) => y.id === id);
      if (x) change(x);
    });

  const row = (label: string, cell: (g: SlabGroup) => React.ReactNode, total?: React.ReactNode, strong = false, editable = false) => (
    <tr className={strong ? "strong" : undefined} data-slab-row={label}>
      <td>{label}</td>
      {groups.map((g) => (
        <td key={g.rate.id} className={editable ? "has-input" : "value"}>
          {cell(g)}
        </td>
      ))}
      {showTotal && <td className="value font-semibold">{total}</td>}
    </tr>
  );

  return (
    <div>
      <Toolbar>
        <span className="text-[13px] font-medium text-ink-2">Material priced on</span>
        <div role="radiogroup" aria-label="Material priced on" className="inline-flex overflow-hidden rounded-lg border border-line-2 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
          {(
            [
              ["slab", "Slabs purchased"],
              ["piece", "Piece sqft + wastage %"],
            ] as const
          ).map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={v.pricing === value} className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${v.pricing === value ? "bg-brand text-white" : "bg-white text-ink-2 hover:bg-mute-bg"}`} onClick={() => update((d) => void (d.variables.pricing = value))}>
              {label}
            </button>
          ))}
        </div>
      </Toolbar>

      <div className="space-y-4 p-4">
        <section className="card w-fit max-w-full overflow-x-auto">
          <table className="kv w-auto">
            <thead>
              <tr>
                <th style={{ minWidth: 360 }} />
                {groups.map((g) => (
                  <th key={g.rate.id} className="right" style={{ minWidth: 170 }}>
                    {g.rate.label}
                  </th>
                ))}
                {showTotal && (
                  <th className="right" style={{ minWidth: 130 }}>
                    TOTAL
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {row(
                "Slabs from CutList Optimizer",
                (g) => (
                  <NumCell value={g.estimated ? null : g.slabs} label={`Slabs, ${g.rate.label}`} format={int} placeholder={`${int(g.slabs)} (estimate)`} className={g.estimated ? "cell-confirm" : ""} onCommit={(n) => editRate(g.rate.id, (r) => void (r.slabs = n))} />
                ),
                int(t.slabs),
                false,
                true,
              )}
              {row("Adjustment (+/-)", (g) => <NumCell value={g.adjustment} label={`Adjustment, ${g.rate.label}`} onCommit={(n) => editRate(g.rate.id, (r) => void (r.slabAdjust = n ?? 0))} />, int(t.adjustment), false, true)}
              {row("Total slabs", (g) => int(g.totalSlabs), int(t.totalSlabs))}
              {row("Slab area each (sqft)", () => num(result.slabArea))}
              {row("Total slab area purchased (sqft)", (g) => num(g.purchased), num(t.purchased))}
              {row(
                "Used area (sqft)",
                (g) =>
                  g.usedSource === "percent" ? (
                    <div className="px-3 text-right">{num(g.used)}</div>
                  ) : (
                    <NumCell value={g.usedSource === "typed" ? g.used : null} label={`Used area, ${g.rate.label}`} format={(n) => num(n)} placeholder={num(g.used)} onCommit={(n) => editRate(g.rate.id, (r) => void (r.usedSqft = n))} />
                  ),
                num(t.used),
                false,
                true,
              )}
              {row("Used area % (from CutList)", (g) => <NumCell value={g.rate.usedPct ?? null} percent format={(n) => pct(n)} placeholder={pct(g.utilization)} label={`Used percent, ${g.rate.label}`} onCommit={(n) => editRate(g.rate.id, (r) => void (r.usedPct = n))} />, pct(t.utilization), false, true)}
              {row("Wasted area (sqft)", (g) => num(g.wasted), num(t.wasted))}
              {row("Wastage %", (g) => pct(g.wastagePct), pct(t.wastagePct))}
              {v.pricing === "piece" && row(`Wastage markup % (wastage + ${pct(v.wastageExtra, 0)})`, (g) => pct(g.markup))}
              {row(`Slab-basis material cost (My Cost)${v.pricing === "piece" ? ", for reference" : ""}`, (g) => money(g.materialCost), money(t.materialCost), v.pricing === "slab")}
              {row(`Slab-basis material charge (Customer, at My Cost)${v.pricing === "piece" ? ", for reference" : ""}`, (g) => money(g.materialCharge), money(t.materialCharge), v.pricing === "slab")}
            </tbody>
          </table>
        </section>

        <section className="card max-w-[532px] overflow-hidden">
          <table className="kv">
            <tbody>
              <tr>
                <td>Extra wastage %</td>
                <td className="has-input" style={{ width: 110 }}>
                  <NumCell value={v.wastageExtra} percent format={(n) => pct(n)} label="Extra wastage percent" onCommit={(n) => update((d) => void (d.variables.wastageExtra = n ?? 0))} />
                </td>
              </tr>
              <tr>
                <td>Estimate utilization %</td>
                <td className="has-input">
                  <NumCell value={v.estimateUtilization} percent format={(n) => pct(n)} label="Estimate utilization" onCommit={(n) => update((d) => void (d.variables.estimateUtilization = n ?? 0.85))} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {result.drivers.map((dr) => (
          <section key={dr.id} className="card max-w-[532px] overflow-hidden" aria-label={`Slab driver ${dr.label}`}>
            <div className="section-title flex items-center gap-2">
              <span className="shrink-0">Slab driver</span>
              <input aria-label="Driver name" className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-0.5 text-[13px] font-medium text-ink-2 transition-colors hover:border-line-2 focus:border-brand-2 focus:outline-none" defaultValue={dr.label} key={dr.label} onBlur={(e) => e.target.value !== dr.label && editDriver(dr.id, (x) => void (x.label = e.target.value))} />
              <button type="button" aria-label="Remove this analysis" title="Remove this analysis" className="rounded p-0.5 text-ink-3 hover:bg-bad-bg hover:text-bad-fg" onClick={() => update((d) => void (d.variables.drivers = d.variables.drivers.filter((x) => x.id !== dr.id)))}>
                <Trash2 className="size-3.5" />
              </button>
            </div>
            <table className="kv">
              <tbody>
                {(
                  [
                    ["Pieces", "pieces"],
                    ["Pieces per slab", "piecesPerSlab"],
                    ["Dedicated slabs", "dedicatedSlabs"],
                    ["Waste per slab (sq in)", "wastePerSlabSqIn"],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td className="has-input" style={{ width: 110 }}>
                      <NumCell value={dr[key]} label={label} onCommit={(n) => editDriver(dr.id, (x) => void (x[key] = n ?? 0))} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Share of total slabs</td>
                  <td className="value">{pct(dr.shareOfSlabs)}</td>
                </tr>
                <tr>
                  <td>Waste on these slabs (sqft)</td>
                  <td className="value">{num(dr.wasteSqft)}</td>
                </tr>
                <tr>
                  <td>Share of total waste</td>
                  <td className="value">{pct(dr.shareOfWaste)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        ))}
        <button type="button" className="btn-ghost" onClick={() => update((d) => void d.variables.drivers.push({ id: newId("d"), label: "Repeated piece", pieces: 0, piecesPerSlab: 0, dedicatedSlabs: 0, wastePerSlabSqIn: 0, note: "" }))}>
          <Plus className="size-4" />
          Slab driver analysis
        </button>

        <section className="max-w-3xl">
          <label className="label" htmlFor="slab-notes">
            Slab notes
          </label>
          <textarea id="slab-notes" className="input min-h-20 text-[13px]" defaultValue={v.slabNotes} key={v.slabNotes} onBlur={(e) => e.target.value !== v.slabNotes && update((d) => void (d.variables.slabNotes = e.target.value))} />
        </section>
      </div>
    </div>
  );
}


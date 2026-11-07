"use client";

import { useState } from "react";
import { Check, Link2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { NumCell, TextCell } from "@/components/cells";
import { ReplaceSheet, Toolbar, type SheetProps } from "@/components/sheets/shared";
import { int, money, num } from "@/lib/format";
import { newId, type CostKey, type ProjectData, type RateRow } from "@/lib/model";

const NEW_ROW: Partial<Record<CostKey, { label: string; unit: string; hint: string }>> = {
  material: { label: "New Material", unit: "per sqft", hint: "Material rate" },
  dep: { label: "New DE&P", unit: "per linear ft", hint: "DE&P rate" },
  sink: { label: "Sink Cutout - model", unit: "per cutout", hint: "Sink model rate" },
};

export function VariablesSheet({ data, result, update, id, apply }: SheetProps & { id: string; apply: (next: ProjectData) => void }) {
  const v = data.variables;
  const [saved, setSaved] = useState(false);

  const editRate = (rateId: string, change: (r: RateRow) => void) =>
    update((d) => {
      const r = d.variables.rates.find((x) => x.id === rateId);
      if (r) change(r);
    });
  const addRate = (kind: CostKey) =>
    update((d) => {
      const base = NEW_ROW[kind]!;
      const row: RateRow = { id: newId("r"), kind, label: base.label, unit: base.unit, match: "", myCost: 0, customer: kind === "material" ? null : 0 };
      if (kind === "material") Object.assign(row, { slabs: null, slabAdjust: 0, usedSqft: null, usedPct: null });
      const rates = d.variables.rates;
      let at = rates.length;
      for (let i = rates.length - 1; i >= 0; i--) {
        if (rates[i].kind === kind) {
          at = i + 1;
          break;
        }
      }
      rates.splice(at, 0, row);
    });

  async function saveAsStored() {
    const res = await fetch("/api/stored-variables", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const options = (kind: CostKey) => {
    const values = data.pieces.flatMap((p) => (kind === "sink" ? [p.sinkModel] : kind === "material" ? [p.color, p.thickness] : [p.thickness]));
    return [...new Set(values.filter((x) => x && x !== "-"))];
  };
  const kindCount = (kind: CostKey) => v.rates.filter((r) => r.kind === kind).length;

  return (
    <div>
      <Toolbar>
        <ReplaceSheet id={id} kind="variables" label="Upload Variables sheet" data={data} apply={apply} />
        <button type="button" className="btn-secondary" onClick={saveAsStored}>
          {saved ? <Check className="size-4 text-ok-fg" /> : <Save className="size-4" />}
          {saved ? "Saved as stored rate card" : "Save as stored rate card"}
        </button>
      </Toolbar>

      <div className="grid items-start gap-4 p-4 xl:grid-cols-[1fr_400px]">
        <section className="card overflow-hidden">
          <h3 className="section-title">Cost inputs</h3>
          <div className="overflow-x-auto">
            <table className="kv min-w-[880px] table-fixed">
              <thead>
                <tr>
                  <th style={{ width: 210 }}>Cost Item</th>
                  <th style={{ width: 104 }}>Unit</th>
                  <th className="center" style={{ width: 128 }}>
                    Applies to
                  </th>
                  <th className="right" style={{ width: 88 }}>
                    My Cost
                  </th>
                  <th className="right" style={{ width: 118 }}>
                    Customer Charge
                  </th>
                  <th>Note</th>
                  <th style={{ width: 40 }} aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {v.rates.map((r, i) => {
                  const packing = r.kind === "packing";
                  const digits = packing ? 4 : 3;
                  const values = result.rates[r.id];
                  const several = kindCount(r.kind) > 1;
                  const confirm = r.needsConfirm ? "cell-confirm" : "";
                  return (
                    <tr key={r.id} data-rate={r.kind}>
                      <td className="has-input">
                        <TextCell value={r.label} label="Cost item" onCommit={(t) => editRate(r.id, (x) => void (x.label = t))} />
                      </td>
                      <td className="has-input">
                        <TextCell value={r.unit} label="Unit" onCommit={(t) => editRate(r.id, (x) => void (x.unit = t))} />
                      </td>
                      <td className={several ? "has-input" : "text-center text-[12px] whitespace-nowrap text-ink-3"}>
                        {several ? (
                          <>
                            <TextCell value={r.match ?? ""} label={`Applies to, ${r.label}`} align="center" list={`opts-${r.kind}`} placeholder="choose…" onCommit={(t) => editRate(r.id, (x) => void (x.match = t || null))} />
                            <datalist id={`opts-${r.kind}`}>
                              {options(r.kind).map((o) => (
                                <option key={o} value={o} />
                              ))}
                            </datalist>
                          </>
                        ) : (
                          "All pieces"
                        )}
                      </td>
                      <td className="has-input">
                        <NumCell
                          value={r.myCost}
                          min={0}
                          label={`My Cost, ${r.label}`}
                          nav={{ col: "my", row: i }}
                          className={confirm}
                          format={(n) => money(n, digits)}
                          placeholder={packing ? money(values.my, digits) : "0"}
                          onCommit={(n) =>
                            editRate(r.id, (x) => {
                              x.myCost = n ?? (packing ? null : 0);
                              delete x.needsConfirm;
                            })
                          }
                        />
                      </td>
                      <td className="has-input">
                        <NumCell
                          value={r.customer}
                          min={0}
                          label={`Customer Charge, ${r.label}`}
                          nav={{ col: "customer", row: i }}
                          className={confirm}
                          format={(n) => money(n, digits)}
                          placeholder={money(values.customer, digits)}
                          onCommit={(n) =>
                            editRate(r.id, (x) => {
                              x.customer = n;
                              delete x.needsConfirm;
                            })
                          }
                        />
                      </td>
                      <td className="has-input">
                        <TextCell value={r.note ?? ""} label={`Note, ${r.label}`} className="text-[12px] text-ink-2" onCommit={(t) => editRate(r.id, (x) => void (x.note = t || undefined))} />
                      </td>
                      <td className="text-center">
                        {r.needsConfirm ? (
                          <button type="button" title="Confirm rate" aria-label={`Confirm ${r.label}`} className="rounded p-0.5 text-ok-fg hover:bg-mute-bg" onClick={() => editRate(r.id, (x) => void delete x.needsConfirm)}>
                            <Check className="size-4" />
                          </button>
                        ) : several ? (
                          <button type="button" title="Remove this rate" aria-label={`Remove ${r.label}`} className="rounded p-0.5 text-ink-3 hover:bg-bad-bg hover:text-bad-fg" onClick={() => update((d) => void (d.variables.rates = d.variables.rates.filter((x) => x.id !== r.id)))}>
                            <Trash2 className="size-4" />
                          </button>
                        ) : (r.customer === null || packing) && (r.kind === "material" || packing) ? (
                          <Link2 className="mx-auto size-3.5 text-ink-3" aria-label={packing ? "Linked to the packing calculation" : "Customer Charge follows My Cost"} />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-1 border-t border-line p-2">
            {(Object.keys(NEW_ROW) as CostKey[]).map((kind) => (
              <button key={kind} type="button" className="btn-ghost" onClick={() => addRate(kind)}>
                <Plus className="size-4" />
                {NEW_ROW[kind]!.hint}
              </button>
            ))}
          </div>
        </section>

        <div className="space-y-4">
          <section className="card overflow-hidden">
            <h3 className="section-title">Slab specifications</h3>
            <table className="kv">
              <tbody>
                <tr>
                  <td>Slab Width ({v.slabUnit})</td>
                  <td className="has-input" style={{ width: 150 }}>
                    <NumCell value={v.slabWidth} min={0} label="Slab width" onCommit={(n) => update((d) => void (d.variables.slabWidth = n ?? 0))} />
                  </td>
                </tr>
                <tr>
                  <td>Slab Depth ({v.slabUnit})</td>
                  <td className="has-input">
                    <NumCell value={v.slabDepth} min={0} label="Slab depth" onCommit={(n) => update((d) => void (d.variables.slabDepth = n ?? 0))} />
                  </td>
                </tr>
                <tr>
                  <td>Slab Area (sqft)</td>
                  <td className="value" data-value="slab-area">
                    {num(result.slabArea, 4)}
                  </td>
                </tr>
                <tr>
                  <td>Material Basis</td>
                  <td className="has-input">
                    <TextCell value={v.materialBasis} label="Material basis" align="right" onCommit={(t) => update((d) => void (d.variables.materialBasis = t))} />
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="card overflow-hidden">
            <h3 className="section-title">Packing calculation</h3>
            <table className="kv">
              <thead>
                <tr>
                  <th>Container</th>
                  <th className="right" style={{ width: 110 }}>
                    Cost (Rs)
                  </th>
                  <th className="right" style={{ width: 70 }}>
                    Qty
                  </th>
                  <th style={{ width: 36 }} aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {v.containers.map((c) => (
                  <tr key={c.id}>
                    <td className="has-input">
                      <TextCell value={c.label} label="Container" onCommit={(t) => update((d) => void (d.variables.containers.find((x) => x.id === c.id)!.label = t))} />
                    </td>
                    <td className="has-input">
                      <NumCell value={c.cost} min={0} label={`${c.label} cost`} format={int} onCommit={(n) => update((d) => void (d.variables.containers.find((x) => x.id === c.id)!.cost = n ?? 0))} />
                    </td>
                    <td className="has-input">
                      <NumCell value={c.count} min={0} label={`${c.label} quantity`} onCommit={(n) => update((d) => void (d.variables.containers.find((x) => x.id === c.id)!.count = n ?? 0))} />
                    </td>
                    <td className="text-center">
                      {v.containers.length > 1 && (
                        <button type="button" aria-label={`Remove ${c.label}`} title="Remove" className="rounded p-0.5 text-ink-3 hover:bg-bad-bg hover:text-bad-fg" onClick={() => update((d) => void (d.variables.containers = d.variables.containers.filter((x) => x.id !== c.id)))}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="border-y border-line px-2 py-1">
              <button type="button" className="btn-ghost" onClick={() => update((d) => void d.variables.containers.push({ id: newId("c"), label: "20ft", cost: 0, count: 1 }))}>
                <Plus className="size-4" />
                Container
              </button>
            </div>
            <table className="kv">
              <tbody>
                <tr>
                  <td>Total Packing (Rs)</td>
                  <td className="value" style={{ width: 150 }}>
                    {int(result.packing.totalLocal)}
                  </td>
                </tr>
                <tr>
                  <td>Exchange Rate (Rs per USD)</td>
                  <td className="has-input">
                    <NumCell value={v.exchangeRate} min={0} label="Exchange rate" onCommit={(n) => update((d) => void (d.variables.exchangeRate = n ?? 0))} />
                  </td>
                </tr>
                <tr>
                  <td>Total Packing (USD)</td>
                  <td className="value" data-value="packing-usd">
                    {money(result.packing.usd)}
                  </td>
                </tr>
                <tr>
                  <td>
                    Total Project Sqft{" "}
                    {result.packing.sqftIsTyped ? (
                      <button type="button" className="ml-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-brand underline underline-offset-2" onClick={() => update((d) => void ((d.variables.packingSqftTyped = null), (d.variables.packingSqftRoundedCopy = false)))}>
                        <RotateCcw className="size-3" />
                        use drawing total
                      </button>
                    ) : (
                      <span className="text-[11px] text-ink-3">(Drawing Summary)</span>
                    )}
                  </td>
                  <td className="has-input">
                    <NumCell
                      value={result.packing.sqftIsTyped ? v.packingSqftTyped : null}
                      label="Total project sqft"
                      format={(n) => num(n)}
                      placeholder={num(result.drawing.sqft)}
                      onCommit={(n) =>
                        update((d) => {
                          d.variables.packingSqftTyped = n;
                          d.variables.packingSqftRoundedCopy = false;
                        })
                      }
                    />
                  </td>
                </tr>
                <tr className="strong">
                  <td>Packing per Sqft (USD)</td>
                  <td className="value" data-value="packing-per-sqft">
                    {money(result.packing.perSqft, 4)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

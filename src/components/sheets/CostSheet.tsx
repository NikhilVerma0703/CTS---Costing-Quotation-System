"use client";

import { RotateCcw } from "lucide-react";
import { NumCell, SheetTable, type Col } from "@/components/cells";
import { Toolbar, bandKey, identityCols, rowSignature, type SheetProps } from "@/components/sheets/shared";
import type { RowResult, Side } from "@/lib/engine";
import { int, money, num } from "@/lib/format";
import { COST_KEYS, COST_LABEL, labelOf, type CostKey } from "@/lib/model";

/** Internal Costing and Customer Quote: the same sheet, on My Cost or Customer Charge rates. */
export function CostSheet({ data, result, update, side }: SheetProps & { side: Side }) {
  const totals = result[side];
  const isSlab = data.variables.pricing === "slab";

  const setCost = (pieceId: string, key: CostKey, value: number | null) =>
    update((d) => {
      const all = d.overrides[side];
      const entry = { ...all[pieceId] };
      if (value === null) delete entry[key];
      else entry[key] = value;
      if (Object.keys(entry).length) all[pieceId] = entry;
      else delete all[pieceId];
    });

  const editedCount = result.rows.reduce((s, r) => s + Object.keys(r[side].edited).length, 0);
  const resetAll = () => update((d) => void (d.overrides[side] = {}));

  const costCol = (key: CostKey): Col<RowResult> => ({
    key,
    head: COST_LABEL[key],
    width: key === "material" ? 94 : 82,
    align: "right",
    edit: true,
    foot: money(totals.components[key]),
    cellClass: (r) => (r[side].edited[key] !== undefined ? "is-edited" : ""),
    render: (r, i) => {
      const was = r[side].edited[key];
      return (
        <div className="flex items-center">
          <NumCell
            value={r[side].costs[key]}
            label={`${COST_LABEL[key]}, piece ${r.piece.piece}`}
            nav={{ col: key, row: i }}
            format={(n) => money(n)}
            className={was === undefined ? "cell-calc" : ""}
            title={was !== undefined ? `Calculated value: ${money(was)}` : undefined}
            onCommit={(n) => setCost(r.piece.id, key, n)}
          />
          {was !== undefined && (
            <button type="button" aria-label={`Back to the calculated value, ${money(was)}`} title={`Reset to ${money(was)}`} className="mr-0.5 shrink-0 rounded text-warn-fg hover:bg-warn-bg" onClick={() => setCost(r.piece.id, key, null)}>
              <RotateCcw className="size-3" />
            </button>
          )}
        </div>
      );
    },
  });

  const ids = identityCols(data);
  ids[1] = { ...ids[1], foot: "TOTAL (qty-weighted)" };
  const cols: Col<RowResult>[] = [
    ...ids,
    { key: "sqft", head: "Sqft/Pc", width: 68, align: "right", render: (r) => num(r.sqftPerPc) },
    {
      key: "qty",
      head: labelOf(data, "qty"),
      width: 58,
      align: "center",
      edit: true,
      foot: int(totals.qty),
      render: (r, i) => <NumCell value={r.piece.qty} min={0} label={labelOf(data, "qty")} align="center" nav={{ col: "qty", row: i }} onCommit={(n) => update((d) => void (d.pieces.find((p) => p.id === r.piece.id)!.qty = n ?? 0))} />,
    },
    ...COST_KEYS.map(costCol),
    { key: "perPc", head: side === "internal" ? "Cost/Pc" : "Price/Pc", width: 82, align: "right", foot: "n/a", render: (r) => money(r[side].perPc) },
    { key: "total", head: side === "internal" ? "Total Cost" : "Total Price", width: 104, align: "right", foot: money(totals.total), render: (r) => <strong className="font-semibold">{money(r[side].total)}</strong> },
    ...(side === "customer" ? [{ key: "perSqft", head: "Price/Sqft", width: 76, align: "right", render: (r: RowResult) => money(r.pricePerSqft) } as Col<RowResult>] : []),
  ];

  return (
    <div>
      <Toolbar>
        <span className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${side === "internal" ? "bg-internal-bg text-internal" : "bg-customer-bg text-customer"}`}>{side === "internal" ? "My Cost rates" : "Customer Charge rates"}</span>
        {editedCount > 0 && (
          <>
            <span className="text-[13px] text-warn-fg">
              {editedCount} cell{editedCount === 1 ? "" : "s"} edited by hand
            </span>
            <button type="button" className="btn-ghost" onClick={resetAll}>
              <RotateCcw className="size-4" />
              Reset all
            </button>
          </>
        )}
      </Toolbar>
      {isSlab ? (
        <p className="border-b border-line bg-white px-4 py-2 text-[12px] text-ink-2 tabular-nums" data-reconcile={side}>
          Sheet total {money(totals.total)} − Material column {money(totals.material)} = fabrication {money(totals.fabrication)}. Fabrication + slab-basis material {money(side === "internal" ? result.summary.internalMaterial : result.summary.customerMaterial)} = <strong className="font-semibold">firm total {money(side === "internal" ? result.summary.totalInternal : result.summary.totalCustomer)}</strong>.
        </p>
      ) : (
        <p className="border-b border-line bg-white px-4 py-2 text-[12px] text-ink-2">Material = piece sqft × rate × (1 + wastage markup)</p>
      )}
      <SheetTable cols={cols} rows={result.rows} rowKey={(r) => r.piece.id} bandKey={bandKey} signature={rowSignature} />
    </div>
  );
}

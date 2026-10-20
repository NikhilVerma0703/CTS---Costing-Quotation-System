import type { CostSheet, ResolvedRate } from "@/lib/engine/types";
import { DRIVER_LABEL } from "@/lib/engine/calculate";
import { dec2, dec4, money, qty } from "@/lib/engine/format";
import { cn } from "@/lib/utils";

/**
 * Per-piece costing table — sheet 3 (Internal Costing) and sheet 4 (Customer
 * Quote) have the same layout, only the rate column differs.
 */
export function CostSheetTable({ sheet, rates, currency }: { sheet: CostSheet; rates: ResolvedRate[]; currency: string }) {
  const internal = sheet.side === "internal";
  const rateOf = (r: ResolvedRate) => (internal ? r.myCost : r.customerCharge);
  const perLabel = internal ? "Cost/Pc" : "Price/Pc";
  const totalLabel = internal ? "Total Cost" : "Total Price";
  const accent = internal ? "bg-internal-bg text-internal" : "bg-customer-bg text-customer";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="th">Dwg#</th>
            <th className="th">Group</th>
            <th className="th">Piece</th>
            <th className="th">Description</th>
            <th className="th num">Sqft/Pc</th>
            <th className="th num">Units Qty</th>
            {rates.map((r) => (
              <th key={r.code} className="th num" title={`${DRIVER_LABEL[r.driver]} × ${r.name} rate`}>
                {r.name.replace(/\s*\(.*\)$/, "")} $
                <span className="block text-[10px] font-medium tracking-normal text-ink-3 normal-case">
                  {DRIVER_LABEL[r.driver]} × {money(rateOf(r), currency, 4)}
                </span>
              </th>
            ))}
            <th className={cn("th num", accent)}>{perLabel}</th>
            <th className={cn("th num", accent)}>{totalLabel}</th>
          </tr>
        </thead>
        <tbody>
          {sheet.lines.map((l) => (
            <tr key={l.piece.id} className="hover:bg-shell">
              <td className="td">{l.piece.dwgNo}</td>
              <td className="td max-w-48 truncate" title={l.piece.group ?? ""}>
                {l.piece.group}
              </td>
              <td className="td">{l.piece.pieceNo}</td>
              <td className="td min-w-36">{l.piece.description}</td>
              <td className="td num">{dec4(l.sqftPerPc)}</td>
              <td className="td num">{qty(l.unitsQty)}</td>
              {rates.map((r) => (
                <td key={r.code} className={cn("td num", l.components[r.code] === 0 && "text-ink-3")}>
                  {dec2(l.components[r.code])}
                </td>
              ))}
              <td className="td num font-semibold">{money(l.perPc, currency)}</td>
              <td className="td num font-semibold">{money(l.total, currency)}</td>
            </tr>
          ))}
          {sheet.lines.length === 0 && (
            <tr>
              <td className="td py-8 text-center text-ink-3" colSpan={8 + rates.length}>
                No drawing pieces yet.
              </td>
            </tr>
          )}
        </tbody>
        {sheet.lines.length > 0 && (
          <tfoot>
            <tr className="bg-mute-bg font-bold">
              <td className="td" colSpan={5}>
                TOTAL (qty-weighted)
              </td>
              <td className="td num">{qty(sheet.totalQty)}</td>
              {rates.map((r) => (
                <td key={r.code} className="td num">
                  {money(sheet.componentTotals[r.code], currency)}
                </td>
              ))}
              <td className="td num text-ink-3">n/a</td>
              <td className={cn("td num text-[14px]", accent)}>{money(sheet.grandTotal, currency)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Component totals as a compact breakdown list (material vs fabrication). */
export function ComponentBreakdown({ sheet, rates, currency }: { sheet: CostSheet; rates: ResolvedRate[]; currency: string }) {
  const total = sheet.grandTotal || 1;
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          <th className="th">Cost item</th>
          <th className="th">Driver</th>
          <th className="th num">Amount</th>
          <th className="th num">Share</th>
        </tr>
      </thead>
      <tbody>
        {rates.map((r) => (
          <tr key={r.code}>
            <td className="td">
              {r.name}
              {r.isMaterial && <span className="ml-1 text-xs text-ink-3">(piece-basis, reference)</span>}
            </td>
            <td className="td text-ink-2">{DRIVER_LABEL[r.driver]}</td>
            <td className="td num">{money(sheet.componentTotals[r.code], currency)}</td>
            <td className="td num text-ink-2">{((sheet.componentTotals[r.code] / total) * 100).toFixed(1)}%</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="font-semibold">
          <td className="td" colSpan={2}>
            Fabrication (all except material)
          </td>
          <td className="td num">{money(sheet.fabricationTotal, currency)}</td>
          <td className="td" />
        </tr>
        <tr className="bg-mute-bg font-bold">
          <td className="td" colSpan={2}>
            Total (piece-basis material)
          </td>
          <td className="td num">{money(sheet.grandTotal, currency)}</td>
          <td className="td" />
        </tr>
      </tfoot>
    </table>
  );
}

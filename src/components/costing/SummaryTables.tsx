import type { CostSheet, EngineResult } from "@/lib/engine/types";
import { dec2, dec4, money, pct, qty } from "@/lib/engine/format";
import { subtotals } from "@/lib/engine/subtotals";
import { cn } from "@/lib/utils";

/** Per-piece summary — layout of sheet 5 (Quote Summary). */
export function PieceSummaryTable({ result, sheet, currency }: { result: EngineResult; sheet: CostSheet; currency: string }) {
  const internal = sheet.side === "internal";
  const accent = internal ? "bg-internal-bg text-internal" : "bg-customer-bg text-customer";
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="th">Dwg#</th>
            <th className="th">Group</th>
            <th className="th">Area</th>
            <th className="th">Piece</th>
            <th className="th">Description</th>
            <th className="th num">Units Qty</th>
            <th className="th num">Sqft/Pc</th>
            <th className="th num">Total Sqft</th>
            <th className={cn("th num", accent)}>{internal ? "Cost/Pc" : "Price/Pc"}</th>
            <th className={cn("th num", accent)}>{internal ? "Total Cost" : "Total Price"}</th>
          </tr>
        </thead>
        <tbody>
          {sheet.lines.map((l, i) => (
            <tr key={l.piece.id} className="hover:bg-shell">
              <td className="td">{l.piece.dwgNo}</td>
              <td className="td max-w-56 truncate" title={l.piece.group ?? ""}>
                {l.piece.group}
              </td>
              <td className="td whitespace-nowrap">{l.piece.area}</td>
              <td className="td">{l.piece.pieceNo}</td>
              <td className="td">{l.piece.description}</td>
              <td className="td num">{qty(l.unitsQty)}</td>
              <td className="td num">{dec4(l.sqftPerPc)}</td>
              <td className="td num">{dec2(result.measurements[i].totalSqft)}</td>
              <td className="td num">{money(l.perPc, currency)}</td>
              <td className="td num font-semibold">{money(l.total, currency)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-mute-bg font-bold">
            <td className="td" colSpan={5}>
              TOTAL (piece-basis material)
            </td>
            <td className="td num">{qty(sheet.totalQty)}</td>
            <td className="td" />
            <td className="td num">{dec2(result.drawingTotals.totalSqft)}</td>
            <td className="td" />
            <td className={cn("td num text-[14px]", accent)}>{money(sheet.grandTotal, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Subtotals by plan group and by area. */
export function GroupSubtotals({ result, sheet, currency, by }: { result: EngineResult; sheet: CostSheet; currency: string; by: "group" | "area" }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          <th className="th">{by === "group" ? "Group" : "Area"}</th>
          <th className="th num">Rows</th>
          <th className="th num">Pieces</th>
          <th className="th num">Sqft</th>
          <th className="th num">{sheet.side === "internal" ? "Cost" : "Price"}</th>
          <th className="th num">Share</th>
        </tr>
      </thead>
      <tbody>
        {subtotals(result, sheet, by).map((e) => (
          <tr key={e.key}>
            <td className="td">{e.key}</td>
            <td className="td num">{e.rows}</td>
            <td className="td num">{qty(e.pcs)}</td>
            <td className="td num">{dec2(e.sqft)}</td>
            <td className="td num font-semibold">{money(e.total, currency)}</td>
            <td className="td num text-ink-2">{pct(e.share, 1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

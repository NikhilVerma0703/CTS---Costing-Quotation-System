"use client";

import { SheetTable, type Col } from "@/components/cells";
import { bandKey, identityCols, rowSignature, type SheetProps } from "@/components/sheets/shared";
import type { RowResult } from "@/lib/engine";
import { int, money, num } from "@/lib/format";
import { labelOf } from "@/lib/model";

export function QuoteSummarySheet({ data, result }: SheetProps) {
  const isSlab = data.variables.pricing === "slab";
  const ids = identityCols(data);
  ids[1] = { ...ids[1], foot: isSlab ? "TOTAL (piece-basis material)" : "TOTAL" };
  const cols: Col<RowResult>[] = [
    ...ids,
    { key: "qty", head: labelOf(data, "qty"), width: 62, align: "center", render: (r) => int(r.piece.qty), foot: int(result.customer.qty) },
    { key: "sqft", head: "Sqft/Pc", width: 72, align: "right", render: (r) => num(r.sqftPerPc) },
    { key: "totalSqft", head: "Total Sqft", width: 90, align: "right", render: (r) => num(r.totalSqft), foot: num(result.drawing.sqft) },
    { key: "perPc", head: "Price/Pc", width: 88, align: "right", render: (r) => money(r.customer.perPc) },
    { key: "total", head: "Total Price", width: 108, align: "right", render: (r) => money(r.customer.total), foot: money(result.customer.total) },
  ];
  return (
    <div>
      {isSlab && (
        <p className="border-b border-line bg-white px-4 py-2 text-[12px] text-ink-2 tabular-nums">
          Firm customer quote (material on slabs purchased): <strong className="font-semibold">{money(result.summary.totalCustomer)}</strong>
        </p>
      )}
      <SheetTable cols={cols} rows={result.rows} rowKey={(r) => r.piece.id} bandKey={bandKey} signature={rowSignature} />
    </div>
  );
}

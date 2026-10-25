"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Search, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { deletePiece } from "@/modules/drawing/actions";
import type { PieceFormInput } from "@/modules/drawing/schema";
import { PieceForm } from "./PieceForm";
import { cn } from "@/lib/utils";

export interface PieceRow {
  id: string;
  source: "IMPORT" | "MANUAL";
  form: PieceFormInput;
  unitSymbol: string;
  cuttingLf: number;
  depLf: number;
  sqftPerPc: number;
  totalSqft: number;
  depRuleShort: string;
  /** "2 × (93.25 + 44.75) ÷ 12 = 23.0000" — how each calculated value was produced. */
  formula: { cutting: string; dep: string; sqft: string };
  extra: Record<string, string>;
  /** Data-check messages about this piece. */
  flags: string[];
}

const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const f4 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

export function PiecesTable({
  projectId,
  rows,
  totals,
  suggestions,
  extraColumns,
}: {
  projectId: string;
  rows: PieceRow[];
  extraColumns: string[];
  totals: { totalPcs: number; totalSqft: number; sinkCutouts: number };
  suggestions: Parameters<typeof PieceForm>[0]["suggestions"];
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<PieceRow | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      [r.form.dwgNo, r.form.group, r.form.area, r.form.pieceNo, r.form.description, r.form.sinkModel]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [q, rows]);

  const remove = (id: string) =>
    start(async () => {
      const res = await deletePiece(projectId, id);
      setConfirmId(null);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
    });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input className="input pl-9" placeholder="Search Dwg#, group, area, piece, description…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {q && <span className="text-xs text-ink-3">{filtered.length} of {rows.length}</span>}
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="th">Dwg#</th>
              <th className="th">Group</th>
              <th className="th">Area</th>
              <th className="th">Piece</th>
              <th className="th">Description</th>
              <th className="th num">L</th>
              <th className="th num">W</th>
              <th className="th">Thk</th>
              <th className="th">Color</th>
              <th className="th">Sink Model</th>
              <th className="th num">Sink</th>
              <th className="th num">Faucet</th>
              <th className="th num">R-Cor</th>
              <th className="th num">Joints</th>
              <th className="th num">Units Qty</th>
              <th className="th num bg-info-bg">Cutting LF</th>
              <th className="th num bg-info-bg">DE&amp;P LF</th>
              <th className="th num bg-info-bg">Sqft/Pc</th>
              <th className="th num bg-info-bg">Total Sqft</th>
              {extraColumns.map((c) => (
                <th key={c} className="th bg-accent-bg normal-case">
                  {c}
                </th>
              ))}
              <th className="th">Source</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className={cn("hover:bg-shell", r.flags.length > 0 && "bg-warn-bg/30")}>
                <td className="td whitespace-nowrap">
                  {r.flags.length > 0 && (
                    <span title={r.flags.join("\n")} className="mr-1 inline-flex align-[-2px] text-warn-fg">
                      <AlertTriangle className="size-3.5" />
                    </span>
                  )}
                  {r.form.dwgNo}
                </td>
                <td className="td max-w-52 truncate" title={r.form.group ?? ""}>
                  {r.form.group}
                </td>
                <td className="td whitespace-nowrap">{r.form.area}</td>
                <td className="td">{r.form.pieceNo}</td>
                <td className="td min-w-40" title={r.form.notes ?? ""}>
                  {r.form.description}
                </td>
                <td className="td num">
                  {String(r.form.length)}
                  <span className="text-ink-3"> {r.unitSymbol}</span>
                </td>
                <td className="td num">
                  {String(r.form.width)}
                  <span className="text-ink-3"> {r.unitSymbol}</span>
                </td>
                <td className="td">{r.form.thickness}</td>
                <td className="td">{r.form.color}</td>
                <td className="td whitespace-nowrap">{r.form.sinkModel}</td>
                <td className="td num">{String(r.form.sinkCuts)}</td>
                <td className="td num">{String(r.form.faucetHoles)}</td>
                <td className="td num">{String(r.form.rCorners)}</td>
                <td className="td num">{String(r.form.joints)}</td>
                <td className="td num font-semibold">{String(r.form.unitsQty)}</td>
                <td className="td num bg-info-bg/40" title={r.formula.cutting}>
                  {f4(r.cuttingLf)}
                </td>
                <td className="td num bg-info-bg/40" title={`${r.depRuleShort}\n${r.formula.dep}`}>
                  {f4(r.depLf)}
                  {r.form.depRule === "FULL_PERIMETER" && <span className="ml-1 text-[10px] font-bold text-info-fg">FP</span>}
                </td>
                <td className="td num bg-info-bg/40" title={r.formula.sqft}>
                  {f4(r.sqftPerPc)}
                </td>
                <td className="td num bg-info-bg/40" title={`Sqft/Pc × ${r.form.unitsQty}`}>
                  {f2(r.totalSqft)}
                </td>
                {extraColumns.map((c) => (
                  <td key={c} className="td text-ink-2">
                    {r.extra[c]}
                  </td>
                ))}
                <td className="td">
                  <span className={cn("badge", r.source === "IMPORT" ? "bg-info-bg text-info-fg" : "bg-accent-bg text-accent")}>
                    {r.source === "IMPORT" ? "Import" : "Manual"}
                  </span>
                </td>
                <td className="td whitespace-nowrap">
                  {confirmId === r.id ? (
                    <span className="flex items-center gap-1">
                      <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => remove(r.id)}>
                        Remove
                      </button>
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmId(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5">
                      <button type="button" className="icon-btn" aria-label="Edit piece" onClick={() => setEditing(r)}>
                        <Pencil className="size-4" />
                      </button>
                      <button type="button" className="icon-btn hover:text-bad-fg" aria-label="Remove piece" onClick={() => setConfirmId(r.id)}>
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="td py-8 text-center text-ink-3" colSpan={21 + extraColumns.length}>
                  {rows.length === 0 ? "No pieces yet — import the sheet above or add pieces below." : "No piece matches the search."}
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && !q && (
            <tfoot>
              <tr className="bg-mute-bg font-bold">
                <td className="td" colSpan={10}>
                  TOTAL
                </td>
                <td className="td num" title="SUMPRODUCT(Sink Cuts, Units Qty)">
                  {totals.sinkCutouts.toLocaleString("en-US")}
                </td>
                <td className="td" colSpan={3} />
                <td className="td num">{totals.totalPcs.toLocaleString("en-US")}</td>
                <td className="td" colSpan={3} />
                <td className="td num">{f2(totals.totalSqft)}</td>
                <td className="td" colSpan={2 + extraColumns.length} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">Shaded columns use the standard formulas — hover a value to see it worked out. FP = DE&amp;P on full perimeter.</p>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit Dwg ${editing.form.dwgNo} · piece ${editing.form.pieceNo}` : ""} wide>
        {editing && (
          <PieceForm projectId={projectId} pieceId={editing.id} initial={editing.form} suggestions={suggestions} onDone={() => setEditing(null)} />
        )}
      </Dialog>
    </div>
  );
}

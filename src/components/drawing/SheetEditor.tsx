"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2, X } from "lucide-react";
import { saveSheetEdits } from "@/modules/drawing/actions";
import type { PieceFormInput } from "@/modules/drawing/schema";
import { cn } from "@/lib/utils";

export interface EditorRow {
  id: string;
  values: PieceFormInput;
  extra: Record<string, string>;
}

type Key = keyof PieceFormInput;
const COLS: { key: Key; label: string; w: string; kind?: "num" | "unit" | "rule" }[] = [
  { key: "dwgNo", label: "Dwg#", w: "w-16" },
  { key: "group", label: "Group", w: "w-44" },
  { key: "area", label: "Area", w: "w-28" },
  { key: "pieceNo", label: "Piece", w: "w-14" },
  { key: "description", label: "Description", w: "w-44" },
  { key: "length", label: "L", w: "w-20", kind: "num" },
  { key: "width", label: "W", w: "w-20", kind: "num" },
  { key: "dimUnit", label: "Unit", w: "w-16", kind: "unit" },
  { key: "thickness", label: "Thk", w: "w-16" },
  { key: "color", label: "Color", w: "w-20" },
  { key: "sinkModel", label: "Sink Model", w: "w-24" },
  { key: "sinkCuts", label: "Sink", w: "w-14", kind: "num" },
  { key: "faucetHoles", label: "Faucet", w: "w-14", kind: "num" },
  { key: "rCorners", label: "R-Cor", w: "w-14", kind: "num" },
  { key: "joints", label: "Joints", w: "w-14", kind: "num" },
  { key: "unitsQty", label: "Units Qty", w: "w-16", kind: "num" },
  { key: "cuttingRule", label: "Cutting", w: "w-24", kind: "rule" },
  { key: "depRule", label: "DE&P", w: "w-24", kind: "rule" },
  { key: "notes", label: "Notes", w: "w-44" },
];
const RULES = { FULL_PERIMETER: "2(L+W)", ONE_LENGTH_ONE_WIDTH: "L+W", NONE: "0" } as const;

interface Draft extends EditorRow {
  isNew?: boolean;
  removed?: boolean;
}
interface ExtraCol {
  /** Key the values are stored under in each row. */
  key: string;
  name: string;
}

/** The uploaded sheet as an editable table: values, rows and extra columns. */
export function SheetEditor({
  projectId,
  batchId,
  rows: initialRows,
  extraColumns,
  onDone,
}: {
  projectId: string;
  batchId: string;
  rows: EditorRow[];
  extraColumns: string[];
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Draft[]>(() => initialRows.map((r) => ({ ...r, values: { ...r.values }, extra: { ...r.extra } })));
  const [cols, setCols] = useState<ExtraCol[]>(() => extraColumns.map((c) => ({ key: c, name: c })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const original = useMemo(() => new Map(initialRows.map((r) => [r.id, JSON.stringify({ v: r.values, e: r.extra })])), [initialRows]);

  const setCell = (i: number, key: Key, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, values: { ...r.values, [key]: v } } : r)));
  const setExtra = (i: number, key: string, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, extra: { ...r.extra, [key]: v } } : r)));
  const dirty = (r: Draft) => r.isNew || r.removed || original.get(r.id) !== JSON.stringify({ v: r.values, e: r.extra });
  const changedCount = rows.filter(dirty).length + (cols.some((c) => c.key !== c.name) || cols.length !== extraColumns.length ? 1 : 0);

  const addRow = () => {
    const last = rows[rows.length - 1]?.values;
    setRows((rs) => [
      ...rs,
      {
        id: `new-${Date.now()}`,
        isNew: true,
        extra: {},
        values: {
          dwgNo: last?.dwgNo ?? "",
          group: last?.group ?? "",
          area: last?.area ?? "",
          pieceNo: "",
          description: "",
          length: "",
          width: "",
          dimUnit: last?.dimUnit ?? "IN",
          thickness: last?.thickness ?? "",
          color: last?.color ?? "",
          sinkModel: "",
          sinkCuts: 0,
          faucetHoles: 0,
          rCorners: 0,
          joints: 0,
          unitsQty: 1,
          cuttingRule: last?.cuttingRule ?? "FULL_PERIMETER",
          depRule: "ONE_LENGTH_ONE_WIDTH",
          notes: "",
        } as PieceFormInput,
      },
    ]);
  };

  const save = () =>
    start(async () => {
      const kept = rows.filter((r) => !r.removed);
      const res = await saveSheetEdits(projectId, batchId, {
        rows: kept.map((r) => ({
          id: r.isNew ? null : r.id,
          values: r.values,
          extra: Object.fromEntries(cols.map((c) => [c.name.trim(), String(r.extra[c.key] ?? "")])),
        })),
        deletedIds: rows.filter((r) => r.removed && !r.isNew).map((r) => r.id),
        extraColumns: cols.map((c) => c.name),
      });
      if (!res.ok) {
        // Errors come back keyed by the position among kept rows; map to the full list.
        const keptIdx = rows.map((r, i) => (r.removed ? -1 : i)).filter((i) => i >= 0);
        const mapped: Record<string, string> = {};
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) {
          const [pos, field] = k.split(/\.(.+)/);
          mapped[`${keptIdx[Number(pos)]}.${field}`] = m;
        }
        setErrors(mapped);
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      onDone();
    });

  const s = q.trim().toLowerCase();
  const visible = rows.map((r, i) => ({ r, i })).filter(({ r }) => !s || [r.values.dwgNo, r.values.group, r.values.area, r.values.pieceNo, r.values.description].some((v) => String(v ?? "").toLowerCase().includes(s)));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input input-sm max-w-xs" placeholder="Filter rows…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="btn-secondary btn-sm" onClick={addRow}>
          <Plus className="size-4" /> Row
        </button>
        <button type="button" className="btn-secondary btn-sm" onClick={() => setCols((c) => [...c, { key: `__new${c.length}_${Date.now()}`, name: `Column ${c.length + 1}` }])}>
          <Plus className="size-4" /> Extra column
        </button>
        <span className="ml-auto text-xs text-ink-3">
          {rows.filter((r) => !r.removed).length} rows · {changedCount} change{changedCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="max-h-[62vh] overflow-auto rounded-lg border border-line">
        <table className="text-[12.5px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="th sticky left-0 z-20">#</th>
              {COLS.map((c) => (
                <th key={c.key} className={cn("th", c.kind === "num" && "num")}>
                  {c.label}
                </th>
              ))}
              {cols.map((c, ci) => (
                <th key={c.key} className="th bg-accent-bg normal-case">
                  <span className="flex items-center gap-1">
                    <input
                      aria-label="Column name"
                      className="input input-sm w-28 font-semibold"
                      value={c.name}
                      onChange={(e) => setCols((cs) => cs.map((x, j) => (j === ci ? { ...x, name: e.target.value } : x)))}
                    />
                    <button type="button" className="icon-btn size-6" aria-label={`Remove column ${c.name}`} onClick={() => setCols((cs) => cs.filter((_, j) => j !== ci))}>
                      <X className="size-3.5" />
                    </button>
                  </span>
                </th>
              ))}
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ r, i }) => (
              <tr key={r.id} className={cn(r.removed ? "bg-bad-bg/40 line-through opacity-60" : dirty(r) ? "bg-warn-bg/40" : "")}>
                <td className="td sticky left-0 bg-white text-ink-3">{i + 1}</td>
                {COLS.map((c) => {
                  const err = errors[`${i}.${c.key}`];
                  const val = r.values[c.key];
                  return (
                    <td key={c.key} className="border-b border-line px-1 py-1" title={err}>
                      {c.kind === "unit" ? (
                        <select className={cn("input input-sm", c.w)} value={String(val)} onChange={(e) => setCell(i, c.key, e.target.value)} disabled={r.removed}>
                          {["IN", "MM", "CM", "FT", "M"].map((u) => (
                            <option key={u}>{u}</option>
                          ))}
                        </select>
                      ) : c.kind === "rule" ? (
                        <select className={cn("input input-sm", c.w)} value={String(val)} onChange={(e) => setCell(i, c.key, e.target.value)} disabled={r.removed}>
                          {Object.entries(RULES).map(([k, l]) => (
                            <option key={k} value={k}>
                              {l}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className={cn("input input-sm", c.w, c.kind === "num" && "text-right", err && "input-error")}
                          inputMode={c.kind === "num" ? "decimal" : undefined}
                          value={String(val ?? "")}
                          onChange={(e) => setCell(i, c.key, e.target.value)}
                          disabled={r.removed}
                        />
                      )}
                    </td>
                  );
                })}
                {cols.map((c) => (
                  <td key={c.key} className="border-b border-line px-1 py-1">
                    <input className="input input-sm w-32" value={r.extra[c.key] ?? ""} onChange={(e) => setExtra(i, c.key, e.target.value)} disabled={r.removed} />
                  </td>
                ))}
                <td className="td">
                  <button
                    type="button"
                    className={cn("icon-btn", !r.removed && "hover:text-bad-fg")}
                    aria-label={r.removed ? "Keep row" : "Remove row"}
                    onClick={() => setRows((rs) => (r.isNew && !r.removed ? rs.filter((_, j) => j !== i) : rs.map((x, j) => (j === i ? { ...x, removed: !x.removed } : x))))}
                  >
                    {r.removed ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.keys(errors).length > 0 && (
        <p className="mt-2 text-xs text-bad-fg">
          {Object.entries(errors)
            .slice(0, 4)
            .map(([k, m]) => `Row ${Number(k.split(".")[0]) + 1}: ${m}`)
            .join(" · ")}
        </p>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={pending || changedCount === 0}>
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

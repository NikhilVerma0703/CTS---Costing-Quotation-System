"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, FileSpreadsheet, Pencil, Trash2, Upload, XCircle } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { commitVariables, deleteVariables, previewVariables, reuseVariables, saveVariables } from "@/modules/variables/actions";
import type { VariablesData, VariablesParseResult, VariablesRate } from "@/lib/import/variables-fields";
import { cn } from "@/lib/utils";

export interface CurrentVariables {
  source: "UPLOAD" | "REUSED";
  fileName: string | null;
  copiedFromLabel: string | null;
  materialLabel: string | null;
  updatedAt: string;
  values: VariablesData;
  warnings: string[];
}

const MY_MODE = { MANUAL: "Entered", PACKING_PER_SQFT: "From packing" } as const;
const CU_MODE = { MANUAL: "Entered", SAME_AS_MY_COST: "= My Cost" } as const;
const rateText = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));

function Summary({ data }: { data: VariablesData }) {
  return (
    <div className="space-y-2 text-[13px]">
      <div className="grid gap-2 sm:grid-cols-2">
        <p>
          <span className="text-ink-3">Slab: </span>
          {data.slabSpec ? `${data.slabSpec.width} × ${data.slabSpec.depth} ${data.slabSpec.unit.toLowerCase()}${data.slabSpec.materialBasis ? ` · ${data.slabSpec.materialBasis}` : ""}` : "—"}
        </p>
        <p>
          <span className="text-ink-3">Packing: </span>
          {data.packing ? `${data.packing.containerCount} × ${data.packing.localCurrency} ${data.packing.containerCostLocal.toLocaleString("en-IN")} @ ${data.packing.exchangeRate}` : "—"}
        </p>
      </div>
      {data.rates.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Cost item</th>
                <th className="th">Unit</th>
                <th className="th num">My Cost</th>
                <th className="th num">Customer</th>
              </tr>
            </thead>
            <tbody>
              {data.rates.map((r) => (
                <tr key={r.code}>
                  <td className="td">{r.label}</td>
                  <td className="td text-ink-2">{r.unitLabel}</td>
                  <td className="td num">{r.myCostMode === "MANUAL" ? rateText(r.myCost) : <span className="text-ink-3">{MY_MODE[r.myCostMode]}</span>}</td>
                  <td className="td num">{r.customerChargeMode === "MANUAL" ? rateText(r.customerCharge) : <span className="text-ink-3">{CU_MODE[r.customerChargeMode]}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function VariablesPanel({
  projectId,
  current,
  reuseOptions,
}: {
  projectId: string;
  current: CurrentVariables | null;
  reuseOptions: { id: string; label: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<VariablesParseResult | null>(null);
  const [reuseFrom, setReuseFrom] = useState(reuseOptions[0]?.id ?? "");
  const [tab, setTab] = useState<"upload" | "reuse">(current ? "upload" : "upload");
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, start] = useTransition();

  const choose = (f: File | null) => {
    setFile(f);
    setPreview(null);
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const res = await previewVariables(fd);
      if (!res.ok) return void toast.error(res.error);
      setPreview(res.data);
    });
  };
  const reset = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const apply = () =>
    start(async () => {
      if (!file) return;
      const fd = new FormData();
      fd.set("file", file);
      const res = await commitVariables(projectId, fd);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      reset();
    });
  const reuse = () =>
    start(async () => {
      const res = await reuseVariables(projectId, reuseFrom);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
    });
  const remove = () =>
    start(async () => {
      const res = await deleteVariables(projectId);
      setDeleting(false);
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
    });

  return (
    <div className="space-y-3">
      {current && (
        <div className="rounded-xl border border-line bg-shell px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                {current.source === "UPLOAD" ? <FileSpreadsheet className="size-4 text-brand-2" /> : <Copy className="size-4 text-brand-2" />}
                {current.source === "UPLOAD" ? current.fileName : `Reused from ${current.copiedFromLabel}`}
              </p>
              <p className="text-xs text-ink-3">
                {current.materialLabel ? `${current.materialLabel} · ` : ""}
                {current.updatedAt}
              </p>
            </div>
            <div className="flex gap-1">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </button>
              <button type="button" className="btn-ghost btn-sm hover:text-bad-fg" onClick={() => setDeleting(true)}>
                <Trash2 className="size-3.5" /> Delete
              </button>
            </div>
          </div>
          <div className="mt-2">
            <Summary data={current.values} />
          </div>
        </div>
      )}

      <div className="flex gap-1 text-sm">
        <button type="button" className={cn("btn-sm", tab === "upload" ? "btn-secondary" : "btn-ghost")} onClick={() => setTab("upload")}>
          {current ? "Upload a new sheet" : "Upload"}
        </button>
        {reuseOptions.length > 0 && (
          <button type="button" className={cn("btn-sm", tab === "reuse" ? "btn-secondary" : "btn-ghost")} onClick={() => setTab("reuse")}>
            Reuse from a project
          </button>
        )}
      </div>

      {tab === "upload" ? (
        <>
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-line-2 bg-shell px-4 py-5 text-center hover:border-brand-2 hover:bg-info-bg",
              pending && "pointer-events-none opacity-60",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              choose(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <Upload className="size-6 text-brand-2" />
            <span className="text-sm font-semibold">{file ? file.name : "Drop the Variables sheet here, or click to choose"}</span>
            <span className="text-xs text-ink-3">.xlsx or .csv</span>
            <input ref={inputRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          </label>
          {preview && (
            <div className="space-y-2">
              {preview.errors.map((e) => (
                <p key={e} className="flex items-start gap-2 rounded-lg bg-bad-bg px-3 py-2 text-sm text-bad-fg">
                  <XCircle className="mt-0.5 size-4 shrink-0" /> {e}
                </p>
              ))}
              {preview.warnings.map((w) => (
                <p key={w} className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
                </p>
              ))}
              {preview.ok && (
                <>
                  <Summary data={preview.data} />
                  <div className="flex justify-end gap-2">
                    <button type="button" className="btn-ghost btn-sm" onClick={reset}>
                      Cancel
                    </button>
                    <button type="button" className="btn-primary btn-sm" onClick={apply} disabled={pending}>
                      {current ? "Replace variables" : "Use these variables"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select className="input" value={reuseFrom} onChange={(e) => setReuseFrom(e.target.value)} aria-label="Project to reuse variables from">
            {reuseOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary shrink-0" disabled={pending || !reuseFrom} onClick={reuse}>
            <Copy className="size-4" /> Use its variables
          </button>
        </div>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit Variables sheet" wide>
        {current && <VariablesEditor projectId={projectId} initial={current.values} onDone={() => setEditing(false)} />}
      </Dialog>

      <ConfirmDialog open={deleting} title="Delete Variables sheet permanently?" confirmLabel="Delete permanently" pending={pending} onConfirm={remove} onClose={() => setDeleting(false)}>
        <p>The rates, slab size and packing that came from this sheet are cleared, so costing and the quote will need new variables (upload or reuse).</p>
        <p>Drawing sheets, other projects and the standard formulas are not affected. This can&apos;t be undone.</p>
      </ConfirmDialog>
    </div>
  );
}

// ─── Editable table ─────────────────────────────────────────────────────────

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

function VariablesEditor({ projectId, initial, onDone }: { projectId: string; initial: VariablesData; onDone: () => void }) {
  const [slab, setSlab] = useState(initial.slabSpec);
  const [packing, setPacking] = useState(initial.packing);
  const [rates, setRates] = useState<VariablesRate[]>(initial.rates);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const setRate = (i: number, patch: Partial<VariablesRate>) => setRates((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = () =>
    start(async () => {
      const res = await saveVariables(projectId, { slabSpec: slab, packing, rates });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        return void toast.error(res.error);
      }
      toast.success(res.message);
      onDone();
    });

  const err = (k: string) => (errors[k] ? "input-error" : "");

  return (
    <div className="space-y-4 text-[13px]">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Cost item</th>
              <th className="th">Unit</th>
              <th className="th">My Cost</th>
              <th className="th">Customer Charge</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r, i) => (
              <tr key={r.code}>
                <td className="border-b border-line px-1 py-1">
                  <input className="input input-sm" value={r.label} onChange={(e) => setRate(i, { label: e.target.value })} />
                </td>
                <td className="border-b border-line px-1 py-1">
                  <input className="input input-sm w-28" value={r.unitLabel} onChange={(e) => setRate(i, { unitLabel: e.target.value })} />
                </td>
                <td className="border-b border-line px-1 py-1">
                  <div className="flex gap-1">
                    <select className="input input-sm w-32" value={r.myCostMode} onChange={(e) => setRate(i, { myCostMode: e.target.value as VariablesRate["myCostMode"] })}>
                      <option value="MANUAL">Entered</option>
                      <option value="PACKING_PER_SQFT">From packing</option>
                    </select>
                    {r.myCostMode === "MANUAL" && (
                      <input
                        className={cn("input input-sm w-24 text-right", err(`rates.${i}.myCost`))}
                        inputMode="decimal"
                        value={r.myCost ?? ""}
                        onChange={(e) => setRate(i, { myCost: numOrNull(e.target.value) })}
                      />
                    )}
                  </div>
                </td>
                <td className="border-b border-line px-1 py-1">
                  <div className="flex gap-1">
                    <select
                      className="input input-sm w-32"
                      value={r.customerChargeMode}
                      onChange={(e) => setRate(i, { customerChargeMode: e.target.value as VariablesRate["customerChargeMode"] })}
                    >
                      <option value="MANUAL">Entered</option>
                      <option value="SAME_AS_MY_COST">= My Cost</option>
                    </select>
                    {r.customerChargeMode === "MANUAL" && (
                      <input
                        className={cn("input input-sm w-24 text-right", err(`rates.${i}.customerCharge`))}
                        inputMode="decimal"
                        value={r.customerCharge ?? ""}
                        onChange={(e) => setRate(i, { customerCharge: numOrNull(e.target.value) })}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-ink-2">Slab</legend>
          {slab ? (
            <div className="grid grid-cols-3 gap-2">
              <input className={cn("input input-sm", err("slabSpec.width"))} aria-label="Slab width" value={slab.width} onChange={(e) => setSlab({ ...slab, width: Number(e.target.value) })} />
              <input className={cn("input input-sm", err("slabSpec.depth"))} aria-label="Slab depth" value={slab.depth} onChange={(e) => setSlab({ ...slab, depth: Number(e.target.value) })} />
              <select className="input input-sm" aria-label="Unit" value={slab.unit} onChange={(e) => setSlab({ ...slab, unit: e.target.value as typeof slab.unit })}>
                {["IN", "MM", "CM", "FT", "M"].map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <input
                className="input input-sm col-span-3"
                placeholder="Material basis"
                value={slab.materialBasis ?? ""}
                onChange={(e) => setSlab({ ...slab, materialBasis: e.target.value || null })}
              />
            </div>
          ) : (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setSlab({ width: 136, depth: 78, unit: "IN", materialBasis: null })}>
              Add slab size
            </button>
          )}
        </fieldset>
        <fieldset className="rounded-lg border border-line p-3">
          <legend className="px-1 text-xs font-semibold text-ink-2">Packing</legend>
          {packing ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-ink-3">
                Container cost ({packing.localCurrency})
                <input className={cn("input input-sm", err("packing.containerCostLocal"))} value={packing.containerCostLocal} onChange={(e) => setPacking({ ...packing, containerCostLocal: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-ink-3">
                Containers
                <input className={cn("input input-sm", err("packing.containerCount"))} value={packing.containerCount} onChange={(e) => setPacking({ ...packing, containerCount: Number(e.target.value) })} />
              </label>
              <label className="col-span-2 text-xs text-ink-3">
                Exchange rate ({packing.localCurrency} per USD)
                <input className={cn("input input-sm", err("packing.exchangeRate"))} value={packing.exchangeRate} onChange={(e) => setPacking({ ...packing, exchangeRate: Number(e.target.value) })} />
              </label>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => setPacking({ containerLabel: "40ft container", containerCostLocal: 0, containerCount: 0, localCurrency: "INR", exchangeRate: 0 })}
            >
              Add packing
            </button>
          )}
        </fieldset>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save and recalculate"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import {
  deleteAdjustment,
  deleteDriver,
  saveAdjustment,
  saveDriver,
  saveSlabBase,
  type AdjustmentValues,
  type DriverValues,
  type SlabBaseValues,
} from "@/modules/slab/actions";
import type { ActionResult } from "@/lib/action-result";
import { cn } from "@/lib/utils";

function useSaver() {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(res.message, { duration: 6000 });
      after?.();
    });
  return { pending, errors, run };
}

export function SlabBaseForm({ projectId, initial }: { projectId: string; initial: SlabBaseValues }) {
  const [v, setV] = useState(initial);
  const { pending, errors, run } = useSaver();
  return (
    <form
      className="grid gap-3 sm:grid-cols-[180px_1fr_120px_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveSlabBase(projectId, v));
      }}
    >
      <Field label="Slabs per optimizer run" htmlFor="os" error={errors.optimizerSlabs}>
        <input id="os" type="number" step={1} min={0} className={inputClass(errors.optimizerSlabs)} value={String(v.optimizerSlabs)} onChange={(e) => setV({ ...v, optimizerSlabs: e.target.value })} />
      </Field>
      <Field label="Source (optimizer report)" htmlFor="src">
        <input id="src" className="input" value={String(v.sourceNote ?? "")} onChange={(e) => setV({ ...v, sourceNote: e.target.value })} />
      </Field>
      <Field label="Kerf (in)" htmlFor="kerf">
        <input id="kerf" type="number" step="any" className="input" value={String(v.kerfIn ?? "")} onChange={(e) => setV({ ...v, kerfIn: e.target.value })} />
      </Field>
      <button className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}

export interface AdjustmentRow {
  id: string;
  slabs: number;
  reason: string;
}

export function AdjustmentsEditor({ projectId, rows }: { projectId: string; rows: AdjustmentRow[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  return (
    <div className="space-y-2">
      {rows.map((r) =>
        editing === r.id ? (
          <AdjForm key={r.id} projectId={projectId} id={r.id} initial={r} onDone={() => setEditing(null)} />
        ) : (
          <div key={r.id} className="flex items-start gap-3 rounded-lg border border-line px-3 py-2 text-sm">
            <span className={cn("w-12 shrink-0 text-right font-bold tabular-nums", r.slabs < 0 ? "text-ok-fg" : "text-bad-fg")}>
              {r.slabs > 0 ? `+${r.slabs}` : r.slabs}
            </span>
            <span className="flex-1">{r.reason}</span>
            <button type="button" className="icon-btn" aria-label="Edit adjustment" onClick={() => setEditing(r.id)}>
              <Pencil className="size-4" />
            </button>
            <DeleteBtn onDelete={() => deleteAdjustment(projectId, r.id)} />
          </div>
        ),
      )}
      {editing === "new" ? (
        <AdjForm projectId={projectId} id={null} initial={{ slabs: "", reason: "" }} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add adjustment
        </button>
      )}
    </div>
  );
}

function AdjForm({ projectId, id, initial, onDone }: { projectId: string; id: string | null; initial: AdjustmentValues; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const { pending, errors, run } = useSaver();
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border border-brand-2/30 bg-info-bg/40 p-2 sm:flex-row sm:items-start"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAdjustment(projectId, id, v), onDone);
      }}
    >
      <div className="w-24">
        <input type="number" step={1} autoFocus placeholder="−1" className={cn("input input-sm text-right", errors.slabs && "input-error")} value={String(v.slabs)} onChange={(e) => setV({ ...v, slabs: e.target.value })} />
        {errors.slabs && <p className="text-xs text-bad-fg">{errors.slabs}</p>}
      </div>
      <div className="flex-1">
        <input placeholder="Reason, e.g. qty change frees 1 slab — rerun optimizer" className={cn("input input-sm", errors.reason && "input-error")} value={String(v.reason)} onChange={(e) => setV({ ...v, reason: e.target.value })} />
        {errors.reason && <p className="text-xs text-bad-fg">{errors.reason}</p>}
      </div>
      <div className="flex gap-1">
        <button className="btn-primary btn-sm" disabled={pending}>
          Save
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export interface DriverRow {
  id: string;
  label: string;
  pieces: number;
  piecesPerSlab: number;
  dedicatedSlabs: number;
  wastePerSlabSqIn: number;
  note: string;
}

export function DriverEditor({ projectId, row, onDone }: { projectId: string; row: DriverRow | null; onDone: () => void }) {
  const [v, setV] = useState<DriverValues>(row ?? { label: "", pieces: "", piecesPerSlab: "", dedicatedSlabs: "", wastePerSlabSqIn: "", note: "" });
  const { pending, errors, run } = useSaver();
  const f = (k: keyof DriverValues, label: string, type = "number", cls = "") => (
    <Field label={label} htmlFor={`d-${k}`} error={errors[k]} className={cls}>
      <input id={`d-${k}`} type={type} step="any" className={inputClass(errors[k])} value={String(v[k] ?? "")} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </Field>
  );
  return (
    <form
      className="grid gap-3 rounded-lg border border-brand-2/30 bg-info-bg/40 p-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveDriver(projectId, row?.id ?? null, v), onDone);
      }}
    >
      {f("label", "Driver pieces", "text", "sm:col-span-2")}
      {f("pieces", "Pieces")}
      {f("piecesPerSlab", "Pieces per slab")}
      {f("dedicatedSlabs", "Dedicated slabs")}
      {f("wastePerSlabSqIn", "Waste per slab (sq in)")}
      {f("note", "Note", "text", "sm:col-span-5")}
      <div className="flex items-end gap-1">
        <button className="btn-primary btn-sm" disabled={pending}>
          Save
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DriverActions({ projectId, row }: { projectId: string; row: DriverRow }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span className="flex gap-0.5">
        <button type="button" className="icon-btn" aria-label="Edit driver" onClick={() => setOpen(true)}>
          <Pencil className="size-4" />
        </button>
        <DeleteBtn onDelete={() => deleteDriver(projectId, row.id)} />
      </span>
      {open && (
        <div className="mt-2">
          <DriverEditor projectId={projectId} row={row} onDone={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}

export function AddDriverButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  return open ? (
    <DriverEditor projectId={projectId} row={null} onDone={() => setOpen(false)} />
  ) : (
    <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>
      <Plus className="size-4" /> Add driver analysis
    </button>
  );
}

function DeleteBtn({ onDelete }: { onDelete: () => Promise<ActionResult> }) {
  const [confirm, setConfirm] = useState(false);
  const { pending, run } = useSaver();
  return confirm ? (
    <span className="flex gap-1">
      <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={() => run(onDelete, () => setConfirm(false))}>
        Remove
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(false)}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" className="icon-btn hover:text-bad-fg" aria-label="Remove" onClick={() => setConfirm(true)}>
      <Trash2 className="size-4" />
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, inputClass } from "@/components/ui/Field";
import { savePacking, saveSlabSpec, type PackingValues, type SlabSpecValues } from "@/modules/cost-inputs/actions";

export function SlabSpecForm({ projectId, initial }: { projectId: string; initial: SlabSpecValues }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveSlabSpec(projectId, v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      } else {
        setErrors({});
        toast.success(res.message, { duration: 6000 });
      }
    });
  };
  return (
    <form onSubmit={save} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Field label="Slab width" htmlFor="sw" error={errors.width}>
        <input id="sw" type="number" step="any" className={inputClass(errors.width)} value={String(v.width)} onChange={(e) => setV({ ...v, width: e.target.value })} />
      </Field>
      <Field label="Slab depth" htmlFor="sd" error={errors.depth}>
        <input id="sd" type="number" step="any" className={inputClass(errors.depth)} value={String(v.depth)} onChange={(e) => setV({ ...v, depth: e.target.value })} />
      </Field>
      <Field label="Unit" htmlFor="su">
        <select id="su" className="input" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value as SlabSpecValues["unit"] })}>
          <option value="IN">inches</option>
          <option value="MM">mm</option>
          <option value="CM">cm</option>
          <option value="FT">feet</option>
          <option value="M">metres</option>
        </select>
      </Field>
      <Field label="Material basis" htmlFor="mb">
        <input id="mb" className="input" value={String(v.materialBasis ?? "")} onChange={(e) => setV({ ...v, materialBasis: e.target.value })} />
      </Field>
      <div className="col-span-2 flex justify-end sm:col-span-4">
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save slab size"}
        </button>
      </div>
    </form>
  );
}

export function PackingForm({ projectId, initial }: { projectId: string; initial: PackingValues }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await savePacking(projectId, v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      } else {
        setErrors({});
        toast.success(res.message, { duration: 6000 });
      }
    });
  };
  return (
    <form onSubmit={save} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Field label="Container" htmlFor="pl" error={errors.containerLabel}>
        <input id="pl" className={inputClass(errors.containerLabel)} value={String(v.containerLabel)} onChange={(e) => setV({ ...v, containerLabel: e.target.value })} />
      </Field>
      <Field label={`Cost per container (${String(v.localCurrency)})`} htmlFor="pc" error={errors.containerCostLocal}>
        <input id="pc" type="number" step="any" className={inputClass(errors.containerCostLocal)} value={String(v.containerCostLocal)} onChange={(e) => setV({ ...v, containerCostLocal: e.target.value })} />
      </Field>
      <Field label="Number of containers" htmlFor="pn" error={errors.containerCount}>
        <input id="pn" type="number" step="any" className={inputClass(errors.containerCount)} value={String(v.containerCount)} onChange={(e) => setV({ ...v, containerCount: e.target.value })} />
      </Field>
      <Field label="Local currency" htmlFor="pcur" error={errors.localCurrency}>
        <input id="pcur" maxLength={3} className={inputClass(errors.localCurrency)} value={String(v.localCurrency)} onChange={(e) => setV({ ...v, localCurrency: e.target.value })} />
      </Field>
      <Field label={`Exchange rate (${String(v.localCurrency)} per USD)`} htmlFor="px" error={errors.exchangeRate}>
        <input id="px" type="number" step="any" className={inputClass(errors.exchangeRate)} value={String(v.exchangeRate)} onChange={(e) => setV({ ...v, exchangeRate: e.target.value })} />
      </Field>
      <div className="col-span-2 flex justify-end sm:col-span-5">
        <button className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save packing"}
        </button>
      </div>
    </form>
  );
}

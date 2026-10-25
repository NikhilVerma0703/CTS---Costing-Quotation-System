"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { createProject, updateProject } from "@/modules/projects/actions";

export interface ExtraField {
  label: string;
  value: string;
}

export interface ProjectFormValues {
  code: string;
  name: string;
  customerName: string;
  description: string;
  extraFields: ExtraField[];
  siteAddress: string;
  contactName: string;
  contactEmail: string;
  versionLabel: string;
  validityDays: number;
  /** DRAFT = automatic (follows the data); the rest are outcomes. */
  status: "DRAFT" | "WON" | "LOST" | "ARCHIVED";
}

const EMPTY: ProjectFormValues = {
  code: "",
  name: "",
  customerName: "",
  description: "",
  extraFields: [],
  siteAddress: "",
  contactName: "",
  contactEmail: "",
  versionLabel: "",
  validityDays: 30,
  status: "DRAFT",
};

/** New project: code, name, customer, description, extra fields. Edit: also the quote details. */
export function ProjectForm({ projectId, initial, onDone }: { projectId?: string; initial?: ProjectFormValues; onDone?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<ProjectFormValues>(initial ?? EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof ProjectFormValues>(k: K, val: ProjectFormValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const setExtra = (i: number, k: keyof ExtraField, val: string) =>
    set(
      "extraFields",
      v.extraFields.map((f, j) => (j === i ? { ...f, [k]: val } : f)),
    );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = projectId
        ? await updateProject(projectId, v)
        : await createProject({ code: v.code, name: v.name, customerName: v.customerName, description: v.description, extraFields: v.extraFields });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      setErrors({});
      toast.success(res.message ?? "Saved");
      onDone?.();
      if (!projectId && res.data && typeof res.data === "object" && "id" in res.data) {
        router.push(`/projects/${(res.data as { id: string }).id}/import-drawing`);
      } else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Project code *" htmlFor="code" error={errors.code}>
        <input id="code" className={inputClass(errors.code)} value={v.code} onChange={(e) => set("code", e.target.value)} placeholder="e.g. 1633" autoFocus={!projectId} />
      </Field>
      <Field label="Customer name" htmlFor="customerName" error={errors.customerName}>
        <input id="customerName" className={inputClass(errors.customerName)} value={v.customerName} onChange={(e) => set("customerName", e.target.value)} />
      </Field>
      <Field label="Project name *" htmlFor="name" error={errors.name} className="sm:col-span-2">
        <input id="name" className={inputClass(errors.name)} value={v.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <textarea id="description" rows={2} className="input" value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>

      {projectId && (
        <>
          <Field label="Site / address" htmlFor="siteAddress" error={errors.siteAddress}>
            <input id="siteAddress" className={inputClass(errors.siteAddress)} value={v.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} />
          </Field>
          <Field label="Version label" htmlFor="versionLabel" error={errors.versionLabel}>
            <input id="versionLabel" className={inputClass(errors.versionLabel)} value={v.versionLabel} onChange={(e) => set("versionLabel", e.target.value)} placeholder="e.g. Ver 5" />
          </Field>
          <Field label="Customer contact" htmlFor="contactName" error={errors.contactName}>
            <input id="contactName" className={inputClass(errors.contactName)} value={v.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label="Contact email" htmlFor="contactEmail" error={errors.contactEmail}>
            <input id="contactEmail" type="email" className={inputClass(errors.contactEmail)} value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} />
          </Field>
          <Field label="Quote valid for (days)" htmlFor="validityDays" error={errors.validityDays}>
            <input id="validityDays" type="number" min={1} className={inputClass(errors.validityDays)} value={v.validityDays} onChange={(e) => set("validityDays", Number(e.target.value))} />
          </Field>
          <Field label="Status" htmlFor="status" hint="Automatic follows the drawings, rates and issued revisions.">
            <select id="status" className="input" value={v.status} onChange={(e) => set("status", e.target.value as ProjectFormValues["status"])}>
              <option value="DRAFT">Automatic</option>
              <option value="WON">Won</option>
              <option value="LOST">Lost</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>
        </>
      )}

      <div className="sm:col-span-2">
        {v.extraFields.length > 0 && (
          <div className="mb-2 space-y-2">
            {v.extraFields.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-2/5">
                  <input
                    aria-label="Field name"
                    className={inputClass(errors[`extraFields.${i}.label`])}
                    placeholder="Field name, e.g. PO number"
                    value={f.label}
                    onChange={(e) => setExtra(i, "label", e.target.value)}
                  />
                  {errors[`extraFields.${i}.label`] && <p className="mt-1 text-xs text-bad-fg">{errors[`extraFields.${i}.label`]}</p>}
                </div>
                <input aria-label="Value" className="input flex-1" placeholder="Value" value={f.value} onChange={(e) => setExtra(i, "value", e.target.value)} />
                <button
                  type="button"
                  className="icon-btn mt-1"
                  aria-label="Remove field"
                  onClick={() => set("extraFields", v.extraFields.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {v.extraFields.length < 10 && (
          <button type="button" className="btn-ghost btn-sm" onClick={() => set("extraFields", [...v.extraFields, { label: "", value: "" }])}>
            <Plus className="size-4" /> Add extra important field
          </button>
        )}
      </div>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : projectId ? "Save project" : "Create project"}
        </button>
      </div>
    </form>
  );
}

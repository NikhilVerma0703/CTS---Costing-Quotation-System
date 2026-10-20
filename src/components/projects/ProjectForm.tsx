"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Field, inputClass } from "@/components/ui/Field";
import { createProject, updateProject } from "@/modules/projects/actions";

export interface ProjectFormValues {
  code: string;
  name: string;
  customerName: string;
  siteAddress: string;
  contactName: string;
  contactEmail: string;
  versionLabel: string;
  validityDays: number;
  status?: "DRAFT" | "QUOTED" | "WON" | "LOST" | "ARCHIVED";
  description: string;
}

const EMPTY: ProjectFormValues = {
  code: "",
  name: "",
  customerName: "",
  siteAddress: "",
  contactName: "",
  contactEmail: "",
  versionLabel: "",
  validityDays: 30,
  description: "",
};

export function ProjectForm({
  projectId,
  initial,
  copyOptions,
  onDone,
}: {
  projectId?: string;
  initial?: ProjectFormValues;
  copyOptions?: { id: string; label: string }[];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [v, setV] = useState<ProjectFormValues>(initial ?? EMPTY);
  const [copyFrom, setCopyFrom] = useState(copyOptions?.[0]?.id ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = <K extends keyof ProjectFormValues>(k: K, val: ProjectFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = projectId
        ? await updateProject(projectId, v)
        : await createProject({ ...v, copyFromProjectId: copyFrom || undefined });
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
      <Field label="Project code *" htmlFor="code" error={errors.code} hint="Short unique code, e.g. LEN-NWA-BP">
        <input id="code" className={inputClass(errors.code)} value={v.code} onChange={(e) => set("code", e.target.value)} />
      </Field>
      <Field label="Version label" htmlFor="versionLabel" error={errors.versionLabel} hint="e.g. Ver 5">
        <input id="versionLabel" className={inputClass(errors.versionLabel)} value={v.versionLabel} onChange={(e) => set("versionLabel", e.target.value)} />
      </Field>
      <Field label="Project name *" htmlFor="name" error={errors.name} className="sm:col-span-2">
        <input id="name" className={inputClass(errors.name)} value={v.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <Field label="Customer" htmlFor="customerName" error={errors.customerName}>
        <input id="customerName" className={inputClass(errors.customerName)} value={v.customerName} onChange={(e) => set("customerName", e.target.value)} />
      </Field>
      <Field label="Site / address" htmlFor="siteAddress" error={errors.siteAddress}>
        <input id="siteAddress" className={inputClass(errors.siteAddress)} value={v.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} />
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
      {projectId ? (
        <Field label="Status" htmlFor="status">
          <select id="status" className="input" value={v.status} onChange={(e) => set("status", e.target.value as ProjectFormValues["status"])}>
            {["DRAFT", "QUOTED", "WON", "LOST", "ARCHIVED"].map((s) => (
              <option key={s} value={s}>
                {s[0] + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Start cost inputs from" htmlFor="copyFrom" hint="Copies rates, slab size and packing. Drawings are not copied.">
          <select id="copyFrom" className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            {copyOptions?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
            <option value="">Blank — enter all rates</option>
          </select>
        </Field>
      )}
      <Field label="Description" htmlFor="description" className="sm:col-span-2">
        <textarea id="description" rows={2} className="input" value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : projectId ? "Save project" : "Create project"}
        </button>
      </div>
    </form>
  );
}

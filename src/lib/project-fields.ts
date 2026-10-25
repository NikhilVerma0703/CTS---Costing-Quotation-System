import type { Project } from "@prisma/client";
import type { ExtraField, ProjectFormValues } from "@/components/projects/ProjectForm";

export function extraFieldsOf(p: Pick<Project, "extraFields">): ExtraField[] {
  const v = p.extraFields;
  return Array.isArray(v) ? (v as unknown as ExtraField[]).filter((f) => f && typeof f.label === "string") : [];
}

/** A project row as the edit form's values. */
export function projectFormValues(p: Project): ProjectFormValues {
  return {
    code: p.code,
    name: p.name,
    customerName: p.customerName ?? "",
    description: p.description ?? "",
    extraFields: extraFieldsOf(p),
    siteAddress: p.siteAddress ?? "",
    contactName: p.contactName ?? "",
    contactEmail: p.contactEmail ?? "",
    versionLabel: p.versionLabel ?? "",
    validityDays: p.validityDays,
    status: p.status === "QUOTED" ? "DRAFT" : p.status,
  };
}

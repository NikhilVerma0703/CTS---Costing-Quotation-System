"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { parseVariablesSheet, type VariablesParseResult } from "@/lib/import/variables-sheet";
import type { VariablesData } from "@/lib/import/variables-fields";
import { applyVariables, clearVariables, toJson, variablesFromInputs } from "./apply";

const MAX_BYTES = 8 * 1024 * 1024;
const refresh = (projectId: string) => {
  revalidatePath(`/projects/${projectId}`, "layout");
  revalidatePath("/");
};

async function readUpload(formData: FormData): Promise<{ name: string; data: ArrayBuffer } | string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a .xlsx or .csv file first.";
  if (file.size > MAX_BYTES) return "The file is larger than 8 MB.";
  return { name: file.name, data: await file.arrayBuffer() };
}

/** Read and check a Variables sheet. Nothing is saved. */
export async function previewVariables(formData: FormData): Promise<ActionResult<VariablesParseResult>> {
  const up = await readUpload(formData);
  if (typeof up === "string") return fail(up);
  return ok(await parseVariablesSheet(up.name, up.data));
}

/** Use an uploaded Variables sheet for this project (replaces the previous one). */
export async function commitVariables(projectId: string, formData: FormData): Promise<ActionResult> {
  const up = await readUpload(formData);
  if (typeof up === "string") return fail(up);
  const parsed = await parseVariablesSheet(up.name, up.data);
  if (!parsed.ok) return fail(parsed.errors.join(" "));
  const user = currentUserName();
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.variablesSheet.findUnique({ where: { projectId } });
      await applyVariables(tx, projectId, parsed.data, user);
      const row = {
        source: "UPLOAD" as const,
        fileName: up.name,
        sheetName: parsed.sheetName,
        copiedFromProjectId: null,
        copiedFromLabel: null,
        materialLabel: parsed.materialLabel,
        values: toJson(parsed.data),
        report: toJson({ warnings: parsed.warnings }),
        updatedBy: user,
      };
      const sheet = await tx.variablesSheet.upsert({ where: { projectId }, update: row, create: { ...row, projectId, createdBy: user } });
      await audit(tx, {
        projectId,
        entityType: "VariablesSheet",
        entityId: sheet.id,
        action: "IMPORT",
        summary: `${before ? "Replaced Variables sheet with" : "Variables sheet"} ${up.name}: ${parsed.data.rates.length} rates` +
          `${parsed.data.slabSpec ? ", slab size" : ""}${parsed.data.packing ? ", packing" : ""}`,
      });
    });
    refresh(projectId);
    return ok(undefined, `Variables applied from ${up.name}`);
  } catch (e) {
    return unexpected(e);
  }
}

/** Reuse another project's stored Variables sheet (or its rate card) without uploading again. */
export async function reuseVariables(projectId: string, fromProjectId: string): Promise<ActionResult> {
  if (fromProjectId === projectId) return fail("Choose a different project.");
  const user = currentUserName();
  try {
    const source = await prisma.project.findFirst({ where: { id: fromProjectId, deletedAt: null }, include: { variables: true } });
    if (!source) return fail("That project no longer exists.");
    await prisma.$transaction(async (tx) => {
      const data: VariablesData = source.variables
        ? (source.variables.values as unknown as VariablesData)
        : await variablesFromInputs(tx, fromProjectId);
      await applyVariables(tx, projectId, data, user);
      const material = data.rates.find((r) => r.code === "MATERIAL")?.label ?? data.slabSpec?.materialBasis ?? null;
      const row = {
        source: "REUSED" as const,
        fileName: source.variables?.fileName ?? null,
        sheetName: source.variables?.sheetName ?? null,
        copiedFromProjectId: source.id,
        copiedFromLabel: `${source.code} — ${source.name}`,
        materialLabel: material,
        values: toJson(data),
        report: source.variables?.report ? toJson(source.variables.report) : undefined,
        updatedBy: user,
      };
      const sheet = await tx.variablesSheet.upsert({ where: { projectId }, update: row, create: { ...row, projectId, createdBy: user } });
      await audit(tx, {
        projectId,
        entityType: "VariablesSheet",
        entityId: sheet.id,
        action: "IMPORT",
        summary: `Variables reused from ${source.code}${source.variables?.fileName ? ` (${source.variables.fileName})` : " (its rate card)"}`,
      });
    });
    refresh(projectId);
    return ok(undefined, `Variables reused from ${source.code}`);
  } catch (e) {
    return unexpected(e);
  }
}

const rateSchema = z.object({
  code: z.string().min(1),
  label: z.string().trim().max(120),
  unitLabel: z.string().trim().max(40),
  myCostMode: z.enum(["MANUAL", "PACKING_PER_SQFT"]),
  myCost: z.number().min(0, "Can't be negative").max(1_000_000).nullable(),
  customerChargeMode: z.enum(["MANUAL", "SAME_AS_MY_COST"]),
  customerCharge: z.number().min(0, "Can't be negative").max(1_000_000).nullable(),
  note: z.string().trim().max(500).nullable(),
});
const variablesSchema = z.object({
  slabSpec: z
    .object({
      width: z.number({ message: "Must be a number" }).positive("Must be greater than 0"),
      depth: z.number({ message: "Must be a number" }).positive("Must be greater than 0"),
      unit: z.enum(["IN", "MM", "CM", "FT", "M"]),
      materialBasis: z.string().trim().max(120).nullable(),
    })
    .nullable(),
  packing: z
    .object({
      containerLabel: z.string().trim().min(1, "Required").max(60),
      containerCostLocal: z.number({ message: "Must be a number" }).min(0, "Can't be negative"),
      containerCount: z.number({ message: "Must be a number" }).min(0, "Can't be negative"),
      localCurrency: z.string().trim().length(3),
      exchangeRate: z.number({ message: "Must be a number" }).positive("Must be greater than 0"),
    })
    .nullable(),
  rates: z.array(rateSchema),
});

/** Edit the stored Variables sheet in place; the new values are applied at once. */
export async function saveVariables(projectId: string, values: Pick<VariablesData, "slabSpec" | "packing" | "rates">): Promise<ActionResult> {
  const parsed = variablesSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted values.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  for (const [i, r] of d.rates.entries()) {
    if (r.myCostMode === "MANUAL" && r.myCost === null) return fail("Please correct the highlighted values.", { [`rates.${i}.myCost`]: "Enter My Cost" });
    if (r.customerChargeMode === "MANUAL" && r.customerCharge === null)
      return fail("Please correct the highlighted values.", { [`rates.${i}.customerCharge`]: "Enter Customer Charge" });
  }
  const user = currentUserName();
  try {
    await prisma.$transaction(async (tx) => {
      const sheet = await tx.variablesSheet.findUnique({ where: { projectId } });
      if (!sheet) throw new Error("NO_SHEET");
      const prev = sheet.values as unknown as VariablesData;
      const data: VariablesData = { ...prev, slabSpec: d.slabSpec, packing: d.packing, rates: d.rates };
      await applyVariables(tx, projectId, data, user);
      if (!d.slabSpec) await tx.slabSpec.deleteMany({ where: { projectId } });
      if (!d.packing) await tx.packingConfig.deleteMany({ where: { projectId } });
      await tx.variablesSheet.update({ where: { projectId }, data: { values: toJson(data), updatedBy: user } });
      await audit(tx, {
        projectId,
        entityType: "VariablesSheet",
        entityId: sheet.id,
        action: "UPDATE",
        summary: "Variables sheet edited",
        before: toJson(prev),
        after: toJson(data),
      });
    });
    refresh(projectId);
    return ok(undefined, "Variables saved — every section is recalculated");
  } catch (e) {
    if (e instanceof Error && e.message === "NO_SHEET") return fail("This project has no Variables sheet.");
    return unexpected(e);
  }
}

/**
 * Delete the project's Variables sheet permanently, and clear what it set
 * (rates, slab size, packing) so no section keeps using values from a
 * deleted sheet. Other projects and the standard formulas are not touched.
 */
export async function deleteVariables(projectId: string): Promise<ActionResult> {
  const user = currentUserName();
  try {
    await prisma.$transaction(async (tx) => {
      const sheet = await tx.variablesSheet.findUnique({ where: { projectId } });
      if (!sheet) return;
      await clearVariables(tx, projectId, user);
      await tx.variablesSheet.delete({ where: { projectId } });
      await audit(tx, {
        projectId,
        entityType: "VariablesSheet",
        entityId: sheet.id,
        action: "DELETE",
        summary: `Deleted Variables sheet${sheet.fileName ? ` ${sheet.fileName}` : ""}; rates, slab size and packing cleared`,
        before: toJson(sheet.values),
      });
    });
    refresh(projectId);
    return ok(undefined, "Variables sheet deleted");
  } catch (e) {
    return unexpected(e);
  }
}

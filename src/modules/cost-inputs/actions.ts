"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { calculateProject } from "@/lib/engine/calculate";
import { loadEngineInput } from "@/lib/engine/load";
import { money } from "@/lib/engine/format";

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

/** After a change, report the new headline figures so the user sees the effect at once. */
async function headline(projectId: string): Promise<string> {
  const r = calculateProject(await loadEngineInput(projectId));
  if (!r.ready) return "Saved. The quote still has issues to fix.";
  return `Saved. Internal cost ${money(r.summary.totalInternalCost)} · Customer quote ${money(r.summary.totalQuote)}`;
}

const optionalRate = z
  .union([z.literal(""), z.null(), z.coerce.number({ message: "Must be a number" }).min(0, "Can't be negative").max(1_000_000)])
  .transform((v) => (v === "" || v === null ? null : v));

const costInputSchema = z
  .object({
    label: z.string().trim().max(120).optional().or(z.literal("")),
    myCostMode: z.enum(["MANUAL", "PACKING_PER_SQFT"]),
    myCost: optionalRate,
    customerChargeMode: z.enum(["MANUAL", "SAME_AS_MY_COST"]),
    customerCharge: optionalRate,
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .superRefine((v, ctx) => {
    if (v.myCostMode === "MANUAL" && v.myCost === null) ctx.addIssue({ code: "custom", path: ["myCost"], message: "Enter My Cost" });
    if (v.customerChargeMode === "MANUAL" && v.customerCharge === null)
      ctx.addIssue({ code: "custom", path: ["customerCharge"], message: "Enter Customer Charge" });
  });
export type CostInputValues = z.input<typeof costInputSchema>;

export async function updateCostInput(projectId: string, inputId: string, values: CostInputValues): Promise<ActionResult> {
  const parsed = costInputSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.projectCostInput.findFirstOrThrow({ where: { id: inputId, projectId }, include: { costItem: true } });
      const data = {
        label: d.label || null,
        myCostMode: d.myCostMode,
        myCost: d.myCostMode === "MANUAL" ? d.myCost : null,
        customerChargeMode: d.customerChargeMode,
        customerCharge: d.customerChargeMode === "MANUAL" ? d.customerCharge : null,
        note: d.note || null,
        updatedBy: currentUserName(),
      };
      await tx.projectCostInput.update({ where: { id: inputId }, data });
      const show = (mode: string, v: unknown) => (mode === "MANUAL" ? String(v ?? "—") : mode === "SAME_AS_MY_COST" ? "= My Cost" : "from packing");
      await audit(tx, {
        projectId,
        entityType: "ProjectCostInput",
        entityId: inputId,
        action: "UPDATE",
        summary:
          `${before.label || before.costItem.name}: My Cost ${show(before.myCostMode, before.myCost)} → ${show(data.myCostMode, data.myCost)}, ` +
          `Customer ${show(before.customerChargeMode, before.customerCharge)} → ${show(data.customerChargeMode, data.customerCharge)}`,
        before: JSON.parse(JSON.stringify(before)),
        after: JSON.parse(JSON.stringify(data)),
      });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    return unexpected(e);
  }
}

const newItemSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(80),
  unitLabel: z.string().trim().min(2, "Unit is required").max(40),
  driver: z.enum(["PIECE_SQFT", "CUTTING_LF", "DEP_LF", "SINK_CUTS", "FAUCET_HOLES", "R_CORNERS", "JOINTS"]),
  myCost: z.coerce.number({ message: "Must be a number" }).min(0),
  customerCharge: z.coerce.number({ message: "Must be a number" }).min(0),
});
export type NewItemValues = z.input<typeof newItemSchema>;

/** A new chargeable operation that multiplies an existing drawing quantity. */
export async function addCostItem(projectId: string, values: NewItemValues): Promise<ActionResult> {
  const parsed = newItemSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const code = d.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30);
  try {
    await prisma.$transaction(async (tx) => {
      let item = await tx.costItem.findUnique({ where: { code } });
      if (!item) {
        const max = await tx.costItem.aggregate({ _max: { sortOrder: true } });
        item = await tx.costItem.create({
          data: { code, name: d.name, unitLabel: d.unitLabel, driver: d.driver, sortOrder: (max._max.sortOrder ?? 0) + 10 },
        });
      }
      const exists = await tx.projectCostInput.findUnique({ where: { projectId_costItemId: { projectId, costItemId: item.id } } });
      if (exists) throw new Error("DUPLICATE");
      const created = await tx.projectCostInput.create({
        data: { projectId, costItemId: item.id, myCost: d.myCost, customerCharge: d.customerCharge, updatedBy: currentUserName() },
      });
      await audit(tx, {
        projectId,
        entityType: "ProjectCostInput",
        entityId: created.id,
        action: "CREATE",
        summary: `Added cost item ${d.name} (${d.unitLabel}): My Cost ${d.myCost}, Customer ${d.customerCharge}`,
      });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    if (e instanceof Error && e.message === "DUPLICATE") return fail("This project already has that cost item.", { name: "Already in the list" });
    return unexpected(e);
  }
}

const slabSpecSchema = z.object({
  width: z.coerce.number({ message: "Must be a number" }).positive("Must be greater than 0"),
  depth: z.coerce.number({ message: "Must be a number" }).positive("Must be greater than 0"),
  unit: z.enum(["IN", "MM", "CM", "FT", "M"]),
  materialBasis: z.string().trim().max(120).optional().or(z.literal("")),
});
export type SlabSpecValues = z.input<typeof slabSpecSchema>;

export async function saveSlabSpec(projectId: string, values: SlabSpecValues): Promise<ActionResult> {
  const parsed = slabSpecSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = { ...parsed.data, materialBasis: parsed.data.materialBasis || null, updatedBy: currentUserName() };
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.slabSpec.findUnique({ where: { projectId } });
      await tx.slabSpec.upsert({ where: { projectId }, update: d, create: { ...d, projectId } });
      await audit(tx, {
        projectId,
        entityType: "SlabSpec",
        entityId: projectId,
        action: before ? "UPDATE" : "CREATE",
        summary: `Slab size ${before ? `${before.width} × ${before.depth} → ` : ""}${d.width} × ${d.depth} ${d.unit.toLowerCase()}`,
        before: before ? JSON.parse(JSON.stringify(before)) : undefined,
        after: JSON.parse(JSON.stringify(d)),
      });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    return unexpected(e);
  }
}

const packingSchema = z.object({
  containerLabel: z.string().trim().min(1, "Required").max(60),
  containerCostLocal: z.coerce.number({ message: "Must be a number" }).min(0, "Can't be negative"),
  containerCount: z.coerce.number({ message: "Must be a number" }).min(0, "Can't be negative"),
  localCurrency: z.string().trim().min(3).max(3),
  exchangeRate: z.coerce.number({ message: "Must be a number" }).positive("Must be greater than 0"),
});
export type PackingValues = z.input<typeof packingSchema>;

export async function savePacking(projectId: string, values: PackingValues): Promise<ActionResult> {
  const parsed = packingSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = { ...parsed.data, localCurrency: parsed.data.localCurrency.toUpperCase(), updatedBy: currentUserName() };
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.packingConfig.findUnique({ where: { projectId } });
      await tx.packingConfig.upsert({ where: { projectId }, update: d, create: { ...d, projectId } });
      await audit(tx, {
        projectId,
        entityType: "PackingConfig",
        entityId: projectId,
        action: before ? "UPDATE" : "CREATE",
        summary: `Packing: ${d.containerCount} × ${d.localCurrency} ${d.containerCostLocal} @ ${d.exchangeRate}` +
          (before ? ` (was ${before.containerCount} × ${before.containerCostLocal} @ ${before.exchangeRate})` : ""),
        before: before ? JSON.parse(JSON.stringify(before)) : undefined,
        after: JSON.parse(JSON.stringify(d)),
      });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    return unexpected(e);
  }
}

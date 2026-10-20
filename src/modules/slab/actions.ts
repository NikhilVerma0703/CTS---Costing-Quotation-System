"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { calculateProject } from "@/lib/engine/calculate";
import { loadEngineInput } from "@/lib/engine/load";
import { money } from "@/lib/engine/format";

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

async function headline(projectId: string) {
  const r = calculateProject(await loadEngineInput(projectId));
  if (!r.slab) return "Saved.";
  return `Saved. ${r.slab.totalSlabs} slabs · material ${money(r.slab.materialCost)} · quote ${money(r.summary.totalQuote)}`;
}

async function ensureSlabInput(tx: Tx, projectId: string) {
  return (
    (await tx.slabInput.findUnique({ where: { projectId } })) ??
    tx.slabInput.create({ data: { projectId, optimizerSlabs: 0, updatedBy: currentUserName() } })
  );
}

const baseSchema = z.object({
  optimizerSlabs: z.coerce.number({ message: "Must be a number" }).int("Whole slabs only").min(0).max(100000),
  sourceNote: z.string().trim().max(500).optional().or(z.literal("")),
  kerfIn: z.union([z.literal(""), z.coerce.number().min(0).max(5)]).optional(),
});
export type SlabBaseValues = z.input<typeof baseSchema>;

export async function saveSlabBase(projectId: string, values: SlabBaseValues): Promise<ActionResult> {
  const parsed = baseSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.slabInput.findUnique({ where: { projectId } });
      const data = {
        optimizerSlabs: d.optimizerSlabs,
        sourceNote: d.sourceNote || null,
        kerfIn: d.kerfIn === "" || d.kerfIn === undefined ? null : d.kerfIn,
        updatedBy: currentUserName(),
      };
      await tx.slabInput.upsert({ where: { projectId }, update: data, create: { ...data, projectId } });
      await audit(tx, {
        projectId,
        entityType: "SlabInput",
        entityId: projectId,
        action: before ? "UPDATE" : "CREATE",
        summary: `Optimizer slabs ${before ? `${before.optimizerSlabs} → ` : ""}${d.optimizerSlabs}`,
      });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    return unexpected(e);
  }
}

const adjSchema = z.object({
  slabs: z.coerce.number({ message: "Must be a number" }).int("Whole slabs only").min(-100000).max(100000).refine((v) => v !== 0, "Can't be 0"),
  reason: z.string().trim().min(3, "Give a reason").max(300),
});
export type AdjustmentValues = z.input<typeof adjSchema>;

export async function saveAdjustment(projectId: string, id: string | null, values: AdjustmentValues): Promise<ActionResult> {
  const parsed = adjSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  try {
    await prisma.$transaction(async (tx) => {
      const si = await ensureSlabInput(tx, projectId);
      if (id) {
        await tx.slabAdjustment.update({ where: { id, slabInputId: si.id }, data: parsed.data });
      } else {
        const n = await tx.slabAdjustment.count({ where: { slabInputId: si.id } });
        await tx.slabAdjustment.create({ data: { ...parsed.data, slabInputId: si.id, sortOrder: n } });
      }
      await audit(tx, {
        projectId,
        entityType: "SlabAdjustment",
        entityId: id ?? "new",
        action: id ? "UPDATE" : "CREATE",
        summary: `Slab adjustment ${parsed.data.slabs > 0 ? "+" : ""}${parsed.data.slabs}: ${parsed.data.reason}`,
      });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    return unexpected(e);
  }
}

export async function deleteAdjustment(projectId: string, id: string): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const a = await tx.slabAdjustment.findFirstOrThrow({ where: { id, slabInput: { projectId } } });
      await tx.slabAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, { projectId, entityType: "SlabAdjustment", entityId: id, action: "DELETE", summary: `Removed slab adjustment ${a.slabs}: ${a.reason}` });
    });
    refresh(projectId);
    return ok(undefined, await headline(projectId));
  } catch (e) {
    return unexpected(e);
  }
}

const driverSchema = z.object({
  label: z.string().trim().min(2, "Required").max(120),
  pieces: z.coerce.number().int().min(0),
  piecesPerSlab: z.coerce.number().positive("Must be > 0"),
  dedicatedSlabs: z.coerce.number().int().min(0),
  wastePerSlabSqIn: z.coerce.number().min(0),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});
export type DriverValues = z.input<typeof driverSchema>;

export async function saveDriver(projectId: string, id: string | null, values: DriverValues): Promise<ActionResult> {
  const parsed = driverSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const data = { ...parsed.data, note: parsed.data.note || null };
  try {
    await prisma.$transaction(async (tx) => {
      const si = await ensureSlabInput(tx, projectId);
      if (id) await tx.slabDriver.update({ where: { id, slabInputId: si.id }, data });
      else {
        const n = await tx.slabDriver.count({ where: { slabInputId: si.id } });
        await tx.slabDriver.create({ data: { ...data, slabInputId: si.id, sortOrder: n } });
      }
      await audit(tx, { projectId, entityType: "SlabDriver", entityId: id ?? "new", action: id ? "UPDATE" : "CREATE", summary: `Slab driver ${data.label}: ${data.dedicatedSlabs} slabs` });
    });
    refresh(projectId);
    return ok(undefined, "Saved");
  } catch (e) {
    return unexpected(e);
  }
}

export async function deleteDriver(projectId: string, id: string): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.slabDriver.findFirstOrThrow({ where: { id, slabInput: { projectId } } });
      await tx.slabDriver.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, { projectId, entityType: "SlabDriver", entityId: id, action: "DELETE", summary: "Removed slab driver row" });
    });
    refresh(projectId);
    return ok(undefined, "Removed");
  } catch (e) {
    return unexpected(e);
  }
}

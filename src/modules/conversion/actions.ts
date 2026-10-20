"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";

const ruleSchema = z.object({
  measurementType: z.enum(["LENGTH", "AREA"]),
  fromUnit: z.string().trim().min(1, "From unit is required").max(20),
  toUnit: z.string().trim().min(1, "To unit is required").max(20),
  multiplier: z.coerce.number({ message: "Multiplier must be a number" }).positive("Must be greater than 0"),
  divisor: z.coerce.number({ message: "Divisor must be a number" }).positive("Must be greater than 0"),
  description: z.string().trim().max(200).optional().or(z.literal("")),
  isActive: z.boolean(),
});
export type RuleInput = z.input<typeof ruleSchema>;

/** Conversion rules are shared by all projects, so every project is refreshed. */
const refreshAll = () => revalidatePath("/", "layout");

export async function saveRule(ruleId: string | null, values: RuleInput): Promise<ActionResult> {
  const parsed = ruleSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const user = currentUserName();
  try {
    await prisma.$transaction(async (tx) => {
      if (ruleId) {
        const before = await tx.unitConversionRule.findUniqueOrThrow({ where: { id: ruleId } });
        // System rules keep their units — the engine looks them up by unit.
        const data = before.isSystem
          ? { multiplier: d.multiplier, divisor: d.divisor, description: d.description || null, isActive: d.isActive, updatedBy: user }
          : { ...d, description: d.description || null, updatedBy: user };
        await tx.unitConversionRule.update({ where: { id: ruleId }, data });
        await audit(tx, {
          entityType: "UnitConversionRule",
          entityId: ruleId,
          action: "UPDATE",
          summary: `Conversion ${before.fromUnit} → ${before.toUnit}: ×${before.multiplier} ÷${before.divisor} → ×${d.multiplier} ÷${d.divisor}${before.isActive !== d.isActive ? (d.isActive ? " (enabled)" : " (disabled)") : ""}`,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(data)),
        });
      } else {
        const created = await tx.unitConversionRule.create({ data: { ...d, description: d.description || null, updatedBy: user } });
        await audit(tx, {
          entityType: "UnitConversionRule",
          entityId: created.id,
          action: "CREATE",
          summary: `Added conversion ${d.fromUnit} → ${d.toUnit} (×${d.multiplier} ÷${d.divisor})`,
        });
      }
    });
    refreshAll();
    return ok(undefined, "Conversion rule saved — all calculations updated");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint")) return fail("A rule for these units already exists.", { fromUnit: "Already exists" });
    return unexpected(e);
  }
}

const edgeSchema = z.object({
  cuttingRule: z.enum(["FULL_PERIMETER", "ONE_LENGTH_ONE_WIDTH", "NONE"]),
  depRule: z.enum(["FULL_PERIMETER", "ONE_LENGTH_ONE_WIDTH", "NONE"]),
});

/** Change the Cutting / DE&P edge rule of one piece. */
export async function setPieceEdgeRules(
  projectId: string,
  pieceId: string,
  values: z.input<typeof edgeSchema>,
): Promise<ActionResult> {
  const parsed = edgeSchema.safeParse(values);
  if (!parsed.success) return fail("Invalid rule.");
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.drawingPiece.findFirstOrThrow({ where: { id: pieceId, projectId, deletedAt: null } });
      await tx.drawingPiece.update({ where: { id: pieceId }, data: { ...parsed.data, updatedBy: currentUserName() } });
      await audit(tx, {
        projectId,
        entityType: "DrawingPiece",
        entityId: pieceId,
        action: "UPDATE",
        summary: `Dwg ${before.dwgNo} piece ${before.pieceNo}: Cutting ${before.cuttingRule} → ${parsed.data.cuttingRule}, DE&P ${before.depRule} → ${parsed.data.depRule}`,
        before: { cuttingRule: before.cuttingRule, depRule: before.depRule },
        after: parsed.data,
      });
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    return ok(undefined, "Edge rule updated");
  } catch (e) {
    return unexpected(e);
  }
}

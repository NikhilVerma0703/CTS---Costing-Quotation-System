"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { EDGE_FORMULA_CODES, edgeExpression } from "@/lib/reference/standard-formulas";

const schema = z.object({
  code: z.enum(EDGE_FORMULA_CODES),
  edgeRule: z.enum(["FULL_PERIMETER", "ONE_LENGTH_ONE_WIDTH", "NONE"]),
  reason: z.string().trim().min(5, "Give the reason for the change (who approved it, why)").max(300),
});
export type FormulaChange = z.input<typeof schema>;

/**
 * An authorised change to a standard edge formula. It is versioned and
 * audited, and applies to new uploads and manual entries; pieces already
 * stored keep the rule they were imported with (change those per piece).
 */
export async function changeEdgeFormula(values: FormulaChange): Promise<ActionResult> {
  const parsed = schema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const user = currentUserName();
  try {
    await prisma.$transaction(async (tx) => {
      const before = await tx.standardFormula.findUniqueOrThrow({ where: { code: d.code } });
      if (before.edgeRule === d.edgeRule) throw new Error("UNCHANGED");
      const after = await tx.standardFormula.update({
        where: { code: d.code },
        data: { edgeRule: d.edgeRule, expression: edgeExpression(d.edgeRule), version: { increment: 1 }, changeReason: d.reason, updatedBy: user },
      });
      await audit(tx, {
        entityType: "StandardFormula",
        entityId: after.id,
        action: "UPDATE",
        summary: `${before.name}: ${before.expression} → ${after.expression} (v${after.version}) — ${d.reason}`,
        before: { edgeRule: before.edgeRule, expression: before.expression, version: before.version },
        after: { edgeRule: after.edgeRule, expression: after.expression, version: after.version },
      });
    });
    revalidatePath("/formulas");
    return ok(undefined, "Formula changed — new uploads use it");
  } catch (e) {
    if (e instanceof Error && e.message === "UNCHANGED") return fail("That is already the formula.");
    return unexpected(e);
  }
}

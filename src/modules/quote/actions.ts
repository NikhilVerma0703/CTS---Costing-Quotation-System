"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, type ActionResult } from "@/lib/action-result";
import { money } from "@/lib/engine/format";
import { quoteNumberFor } from "@/lib/pdf/quote-data";
import { buildLiveQuote } from "./build";

const issueSchema = z.object({
  remarks: z.string().trim().max(500).optional().or(z.literal("")),
  pieceSchedule: z.boolean(),
  priceSplit: z.boolean(),
});

/**
 * Freeze the current quote as the next revision: full engine input + result
 * and the exact PDF data are stored, earlier revisions become SUPERSEDED.
 */
export async function issueRevision(
  projectId: string,
  values: z.input<typeof issueSchema>,
): Promise<ActionResult<{ revisionNo: number; quoteNumber: string }>> {
  const parsed = issueSchema.safeParse(values);
  if (!parsed.success) return fail("Invalid request.");
  const opts = { pieceSchedule: parsed.data.pieceSchedule, priceSplit: parsed.data.priceSplit };
  try {
    const out = await prisma.$transaction(async (tx) => {
      const last = await tx.quoteRevision.findFirst({ where: { projectId }, orderBy: { revisionNo: "desc" } });
      const revisionNo = (last?.revisionNo ?? 0) + 1;
      const { data, input, result } = await buildLiveQuote(projectId, opts, revisionNo);
      if (!result.ready) throw new Error(`NOT_READY:${result.issues.filter((i) => i.severity === "error").length}`);
      const quoteNumber = quoteNumberFor(data.project.code, revisionNo);
      await tx.quoteRevision.updateMany({ where: { projectId, status: "ISSUED" }, data: { status: "SUPERSEDED" } });
      const rev = await tx.quoteRevision.create({
        data: {
          projectId,
          revisionNo,
          quoteNumber,
          issuedBy: currentUserName(),
          remarks: parsed.data.remarks || null,
          totalQuote: result.summary.totalQuote,
          totalInternalCost: result.summary.totalInternalCost,
          totalSqft: result.summary.totalSqft,
          inputSnapshot: JSON.parse(JSON.stringify(input)),
          resultSnapshot: JSON.parse(JSON.stringify(result)),
          quoteSnapshot: JSON.parse(JSON.stringify({ ...data, quoteNumber })),
        },
      });
      await tx.project.update({ where: { id: projectId }, data: { status: "QUOTED", updatedBy: currentUserName() } });
      await audit(tx, {
        projectId,
        entityType: "QuoteRevision",
        entityId: rev.id,
        action: "ISSUE",
        summary: `Issued ${quoteNumber}: ${money(result.summary.totalQuote)}${parsed.data.remarks ? ` — ${parsed.data.remarks}` : ""}`,
      });
      return { revisionNo, quoteNumber };
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    revalidatePath("/");
    return ok(out, `Issued ${out.quoteNumber}`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("NOT_READY")) {
      return fail("The quote has problems to fix first (see the red box on this page).");
    }
    return unexpected(e);
  }
}

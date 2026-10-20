"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";

const noteSchema = z.object({
  text: z.string().trim().min(2, "Write the note").max(2000),
  visibility: z.enum(["INTERNAL", "CUSTOMER"]),
});
export type NoteValues = z.input<typeof noteSchema>;

export async function saveNote(projectId: string, id: string | null, values: NoteValues): Promise<ActionResult> {
  const parsed = noteSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  try {
    await prisma.$transaction(async (tx) => {
      if (id) {
        const before = await tx.projectNote.findFirstOrThrow({ where: { id, projectId, deletedAt: null } });
        await tx.projectNote.update({ where: { id }, data: parsed.data });
        await audit(tx, {
          projectId,
          entityType: "ProjectNote",
          entityId: id,
          action: "UPDATE",
          summary: `Note edited (${parsed.data.visibility.toLowerCase()})`,
          before: { text: before.text, visibility: before.visibility },
          after: parsed.data,
        });
      } else {
        const max = await tx.projectNote.aggregate({ where: { projectId }, _max: { sortOrder: true } });
        const n = await tx.projectNote.create({
          data: { ...parsed.data, projectId, sortOrder: (max._max.sortOrder ?? 0) + 1, createdBy: currentUserName() },
        });
        await audit(tx, { projectId, entityType: "ProjectNote", entityId: n.id, action: "CREATE", summary: `Note added (${parsed.data.visibility.toLowerCase()})` });
      }
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    return ok(undefined, "Note saved");
  } catch (e) {
    return unexpected(e);
  }
}

export async function deleteNote(projectId: string, id: string): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectNote.findFirstOrThrow({ where: { id, projectId } });
      await tx.projectNote.update({ where: { id }, data: { deletedAt: new Date() } });
      await audit(tx, { projectId, entityType: "ProjectNote", entityId: id, action: "DELETE", summary: "Note removed" });
    });
    revalidatePath(`/projects/${projectId}`, "layout");
    return ok(undefined, "Note removed");
  } catch (e) {
    return unexpected(e);
  }
}

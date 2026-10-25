"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { templateMode } from "@/modules/variables/apply";

const codeSchema = z
  .string()
  .trim()
  .min(1, "Project code is required")
  .max(30)
  .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash or underscore only");

const extraFieldsSchema = z
  .array(z.object({ label: z.string().trim().max(60), value: z.string().trim().max(300) }))
  .max(10)
  .optional()
  .transform((rows) => (rows ?? []).filter((r) => r.label || r.value))
  .superRefine((rows, ctx) =>
    rows.forEach((r, i) => {
      if (!r.label) ctx.addIssue({ code: "custom", path: [i, "label"], message: "Name the field" });
    }),
  );

/** New project: only what is needed to start. Everything else comes from the uploads. */
const createSchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(2, "Project name is required").max(200),
  customerName: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  extraFields: extraFieldsSchema,
});
export type CreateProjectValues = z.input<typeof createSchema>;

const projectSchema = createSchema.extend({
  siteAddress: z.string().trim().max(300).optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactEmail: z.string().trim().email("Not a valid email").optional().or(z.literal("")),
  versionLabel: z.string().trim().max(40).optional().or(z.literal("")),
  validityDays: z.coerce.number().int().min(1).max(365),
  /** DRAFT = status follows the data; the others are outcomes a person decides. */
  status: z.enum(["DRAFT", "WON", "LOST", "ARCHIVED"]).optional(),
});

const blank = (s: string | undefined) => (s && s.length ? s : null);

export async function createProject(values: CreateProjectValues): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const user = currentUserName();
  try {
    if (await prisma.project.findUnique({ where: { code: d.code } })) {
      return fail("Please correct the highlighted fields.", { code: "A project with this code already exists" });
    }
    const items = await prisma.costItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          code: d.code,
          name: d.name,
          customerName: blank(d.customerName),
          description: blank(d.description),
          extraFields: d.extraFields.length ? d.extraFields : undefined,
          createdBy: user,
          updatedBy: user,
          // Empty rate rows; the Variables sheet (uploaded or reused) fills them.
          costInputs: { create: items.map((item) => ({ costItemId: item.id, ...templateMode(item.code), updatedBy: user })) },
        },
      });
      await audit(tx, {
        projectId: p.id,
        entityType: "Project",
        entityId: p.id,
        action: "CREATE",
        summary: `Created project ${p.code}`,
        after: { code: p.code, name: p.name },
      });
      return p;
    });
    revalidatePath("/");
    return ok({ id: project.id }, "Project created");
  } catch (e) {
    return unexpected(e);
  }
}

export type ProjectValues = z.input<typeof projectSchema>;

export async function updateProject(projectId: string, values: ProjectValues): Promise<ActionResult> {
  const parsed = projectSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  try {
    const before = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!before) return fail("Project not found.");
    if (d.code !== before.code && (await prisma.project.findUnique({ where: { code: d.code } }))) {
      return fail("Please correct the highlighted fields.", { code: "A project with this code already exists" });
    }
    await prisma.$transaction(async (tx) => {
      const after = await tx.project.update({
        where: { id: projectId },
        data: {
          code: d.code,
          name: d.name,
          customerName: blank(d.customerName),
          siteAddress: blank(d.siteAddress),
          contactName: blank(d.contactName),
          contactEmail: blank(d.contactEmail),
          versionLabel: blank(d.versionLabel),
          validityDays: d.validityDays,
          // Issued revisions decide "Quoted"; an outcome set back to automatic keeps QUOTED if one exists.
          status: d.status ? (d.status === "DRAFT" && before.status === "QUOTED" ? "QUOTED" : d.status) : before.status,
          description: blank(d.description),
          extraFields: d.extraFields.length ? d.extraFields : Prisma.DbNull,
          updatedBy: currentUserName(),
        },
      });
      await audit(tx, {
        projectId,
        entityType: "Project",
        entityId: projectId,
        action: "UPDATE",
        summary: "Project details updated",
        before: { code: before.code, name: before.name, customerName: before.customerName, status: before.status },
        after: { code: after.code, name: after.name, customerName: after.customerName, status: after.status },
      });
    });
    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`, "layout");
    return ok(undefined, "Project saved");
  } catch (e) {
    return unexpected(e);
  }
}

export async function archiveProject(projectId: string): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { deletedAt: new Date(), updatedBy: currentUserName() } });
      await audit(tx, { projectId, entityType: "Project", entityId: projectId, action: "DELETE", summary: "Project removed (soft delete)" });
    });
    revalidatePath("/");
    return ok(undefined, "Project removed");
  } catch (e) {
    return unexpected(e);
  }
}

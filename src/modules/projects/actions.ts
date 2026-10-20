"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";

const projectSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(30)
    .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash or underscore only"),
  name: z.string().trim().min(2, "Name is required").max(200),
  customerName: z.string().trim().max(200).optional().or(z.literal("")),
  siteAddress: z.string().trim().max(300).optional().or(z.literal("")),
  contactName: z.string().trim().max(120).optional().or(z.literal("")),
  contactEmail: z.string().trim().email("Not a valid email").optional().or(z.literal("")),
  versionLabel: z.string().trim().max(40).optional().or(z.literal("")),
  validityDays: z.coerce.number().int().min(1).max(365),
  status: z.enum(["DRAFT", "QUOTED", "WON", "LOST", "ARCHIVED"]).optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
});

const blank = (s: string | undefined) => (s && s.length ? s : null);

/** Cost-input modes of the reference template (rates left empty). */
const TEMPLATE_MODES: Record<string, { myCostMode: "MANUAL" | "PACKING_PER_SQFT"; customerChargeMode: "MANUAL" | "SAME_AS_MY_COST" }> = {
  MATERIAL: { myCostMode: "MANUAL", customerChargeMode: "SAME_AS_MY_COST" },
  PACKING: { myCostMode: "PACKING_PER_SQFT", customerChargeMode: "SAME_AS_MY_COST" },
};

export async function createProject(
  values: z.input<typeof projectSchema> & { copyFromProjectId?: string },
): Promise<ActionResult<{ id: string }>> {
  const parsed = projectSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const user = currentUserName();
  try {
    if (await prisma.project.findUnique({ where: { code: d.code } })) {
      return fail("Please correct the highlighted fields.", { code: "A project with this code already exists" });
    }
    const source = values.copyFromProjectId
      ? await prisma.project.findFirst({
          where: { id: values.copyFromProjectId, deletedAt: null },
          include: { slabSpec: true, packing: true, costInputs: true },
        })
      : null;
    const items = await prisma.costItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });

    const project = await prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          code: d.code,
          name: d.name,
          customerName: blank(d.customerName),
          siteAddress: blank(d.siteAddress),
          contactName: blank(d.contactName),
          contactEmail: blank(d.contactEmail),
          versionLabel: blank(d.versionLabel),
          validityDays: d.validityDays,
          description: blank(d.description),
          createdBy: user,
          updatedBy: user,
          slabSpec: source?.slabSpec
            ? {
                create: {
                  width: source.slabSpec.width,
                  depth: source.slabSpec.depth,
                  unit: source.slabSpec.unit,
                  materialBasis: source.slabSpec.materialBasis,
                  updatedBy: user,
                },
              }
            : undefined,
          packing: source?.packing
            ? {
                create: {
                  containerLabel: source.packing.containerLabel,
                  containerCostLocal: source.packing.containerCostLocal,
                  containerCount: source.packing.containerCount,
                  localCurrency: source.packing.localCurrency,
                  exchangeRate: source.packing.exchangeRate,
                  updatedBy: user,
                },
              }
            : undefined,
          costInputs: {
            create: items.map((item) => {
              const from = source?.costInputs.find((c) => c.costItemId === item.id);
              const tpl = TEMPLATE_MODES[item.code] ?? { myCostMode: "MANUAL", customerChargeMode: "MANUAL" };
              return from
                ? {
                    costItemId: item.id,
                    label: from.label,
                    myCostMode: from.myCostMode,
                    myCost: from.myCost,
                    customerChargeMode: from.customerChargeMode,
                    customerCharge: from.customerCharge,
                    note: from.note,
                    updatedBy: user,
                  }
                : { costItemId: item.id, ...tpl, updatedBy: user };
            }),
          },
        },
      });
      await audit(tx, {
        projectId: p.id,
        entityType: "Project",
        entityId: p.id,
        action: "CREATE",
        summary: `Created project ${p.code}${source ? ` (cost inputs copied from ${source.code})` : ""}`,
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

export async function updateProject(projectId: string, values: z.input<typeof projectSchema>): Promise<ActionResult> {
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
          status: d.status ?? before.status,
          description: blank(d.description),
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

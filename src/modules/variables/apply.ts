import "server-only";
import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { num } from "@/lib/utils";
import { EMPTY_VARIABLES, type VariablesData } from "@/lib/import/variables-fields";

/** Cost-input modes of the reference template (rates left empty). */
export const TEMPLATE_MODES: Record<string, { myCostMode: "MANUAL" | "PACKING_PER_SQFT"; customerChargeMode: "MANUAL" | "SAME_AS_MY_COST" }> = {
  MATERIAL: { myCostMode: "MANUAL", customerChargeMode: "SAME_AS_MY_COST" },
  PACKING: { myCostMode: "PACKING_PER_SQFT", customerChargeMode: "SAME_AS_MY_COST" },
};
export const templateMode = (code: string) => TEMPLATE_MODES[code] ?? { myCostMode: "MANUAL" as const, customerChargeMode: "MANUAL" as const };

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/**
 * Write a Variables sheet's values into the inputs the engine reads: slab
 * size, packing and one cost-input row per rate. Rates the sheet doesn't list
 * are left as they are.
 */
export async function applyVariables(tx: Tx, projectId: string, data: VariablesData, user: string) {
  if (data.slabSpec) {
    const v = { ...data.slabSpec, updatedBy: user };
    await tx.slabSpec.upsert({ where: { projectId }, update: v, create: { ...v, projectId } });
  }
  if (data.packing) {
    const v = { ...data.packing, updatedBy: user };
    await tx.packingConfig.upsert({ where: { projectId }, update: v, create: { ...v, projectId } });
  }
  const items = await tx.costItem.findMany({ where: { code: { in: data.rates.map((r) => r.code) } } });
  for (const r of data.rates) {
    const item = items.find((i) => i.code === r.code);
    if (!item) continue;
    const v = {
      label: r.label || null,
      myCostMode: r.myCostMode,
      myCost: r.myCostMode === "MANUAL" ? r.myCost : null,
      customerChargeMode: r.customerChargeMode,
      customerCharge: r.customerChargeMode === "MANUAL" ? r.customerCharge : null,
      note: r.note,
      updatedBy: user,
    };
    await tx.projectCostInput.upsert({
      where: { projectId_costItemId: { projectId, costItemId: item.id } },
      update: v,
      create: { ...v, projectId, costItemId: item.id },
    });
  }
}

/** A project's current rate card, slab size and packing, in Variables-sheet form. */
export async function variablesFromInputs(tx: Tx, projectId: string): Promise<VariablesData> {
  const [slab, packing, inputs] = await Promise.all([
    tx.slabSpec.findUnique({ where: { projectId } }),
    tx.packingConfig.findUnique({ where: { projectId } }),
    tx.projectCostInput.findMany({ where: { projectId }, include: { costItem: true }, orderBy: { costItem: { sortOrder: "asc" } } }),
  ]);
  return {
    ...structuredClone(EMPTY_VARIABLES),
    slabSpec: slab ? { width: num(slab.width)!, depth: num(slab.depth)!, unit: slab.unit, materialBasis: slab.materialBasis } : null,
    packing: packing
      ? {
          containerLabel: packing.containerLabel,
          containerCostLocal: num(packing.containerCostLocal)!,
          containerCount: num(packing.containerCount)!,
          localCurrency: packing.localCurrency,
          exchangeRate: num(packing.exchangeRate)!,
        }
      : null,
    rates: inputs.map((c) => ({
      code: c.costItem.code,
      label: c.label || c.costItem.name,
      unitLabel: c.costItem.unitLabel,
      myCostMode: c.myCostMode,
      myCost: num(c.myCost),
      customerChargeMode: c.customerChargeMode,
      customerCharge: num(c.customerCharge),
      note: c.note,
    })),
  };
}

/**
 * Keep the stored Variables sheet equal to the live inputs after a change made
 * on the Cost Inputs page, so the sheet and the rate card never disagree. The
 * sheet's own reference figures (checks, unmatched rows) are kept.
 */
export async function syncVariablesFromInputs(tx: Tx, projectId: string, user: string) {
  const sheet = await tx.variablesSheet.findUnique({ where: { projectId } });
  if (!sheet) return;
  const prev = sheet.values as unknown as VariablesData;
  const live = await variablesFromInputs(tx, projectId);
  await tx.variablesSheet.update({
    where: { projectId },
    data: { values: json({ ...live, checks: prev.checks ?? EMPTY_VARIABLES.checks, unmatched: prev.unmatched ?? [] }), updatedBy: user },
  });
}

/** Clear what a deleted Variables sheet had set: rates back to empty template rows, slab size and packing removed. */
export async function clearVariables(tx: Tx, projectId: string, user: string) {
  const inputs = await tx.projectCostInput.findMany({ where: { projectId }, include: { costItem: true } });
  for (const c of inputs) {
    await tx.projectCostInput.update({
      where: { id: c.id },
      data: { ...templateMode(c.costItem.code), myCost: null, customerCharge: null, label: null, note: null, updatedBy: user },
    });
  }
  await tx.slabSpec.deleteMany({ where: { projectId } });
  await tx.packingConfig.deleteMany({ where: { projectId } });
}

export { json as toJson };

import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { num } from "@/lib/utils";
import { calculateProject } from "./calculate";
import type { EngineInput, EngineResult } from "./types";

/** The project row with everything the pages show in headers. */
export const getProject = cache(async (projectId: string) => {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    include: { slabSpec: true },
  });
  if (!project) notFound();
  return project;
});

/** Read the current inputs of a project into the engine's plain shape. */
export async function loadEngineInput(projectId: string): Promise<EngineInput> {
  const [project, rules, costInputs, pieces, slab] = await Promise.all([
    prisma.project.findFirstOrThrow({
      where: { id: projectId, deletedAt: null },
      include: { slabSpec: true, packing: true },
    }),
    prisma.unitConversionRule.findMany({ where: { isActive: true } }),
    prisma.projectCostInput.findMany({
      where: { projectId, costItem: { isActive: true } },
      include: { costItem: true },
    }),
    prisma.drawingPiece.findMany({
      where: { projectId, deletedAt: null },
      include: { group: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.slabInput.findUnique({
      where: { projectId },
      include: {
        adjustments: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
        drivers: { where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
  ]);

  return {
    currency: project.currency,
    slabSpec: project.slabSpec
      ? {
          width: num(project.slabSpec.width)!,
          depth: num(project.slabSpec.depth)!,
          unit: project.slabSpec.unit,
          materialBasis: project.slabSpec.materialBasis,
        }
      : null,
    packing: project.packing
      ? {
          containerLabel: project.packing.containerLabel,
          containerCostLocal: num(project.packing.containerCostLocal)!,
          containerCount: num(project.packing.containerCount)!,
          localCurrency: project.packing.localCurrency,
          exchangeRate: num(project.packing.exchangeRate)!,
        }
      : null,
    slab: slab
      ? {
          optimizerSlabs: slab.optimizerSlabs,
          sourceNote: slab.sourceNote,
          adjustments: slab.adjustments.map((a) => ({ slabs: a.slabs, reason: a.reason })),
          drivers: slab.drivers.map((d) => ({
            label: d.label,
            pieces: d.pieces,
            piecesPerSlab: num(d.piecesPerSlab)!,
            dedicatedSlabs: d.dedicatedSlabs,
            wastePerSlabSqIn: num(d.wastePerSlabSqIn)!,
            note: d.note,
          })),
        }
      : null,
    conversionRules: rules.map((r) => ({
      measurementType: r.measurementType,
      fromUnit: r.fromUnit,
      toUnit: r.toUnit,
      multiplier: num(r.multiplier)!,
      divisor: num(r.divisor)!,
    })),
    costInputs: costInputs.map((c) => ({
      code: c.costItem.code,
      name: c.label || c.costItem.name,
      unitLabel: c.costItem.unitLabel,
      driver: c.costItem.driver,
      isMaterial: c.costItem.isMaterial,
      sortOrder: c.costItem.sortOrder,
      myCostMode: c.myCostMode,
      myCost: num(c.myCost),
      customerChargeMode: c.customerChargeMode,
      customerCharge: num(c.customerCharge),
    })),
    pieces: pieces.map((p) => ({
      id: p.id,
      dwgNo: p.dwgNo,
      group: p.group?.name ?? null,
      area: p.area,
      pieceNo: p.pieceNo,
      description: p.description,
      length: num(p.length)!,
      width: num(p.width)!,
      dimUnit: p.dimUnit,
      thickness: p.thickness,
      color: p.color,
      sinkModel: p.sinkModel,
      sinkCuts: p.sinkCuts,
      faucetHoles: p.faucetHoles,
      rCorners: p.rCorners,
      joints: p.joints,
      unitsQty: p.unitsQty,
      cuttingRule: p.cuttingRule,
      depRule: p.depRule,
      notes: p.notes,
    })),
  };
}

/**
 * Current inputs → current results. Every calculated page calls this, once per
 * request (React cache), so all sections always show the same numbers.
 */
export const getProjectCalculation = cache(
  async (projectId: string): Promise<{ input: EngineInput; result: EngineResult }> => {
    const input = await loadEngineInput(projectId);
    return { input, result: calculateProject(input) };
  },
);

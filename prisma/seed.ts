/**
 * Seed: cost item catalog, unit conversion rules, and the reference project
 * (Lennar NWA Brighton Park, Ver 5) exactly as in the uploaded workbooks.
 *
 * Safe to re-run: existing rows are never overwritten, so edits made in the
 * app survive. `npm run db:reset` wipes everything and seeds fresh.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BRIGHTON_PARK, COST_ITEMS, CONVERSION_RULES } from "../src/lib/reference/brighton-park";
import { STANDARD_FORMULAS } from "../src/lib/reference/standard-formulas";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const SEED_USER = "Seed";

async function main() {
  for (const item of COST_ITEMS) {
    await prisma.costItem.upsert({ where: { code: item.code }, update: {}, create: item });
  }
  console.log(`Cost items: ${COST_ITEMS.length}`);

  for (const rule of CONVERSION_RULES) {
    await prisma.unitConversionRule.upsert({
      where: {
        measurementType_fromUnit_toUnit: {
          measurementType: rule.measurementType,
          fromUnit: rule.fromUnit,
          toUnit: rule.toUnit,
        },
      },
      update: {},
      create: { ...rule, isSystem: true, updatedBy: SEED_USER },
    });
  }
  console.log(`Conversion rules: ${CONVERSION_RULES.length}`);

  // Standard formulas: created once, never overwritten (changes are made in the app, versioned).
  for (const f of STANDARD_FORMULAS) {
    await prisma.standardFormula.upsert({ where: { code: f.code }, update: {}, create: { ...f, edgeRule: f.edgeRule ?? null, updatedBy: SEED_USER } });
  }
  console.log(`Standard formulas: ${STANDARD_FORMULAS.length}`);

  const bp = BRIGHTON_PARK;
  const existing = await prisma.project.findUnique({ where: { code: bp.project.code } });
  if (existing) {
    console.log(`Reference project ${bp.project.code} already exists — left as is.`);
    return;
  }

  const items = await prisma.costItem.findMany();
  const itemId = (code: string) => items.find((i) => i.code === code)!.id;

  await prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        ...bp.project,
        createdBy: SEED_USER,
        slabSpec: { create: { ...bp.slabSpec, updatedBy: SEED_USER } },
        packing: { create: { ...bp.packing, updatedBy: SEED_USER } },
        slabInput: {
          create: {
            optimizerSlabs: bp.slab.optimizerSlabs,
            sourceNote: bp.slab.sourceNote,
            kerfIn: bp.slab.kerfIn,
            updatedBy: SEED_USER,
            adjustments: { create: bp.slab.adjustments.map((a, i) => ({ ...a, sortOrder: i })) },
            drivers: { create: bp.slab.drivers.map((d, i) => ({ ...d, sortOrder: i })) },
          },
        },
        costInputs: {
          create: bp.rates.map((r) => ({
            costItemId: itemId(r.code),
            label: r.label,
            myCostMode: r.myCostMode,
            myCost: r.myCost,
            customerChargeMode: r.customerChargeMode,
            customerCharge: r.customerCharge,
            note: r.note,
            updatedBy: SEED_USER,
          })),
        },
        notes: { create: bp.notes.map((n, i) => ({ ...n, sortOrder: i, createdBy: SEED_USER })) },
      },
    });

    const groupNames = [...new Set(bp.pieces.map((p) => p.group))];
    const groups = new Map<string, string>();
    for (const name of groupNames) {
      const g = await tx.drawingGroup.create({ data: { projectId: project.id, name } });
      groups.set(name, g.id);
    }

    const batch = await tx.importBatch.create({
      data: {
        projectId: project.id,
        fileName: "2_Drawing_Summary.xlsx",
        sheetName: "Drawing Summary",
        mode: "REPLACE",
        status: "IMPORTED",
        rowsRead: bp.pieces.length,
        rowsImported: bp.pieces.length,
        report: { note: "Seeded from the reference workbook." },
        createdBy: SEED_USER,
      },
    });

    await tx.drawingPiece.createMany({
      data: bp.pieces.map((p, i) => ({
        projectId: project.id,
        groupId: groups.get(p.group)!,
        importBatchId: batch.id,
        source: "IMPORT" as const,
        sortOrder: (i + 1) * 10,
        dwgNo: p.dwgNo,
        area: p.area,
        pieceNo: p.pieceNo,
        description: p.description,
        length: p.length,
        width: p.width,
        dimUnit: "IN" as const,
        thickness: p.thickness,
        color: p.color,
        sinkModel: p.sinkModel,
        sinkCuts: p.sinkCuts,
        faucetHoles: p.faucetHoles,
        rCorners: p.rCorners,
        joints: p.joints,
        unitsQty: p.unitsQty,
        cuttingRule: "FULL_PERIMETER" as const,
        depRule: p.depRule,
        notes: p.notes,
        createdBy: SEED_USER,
      })),
    });

    await tx.auditLog.create({
      data: {
        projectId: project.id,
        entityType: "Project",
        entityId: project.id,
        action: "CREATE",
        summary: `Seeded reference project ${bp.project.code} (${bp.pieces.length} pieces)`,
        userName: SEED_USER,
      },
    });
    console.log(`Reference project ${bp.project.code}: ${bp.pieces.length} pieces`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

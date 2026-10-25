import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { DEFAULT_EDGE_RULES, STANDARD_FORMULAS, type EdgeDefaults } from "@/lib/reference/standard-formulas";

/**
 * The stored standard formulas. Missing rows are created from the reference
 * definitions (an existing database gets them without a re-seed); stored rows
 * are never overwritten here, so an authorised change stays in force.
 */
export const getStandardFormulas = cache(async () => {
  const rows = await prisma.standardFormula.findMany({ orderBy: { sortOrder: "asc" } });
  const have = new Set(rows.map((r) => r.code));
  const missing = STANDARD_FORMULAS.filter((f) => !have.has(f.code));
  if (missing.length === 0) return rows;
  await prisma.standardFormula.createMany({
    data: missing.map((f) => ({ ...f, edgeRule: f.edgeRule ?? null, updatedBy: "System" })),
    skipDuplicates: true,
  });
  return prisma.standardFormula.findMany({ orderBy: { sortOrder: "asc" } });
});

/** Edge rules new uploads and manual entries start from. */
export async function getEdgeDefaults(): Promise<EdgeDefaults> {
  const rows = await getStandardFormulas();
  const rule = (code: string) => rows.find((r) => r.code === code)?.edgeRule ?? null;
  return {
    cuttingRule: rule("CUTTING_LF") ?? DEFAULT_EDGE_RULES.cuttingRule,
    depRule: rule("DEP_LF") ?? DEFAULT_EDGE_RULES.depRule,
    islandDepRule: rule("DEP_LF_ISLAND") ?? DEFAULT_EDGE_RULES.islandDepRule,
  };
}

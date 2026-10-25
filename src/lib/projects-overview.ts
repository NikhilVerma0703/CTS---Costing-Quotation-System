import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { num } from "@/lib/utils";
import { projectStatus, type ProjectStatus } from "@/lib/status";
import type { EngineResult } from "@/lib/engine/types";

export interface ProjectOverview {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  versionLabel: string | null;
  currency: string;
  updatedAt: Date;
  createdAt: Date;
  revisions: number;
  latestRevision: { revisionNo: number; quoteNumber: string; totalQuote: number; totalInternalCost: number; issuedAt: Date } | null;
  result: EngineResult;
  status: ProjectStatus;
}

/** Every live project with its current calculation and derived status — once per request. */
export const getProjectsOverview = cache(async (): Promise<ProjectOverview[]> => {
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { revisions: true } },
      revisions: { orderBy: { revisionNo: "desc" }, take: 1 },
    },
  });
  return Promise.all(
    projects.map(async (p) => {
      const { result } = await getProjectCalculation(p.id);
      const rev = p.revisions[0];
      const latestRevision = rev
        ? {
            revisionNo: rev.revisionNo,
            quoteNumber: rev.quoteNumber,
            totalQuote: num(rev.totalQuote)!,
            totalInternalCost: num(rev.totalInternalCost)!,
            issuedAt: rev.issuedAt,
          }
        : null;
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        customerName: p.customerName,
        versionLabel: p.versionLabel,
        currency: p.currency,
        updatedAt: p.updatedAt,
        createdAt: p.createdAt,
        revisions: p._count.revisions,
        latestRevision,
        result,
        status: projectStatus({
          stored: p.status,
          pieceRows: result.drawingTotals.pieceRows,
          issues: result.issues,
          ready: result.ready,
          liveQuote: result.summary.totalQuote,
          currency: p.currency,
          latestRevision,
        }),
      };
    }),
  );
});

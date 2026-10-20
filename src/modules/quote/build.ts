import "server-only";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { toCustomerView } from "@/lib/engine/customer-view";
import type { EngineInput, EngineResult } from "@/lib/engine/types";
import { companyFromEnv, quoteNumberFor, type QuoteDocData, type QuoteOptions } from "@/lib/pdf/quote-data";

/** Quote document data from the CURRENT inputs (always the latest valid values). */
export async function buildLiveQuote(
  projectId: string,
  options: QuoteOptions,
  revisionNo?: number,
): Promise<{ data: QuoteDocData; input: EngineInput; result: EngineResult }> {
  const [project, notes, lastRev, { input, result }] = await Promise.all([
    prisma.project.findFirstOrThrow({ where: { id: projectId, deletedAt: null } }),
    prisma.projectNote.findMany({
      where: { projectId, deletedAt: null, visibility: "CUSTOMER" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.quoteRevision.findFirst({ where: { projectId }, orderBy: { revisionNo: "desc" } }),
    getProjectCalculation(projectId),
  ]);
  const issuedAt = new Date();
  const validUntil = new Date(issuedAt.getTime() + project.validityDays * 86_400_000);
  const nextNo = (lastRev?.revisionNo ?? 0) + 1;
  const isDraft = revisionNo === undefined;
  const data: QuoteDocData = {
    company: companyFromEnv(),
    project: {
      code: project.code,
      name: project.name,
      customerName: project.customerName,
      siteAddress: project.siteAddress,
      contactName: project.contactName,
      contactEmail: project.contactEmail,
      versionLabel: project.versionLabel,
    },
    quoteNumber: isDraft ? `${quoteNumberFor(project.code, nextNo)} (draft)` : quoteNumberFor(project.code, revisionNo),
    revisionNo: revisionNo ?? null,
    isDraft,
    issuedAt: issuedAt.toISOString(),
    validUntil: validUntil.toISOString(),
    view: toCustomerView(result, { currency: project.currency, materialBasis: input.slabSpec?.materialBasis ?? null }),
    notes: notes.map((n) => n.text),
    options,
  };
  return { data, input, result };
}

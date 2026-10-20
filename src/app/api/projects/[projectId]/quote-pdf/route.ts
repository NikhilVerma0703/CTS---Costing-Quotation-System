import { renderToBuffer } from "@react-pdf/renderer";
import { prisma } from "@/lib/db";
import { QuoteDocument } from "@/lib/pdf/QuoteDocument";
import { parseOptions, type QuoteDocData } from "@/lib/pdf/quote-data";
import { buildLiveQuote } from "@/modules/quote/build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/projects/:id/quote-pdf            → draft PDF from the current (latest) inputs
 * GET /api/projects/:id/quote-pdf?rev=2      → exact PDF of issued revision 2 (from its snapshot)
 * Options: schedule=0 hides the piece schedule, split=1 shows fabrication/material lines.
 * &download=1 sends it as an attachment.
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const url = new URL(req.url);
  const rev = url.searchParams.get("rev");

  let data: QuoteDocData;
  if (rev) {
    const revision = await prisma.quoteRevision.findFirst({ where: { projectId, revisionNo: Number(rev) } });
    if (!revision) return new Response("Revision not found", { status: 404 });
    data = revision.quoteSnapshot as unknown as QuoteDocData;
  } else {
    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } });
    if (!project) return new Response("Project not found", { status: 404 });
    const live = await buildLiveQuote(projectId, parseOptions(url.searchParams));
    if (!live.result.ready) {
      return new Response(
        "The quote can't be produced yet:\n- " + live.data.view.blockingIssues.join("\n- "),
        { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }
    data = live.data;
  }

  const pdf = await renderToBuffer(QuoteDocument({ data }));
  const name = `${data.quoteNumber.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+$/, "")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${url.searchParams.get("download") === "1" ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}

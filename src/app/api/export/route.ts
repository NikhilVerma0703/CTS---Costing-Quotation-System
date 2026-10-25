import { renderToBuffer } from "@react-pdf/renderer";
import { buildExport, isScope, QuoteNotReady } from "@/lib/export/sections";
import { exportToXlsx } from "@/lib/export/xlsx";
import { ExportDocument } from "@/lib/export/pdf";
import { companyFromEnv } from "@/lib/pdf/quote-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export?scope=<section>&project=<id>&format=xlsx|pdf
 * Sections: inputs, cost-inputs, internal-costing, customer-charges,
 * slab-calculation, project-summary, final-quote; and projects, dashboard.
 * Always built from the current inputs. The customer quote PDF itself is
 * /api/projects/:id/quote-pdf.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope");
  const projectId = url.searchParams.get("project");
  const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
  if (!isScope(scope)) return new Response("Unknown export", { status: 400 });

  if (scope === "final-quote" && format === "pdf" && projectId) {
    return Response.redirect(new URL(`/api/projects/${projectId}/quote-pdf?download=1`, url), 302);
  }

  let doc;
  try {
    doc = await buildExport(scope, projectId);
  } catch (e) {
    if (e instanceof QuoteNotReady) return new Response(e.message, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    if (e instanceof Error && /NEXT_(HTTP_ERROR|NOT_FOUND)/.test(e.message + String((e as { digest?: string }).digest))) {
      return new Response("Project not found", { status: 404 });
    }
    throw e;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "xlsx") {
    const buf = await exportToXlsx(doc);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${doc.fileBase}_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }
  const pdf = await renderToBuffer(ExportDocument({ doc, company: companyFromEnv().name }));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.fileBase}_${stamp}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

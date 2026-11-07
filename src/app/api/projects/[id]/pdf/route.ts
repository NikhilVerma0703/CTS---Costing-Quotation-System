import { prisma, readData } from "@/lib/db";
import { buildQuotePdf } from "@/lib/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The customer quotation, from the current figures. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return new Response("Project not found", { status: 404 });
  const { buffer, fileName } = await buildQuotePdf(readData(project.data), id.slice(-6).toUpperCase());
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${fileName}"`, "Cache-Control": "no-store" },
  });
}

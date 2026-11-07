import { prisma, readData } from "@/lib/db";
import { buildWorkbook, workbookFileName } from "@/lib/export-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All seven sheets, with live formulas. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return new Response("Project not found", { status: 404 });
  const data = readData(project.data);
  const buffer = await buildWorkbook(data);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${workbookFileName(data)}"`,
      "Cache-Control": "no-store",
    },
  });
}

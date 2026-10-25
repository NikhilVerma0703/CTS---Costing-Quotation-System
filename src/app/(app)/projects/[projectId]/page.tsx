import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

/** Opening a project: its inputs until a drawing is uploaded, then the summary. */
export default async function ProjectIndex({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const pieces = await prisma.drawingPiece.count({ where: { projectId, deletedAt: null } });
  redirect(`/projects/${projectId}/${pieces ? "project-summary" : "import-drawing"}`);
}

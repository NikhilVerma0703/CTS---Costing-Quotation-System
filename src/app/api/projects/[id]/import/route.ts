import { NextResponse } from "next/server";
import { prisma, readData } from "@/lib/db";
import { replaceDrawing, replaceVariables } from "@/lib/import";

export const runtime = "nodejs";

/**
 * A new Drawing Summary or Variables sheet for an open project. Returns the new
 * document; the page applies it (so Undo can take it back) and autosaves.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ errors: ["This project no longer exists."] }, { status: 404 });
  const form = await req.formData();
  const value = form.get("file");
  if (!value || typeof value === "string" || value.size === 0) return NextResponse.json({ errors: ["Choose a file."] }, { status: 400 });
  const file = { name: value.name, data: await value.arrayBuffer() };
  const currentText = form.get("current");
  const current = readData(typeof currentText === "string" && currentText ? JSON.parse(currentText) : project.data);
  const mappingText = form.get("mapping");
  const mapping = typeof mappingText === "string" && mappingText ? JSON.parse(mappingText) : undefined;
  const result = form.get("kind") === "variables" ? await replaceVariables(current, file) : await replaceDrawing(current, file, mapping);
  return NextResponse.json(result, { status: result.errors.length ? 400 : 200 });
}

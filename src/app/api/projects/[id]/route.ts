import { NextResponse } from "next/server";
import { asJson, prisma, readData } from "@/lib/db";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Autosave: the whole document, on every edit. */
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const data = readData(await req.json());
  const updated = await prisma.project.updateMany({ where: { id }, data: { name: data.meta.name || "Untitled costing", data: asJson(data) } });
  if (updated.count === 0) return NextResponse.json({ error: "This project no longer exists." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.project.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
}

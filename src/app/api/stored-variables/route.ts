import { NextResponse } from "next/server";
import { asJson, prisma } from "@/lib/db";
import { variablesForReuse, type Variables } from "@/lib/model";

export const runtime = "nodejs";

/** "Save as stored rate card": these rates start the next project that has no Variables sheet. */
export async function PUT(req: Request) {
  const variables = variablesForReuse((await req.json()) as Variables);
  for (const r of variables.rates) delete r.needsConfirm;
  await prisma.storedVariables.upsert({ where: { id: "default" }, create: { id: "default", data: asJson(variables) }, update: { data: asJson(variables) } });
  return NextResponse.json({ ok: true });
}

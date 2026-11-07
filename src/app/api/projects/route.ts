import { NextResponse } from "next/server";
import { asJson, getStoredVariables, prisma, readData } from "@/lib/db";
import { calculate } from "@/lib/engine";
import { importProject, type UploadFile } from "@/lib/import";
import { variablesForNewDrawing, variablesForReuse, type ProjectData } from "@/lib/model";
import { projectTitle, sameTitle, withCustomerDetails } from "@/lib/quote-details";

export const runtime = "nodejs";

async function toUpload(value: FormDataEntryValue | null): Promise<UploadFile | undefined> {
  if (!value || typeof value === "string" || value.size === 0) return undefined;
  return { name: value.name, data: await value.arrayBuffer() };
}

/** An existing project this upload is another version of. Rates and customer details pass between them, so this errs towards "no". */
async function sameProject(upload: ProjectData) {
  const projects = await prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  for (const p of projects) {
    const data = readData(p.data);
    if (sameTitle(projectTitle(upload.meta), projectTitle(data.meta))) return { name: p.name, data };
  }
  return null;
}

/** That project's rates carry over; its slab inputs too if the drawing still totals the same sqft, because then the CutList results still apply. */
function ratesFrom(same: { name: string; data: ProjectData }, upload: ProjectData) {
  const sameDrawing = Math.abs(calculate(same.data).drawing.sqft - calculate(upload).drawing.sqft) <= 0.01;
  return {
    fallback: sameDrawing ? same.data.variables : variablesForNewDrawing(same.data.variables),
    fallbackFits: true,
    fallbackLabel: `the rates from "${same.name}"`,
  };
}

/** New costing: Drawing Summary (required) + Variables sheet (optional), or a stored rate card. */
export async function POST(req: Request) {
  const form = await req.formData();
  const drawing = await toUpload(form.get("drawing"));
  if (!drawing) return NextResponse.json({ errors: ["Choose a Drawing Summary sheet."] }, { status: 400 });
  const variables = await toUpload(form.get("variables"));

  // Which saved variables to use when no Variables sheet comes with the upload.
  const from = String(form.get("variablesFrom") ?? "auto");
  let fallback = variablesForReuse(await getStoredVariables());
  let fallbackLabel = "the stored rate card";
  if (from !== "stored" && from !== "auto") {
    const source = await prisma.project.findUnique({ where: { id: from } });
    if (source) {
      fallback = variablesForReuse(readData(source.data).variables);
      fallbackLabel = `the rates from "${source.name}"`;
    }
  }

  const mappingText = form.get("mapping");
  const options = {
    name: String(form.get("name") ?? ""),
    mapping: typeof mappingText === "string" && mappingText ? JSON.parse(mappingText) : undefined,
  };
  let result = await importProject({ drawing, variables }, { ...options, fallback, fallbackLabel });

  // The same project's own variables are the appropriate ones, when it is already here.
  const same = result.data ? await sameProject(result.data) : null;
  if (result.data && same && result.usedFallback && from === "auto") result = await importProject({ drawing, variables }, { ...options, ...ratesFrom(same, result.data) });
  if (!result.data) return NextResponse.json({ errors: result.errors, mappingNeeded: result.mappingNeeded }, { status: result.mappingNeeded ? 200 : 400 });

  const data = withCustomerDetails(result.data, same && { meta: same.data.meta });
  const project = await prisma.project.create({ data: { name: data.meta.name, data: asJson(data) } });
  return NextResponse.json({ id: project.id });
}

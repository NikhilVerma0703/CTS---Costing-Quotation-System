/**
 * Sets up the stored rate card and loads the three reference workbooks as
 * projects, through the same importer an upload uses. Safe to re-run: it never
 * overwrites a saved rate card or a project that already exists, and only fills
 * customer details that are still blank.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@prisma/client";
import { importProject } from "../src/lib/import";
import { DEFAULT_VARIABLES, type ProjectData } from "../src/lib/model";
import { agreedDetails, fillBlanks } from "../src/lib/quote-details";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const REFERENCE = ["Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx", "Project_1633_The_Approach_Quote.xlsx", "Peoria_Gateway_Quote_Ver10.xlsx"];

async function main() {
  await prisma.storedVariables.upsert({
    where: { id: "default" },
    create: { id: "default", data: DEFAULT_VARIABLES as unknown as Prisma.InputJsonValue },
    update: {},
  });
  console.log("Stored rate card ready.");

  for (const file of REFERENCE) {
    const buf = readFileSync(path.join(process.cwd(), "reference-sheets", file));
    const result = await importProject({ drawing: { name: file, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer } }, { fallback: DEFAULT_VARIABLES });
    if (!result.data) throw new Error(`${file}: ${result.errors.join("; ")}`);
    const name = result.data.meta.name;
    const details = agreedDetails(result.data.meta)?.details ?? {};
    const existing = await prisma.project.findFirst({ where: { name } });
    if (existing) {
      const stored = existing.data as unknown as ProjectData;
      const meta = fillBlanks(stored.meta, details);
      if (JSON.stringify(meta) !== JSON.stringify(stored.meta)) {
        await prisma.project.update({ where: { id: existing.id }, data: { data: { ...stored, meta } as unknown as Prisma.InputJsonValue } });
        console.log(`Filled in customer details: ${name}`);
      } else console.log(`Already there: ${name}`);
      continue;
    }
    const meta = fillBlanks(result.data.meta, details);
    await prisma.project.create({ data: { name, data: { ...result.data, meta, importNotes: [] } as unknown as Prisma.InputJsonValue } });
    console.log(`Loaded: ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

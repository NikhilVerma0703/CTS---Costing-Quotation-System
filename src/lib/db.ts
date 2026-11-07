import "server-only";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { DEFAULT_VARIABLES, emptyProject, type ProjectData, type Variables } from "./model";

/**
 * One Prisma client per server process. It runs through the `pg` driver adapter,
 * so the same code talks to local PostgreSQL and to Neon.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }), log: ["error"] });
}

export const prisma = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export const asJson = (value: unknown) => value as Prisma.InputJsonValue;

/** A saved document with today's defaults filled in, so older projects keep opening as the model grows. */
export function readData(json: unknown): ProjectData {
  const blank = emptyProject();
  const stored = (json ?? {}) as Partial<ProjectData>;
  return {
    ...blank,
    ...stored,
    meta: { ...blank.meta, ...stored.meta },
    show: { ...blank.show, ...stored.show },
    variables: { ...blank.variables, ...stored.variables },
    overrides: { ...blank.overrides, ...stored.overrides },
  };
}

export async function getStoredVariables(): Promise<Variables> {
  const row = await prisma.storedVariables.findUnique({ where: { id: "default" } });
  return row ? { ...DEFAULT_VARIABLES, ...(row.data as unknown as Partial<Variables>) } : structuredClone(DEFAULT_VARIABLES);
}

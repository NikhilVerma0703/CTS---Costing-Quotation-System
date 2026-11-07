import { Home, type ProjectRow } from "@/components/Home";
import { prisma, readData } from "@/lib/db";
import { calculate } from "@/lib/engine";

export const dynamic = "force-dynamic";

export default async function Page() {
  const projects = await prisma.project.findMany({ orderBy: { updatedAt: "desc" } });
  const rows: ProjectRow[] = projects.map((p) => {
    const r = calculate(readData(p.data));
    return {
      id: p.id,
      name: p.name,
      updatedAt: p.updatedAt.toISOString(),
      pieces: r.drawing.pcs,
      sqft: r.drawing.sqft,
      internal: r.summary.totalInternal,
      customer: r.summary.totalCustomer,
      marginPct: r.summary.marginPct,
      estimated: r.summary.slabsEstimated,
    };
  });
  return <Home projects={rows} />;
}

import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { currentUserName } from "@/lib/audit";
import { AppShell, type ShellProject } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

/** Every CTS page — the projects list and all project sections — sits in this shell. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [projects, jar] = await Promise.all([
    prisma.project.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" } }),
    cookies(),
  ]);
  const shellProjects: ShellProject[] = await Promise.all(
    projects.map(async (p) => {
      const { result } = await getProjectCalculation(p.id);
      return {
        id: p.id,
        code: p.code,
        name: p.name,
        customerName: p.customerName,
        ready: result.ready,
        errorCount: result.issues.filter((i) => i.severity === "error").length,
      };
    }),
  );
  const remembered = jar.get("cts-project")?.value;
  const fallback = shellProjects.find((p) => p.id === remembered)?.id ?? shellProjects[0]?.id ?? null;

  return (
    <AppShell projects={shellProjects} fallbackProjectId={fallback} userName={currentUserName()}>
      {children}
    </AppShell>
  );
}

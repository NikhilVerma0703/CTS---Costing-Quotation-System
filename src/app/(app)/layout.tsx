import { cookies } from "next/headers";
import { getProjectsOverview } from "@/lib/projects-overview";
import { currentUserName } from "@/lib/audit";
import { AppShell, type ShellProject } from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

/** Every CTS page — the projects list, dashboard and all project sections — sits in this shell. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [projects, jar] = await Promise.all([getProjectsOverview(), cookies()]);
  const shellProjects: ShellProject[] = projects.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    customerName: p.customerName,
    statusLabel: p.status.label,
    quoteLabel: p.status.quote.label,
    ready: p.result.ready,
  }));
  const remembered = jar.get("cts-project")?.value;
  const fallback = shellProjects.find((p) => p.id === remembered)?.id ?? shellProjects[0]?.id ?? null;

  return (
    <AppShell projects={shellProjects} fallbackProjectId={fallback} userName={currentUserName()}>
      {children}
    </AppShell>
  );
}

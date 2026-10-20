import { getProject } from "@/lib/engine/load";

export const dynamic = "force-dynamic";

/** Validates the project (404 for unknown / removed ids); the shell is in (app)/layout. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await getProject(projectId);
  return children;
}

import { redirect } from "next/navigation";

/** The internal summary is a tab of Internal Costing. */
export default async function InternalSummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/internal-costing?view=summary`);
}

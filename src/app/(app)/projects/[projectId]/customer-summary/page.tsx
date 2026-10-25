import { redirect } from "next/navigation";

/** The customer summary is a tab of Customer Charges. */
export default async function CustomerSummaryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/customer-charges?view=summary`);
}

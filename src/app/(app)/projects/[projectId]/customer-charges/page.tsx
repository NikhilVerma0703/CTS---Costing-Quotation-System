import type { Metadata } from "next";
import { CostingView } from "@/components/costing/CostingView";

export const metadata: Metadata = { title: "Customer Charges" };

export default async function CustomerChargesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ projectId }, { view }] = await Promise.all([params, searchParams]);
  return <CostingView projectId={projectId} side="customer" view={view} />;
}

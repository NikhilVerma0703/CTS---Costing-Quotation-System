import type { Metadata } from "next";
import { CostingView } from "@/components/costing/CostingView";

export const metadata: Metadata = { title: "Internal Costing" };

export default async function InternalCostingPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ projectId }, { view }] = await Promise.all([params, searchParams]);
  return <CostingView projectId={projectId} side="internal" view={view} />;
}

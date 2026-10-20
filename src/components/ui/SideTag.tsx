import { cn } from "@/lib/utils";

/** Marks a page or block as internal (My Cost) or customer-facing. */
export function SideTag({ side, className }: { side: "internal" | "customer"; className?: string }) {
  return side === "internal" ? (
    <span className={cn("badge bg-internal-bg text-internal", className)}>Internal · not for customer</span>
  ) : (
    <span className={cn("badge bg-customer-bg text-customer", className)}>Customer-facing</span>
  );
}

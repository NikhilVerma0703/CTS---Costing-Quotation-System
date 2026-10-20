import { cn } from "@/lib/utils";

export function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "internal" | "customer" | "warn";
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "card px-4 py-3",
        tone === "internal" && "border-internal/25",
        tone === "customer" && "border-customer/30",
        tone === "warn" && "border-warn-fg/30 bg-warn-bg",
        emphasis && tone === "internal" && "bg-internal-bg",
        emphasis && tone === "customer" && "bg-customer-bg",
      )}
    >
      <p className="text-[12px] font-semibold text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-1 font-bold tabular-nums",
          emphasis ? "text-2xl" : "text-lg",
          tone === "internal" && "text-internal",
          tone === "customer" && "text-customer",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

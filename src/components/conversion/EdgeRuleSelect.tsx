"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setPieceEdgeRules } from "@/modules/conversion/actions";
import type { EdgeRule } from "@/lib/engine/types";

const SHORT: Record<EdgeRule, string> = { FULL_PERIMETER: "2 × (L + W)", ONE_LENGTH_ONE_WIDTH: "(L + W)", NONE: "0" };

/** Inline switch of a piece's Cutting or DE&P edge rule. */
export function EdgeRuleSelect({
  projectId,
  pieceId,
  cuttingRule,
  depRule,
  which,
}: {
  projectId: string;
  pieceId: string;
  cuttingRule: EdgeRule;
  depRule: EdgeRule;
  which: "cutting" | "dep";
}) {
  const [pending, start] = useTransition();
  const value = which === "cutting" ? cuttingRule : depRule;
  return (
    <select
      aria-label={which === "cutting" ? "Cutting LF rule" : "DE&P LF rule"}
      className="input input-sm w-auto min-w-28 font-mono"
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as EdgeRule;
        start(async () => {
          const res = await setPieceEdgeRules(projectId, pieceId, which === "cutting" ? { cuttingRule: next, depRule } : { cuttingRule, depRule: next });
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        });
      }}
    >
      {(Object.keys(SHORT) as EdgeRule[]).map((k) => (
        <option key={k} value={k}>
          {SHORT[k]}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { saveRule, type RuleInput } from "@/modules/conversion/actions";
import { cn } from "@/lib/utils";

export interface RuleRow extends RuleInput {
  id: string;
  isSystem: boolean;
  usedBy: string | null;
}

const fmt = (n: unknown) => {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : String(+v.toPrecision(10));
};

export function RulesTable({ rules }: { rules: RuleRow[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="th">Type</th>
            <th className="th">From</th>
            <th className="th">To</th>
            <th className="th">Formula</th>
            <th className="th num">× Multiplier</th>
            <th className="th num">÷ Divisor</th>
            <th className="th">Description</th>
            <th className="th">Used for</th>
            <th className="th">Status</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>
          {rules.map((r) =>
            editing === r.id ? (
              <RuleEditor key={r.id} rule={r} onDone={() => setEditing(null)} />
            ) : (
              <tr key={r.id} className={cn("hover:bg-shell", !r.isActive && "text-ink-3")}>
                <td className="td">{r.measurementType === "LENGTH" ? "Length" : "Area"}</td>
                <td className="td font-semibold">{r.fromUnit}</td>
                <td className="td font-semibold">{r.toUnit}</td>
                <td className="td">
                  <code className="font-mono text-[12px]">
                    {r.toUnit} = {r.fromUnit}
                    {Number(r.multiplier) !== 1 && ` × ${fmt(r.multiplier)}`} ÷ {fmt(r.divisor)}
                  </code>
                </td>
                <td className="td num">{fmt(r.multiplier)}</td>
                <td className="td num">{fmt(r.divisor)}</td>
                <td className="td">{r.description}</td>
                <td className="td text-xs">{r.usedBy ?? <span className="text-ink-3">—</span>}</td>
                <td className="td">
                  <span className={cn("badge", r.isActive ? "bg-ok-bg text-ok-fg" : "bg-mute-bg text-mute-fg")}>
                    {r.isActive ? "Active" : "Disabled"}
                  </span>
                  {r.isSystem && <span className="badge ml-1 bg-info-bg text-info-fg">System</span>}
                </td>
                <td className="td">
                  <button type="button" className="icon-btn" aria-label="Edit rule" onClick={() => setEditing(r.id)}>
                    <Pencil className="size-4" />
                  </button>
                </td>
              </tr>
            ),
          )}
          {adding ? (
            <RuleEditor onDone={() => setAdding(false)} />
          ) : (
            <tr>
              <td className="td" colSpan={10}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> Add conversion rule
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function RuleEditor({ rule, onDone }: { rule?: RuleRow; onDone: () => void }) {
  const [v, setV] = useState<RuleInput>(
    rule ?? { measurementType: "LENGTH", fromUnit: "", toUnit: "ft", multiplier: 1, divisor: 1, description: "", isActive: true },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const lockUnits = rule?.isSystem;

  const save = () =>
    start(async () => {
      const res = await saveRule(rule?.id ?? null, v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      onDone();
    });

  const cls = (k: string) => cn("input input-sm", errors[k] && "input-error");
  return (
    <tr className="bg-info-bg/40">
      <td className="td">
        <select className="input input-sm" disabled={lockUnits} value={v.measurementType} onChange={(e) => setV({ ...v, measurementType: e.target.value as "LENGTH" | "AREA" })}>
          <option value="LENGTH">Length</option>
          <option value="AREA">Area</option>
        </select>
      </td>
      <td className="td">
        <input className={cls("fromUnit")} disabled={lockUnits} value={v.fromUnit} placeholder="in" onChange={(e) => setV({ ...v, fromUnit: e.target.value })} />
      </td>
      <td className="td">
        <input className={cls("toUnit")} disabled={lockUnits} value={v.toUnit} onChange={(e) => setV({ ...v, toUnit: e.target.value })} />
      </td>
      <td className="td text-xs text-ink-3">value × multiplier ÷ divisor</td>
      <td className="td">
        <input type="number" step="any" className={cn(cls("multiplier"), "w-24 text-right")} value={String(v.multiplier)} onChange={(e) => setV({ ...v, multiplier: e.target.value })} />
      </td>
      <td className="td">
        <input type="number" step="any" className={cn(cls("divisor"), "w-28 text-right")} value={String(v.divisor)} onChange={(e) => setV({ ...v, divisor: e.target.value })} />
      </td>
      <td className="td" colSpan={2}>
        <input className="input input-sm" value={v.description ?? ""} onChange={(e) => setV({ ...v, description: e.target.value })} />
      </td>
      <td className="td">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Active
        </label>
      </td>
      <td className="td whitespace-nowrap">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>
          Save
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

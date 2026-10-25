"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Link2, Pencil, Plus } from "lucide-react";
import { addCostItem, updateCostInput, type CostInputValues, type NewItemValues } from "@/modules/cost-inputs/actions";
import { cn } from "@/lib/utils";

export interface CostInputRowView {
  id: string;
  code: string;
  itemName: string;
  label: string;
  unitLabel: string;
  driverLabel: string;
  isMaterial: boolean;
  myCostMode: "MANUAL" | "PACKING_PER_SQFT";
  myCost: number | null;
  customerChargeMode: "MANUAL" | "SAME_AS_MY_COST";
  customerCharge: number | null;
  /** Values the engine actually uses (after "same as" / "from packing"). */
  resolvedMy: number | null;
  resolvedCustomer: number | null;
  note: string;
  updatedAt: string;
  updatedBy: string | null;
}

const r4 = (v: number | null) =>
  v === null ? "—" : `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

const DRIVERS: [NewItemValues["driver"], string][] = [
  ["PIECE_SQFT", "Sqft/Pc"],
  ["CUTTING_LF", "Cutting LF"],
  ["DEP_LF", "DE&P LF"],
  ["SINK_CUTS", "Sink Cuts"],
  ["FAUCET_HOLES", "Faucet Holes"],
  ["R_CORNERS", "R-Corners"],
  ["JOINTS", "Joints"],
];

export function CostInputsTable({ projectId, rows }: { projectId: string; rows: CostInputRowView[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr>
            <th className="th">Unit</th>
            <th className="th">Cost Item</th>
            <th className="th num bg-internal-bg text-internal">My Cost</th>
            <th className="th num bg-customer-bg text-customer">Customer Charges</th>
            <th className="th num">Difference</th>
            <th className="th">Multiplies</th>
            <th className="th">Note</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            editing === r.id ? (
              <Editor key={r.id} projectId={projectId} row={r} onDone={() => setEditing(null)} />
            ) : (
              <tr key={r.id} className="hover:bg-shell">
                <td className="td whitespace-nowrap text-ink-2">{r.unitLabel}</td>
                <td className="td">
                  <p className="font-semibold">{r.label || r.itemName}</p>
                  {r.isMaterial && <p className="text-xs text-ink-3">Material — priced on slab basis in the Project Summary</p>}
                </td>
                <td className="td num bg-internal-bg/40">
                  <span className="font-semibold">{r4(r.resolvedMy)}</span>
                  {r.myCostMode === "PACKING_PER_SQFT" && (
                    <p className="flex items-center justify-end gap-1 text-[11px] text-internal">
                      <Link2 className="size-3" /> from packing calculation
                    </p>
                  )}
                </td>
                <td className="td num bg-customer-bg/40">
                  <span className="font-semibold">{r4(r.resolvedCustomer)}</span>
                  {r.customerChargeMode === "SAME_AS_MY_COST" && (
                    <p className="flex items-center justify-end gap-1 text-[11px] text-customer">
                      <Link2 className="size-3" /> same as My Cost
                    </p>
                  )}
                </td>
                <td className={cn("td num", r.resolvedMy !== null && r.resolvedCustomer !== null && r.resolvedCustomer < r.resolvedMy && "text-bad-fg")}>
                  {r.resolvedMy !== null && r.resolvedCustomer !== null ? r4(r.resolvedCustomer - r.resolvedMy) : "—"}
                </td>
                <td className="td whitespace-nowrap">{r.driverLabel}</td>
                <td className="td max-w-72 text-xs text-ink-2">{r.note}</td>
                <td className="td">
                  <button type="button" className="icon-btn" aria-label={`Edit ${r.label || r.itemName}`} onClick={() => setEditing(r.id)}>
                    <Pencil className="size-4" />
                  </button>
                </td>
              </tr>
            ),
          )}
          {adding ? (
            <NewItem projectId={projectId} onDone={() => setAdding(false)} />
          ) : (
            <tr>
              <td className="td" colSpan={8}>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> Add cost item
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Editor({ projectId, row, onDone }: { projectId: string; row: CostInputRowView; onDone: () => void }) {
  const [v, setV] = useState<CostInputValues>({
    label: row.label,
    myCostMode: row.myCostMode,
    myCost: row.myCost ?? "",
    customerChargeMode: row.customerChargeMode,
    customerCharge: row.customerCharge ?? "",
    note: row.note,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await updateCostInput(projectId, row.id, v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message, { duration: 6000 });
      onDone();
    });
  return (
    <tr className="bg-info-bg/40">
      <td className="td text-ink-2">{row.unitLabel}</td>
      <td className="td">
        <input className="input input-sm" value={String(v.label ?? "")} placeholder={row.itemName} onChange={(e) => setV({ ...v, label: e.target.value })} />
      </td>
      <td className="td bg-internal-bg/40">
        <select
          className="input input-sm mb-1"
          value={v.myCostMode}
          onChange={(e) => setV({ ...v, myCostMode: e.target.value as CostInputValues["myCostMode"] })}
        >
          <option value="MANUAL">Enter rate</option>
          <option value="PACKING_PER_SQFT">From packing calculation</option>
        </select>
        {v.myCostMode === "MANUAL" && (
          <input
            type="number"
            step="any"
            min={0}
            autoFocus
            className={cn("input input-sm text-right", errors.myCost && "input-error")}
            value={String(v.myCost ?? "")}
            onChange={(e) => setV({ ...v, myCost: e.target.value })}
          />
        )}
        {errors.myCost && <p className="text-xs text-bad-fg">{errors.myCost}</p>}
      </td>
      <td className="td bg-customer-bg/40">
        <select
          className="input input-sm mb-1"
          value={v.customerChargeMode}
          onChange={(e) => setV({ ...v, customerChargeMode: e.target.value as CostInputValues["customerChargeMode"] })}
        >
          <option value="MANUAL">Enter rate</option>
          <option value="SAME_AS_MY_COST">Same as My Cost</option>
        </select>
        {v.customerChargeMode === "MANUAL" && (
          <input
            type="number"
            step="any"
            min={0}
            className={cn("input input-sm text-right", errors.customerCharge && "input-error")}
            value={String(v.customerCharge ?? "")}
            onChange={(e) => setV({ ...v, customerCharge: e.target.value })}
          />
        )}
        {errors.customerCharge && <p className="text-xs text-bad-fg">{errors.customerCharge}</p>}
      </td>
      <td className="td" />
      <td className="td text-ink-2">{row.driverLabel}</td>
      <td className="td">
        <textarea rows={2} className="input input-sm" value={String(v.note ?? "")} placeholder="Reason for change, e.g. negotiated 18 Oct" onChange={(e) => setV({ ...v, note: e.target.value })} />
      </td>
      <td className="td whitespace-nowrap">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

function NewItem({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [v, setV] = useState<NewItemValues>({ name: "", unitLabel: "per sqft", driver: "PIECE_SQFT", myCost: "", customerCharge: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await addCostItem(projectId, v);
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message, { duration: 6000 });
      onDone();
    });
  const cls = (k: string) => cn("input input-sm", errors[k] && "input-error");
  return (
    <tr className="bg-info-bg/40">
      <td className="td">
        <input className={cls("unitLabel")} value={String(v.unitLabel)} onChange={(e) => setV({ ...v, unitLabel: e.target.value })} />
      </td>
      <td className="td">
        <input className={cls("name")} autoFocus placeholder="e.g. Sealing" value={String(v.name)} onChange={(e) => setV({ ...v, name: e.target.value })} />
        {errors.name && <p className="text-xs text-bad-fg">{errors.name}</p>}
      </td>
      <td className="td">
        <input type="number" step="any" min={0} className={cn(cls("myCost"), "text-right")} value={String(v.myCost)} onChange={(e) => setV({ ...v, myCost: e.target.value })} />
      </td>
      <td className="td">
        <input type="number" step="any" min={0} className={cn(cls("customerCharge"), "text-right")} value={String(v.customerCharge)} onChange={(e) => setV({ ...v, customerCharge: e.target.value })} />
      </td>
      <td className="td" />
      <td className="td">
        <select className="input input-sm" value={v.driver} onChange={(e) => setV({ ...v, driver: e.target.value as NewItemValues["driver"] })}>
          {DRIVERS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td className="td" />
      <td className="td whitespace-nowrap">
        <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>
          Add
        </button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

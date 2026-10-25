"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Lock, Pencil } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Field, inputClass } from "@/components/ui/Field";
import { changeEdgeFormula } from "@/modules/formulas/actions";
import { EDGE_RULE_LABEL } from "@/modules/drawing/schema";
import type { EdgeRule } from "@/lib/engine/types";

/** Authorised change of an edge formula: new rule + a reason, confirmed. */
export function EdgeFormulaEdit({ code, name, edgeRule }: { code: "CUTTING_LF" | "DEP_LF" | "DEP_LF_ISLAND"; name: string; edgeRule: EdgeRule }) {
  const [open, setOpen] = useState(false);
  const [rule, setRule] = useState<EdgeRule>(edgeRule);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await changeEdgeFormula({ code, edgeRule: rule, reason });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setOpen(false);
      setReason("");
    });

  return (
    <>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" /> Change
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Change standard formula — ${name}`}>
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
            <Lock className="mt-0.5 size-4 shrink-0" />
            Applies to every new upload and manual entry in all projects. Pieces already stored keep their current rule.
          </p>
          <Field label="Edges measured" htmlFor="rule">
            <select id="rule" className="input" value={rule} onChange={(e) => setRule(e.target.value as EdgeRule)}>
              {(Object.keys(EDGE_RULE_LABEL) as EdgeRule[]).map((r) => (
                <option key={r} value={r}>
                  {EDGE_RULE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason / approved by *" htmlFor="reason" error={errors.reason}>
            <textarea id="reason" rows={2} className={inputClass(errors.reason)} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={pending || rule === edgeRule} onClick={save}>
              {pending ? "Saving…" : "Confirm change"}
            </button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

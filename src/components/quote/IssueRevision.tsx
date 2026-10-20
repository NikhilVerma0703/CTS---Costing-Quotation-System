"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Stamp } from "lucide-react";
import { issueRevision } from "@/modules/quote/actions";

export function IssueRevision({
  projectId,
  ready,
  nextNumber,
  options,
}: {
  projectId: string;
  ready: boolean;
  nextNumber: string;
  options: { pieceSchedule: boolean; priceSplit: boolean };
}) {
  const [open, setOpen] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" className="btn-primary" disabled={!ready} onClick={() => setOpen(true)} title={ready ? "" : "Fix the problems listed first"}>
        <Stamp className="size-4" /> Issue {nextNumber}
      </button>
    );
  return (
    <div className="w-full rounded-lg border border-brand-2/30 bg-info-bg/40 p-3 sm:w-[420px]">
      <p className="text-sm font-semibold">Issue {nextNumber}</p>
      <p className="mt-0.5 text-xs text-ink-2">
        Freezes today&apos;s figures, drawings and rates as this revision. Later changes won&apos;t alter it; issue a new revision instead.
      </p>
      <textarea
        rows={2}
        className="input mt-2"
        placeholder="Remarks (optional), e.g. revised after rate negotiation"
        value={remarks}
        onChange={(e) => setRemarks(e.target.value)}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await issueRevision(projectId, { remarks, ...options });
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(res.message);
              setOpen(false);
              setRemarks("");
            })
          }
        >
          {pending ? "Issuing…" : "Issue revision"}
        </button>
      </div>
    </div>
  );
}

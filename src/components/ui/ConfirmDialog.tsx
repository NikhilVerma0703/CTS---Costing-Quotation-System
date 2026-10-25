"use client";

import { AlertTriangle } from "lucide-react";
import { Dialog } from "./Dialog";

/** Confirmation before a permanent action. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3 text-sm">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-bad-fg" />
        <div className="space-y-2 text-ink-2">{children}</div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button type="button" className="btn-danger" onClick={onConfirm} disabled={pending}>
          {pending ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

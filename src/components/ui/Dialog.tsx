"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** Native <dialog> modal: Esc and backdrop click close it. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** true = wide form; "full" = nearly the whole screen (editable tables). */
  wide?: boolean | "full";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100vw-2rem)] rounded-xl border border-line bg-white p-0 shadow-2xl ${wide === "full" ? "max-w-[96vw]" : wide ? "max-w-4xl" : "max-w-xl"}`}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-base font-bold">{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <X className="size-5" />
        </button>
      </div>
      <div className={`${wide === "full" ? "max-h-[84vh]" : "max-h-[75vh]"} overflow-y-auto px-5 py-4`}>{open && children}</div>
    </dialog>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Pencil, Trash2 } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { deleteImportBatch } from "@/modules/drawing/actions";
import { SheetEditor, type EditorRow } from "./SheetEditor";
import { cn } from "@/lib/utils";

export interface SheetRow {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string | null;
  mode: "APPEND" | "REPLACE";
  rowsImported: number;
  activePieces: number;
  extraColumns: string[];
  rows: EditorRow[];
}

/** Uploaded drawing sheets, with Edit (editable table) and permanent Delete. */
export function UploadedSheets({ projectId, sheets }: { projectId: string; sheets: SheetRow[] }) {
  const [editing, setEditing] = useState<SheetRow | null>(null);
  const [deleting, setDeleting] = useState<SheetRow | null>(null);
  const [pending, start] = useTransition();

  const remove = () =>
    start(async () => {
      if (!deleting) return;
      const res = await deleteImportBatch(projectId, deleting.id);
      if (res.ok) toast.success(res.message);
      else toast.error(res.error);
      setDeleting(null);
    });

  if (sheets.length === 0) return <p className="px-4 py-5 text-sm text-ink-3">No drawing sheet uploaded yet.</p>;

  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            <th className="th">Sheet</th>
            <th className="th">Uploaded</th>
            <th className="th num">Rows</th>
            <th className="th">Extra columns</th>
            <th className="th">Status</th>
            <th className="th" />
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => (
            <tr key={s.id} className="hover:bg-shell">
              <td className="td">
                <span className="flex items-center gap-2 font-semibold">
                  <FileSpreadsheet className="size-4 shrink-0 text-brand-2" /> {s.fileName}
                </span>
              </td>
              <td className="td whitespace-nowrap text-ink-2">
                {s.uploadedAt}
                {s.uploadedBy ? ` · ${s.uploadedBy}` : ""}
              </td>
              <td className="td num">{s.activePieces || s.rowsImported}</td>
              <td className="td max-w-64 truncate text-ink-2" title={s.extraColumns.join(", ")}>
                {s.extraColumns.length ? s.extraColumns.join(", ") : "—"}
              </td>
              <td className="td">
                <span className={cn("badge", s.activePieces ? "bg-ok-bg text-ok-fg" : "bg-mute-bg text-mute-fg")}>
                  {s.activePieces ? "In use" : "Replaced"}
                </span>
              </td>
              <td className="td whitespace-nowrap text-right">
                {s.activePieces > 0 && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(s)}>
                    <Pencil className="size-3.5" /> Edit
                  </button>
                )}
                <button type="button" className="btn-ghost btn-sm hover:text-bad-fg" onClick={() => setDeleting(s)}>
                  <Trash2 className="size-3.5" /> Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? `Edit sheet — ${editing.fileName}` : ""} wide="full">
        {editing && <SheetEditor projectId={projectId} batchId={editing.id} rows={editing.rows} extraColumns={editing.extraColumns} onDone={() => setEditing(null)} />}
      </Dialog>

      <ConfirmDialog
        open={!!deleting}
        title="Delete sheet permanently?"
        confirmLabel="Delete permanently"
        pending={pending}
        onConfirm={remove}
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <>
            <p>
              <b className="text-ink">{deleting.fileName}</b> and its {deleting.activePieces || deleting.rowsImported} piece
              {(deleting.activePieces || deleting.rowsImported) === 1 ? "" : "s"} will be removed from the database. Costing, slab area, summaries and the draft quote are recalculated
              without them.
            </p>
            <p>Other sheets, manually added pieces, rates, standard formulas and issued quote revisions are not affected. This can&apos;t be undone.</p>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}

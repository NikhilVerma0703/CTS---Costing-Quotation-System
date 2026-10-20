"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteNote, saveNote, type NoteValues } from "@/modules/notes/actions";
import { cn } from "@/lib/utils";

export interface NoteRow {
  id: string;
  text: string;
  visibility: "INTERNAL" | "CUSTOMER";
}

/** Notes & assumptions. Customer notes print on the quote PDF; internal ones never do. */
export function NotesEditor({ projectId, notes, visibility }: { projectId: string; notes: NoteRow[]; visibility: "INTERNAL" | "CUSTOMER" }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const list = notes.filter((n) => n.visibility === visibility);
  return (
    <div className="space-y-2">
      {list.length === 0 && editing !== "new" && <p className="text-sm text-ink-3">None yet.</p>}
      <ol className="space-y-1.5">
        {list.map((n, i) =>
          editing === n.id ? (
            <li key={n.id}>
              <NoteForm projectId={projectId} id={n.id} initial={n} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={n.id} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-shell">
              <span className="w-5 shrink-0 text-right text-ink-3">{i + 1}.</span>
              <span className="flex-1 whitespace-pre-line">{n.text}</span>
              <span className="flex shrink-0 gap-0.5 opacity-60 group-hover:opacity-100">
                <button type="button" className="icon-btn" aria-label="Edit note" onClick={() => setEditing(n.id)}>
                  <Pencil className="size-3.5" />
                </button>
                <Remove projectId={projectId} id={n.id} />
              </span>
            </li>
          ),
        )}
      </ol>
      {editing === "new" ? (
        <NoteForm projectId={projectId} id={null} initial={{ text: "", visibility }} onDone={() => setEditing(null)} />
      ) : (
        <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing("new")}>
          <Plus className="size-4" /> Add {visibility === "CUSTOMER" ? "customer note" : "internal note"}
        </button>
      )}
    </div>
  );
}

function NoteForm({ projectId, id, initial, onDone }: { projectId: string; id: string | null; initial: NoteValues; onDone: () => void }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-2 rounded-lg border border-brand-2/30 bg-info-bg/40 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await saveNote(projectId, id, v);
          if (!res.ok) {
            setErr(res.fieldErrors?.text);
            toast.error(res.error);
            return;
          }
          toast.success(res.message);
          onDone();
        });
      }}
    >
      <textarea rows={3} autoFocus className={cn("input", err && "input-error")} value={String(v.text)} onChange={(e) => setV({ ...v, text: e.target.value })} />
      {err && <p className="text-xs text-bad-fg">{err}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={v.visibility === "CUSTOMER"} onChange={(e) => setV({ ...v, visibility: e.target.checked ? "CUSTOMER" : "INTERNAL" })} />
          {v.visibility === "CUSTOMER" ? <Eye className="size-3.5 text-customer" /> : <EyeOff className="size-3.5 text-internal" />}
          Show on customer quote
        </label>
        <span className="flex gap-1">
          <button className="btn-primary btn-sm" disabled={pending}>
            Save
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={onDone}>
            Cancel
          </button>
        </span>
      </div>
    </form>
  );
}

function Remove({ projectId, id }: { projectId: string; id: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  if (!confirm)
    return (
      <button type="button" className="icon-btn hover:text-bad-fg" aria-label="Remove note" onClick={() => setConfirm(true)}>
        <Trash2 className="size-3.5" />
      </button>
    );
  return (
    <span className="flex gap-1">
      <button
        type="button"
        className="btn-danger btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await deleteNote(projectId, id);
            if (res.ok) toast.success(res.message);
            else toast.error(res.error);
          })
        }
      >
        Remove
      </button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirm(false)}>
        Keep
      </button>
    </span>
  );
}

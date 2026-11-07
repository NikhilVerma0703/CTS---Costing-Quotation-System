"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import type { Col } from "@/components/cells";
import { MappingForm, type MappingNeeded } from "@/components/MappingForm";
import type { Update } from "@/components/Workspace";
import type { Result, RowResult } from "@/lib/engine";
import { labelOf, type ColumnKey, type ProjectData } from "@/lib/model";

export interface SheetProps {
  data: ProjectData;
  result: Result;
  update: Update;
}

export const bandKey = (r: RowResult) => `${r.piece.dwg}|${r.piece.group}`;

/** Everything a row shows. Rows whose signature is unchanged aren't redrawn, so an edit stays instant. */
export const rowSignature = (r: RowResult) => JSON.stringify([r.piece, r.cutLf, r.depLf, r.sqftPerPc, r.totalSqft, r.internal, r.customer, r.pricePerSqft]);

/** The columns that say which piece a row is, on the three read-through sheets. */
export function identityCols(d: ProjectData): Col<RowResult>[] {
  const text = (key: ColumnKey, width: number, align: "left" | "center" = "left", sticky = false): Col<RowResult> => ({
    key,
    head: labelOf(d, key),
    width,
    align,
    sticky,
    render: (r) => String(r.piece[key as keyof typeof r.piece] ?? ""),
    title: (r) => String(r.piece[key as keyof typeof r.piece] ?? "") || undefined,
  });
  return [text("dwg", 46, "center", true), text("group", 190, "left", true), text("area", 96), text("piece", 50, "center"), text("description", 190), text("thickness", 74, "center"), ...(d.show.color ? [text("color", 98, "center")] : [])];
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-2">{children}</div>;
}

/** Uploads a replacement sheet for this project. Undo takes it back. */
export function ReplaceSheet({ id, kind, label, data, apply }: { id: string; kind: "drawing" | "variables"; label: string; data: ProjectData; apply: (next: ProjectData) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<{ file: File; needed: MappingNeeded } | null>(null);

  async function send(file: File, answers?: Record<string, number>) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    form.append("current", JSON.stringify(data));
    if (answers) form.append("mapping", JSON.stringify(answers));
    try {
      const res = await fetch(`/api/projects/${id}/import`, { method: "POST", body: form });
      const json = await res.json();
      if (json.data) {
        apply(json.data);
        setMapping(null);
      } else if (json.mappingNeeded) setMapping({ file, needed: json.mappingNeeded });
      else setError((json.errors ?? ["The file could not be read."]).join(" "));
    } catch {
      setError("The server could not be reached.");
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <>
      <button type="button" className="btn-secondary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {label}
      </button>
      <input ref={input} data-testid={`replace-${kind}`} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && send(e.target.files[0])} />
      {error && (
        <span role="alert" className="text-[13px] font-medium text-bad-fg">
          {error}
        </span>
      )}
      {mapping && (
        <div className="w-full max-w-sm">
          <MappingForm mapping={mapping.needed} busy={busy} onSubmit={(answers) => send(mapping.file, answers)} />
        </div>
      )}
    </>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { commitImport, previewImport } from "@/modules/drawing/actions";
import { FIELD_LABEL, type DrawingField, type ParseResult } from "@/lib/import/drawing-fields";
import { EDGE_RULE_LABEL, UNIT_LABEL } from "@/modules/drawing/schema";
import { cn } from "@/lib/utils";

export function ImportPanel({ projectId, existingCount }: { projectId: string; existingCount: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [mode, setMode] = useState<"APPEND" | "REPLACE">(existingCount > 0 ? "REPLACE" : "APPEND");
  const [showOnly, setShowOnly] = useState<"all" | "problems">("all");
  const [pending, start] = useTransition();

  const choose = (f: File | null) => {
    setFile(f);
    setPreview(null);
    if (!f) return;
    const fd = new FormData();
    fd.set("file", f);
    start(async () => {
      const res = await previewImport(fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.data);
      if (res.data.fileErrors.length) toast.error("The file can't be imported — see the details below.");
    });
  };

  const commit = () => {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mode", mode);
    start(async () => {
      const res = await commitImport(projectId, fd);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(res.message);
      setFile(null);
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const rows = preview?.rows.filter((r) => showOnly === "all" || r.errors.length || r.warnings.length) ?? [];
  const warnCount = preview?.rows.filter((r) => r.warnings.length).length ?? 0;
  const mappedFields = preview ? (Object.keys(preview.mapping) as DrawingField[]) : [];

  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-2 bg-shell px-4 py-8 text-center hover:border-brand-2 hover:bg-info-bg",
          pending && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <Upload className="size-7 text-brand-2" />
        <span className="text-sm font-semibold text-ink">
          {file ? file.name : "Drop the drawing summary sheet here, or click to choose"}
        </span>
        <span className="text-xs text-ink-3">.xlsx or .csv · header row with Dwg#, Group, Area, Piece, Description, L, W, … Units Qty</span>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.csv"
          className="sr-only"
          onChange={(e) => choose(e.target.files?.[0] ?? null)}
        />
      </label>

      {pending && !preview && <p className="mt-3 text-sm text-ink-2">Reading the file…</p>}

      {preview && (
        <div className="mt-4 space-y-3">
          {preview.fileErrors.length > 0 && (
            <div className="rounded-lg border border-bad-fg/30 bg-bad-bg px-4 py-3 text-sm text-bad-fg">
              {preview.fileErrors.map((e) => (
                <p key={e} className="flex items-start gap-2">
                  <XCircle className="mt-0.5 size-4 shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}

          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <Info label="Sheet" value={`${preview.sheetName ?? "—"}${preview.headerRow ? ` · header row ${preview.headerRow}` : ""}`} />
            <Info label="Dimensions in" value={UNIT_LABEL[preview.dimUnit]} />
            <Info label="Valid rows" value={<span className="text-ok-fg">{preview.validCount}</span>} />
            <Info
              label="Rejected / to check"
              value={
                <span>
                  <span className={preview.errorCount ? "text-bad-fg" : ""}>{preview.errorCount}</span> /{" "}
                  <span className={warnCount ? "text-warn-fg" : ""}>{warnCount}</span>
                </span>
              }
            />
          </div>

          {preview.fileWarnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
            </p>
          ))}

          <details className="rounded-lg border border-line px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-ink-2">Column mapping ({mappedFields.length} columns recognised)</summary>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mappedFields.map((f) => (
                <span key={f} className="badge bg-info-bg text-info-fg">
                  {preview.mapping[f]} → {FIELD_LABEL[f]}
                </span>
              ))}
              {preview.unmappedHeaders.map((h) => (
                <span key={h} className="badge bg-mute-bg text-mute-fg">
                  {h} (ignored)
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-3">
              Calculated columns in the file (Cutting LF, DE&amp;P LF, Sqft/Pc, Total Pcs, Total Sqft) are only used to check the
              system&apos;s own calculation and to read each piece&apos;s DE&amp;P edge rule.
            </p>
          </details>

          {preview.rows.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" className={cn("btn-sm", showOnly === "all" ? "btn-secondary" : "btn-ghost")} onClick={() => setShowOnly("all")}>
                  All rows ({preview.rows.length})
                </button>
                <button
                  type="button"
                  className={cn("btn-sm", showOnly === "problems" ? "btn-secondary" : "btn-ghost")}
                  onClick={() => setShowOnly("problems")}
                >
                  Problems only ({preview.errorCount + warnCount})
                </button>
              </div>
              <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="th">Row</th>
                      <th className="th">Status</th>
                      <th className="th">Dwg#</th>
                      <th className="th">Group</th>
                      <th className="th">Area</th>
                      <th className="th">Piece</th>
                      <th className="th">Description</th>
                      <th className="th num">L</th>
                      <th className="th num">W</th>
                      <th className="th num">Sink</th>
                      <th className="th num">Faucet</th>
                      <th className="th num">R-Cor</th>
                      <th className="th num">Joints</th>
                      <th className="th num">Qty</th>
                      <th className="th">DE&amp;P rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.rowNumber} className={cn(r.errors.length ? "bg-bad-bg/50" : r.warnings.length ? "bg-warn-bg/50" : "")}>
                        <td className="td text-ink-3">{r.rowNumber}</td>
                        <td className="td">
                          {r.errors.length ? (
                            <span className="text-bad-fg">
                              <XCircle className="mr-1 inline size-3.5" />
                              {r.errors.join(" ")}
                            </span>
                          ) : r.warnings.length ? (
                            <span className="text-warn-fg">
                              <AlertTriangle className="mr-1 inline size-3.5" />
                              {r.warnings.join(" ")}
                            </span>
                          ) : (
                            <CheckCircle2 className="size-4 text-ok-fg" />
                          )}
                        </td>
                        <td className="td">{r.raw.dwgNo}</td>
                        <td className="td max-w-48 truncate" title={r.raw.group}>
                          {r.raw.group}
                        </td>
                        <td className="td">{r.raw.area}</td>
                        <td className="td">{r.raw.pieceNo}</td>
                        <td className="td">{r.raw.description}</td>
                        <td className="td num">{r.raw.length}</td>
                        <td className="td num">{r.raw.width}</td>
                        <td className="td num">{r.raw.sinkCuts}</td>
                        <td className="td num">{r.raw.faucetHoles}</td>
                        <td className="td num">{r.raw.rCorners}</td>
                        <td className="td num">{r.raw.joints}</td>
                        <td className="td num">{r.raw.unitsQty}</td>
                        <td className="td whitespace-nowrap">{r.piece ? EDGE_RULE_LABEL[r.piece.depRule].split(" — ")[0] : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {preview.validCount > 0 && preview.fileErrors.length === 0 && (
            <div className="flex flex-col gap-3 rounded-lg border border-line bg-shell p-3 sm:flex-row sm:items-center sm:justify-between">
              <fieldset className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="mode" checked={mode === "REPLACE"} onChange={() => setMode("REPLACE")} />
                  Replace all current pieces ({existingCount})
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="mode" checked={mode === "APPEND"} onChange={() => setMode("APPEND")} />
                  Add to current pieces
                </label>
              </fieldset>
              <button type="button" className="btn-primary" onClick={commit} disabled={pending}>
                <FileSpreadsheet className="size-4" />
                {pending ? "Importing…" : `Import ${preview.validCount} piece${preview.validCount === 1 ? "" : "s"}`}
                {preview.errorCount > 0 && ` (skip ${preview.errorCount})`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[11px] font-semibold text-ink-3 uppercase">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}

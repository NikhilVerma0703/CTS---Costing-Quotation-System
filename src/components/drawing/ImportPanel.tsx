"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, HelpCircle, Upload, XCircle } from "lucide-react";
import { commitImport, previewImport } from "@/modules/drawing/actions";
import {
  FIELD_LABEL,
  GENERATABLE_FIELDS,
  type DrawingField,
  type GeneratableField,
  type MappingOverrides,
  type ParseResult,
  type SheetColumn,
} from "@/lib/import/drawing-fields";
import { EDGE_RULE_LABEL, UNIT_LABEL } from "@/modules/drawing/schema";
import { cn } from "@/lib/utils";

const ALL_FIELDS = Object.keys(FIELD_LABEL) as DrawingField[];
const MATCH_BADGE: Record<SheetColumn["match"], { label: string; cls: string }> = {
  exact: { label: "Recognised", cls: "bg-ok-bg text-ok-fg" },
  auto: { label: "Matched — check", cls: "bg-info-bg text-info-fg" },
  manual: { label: "Your choice", cls: "bg-accent-bg text-accent" },
  ambiguous: { label: "Needs your answer", cls: "bg-warn-bg text-warn-fg" },
  extra: { label: "Extra column — kept", cls: "bg-mute-bg text-mute-fg" },
};

export function ImportPanel({ projectId, existingCount }: { projectId: string; existingCount: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [overrides, setOverrides] = useState<MappingOverrides>({});
  const [mode, setMode] = useState<"APPEND" | "REPLACE">(existingCount > 0 ? "REPLACE" : "APPEND");
  const [showOnly, setShowOnly] = useState<"all" | "problems">("all");
  const [pending, start] = useTransition();

  const formFor = (f: File, o: MappingOverrides) => {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("mapping", JSON.stringify(o));
    return fd;
  };

  const runPreview = (f: File, o: MappingOverrides) =>
    start(async () => {
      const res = await previewImport(formFor(f, o));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res.data);
      if (res.data.fileErrors.length) toast.error("The file can't be imported — see the details below.");
    });

  const choose = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setOverrides({});
    if (f) runPreview(f, {});
  };

  const answer = (o: MappingOverrides) => {
    setOverrides(o);
    if (file) runPreview(file, o);
  };
  const setColumn = (index: number, choice: DrawingField | "extra") => answer({ ...overrides, columns: { ...overrides.columns, [index]: choice } });
  const setGenerate = (f: GeneratableField, on: boolean) =>
    answer({ ...overrides, generate: on ? [...new Set([...(overrides.generate ?? []), f])] : (overrides.generate ?? []).filter((x) => x !== f) });

  const commit = () => {
    if (!file) return;
    const fd = formFor(file, overrides);
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
      setOverrides({});
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const rows = preview?.rows.filter((r) => showOnly === "all" || r.errors.length || r.warnings.length) ?? [];
  const warnCount = preview?.rows.filter((r) => r.warnings.length).length ?? 0;
  const openQuestions = preview ? preview.columns.filter((c) => c.match === "ambiguous").length + preview.missingRequired.length : 0;

  return (
    <div>
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-2 bg-shell px-4 py-7 text-center hover:border-brand-2 hover:bg-info-bg",
          pending && "pointer-events-none opacity-60",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          choose(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <Upload className="size-7 text-brand-2" />
        <span className="text-sm font-semibold text-ink">{file ? file.name : "Drop the drawing summary sheet here, or click to choose"}</span>
        <span className="text-xs text-ink-3">.xlsx or .csv</span>
        <input ref={inputRef} type="file" accept=".xlsx,.csv" className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
      </label>

      {pending && <p className="mt-3 text-sm text-ink-2">Reading the file…</p>}

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
                  <span className={preview.errorCount ? "text-bad-fg" : ""}>{preview.errorCount}</span> / <span className={warnCount ? "text-warn-fg" : ""}>{warnCount}</span>
                </span>
              }
            />
          </div>

          {preview.fileWarnings.map((w) => (
            <p key={w} className="flex items-start gap-2 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
            </p>
          ))}

          {/* Column mapping: open when anything needs an answer. */}
          <details className="rounded-lg border border-line text-sm" open={preview.needsMapping}>
            <summary className="cursor-pointer px-3 py-2 font-semibold text-ink-2">
              Columns — {preview.columns.filter((c) => c.field).length} standard, {preview.unmappedHeaders.length} extra
              {openQuestions > 0 && <span className="ml-2 badge bg-warn-bg text-warn-fg">{openQuestions} to answer</span>}
            </summary>
            <div className="border-t border-line p-3">
              {preview.missingRequired.length > 0 && (
                <div className="mb-3 space-y-2 rounded-lg bg-warn-bg px-3 py-2 text-warn-fg">
                  {preview.missingRequired.map((f) => {
                    const canGenerate = (GENERATABLE_FIELDS as readonly string[]).includes(f);
                    const choices = preview.columns.filter((c) => !c.field);
                    return (
                      <div key={f} className="flex flex-wrap items-center gap-2">
                        <HelpCircle className="size-4" />
                        <span className="font-semibold">No column for {FIELD_LABEL[f]}.</span>
                        <select
                          className="input input-sm w-auto"
                          value=""
                          onChange={(e) => {
                            if (e.target.value === "__generate") setGenerate(f as GeneratableField, true);
                            else if (e.target.value) setColumn(Number(e.target.value), f);
                          }}
                        >
                          <option value="">Choose…</option>
                          {choices.map((c) => (
                            <option key={c.index} value={c.index}>
                              Use column “{c.header}”
                            </option>
                          ))}
                          {canGenerate && <option value="__generate">{f === "pieceNo" ? "Number pieces 1, 2, 3 … per Dwg# (flagged)" : "Use Area as description (flagged)"}</option>}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
              {preview.generated.length > 0 && (
                <p className="mb-2 text-xs text-ink-2">
                  Generated: {preview.generated.map((g) => FIELD_LABEL[g]).join(", ")}{" "}
                  {preview.generated.map((g) => (
                    <button key={g} type="button" className="ml-1 underline" onClick={() => setGenerate(g, false)}>
                      undo {FIELD_LABEL[g]}
                    </button>
                  ))}
                </p>
              )}
              <div className="max-h-80 overflow-auto rounded-lg border border-line">
                <table className="w-full text-[13px]">
                  <thead className="sticky top-0">
                    <tr>
                      <th className="th">Column in the sheet</th>
                      <th className="th">Used as</th>
                      <th className="th">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.columns.map((c) => (
                      <tr key={c.index} className={c.match === "ambiguous" ? "bg-warn-bg/50" : ""}>
                        <td className="td font-medium">{c.header}</td>
                        <td className="td">
                          <select
                            className="input input-sm"
                            value={c.field ?? "extra"}
                            onChange={(e) => setColumn(c.index, e.target.value as DrawingField | "extra")}
                          >
                            {c.match === "ambiguous" && !c.field && <option value="extra">— choose (or keep as extra) —</option>}
                            <option value="extra">Keep as extra column</option>
                            {[...c.candidates, ...ALL_FIELDS.filter((f) => !c.candidates.includes(f))].map((f) => (
                              <option key={f} value={f}>
                                {FIELD_LABEL[f]}
                                {c.candidates.includes(f) && c.match === "ambiguous" ? " (suggested)" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="td">
                          <span className={cn("badge", MATCH_BADGE[c.match].cls)}>{MATCH_BADGE[c.match].label}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.addedDefaults.length > 0 && (
                <p className="mt-2 text-xs text-ink-2">
                  Not in the sheet, added as standard columns with 0 / blank: {preview.addedDefaults.map((f) => FIELD_LABEL[f]).join(", ")}.
                </p>
              )}
              <p className="mt-1 text-xs text-ink-3">Cutting LF, DE&amp;P LF, Sqft/Pc and totals are always calculated with the standard formulas; the sheet&apos;s own values are kept and compared.</p>
            </div>
          </details>

          {preview.rows.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <button type="button" className={cn("btn-sm", showOnly === "all" ? "btn-secondary" : "btn-ghost")} onClick={() => setShowOnly("all")}>
                  All rows ({preview.rows.length})
                </button>
                <button type="button" className={cn("btn-sm", showOnly === "problems" ? "btn-secondary" : "btn-ghost")} onClick={() => setShowOnly("problems")}>
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
                      <th className="th num">Qty</th>
                      <th className="th">DE&amp;P rule</th>
                      {preview.unmappedHeaders.slice(0, 4).map((h) => (
                        <th key={h} className="th text-ink-3">
                          {h}
                        </th>
                      ))}
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
                        <td className="td">{r.piece?.dwgNo ?? r.raw.dwgNo}</td>
                        <td className="td max-w-48 truncate" title={r.raw.group}>
                          {r.raw.group}
                        </td>
                        <td className="td">{r.raw.area}</td>
                        <td className="td">{r.piece?.pieceNo ?? r.raw.pieceNo}</td>
                        <td className="td">{r.piece?.description ?? r.raw.description}</td>
                        <td className="td num">{r.raw.length}</td>
                        <td className="td num">{r.raw.width}</td>
                        <td className="td num">{r.raw.sinkCuts}</td>
                        <td className="td num">{r.raw.unitsQty}</td>
                        <td className="td whitespace-nowrap">{r.piece ? EDGE_RULE_LABEL[r.piece.depRule].split(" — ")[0] : "—"}</td>
                        {preview.unmappedHeaders.slice(0, 4).map((h) => (
                          <td key={h} className="td text-ink-2">
                            {r.piece?.extra?.[h]}
                          </td>
                        ))}
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
                  Replace current pieces ({existingCount})
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="mode" checked={mode === "APPEND"} onChange={() => setMode("APPEND")} />
                  Add to current pieces
                </label>
              </fieldset>
              <button type="button" className="btn-primary" onClick={commit} disabled={pending || preview.needsMapping} title={preview.needsMapping ? "Answer the column questions first" : undefined}>
                <FileSpreadsheet className="size-4" />
                {pending ? "Working…" : preview.needsMapping ? "Answer the column questions first" : `Import ${preview.validCount} piece${preview.validCount === 1 ? "" : "s"}`}
                {!preview.needsMapping && preview.errorCount > 0 && ` (skip ${preview.errorCount})`}
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

"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Trash2, Upload, X } from "lucide-react";
import { MappingForm, type MappingNeeded } from "@/components/MappingForm";
import { int, money, num, pct } from "@/lib/format";

export interface ProjectRow {
  id: string;
  name: string;
  updatedAt: string;
  pieces: number;
  sqft: number;
  internal: number;
  customer: number;
  marginPct: number | null;
  /** The totals rest on an estimated slab count. */
  estimated: boolean;
}

export function BrandBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex min-h-14 items-center gap-3 border-b border-line bg-white px-4 py-2">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand">
          <Image src="/logo-white.png" alt="Pacific Surfaces" width={20} height={20} />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-brand">CTS Costing</span>
      </Link>
      {children}
    </header>
  );
}

function DropBox({ label, hint, file, onFile, required }: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void; required?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <div className="label">
        {label} {required ? <span className="text-bad-fg">*</span> : <span className="font-normal text-ink-3">(optional)</span>}
      </div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onFile(e.dataTransfer.files[0] ?? null);
        }}
        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-3 text-[13px] transition-colors ${over ? "border-brand bg-info-bg" : "border-line-2 hover:border-ink-3 hover:bg-head"}`}
      >
        {file ? <FileSpreadsheet className="size-4 shrink-0 text-ok-fg" /> : <Upload className="size-4 shrink-0 text-ink-3" />}
        <span className={`min-w-0 flex-1 truncate ${file ? "font-medium" : "text-ink-2"}`}>{file ? file.name : hint}</span>
        {file && (
          <button
            type="button"
            aria-label={`Remove ${file.name}`}
            className="rounded p-0.5 text-ink-3 hover:bg-line hover:text-ink"
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
              if (input.current) input.current.value = "";
            }}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <input ref={input} data-testid={`file-${required ? "drawing" : "variables"}`} type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

function NewCosting({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [drawing, setDrawing] = useState<File | null>(null);
  const [variables, setVariables] = useState<File | null>(null);
  const [from, setFrom] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [mapping, setMapping] = useState<MappingNeeded | null>(null);

  async function generate(answers?: Record<string, number>) {
    if (!drawing) return;
    setBusy(true);
    setErrors([]);
    const form = new FormData();
    form.append("drawing", drawing);
    if (variables) form.append("variables", variables);
    form.append("name", name);
    form.append("variablesFrom", from);
    if (answers) form.append("mapping", JSON.stringify(answers));
    try {
      const res = await fetch("/api/projects", { method: "POST", body: form });
      const json = await res.json();
      if (json.id) {
        router.push(`/projects/${json.id}`);
        return;
      }
      if (json.mappingNeeded) setMapping(json.mappingNeeded);
      else setErrors(json.errors ?? ["The upload could not be read."]);
    } catch {
      setErrors(["The server could not be reached. Check it is running, then try again."]);
    }
    setBusy(false);
  }

  return (
    <section className="card p-5">
      <h2 className="mb-4 text-[15px] font-semibold">New costing</h2>
      <div className="space-y-4">
        <DropBox label="Drawing Summary sheet" hint="Choose or drop .xlsx / .csv" file={drawing} onFile={(f) => (setDrawing(f), setMapping(null), setErrors([]))} required />
        <DropBox label="Variables sheet" hint="Choose or drop .xlsx / .csv" file={variables} onFile={setVariables} />
        {!variables && (
          <div>
            <label className="label" htmlFor="variables-from">
              Without a Variables sheet, use
            </label>
            <select id="variables-from" className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
              <option value="auto">Project&apos;s own rates, or stored rate card</option>
              <option value="stored">Stored rate card</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  Rates from: {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="project-name">
            Project name <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input id="project-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {mapping && <MappingForm mapping={mapping} busy={busy} onSubmit={generate} />}
        {errors.length > 0 && (
          <div role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad-fg">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        {!mapping && (
          <button type="button" className="btn-primary w-full" disabled={!drawing || busy} onClick={() => generate()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            {busy ? "Generating…" : "Generate costing"}
          </button>
        )}
      </div>
    </section>
  );
}

function ProjectList({ projects }: { projects: ProjectRow[] }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function remove(id: string) {
    setDeleting(true);
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setConfirming(null);
    setDeleting(false);
    router.refresh();
  }

  if (projects.length === 0) {
    return <section className="card p-10 text-center text-ink-2">No projects yet.</section>;
  }
  return (
    <section className="card overflow-hidden">
      <h2 className="border-b border-line px-5 py-3.5 text-[15px] font-semibold">Projects</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-line bg-head text-left text-[11.5px] font-semibold whitespace-nowrap text-ink-2">
              <th className="min-w-64 px-5 py-2.5">Project</th>
              <th className="px-3 py-2.5 text-right">Pieces</th>
              <th className="px-3 py-2.5 text-right">Sqft</th>
              <th className="px-3 py-2.5 text-right">Internal cost</th>
              <th className="px-3 py-2.5 text-right">Customer quote</th>
              <th className="px-3 py-2.5 text-right">Margin</th>
              <th className="px-3 py-2.5 text-right">Updated</th>
              <th className="w-24 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-line transition-colors last:border-0 hover:bg-head">
                <td className="px-5 py-2.5">
                  <Link href={`/projects/${p.id}`} className="font-medium text-brand underline-offset-2 hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{int(p.pieces)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{num(p.sqft)}</td>
                <td className="px-3 py-2.5 text-right text-internal tabular-nums">{money(p.internal)}</td>
                <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-customer tabular-nums">
                  {money(p.customer)}
                  {p.estimated && <span className="ml-1 text-[11px] font-normal text-warn-fg">est.</span>}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{pct(p.marginPct)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap text-ink-2" suppressHydrationWarning>{new Date(p.updatedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {confirming === p.id ? (
                    <span className="inline-flex items-center gap-1 text-[12px]">
                      Delete?
                      <button type="button" className="rounded px-1.5 py-0.5 font-medium text-bad-fg hover:bg-bad-bg" disabled={deleting} onClick={() => remove(p.id)}>
                        Yes
                      </button>
                      <button type="button" className="rounded px-1.5 py-0.5 font-medium hover:bg-line" onClick={() => setConfirming(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button type="button" aria-label={`Delete ${p.name}`} title="Delete project" className="rounded p-1 text-ink-3 hover:bg-bad-bg hover:text-bad-fg" onClick={() => setConfirming(p.id)}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function Home({ projects }: { projects: ProjectRow[] }) {
  return (
    <div className="min-h-dvh">
      <BrandBar />
      <main className="mx-auto grid max-w-[1480px] items-start gap-4 p-4 lg:grid-cols-[360px_1fr]">
        <NewCosting projects={projects} />
        <ProjectList projects={projects} />
      </main>
    </div>
  );
}

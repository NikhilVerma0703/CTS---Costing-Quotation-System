"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, Download, FileText, Undo2, X } from "lucide-react";
import { BrandBar } from "@/components/Home";
import { CostSheet } from "@/components/sheets/CostSheet";
import { DrawingSheet } from "@/components/sheets/DrawingSheet";
import { ProjectSummarySheet } from "@/components/sheets/ProjectSummarySheet";
import { QuoteSummarySheet } from "@/components/sheets/QuoteSummarySheet";
import { SlabSheet } from "@/components/sheets/SlabSheet";
import { VariablesSheet } from "@/components/sheets/VariablesSheet";
import { calculate, type Result } from "@/lib/engine";
import { int, money, num, pct } from "@/lib/format";
import type { ProjectData } from "@/lib/model";

export type Update = (change: (draft: ProjectData) => void) => void;

const TABS = [
  ["variables", "Variables"],
  ["drawing", "Drawing Summary"],
  ["internal", "Internal Costing"],
  ["customer", "Customer Quote"],
  ["quote", "Quote Summary"],
  ["slab", "Slab Calculation"],
  ["summary", "Project Summary"],
] as const;
export type TabKey = (typeof TABS)[number][0];

type SaveState = "saved" | "saving" | "unsaved" | "failed";

function Tile({ label, value, tone }: { label: string; value: string; tone?: "internal" | "customer" }) {
  const color = tone === "internal" ? "text-internal" : tone === "customer" ? "text-customer" : "text-ink";
  return (
    <div className="min-w-0 border-r border-line px-3 py-2.5 last:border-0 xl:px-4">
      <div className="truncate text-[11.5px] font-medium text-ink-2 xl:text-[12px]" title={label}>
        {label}
      </div>
      <div className={`mt-0.5 text-[18px] leading-6 font-semibold tracking-tight whitespace-nowrap tabular-nums ${color}`} data-kpi={label}>
        {value}
      </div>
    </div>
  );
}

function Checks({ result, data, update, goTo }: { result: Result; data: ProjectData; update: Update; goTo: (t: TabKey) => void }) {
  // Starts open when there is something new to read, or the totals rest on an estimate.
  const [open, setOpen] = useState(data.importNotes.length > 0 || result.summary.slabsEstimated);
  const total = result.checks.length + data.importNotes.length;
  if (total === 0) return null;
  return (
    <div className="border-b border-warn-line bg-warn-bg text-[13px]">
      <button type="button" className="flex w-full items-center gap-2 px-4 py-2 text-left font-medium text-warn-fg" aria-expanded={open} onClick={() => setOpen(!open)}>
        <AlertTriangle className="size-4 shrink-0" />
        {total} {total === 1 ? "thing" : "things"} to check
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="space-y-1 px-4 pb-2.5 pl-10 text-ink-2">
          {result.checks.map((c) => (
            <li key={c.text} className="list-disc">
              {c.text}{" "}
              {c.tab && (
                <button type="button" className="font-medium text-brand underline underline-offset-2" onClick={() => goTo(c.tab!)}>
                  Open
                </button>
              )}
            </li>
          ))}
          {data.importNotes.map((n) => (
            <li key={n} className="list-disc">
              {n}
            </li>
          ))}
          {data.importNotes.length > 0 && (
            <li className="list-none pt-1">
              <button type="button" className="inline-flex items-center gap-1 font-medium text-brand underline underline-offset-2" onClick={() => update((d) => void (d.importNotes = []))}>
                <X className="size-3.5" />
                Dismiss upload notes
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function Workspace({ id, initial }: { id: string; initial: ProjectData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const current = useRef(initial);
  const history = useRef<ProjectData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const [tab, setTab] = useState<TabKey>("variables");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saved = useRef(initial);
  const inFlight = useRef<Promise<boolean> | null>(null);

  // The one place numbers come from: every sheet reads this result.
  const result = useMemo(() => calculate(data), [data]);

  /** True once what is on screen is what the server holds. */
  const saveNow = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) await inFlight.current;
    const payload = current.current;
    if (payload === saved.current) {
      setSave("saved");
      return true;
    }
    setSave("saving");
    const request = fetch(`/api/projects/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        saved.current = payload;
        setSave(current.current === payload ? "saved" : "unsaved");
        return true;
      })
      .catch(() => {
        setSave("failed");
        return false;
      });
    inFlight.current = request;
    const ok = await request;
    inFlight.current = null;
    return ok;
  }, [id]);

  const scheduleSave = useCallback(() => {
    setSave("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 500);
  }, [saveNow]);

  const apply = useCallback(
    (next: ProjectData) => {
      history.current.push(current.current);
      if (history.current.length > 50) history.current.shift();
      setCanUndo(true);
      current.current = next;
      setData(next);
      scheduleSave();
    },
    [scheduleSave],
  );

  const update: Update = useCallback(
    (change) => {
      const next = structuredClone(current.current);
      change(next);
      apply(next);
    },
    [apply],
  );

  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    setCanUndo(history.current.length > 0);
    current.current = previous;
    setData(previous);
    scheduleSave();
  }, [scheduleSave]);

  useEffect(() => {
    const followHash = () => {
      const hash = window.location.hash.slice(1);
      if (TABS.some(([key]) => key === hash)) setTab(hash as TabKey);
    };
    followHash();
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !inField) {
        e.preventDefault();
        undo();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (current.current !== saved.current) {
        void saveNow();
        e.preventDefault();
      }
    };
    window.addEventListener("hashchange", followHash);
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("hashchange", followHash);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
      // Leaving, by a link or the Back button: don't wait for the autosave timer. Then drop the browser's cached pages, or the
      // project list shows the old totals and coming Back reopens this project as it first loaded, where the next edit would save over the newer figures.
      void saveNow().then(() => router.refresh());
    };
  }, [undo, saveNow, router]);

  /** The project list is only opened once what is on screen is saved, so it can't show older totals; a failed save stays here and says so. */
  const leaveForList = (e: React.MouseEvent) => {
    if (!(e.target as Element).closest?.('a[href="/"]')) return;
    e.preventDefault();
    e.stopPropagation();
    void saveNow().then((saved) => {
      if (saved) router.push("/");
    });
  };

  const goTo = (key: TabKey) => {
    setTab(key);
    window.history.replaceState(null, "", `#${key}`);
  };

  // Both are built on the server from the saved project: an unsaved edit would be missing, so a failed save stops them.
  const downloadExcel = async () => {
    if (await saveNow()) window.location.href = `/api/projects/${id}/excel`;
  };
  const openPdf = async () => {
    const win = window.open("about:blank", "_blank");
    if (await saveNow()) {
      if (win) win.location.href = `/api/projects/${id}/pdf`;
    } else win?.close();
  };

  const s = result.summary;
  const estimate = s.slabsEstimated ? " (est.)" : "";
  const props = { data, result, update };

  return (
    <div className="flex min-h-dvh flex-col" onClickCapture={leaveForList}>
      <BrandBar>
        <input
          aria-label="Project name"
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] font-semibold transition-colors hover:border-line-2 focus:border-brand-2 focus:ring-3 focus:ring-brand-2/15 focus:outline-none"
          defaultValue={data.meta.name}
          key={data.meta.name}
          onBlur={(e) => {
            const name = e.target.value.trim();
            if (name && name !== data.meta.name) update((d) => void (d.meta.name = name));
          }}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className={`mr-1 hidden text-[12px] whitespace-nowrap sm:inline ${save === "failed" ? "font-medium text-bad-fg" : "text-ink-3"}`} role="status" data-save-state={save}>
          {save === "saved" ? "All changes saved" : save === "failed" ? "Not saved: check the server" : "Saving…"}
        </span>
        {save === "failed" && (
          <button type="button" className="btn-ghost" onClick={() => void saveNow()}>
            Retry
          </button>
        )}
        <button type="button" className="btn-ghost" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
          <Undo2 className="size-4" />
          <span className="hidden md:inline">Undo</span>
        </button>
        <button type="button" className="btn-secondary" onClick={openPdf} title={`Customer PDF${estimate}`}>
          <FileText className="size-4" />
          <span className="hidden md:inline">Customer PDF{estimate}</span>
        </button>
        <button type="button" className="btn-primary" onClick={downloadExcel} title="Download Excel">
          <Download className="size-4" />
          <span className="hidden md:inline">Download Excel</span>
        </button>
      </BrandBar>

      <div className="grid grid-cols-2 border-b border-line bg-white sm:grid-cols-4 lg:grid-cols-7">
        <Tile label={`Total Internal Cost${estimate}`} value={money(s.totalInternal)} tone="internal" />
        <Tile label={`Total Customer Quote${estimate}`} value={money(s.totalCustomer)} tone="customer" />
        <Tile label="Gross Margin" value={money(s.margin)} />
        <Tile label="Margin %" value={pct(s.marginPct, 2)} />
        <Tile label="Customer $/sqft" value={money(s.customerPerSqft)} />
        <Tile label="Piece sqft" value={num(result.drawing.sqft)} />
        <Tile label={`Slabs${estimate}`} value={int(result.slabTotals.totalSlabs)} />
      </div>

      <Checks result={result} data={data} update={update} goTo={goTo} />

      <nav role="tablist" aria-label="Sheets" className="flex gap-1 overflow-x-auto border-b border-line bg-white px-2">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`border-b-2 px-3 py-2.5 text-[13px] whitespace-nowrap transition-colors ${tab === key ? "border-brand font-semibold text-brand" : "border-transparent font-medium text-ink-2 hover:border-line-2 hover:text-ink"}`} onClick={() => goTo(key)}>
            {label}
          </button>
        ))}
      </nav>

      <main className="min-w-0 flex-1">
        {tab === "variables" && <VariablesSheet {...props} id={id} apply={apply} />}
        {tab === "drawing" && <DrawingSheet {...props} id={id} apply={apply} />}
        {tab === "internal" && <CostSheet {...props} side="internal" />}
        {tab === "customer" && <CostSheet {...props} side="customer" />}
        {tab === "quote" && <QuoteSummarySheet {...props} />}
        {tab === "slab" && <SlabSheet {...props} />}
        {tab === "summary" && <ProjectSummarySheet {...props} />}
      </main>
    </div>
  );
}

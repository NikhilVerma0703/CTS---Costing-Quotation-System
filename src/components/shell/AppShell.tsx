"use client";

/**
 * CTS application shell — the same sidebar as Pacific ERP (Robo / Chromia):
 * a white rail with the Pacific logo tile, small uppercase group headings that
 * fold with a chevron, and a solid brand-teal pill on the active page.
 *
 * - The logo tile hides the rail on desktop and the floating tile brings it
 *   back. The choice is kept in localStorage and stamped on <html> by the boot
 *   script in app/layout.tsx before first paint, so pages never flash open.
 * - Group folds are remembered per group; the group holding the current page
 *   is always open.
 * - Below md the rail becomes a drawer opened from a top bar.
 *
 * Section links need a project. Inside /projects/<id>/… that is the project in
 * the URL; elsewhere it is the last project opened (cookie) or the most recent.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeDollarSign,
  Calculator,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  LayoutGrid,
  Menu,
  PieChart,
  Receipt,
  Ruler,
  X,
  XCircle,
} from "lucide-react";
import { SECTIONS, SECTION_GROUPS, sectionHref, type SectionDef } from "@/modules/registry";
import { cn } from "@/lib/utils";

const ICONS: Record<SectionDef["icon"], typeof Ruler> = {
  FileSpreadsheet,
  Ruler,
  BadgeDollarSign,
  Calculator,
  Receipt,
  ClipboardList,
  ClipboardCheck,
  LayoutGrid,
  PieChart,
  FileText,
};

export interface ShellProject {
  id: string;
  code: string;
  name: string;
  customerName: string | null;
  ready: boolean;
  errorCount: number;
}

interface NavRow {
  key: string;
  href: string | null; // null = disabled (no project yet)
  label: string;
  Icon: typeof Ruler;
  internal?: boolean;
  exact?: boolean;
}

const HIDE_KEY = "cts-sidebar-hidden";
const HIDE_ATTR = "data-sidebar-hidden";

function projectIdFromPath(path: string): string | null {
  const m = /^\/projects\/([^/]+)/.exec(path);
  return m ? m[1] : null;
}

function isActive(path: string, row: NavRow) {
  if (!row.href) return false;
  return row.exact ? path === row.href : path === row.href || path.startsWith(row.href + "/");
}

// ─── Nav pieces ─────────────────────────────────────────────────────────────

function NavLink({ row, path }: { row: NavRow; path: string }) {
  const active = isActive(path, row);
  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition";
  if (!row.href) {
    return (
      <span className={cn(base, "cursor-not-allowed text-gray-300")} title="Create a project first">
        <row.Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
        <span className="truncate">{row.label}</span>
      </span>
    );
  }
  return (
    <Link
      href={row.href}
      aria-current={active ? "page" : undefined}
      className={cn(base, active ? "bg-brand text-white shadow-sm" : "text-gray-600 hover:bg-white hover:text-brand")}
    >
      <row.Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
      <span className="flex-1 truncate">{row.label}</span>
      {row.internal && (
        <span
          title="Internal — not shown to the customer"
          className={cn("size-1.5 shrink-0 rounded-full", active ? "bg-white/70" : "bg-internal/50")}
        />
      )}
    </Link>
  );
}

function NavGroup({ label, rows, path }: { label: string; rows: NavRow[]; path: string }) {
  const holdsCurrent = rows.some((r) => isActive(path, r));
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem("cts-nav-fold:" + label) === "1");
    } catch {
      /* private mode */
    }
  }, [label]);
  const closed = folded && !holdsCurrent;
  const toggle = () => {
    const next = !folded;
    setFolded(next);
    try {
      localStorage.setItem("cts-nav-fold:" + label, next ? "1" : "0");
    } catch {
      /* private mode */
    }
  };
  return (
    <div className="mt-4 first:mt-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!closed}
        className="mb-1 flex w-full items-center justify-between px-3 text-[10px] font-bold tracking-[0.12em] text-gray-400 uppercase transition hover:text-gray-600"
      >
        <span>{label}</span>
        <ChevronDown className={cn("size-3 transition-transform", closed && "-rotate-90")} strokeWidth={2.5} />
      </button>
      {!closed && (
        <div className="flex flex-col gap-0.5">
          {rows.map((r) => (
            <NavLink key={r.key} row={r} path={path} />
          ))}
        </div>
      )}
    </div>
  );
}

function LogoTile({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl bg-pacific-dark shadow-sm", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-white.png" alt="Pacific Surfaces" className="size-5 object-contain" />
    </span>
  );
}

// ─── Shell ──────────────────────────────────────────────────────────────────

export function AppShell({
  projects,
  fallbackProjectId,
  userName,
  children,
}: {
  projects: ShellProject[];
  fallbackProjectId: string | null;
  userName: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [hidden, setHidden] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const urlProjectId = projectIdFromPath(path);
  const current = projects.find((p) => p.id === (urlProjectId ?? fallbackProjectId)) ?? projects[0] ?? null;

  // Remember the project being worked on, so "/" keeps pointing the sections at it.
  useEffect(() => {
    if (urlProjectId) document.cookie = `cts-project=${urlProjectId}; path=/; max-age=31536000; samesite=lax`;
  }, [urlProjectId]);

  // Rail hidden state (desktop).
  useEffect(() => {
    try {
      const v = localStorage.getItem(HIDE_KEY) === "1";
      setHidden(v);
      if (v) document.documentElement.setAttribute(HIDE_ATTR, "1");
      else document.documentElement.removeAttribute(HIDE_ATTR);
    } catch {
      /* private mode */
    }
  }, []);
  const toggleRail = () => {
    const v = !hidden;
    try {
      localStorage.setItem(HIDE_KEY, v ? "1" : "0");
    } catch {
      /* private mode */
    }
    if (v) document.documentElement.setAttribute(HIDE_ATTR, "1");
    else document.documentElement.removeAttribute(HIDE_ATTR);
    setHidden(v);
  };

  // Drawer: close on navigation, lock page scroll, Escape closes, close at md.
  useEffect(() => setDrawer(false), [path]);
  useEffect(() => {
    if (!drawer) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => mq.matches && setDrawer(false);
    document.addEventListener("keydown", onKey);
    mq.addEventListener("change", onMq);
    closeBtn.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
    };
  }, [drawer]);

  const groups = useMemo(() => {
    const projectRows: NavRow[] = [{ key: "projects", href: "/", label: "All Projects", Icon: FolderKanban, exact: true }];
    const sectionGroups = SECTION_GROUPS.map((g) => ({
      label: g,
      rows: SECTIONS.filter((s) => s.group === g).map<NavRow>((s) => ({
        key: s.slug,
        href: current ? sectionHref(current.id, s.slug) : null,
        label: s.short.replace(/^\d+\.\s*/, ""),
        Icon: ICONS[s.icon],
        internal: s.internal,
      })),
    }));
    return [{ label: "Projects", rows: projectRows }, ...sectionGroups];
  }, [current]);

  const section = SECTIONS.find((s) => current && (path === sectionHref(current.id, s.slug) || path.startsWith(sectionHref(current.id, s.slug) + "/")));

  // Current-project card: which project the section links open.
  const projectCard = current ? (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-bold tracking-[0.12em] text-gray-400 uppercase">Working on</p>
      <p className="mt-1 truncate text-[13px] leading-snug font-semibold text-gray-900" title={current.name}>
        {current.name}
      </p>
      <p className="truncate text-[11px] text-gray-400">
        {current.code}
        {current.customerName ? ` · ${current.customerName}` : ""}
      </p>
      <Link
        href={sectionHref(current.id, "final-quote")}
        className={cn(
          "mt-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold",
          current.ready ? "bg-ok-bg text-ok-fg" : "bg-bad-bg text-bad-fg",
        )}
      >
        {current.ready ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
        {current.ready ? "Quote ready to issue" : `${current.errorCount} issue${current.errorCount === 1 ? "" : "s"} to fix`}
      </Link>
      {projects.length > 1 && (
        <Link href="/" className="mt-1.5 block px-0.5 text-[11px] font-medium text-brand hover:underline">
          Switch project
        </Link>
      )}
    </div>
  ) : (
    <div className="mb-4 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-[12px] text-gray-500">
      No project yet — create one under All Projects.
    </div>
  );

  const nav = (
    <nav aria-label="CTS sections" className="flex flex-col">
      {groups.map((g) => (
        <NavGroup key={g.label} label={g.label} rows={g.rows} path={path} />
      ))}
    </nav>
  );

  const userCard = (
    <div className="mt-3 shrink-0 rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
          {userName.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-xs font-medium text-gray-900">{userName}</div>
          <div className="text-[11px] text-gray-400">Costing · sign-in off</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Floating tile that brings the hidden rail back */}
      {hidden && (
        <button
          type="button"
          onClick={toggleRail}
          title="Show sidebar"
          aria-label="Show sidebar"
          className="fixed top-3 left-3 z-40 hidden transition-transform hover:scale-105 md:flex print:hidden"
        >
          <LogoTile className="shadow-md" />
        </button>
      )}

      {/* Desktop rail */}
      <aside
        inert={hidden || undefined}
        aria-hidden={hidden || undefined}
        className={cn(
          "cts-rail sticky top-0 hidden h-screen shrink-0 overflow-hidden border-r bg-white/70 backdrop-blur transition-[width] duration-200 supports-[height:100dvh]:h-dvh md:flex print:hidden",
          hidden ? "w-0 border-transparent" : "w-64 border-gray-200/70",
        )}
      >
        <div className="flex h-full w-64 flex-col px-4 py-5">
          <div className="mb-5 flex shrink-0 items-center gap-2.5 px-2">
            <button
              type="button"
              onClick={toggleRail}
              title="Hide sidebar"
              aria-label="Hide sidebar"
              aria-expanded={!hidden}
              className="group relative shrink-0"
            >
              <LogoTile />
              <ChevronLeft className="absolute inset-0 m-auto size-4 text-white opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2.5} />
              <span className="absolute inset-0 rounded-xl bg-pacific-dark opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Pacific ERP</div>
              <div className="text-[11px] text-gray-400">Costing &amp; Quotation</div>
            </div>
          </div>
          <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
            {projectCard}
            {nav}
          </div>
          {userCard}
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200/70 bg-white/80 px-3 py-2 backdrop-blur md:hidden print:hidden">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Menu className="size-6" />
          </button>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-brand">{section ? section.label : "Costing & Quotation"}</p>
            <p className="truncate text-[11px] text-gray-400">{current ? current.name : "Pacific ERP"}</p>
          </div>
        </header>

        {/* Desktop breadcrumb bar */}
        <div className={cn("hidden items-center gap-1.5 px-8 pt-5 text-xs text-gray-400 md:flex print:hidden", hidden && "pl-16")}>
          <Link href="/" className="hover:text-brand">
            CTS
          </Link>
          {urlProjectId && current && (
            <>
              <ChevronRight className="size-3" />
              <span className="max-w-72 truncate" title={current.name}>
                {current.code}
              </span>
            </>
          )}
          {section && (
            <>
              <ChevronRight className="size-3" />
              <span>{section.group}</span>
              <ChevronRight className="size-3" />
              <span className="font-medium text-gray-600">{section.label}</span>
            </>
          )}
          {!urlProjectId && (
            <>
              <ChevronRight className="size-3" />
              <span className="font-medium text-gray-600">Projects</span>
            </>
          )}
        </div>

        <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-6 sm:px-6 md:px-8 md:pt-3">{children}</main>
      </div>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-[60] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-4 py-5 shadow-2xl">
            <div className="mb-5 flex shrink-0 items-center justify-between px-2">
              <div className="flex items-center gap-2.5">
                <LogoTile />
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-gray-900">Pacific ERP</div>
                  <div className="text-[11px] text-gray-400">Costing &amp; Quotation</div>
                </div>
              </div>
              <button
                ref={closeBtn}
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close menu"
                className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {projectCard}
              {nav}
            </div>
            {userCard}
          </div>
        </div>
      )}
    </div>
  );
}

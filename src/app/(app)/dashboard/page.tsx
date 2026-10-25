import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, XCircle } from "lucide-react";
import { dashboardData } from "@/lib/dashboard";
import { dec2, money, pct, qty, rate } from "@/lib/engine/format";
import { TONE_CLASS } from "@/lib/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { kpis, byStatus, customers, projects, attention } = await dashboardData();
  const maxStatus = Math.max(1, ...byStatus.map((s) => s.count));

  return (
    <>
      <PageHeader title="Dashboard" side="internal" actions={<ExportButtons scope="dashboard" />} />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total projects" value={kpis.totalProjects} hint={`${kpis.activeProjects} active`} emphasis />
        <StatTile label="Quoted value (issued)" value={money(kpis.issuedValue)} hint={`${kpis.issuedCount} project${kpis.issuedCount === 1 ? "" : "s"} with an issued revision`} tone="customer" emphasis />
        <StatTile label="Ready to quote" value={money(kpis.pipelineValue)} hint={`${kpis.pipelineCount} not issued yet`} tone="customer" />
        <StatTile label="Needs input" value={kpis.needsInput} hint="Projects with blocking issues" tone={kpis.needsInput ? "warn" : "neutral"} />
      </div>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Gross margin (complete costings)" value={money(kpis.margin)} hint={`${pct(kpis.marginPct, 1)} of quote · ${kpis.completeCount} projects`} tone="internal" />
        <StatTile label="Average customer rate" value={rate(kpis.avgPerSqft)} hint="per sqft, complete costings" />
        <StatTile label="Countertop area" value={`${dec2(kpis.totalSqft)} sqft`} hint="All active projects" />
        <StatTile label="Slabs (complete costings)" value={qty(kpis.totalSlabs)} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Section title="Projects by status" bodyClassName="p-0">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="th">Status</th>
                <th className="th num">Projects</th>
                <th className="th w-1/3" />
                <th className="th num">Quote value</th>
              </tr>
            </thead>
            <tbody>
              {byStatus.map((s) => (
                <tr key={s.stage}>
                  <td className="td">
                    <span className={cn("badge", TONE_CLASS[s.tone])}>{s.label}</span>
                  </td>
                  <td className="td num font-semibold">{s.count}</td>
                  <td className="td">
                    <div className="h-2 rounded-full bg-mute-bg">
                      <div className="h-2 rounded-full bg-brand-2" style={{ width: `${(s.count / maxStatus) * 100}%` }} />
                    </div>
                  </td>
                  <td className="td num">{s.value ? money(s.value) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Customers" bodyClassName="p-0 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="th">Customer</th>
                <th className="th num">Projects</th>
                <th className="th num">Sqft</th>
                <th className="th num">Internal cost</th>
                <th className="th num">Quote value</th>
                <th className="th num">Margin %</th>
                <th className="th num">Issued</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customer}>
                  <td className="td font-semibold">{c.customer}</td>
                  <td className="td num">{c.projects}</td>
                  <td className="td num">{dec2(c.sqft)}</td>
                  <td className="td num text-internal">{c.internalCost ? money(c.internalCost) : "—"}</td>
                  <td className="td num text-customer">{c.quote ? money(c.quote) : "—"}</td>
                  <td className="td num">{pct(c.marginPct, 1)}</td>
                  <td className="td num">{c.issued ? money(c.issued) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </div>

      <Section title="Costing and quotation by project" bodyClassName="p-0 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <th className="th">Project</th>
              <th className="th">Customer</th>
              <th className="th">Status</th>
              <th className="th num">Sqft</th>
              <th className="th num">Slabs</th>
              <th className="th num">Internal cost</th>
              <th className="th num">Customer quote</th>
              <th className="th num">Margin %</th>
              <th className="th num">$/sqft</th>
              <th className="th">Quote status</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="hover:bg-shell">
                <td className="td">
                  <Link href={`/projects/${p.id}`} className="font-semibold text-brand hover:underline">
                    {p.name}
                  </Link>
                  <p className="text-xs text-ink-3">{p.code}</p>
                </td>
                <td className="td">{p.customer ?? "—"}</td>
                <td className="td">
                  <span className={cn("badge", TONE_CLASS[p.tone])}>{p.status}</span>
                </td>
                <td className="td num">{dec2(p.sqft)}</td>
                <td className="td num">{p.slabs ?? "—"}</td>
                <td className="td num text-internal">{p.internalCost !== null ? money(p.internalCost) : "—"}</td>
                <td className="td num font-semibold text-customer">{p.quote !== null ? money(p.quote) : "—"}</td>
                <td className="td num">{pct(p.marginPct, 1)}</td>
                <td className="td num">{rate(p.perSqft)}</td>
                <td className="td text-xs text-ink-2">{p.revision ?? p.quoteLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {attention.length > 0 && (
        <Section title="Needs attention" bodyClassName="p-0">
          <ul className="divide-y divide-line text-sm">
            {attention.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                <Link href={`/projects/${a.id}`} className="w-56 shrink-0 font-semibold text-brand hover:underline">
                  {a.code} · {a.name}
                </Link>
                <div className="flex-1 space-y-0.5">
                  {a.blocking.map((b) => (
                    <p key={b} className="flex items-start gap-1.5 text-bad-fg">
                      <XCircle className="mt-0.5 size-3.5 shrink-0" /> {b}
                    </p>
                  ))}
                  {a.checks > 0 && (
                    <Link href={`/projects/${a.id}/import-drawing#checks`} className="flex items-center gap-1.5 text-warn-fg hover:underline">
                      <AlertTriangle className="size-3.5 shrink-0" /> {a.checks} data value{a.checks === 1 ? "" : "s"} to verify
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

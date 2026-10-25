import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getProjectsOverview } from "@/lib/projects-overview";
import { dec2, money, qty } from "@/lib/engine/format";
import { TONE_CLASS } from "@/lib/status";
import { NewProjectButton } from "@/components/projects/NewProjectButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AllProjects() {
  const rows = await getProjectsOverview();
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";

  return (
    <>
      <PageHeader
        title="All Projects"
        actions={
          <>
            {rows.length > 0 && <ExportButtons scope="projects" />}
            <NewProjectButton />
          </>
        }
      />

      {rows.length === 0 ? (
        <div className="card px-6 py-14 text-center">
          <p className="font-semibold">No projects yet</p>
          <p className="mt-1 text-sm text-ink-2">Create a project, then upload its drawing summary sheet.</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="th">Project</th>
                <th className="th">Customer</th>
                <th className="th">Status</th>
                <th className="th num">Pieces</th>
                <th className="th num">Sqft</th>
                <th className="th num">Customer quote</th>
                <th className="th">Quote status</th>
                <th className="th">Updated</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const href = `/projects/${p.id}`;
                const q = p.status.quote;
                return (
                  <tr key={p.id} className="group hover:bg-shell">
                    <td className="td">
                      <Link href={href} className="font-semibold text-brand hover:underline">
                        {p.name}
                      </Link>
                      <p className="text-xs text-ink-3">
                        {p.code}
                        {p.versionLabel ? ` · ${p.versionLabel}` : ""}
                      </p>
                    </td>
                    <td className="td">{p.customerName ?? <span className="text-ink-3">—</span>}</td>
                    <td className="td">
                      <span className={cn("badge", TONE_CLASS[p.status.tone])}>{p.status.label}</span>
                    </td>
                    <td className="td num">{qty(p.result.drawingTotals.totalPcs)}</td>
                    <td className="td num">{dec2(p.result.drawingTotals.totalSqft)}</td>
                    <td className="td num font-semibold">{q.value !== null ? money(q.value, p.currency) : <span className="text-ink-3">—</span>}</td>
                    <td className="td">
                      <span className={cn("badge", TONE_CLASS[q.tone])} title={p.status.blocking.join("\n") || q.detail || undefined}>
                        {q.label}
                      </span>
                      {q.detail && <p className="mt-0.5 text-[11px] text-ink-3">{q.detail}</p>}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-ink-2">{p.updatedAt.toLocaleDateString("en-IN", { timeZone: tz })}</td>
                    <td className="td text-right">
                      <Link href={href} className="btn-ghost btn-sm" aria-label={`Open ${p.name}`}>
                        Open <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

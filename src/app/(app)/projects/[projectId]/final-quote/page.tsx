import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { getProject } from "@/lib/engine/load";
import { dec2, money, qty, rate } from "@/lib/engine/format";
import { num, cn } from "@/lib/utils";
import { parseOptions, quoteNumberFor } from "@/lib/pdf/quote-data";
import { buildLiveQuote } from "@/modules/quote/build";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { StatTile } from "@/components/ui/StatTile";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { IssueRevision } from "@/components/quote/IssueRevision";
import { sectionHref } from "@/modules/registry";

export const metadata: Metadata = { title: "Final Quote / PDF" };

export default async function FinalQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const options = parseOptions(sp);
  const [project, revisions, live] = await Promise.all([
    getProject(projectId),
    prisma.quoteRevision.findMany({ where: { projectId }, orderBy: { revisionNo: "desc" } }),
    buildLiveQuote(projectId, parseOptions(sp)),
  ]);
  const { data, result } = live;
  const v = data.view;
  const cur = v.currency;
  const latest = revisions[0];
  const nextNo = (latest?.revisionNo ?? 0) + 1;
  const changedSinceIssue = latest && Math.abs(num(latest.totalQuote)! - Math.round(v.pricing.totalQuote * 100) / 100) >= 0.005;
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";

  const q = (o: Partial<typeof options>) => {
    const m = { ...options, ...o };
    const p = new URLSearchParams();
    if (!m.pieceSchedule) p.set("schedule", "0");
    if (m.priceSplit) p.set("split", "1");
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pdfUrl = `/api/projects/${projectId}/quote-pdf${q({})}`;

  return (
    <>
      <PageHeader
        side="customer"
        title="Final Quote / PDF"
        description="The customer document. It is built only from customer-facing values — scope, piece schedule, total and rate per sqft — and never contains My Cost, internal totals or margin."
        actions={
          v.ready ? (
            <>
              <a className="btn-secondary" href={pdfUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" /> Open draft PDF
              </a>
              <a className="btn-secondary" href={`${pdfUrl}${pdfUrl.includes("?") ? "&" : "?"}download=1`}>
                <Download className="size-4" /> Download draft
              </a>
            </>
          ) : undefined
        }
      />
      <IssuesBanner issues={result.issues} projectId={projectId} only="error" />

      {changedSinceIssue && (
        <div className="mb-5 rounded-xl border border-info-fg/25 bg-info-bg px-4 py-3 text-sm text-info-fg">
          Figures have changed since {latest.quoteNumber} was issued ({money(num(latest.totalQuote), cur)} → {money(v.pricing.totalQuote, cur)}). Issue a new revision
          to send the updated quote.
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total quotation" value={money(v.pricing.totalQuote, cur)} tone="customer" emphasis />
        <StatTile label="Rate per sqft" value={rate(v.pricing.ratePerSqft, cur)} tone="customer" />
        <StatTile label="Countertop area" value={`${dec2(v.scope.totalSqft)} sqft`} hint={`${qty(v.scope.totalPcs)} pieces · ${qty(v.scope.sinkCutouts)} sink cutouts`} />
        <StatTile label="Latest issued" value={latest ? latest.quoteNumber : "Not issued yet"} hint={latest ? latest.issuedAt.toLocaleDateString("en-IN", { timeZone: tz }) : undefined} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Section title="Preview" description="Exactly what the customer receives." bodyClassName="p-0">
          {v.ready ? (
            <iframe title="Quote PDF preview" src={pdfUrl} className="h-[78vh] w-full rounded-b-xl" />
          ) : (
            <p className="p-8 text-center text-sm text-ink-3">The preview appears once the problems above are fixed.</p>
          )}
        </Section>

        <div>
          <Section title="Options">
            <div className="space-y-2 text-sm">
              <Toggle href={q({ pieceSchedule: !options.pieceSchedule })} on={options.pieceSchedule} label="Piece schedule (sizes, quantities, sqft)" />
              <Toggle
                href={q({ priceSplit: !options.priceSplit })}
                on={options.priceSplit}
                label="Show fabrication and material as separate lines"
                hint="While material has no markup, the material line equals your slab cost. Off by default (total and rate per sqft only)."
              />
            </div>
            <p className="mt-3 text-xs text-ink-3">
              Customer notes come from <Link href={sectionHref(projectId, "project-summary")} className="underline">Project Summary → Quote notes</Link>. Company name
              and contact come from the <code>.env</code> file.
            </p>
          </Section>

          <Section title="Issue">
            <IssueRevision projectId={projectId} ready={v.ready} nextNumber={quoteNumberFor(project.code, nextNo)} options={options} />
            <p className="mt-3 text-xs text-ink-3">
              The draft PDF always uses the latest inputs. Issuing gives it a quote number and keeps an exact copy, so it can be downloaded again later unchanged.
            </p>
          </Section>
        </div>
      </div>

      <Section title={`Revisions (${revisions.length})`} bodyClassName="p-0">
        {revisions.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-3">No revision issued yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="th">Quote no.</th>
                  <th className="th">Issued</th>
                  <th className="th">By</th>
                  <th className="th num">Sqft</th>
                  <th className="th num">Total quote</th>
                  <th className="th">Status</th>
                  <th className="th">Remarks</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody>
                {revisions.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-semibold">{r.quoteNumber}</td>
                    <td className="td whitespace-nowrap">{r.issuedAt.toLocaleString("en-IN", { timeZone: tz })}</td>
                    <td className="td">{r.issuedBy}</td>
                    <td className="td num">{dec2(num(r.totalSqft))}</td>
                    <td className="td num font-semibold">{money(num(r.totalQuote), cur)}</td>
                    <td className="td">
                      <span className={cn("badge", r.status === "ISSUED" ? "bg-ok-bg text-ok-fg" : "bg-mute-bg text-mute-fg")}>
                        {r.status === "ISSUED" ? "Current" : "Superseded"}
                      </span>
                    </td>
                    <td className="td text-ink-2">{r.remarks}</td>
                    <td className="td whitespace-nowrap">
                      <a className="btn-ghost btn-sm" href={`/api/projects/${projectId}/quote-pdf?rev=${r.revisionNo}`} target="_blank" rel="noreferrer">
                        <ExternalLink className="size-3.5" /> Open
                      </a>
                      <a className="btn-ghost btn-sm" href={`/api/projects/${projectId}/quote-pdf?rev=${r.revisionNo}&download=1`}>
                        <Download className="size-3.5" /> PDF
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
      <p className="text-xs text-ink-3">Quote date on the draft: {new Date(data.issuedAt).toLocaleDateString("en-IN", { timeZone: tz })}, valid {project.validityDays} days.</p>
    </>
  );
}

function Toggle({ href, on, label, hint }: { href: string; on: boolean; label: string; hint?: string }) {
  return (
    <Link href={href || "?"} scroll={false} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-shell">
      <span className={cn("mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors", on ? "bg-customer" : "bg-line-2")}>
        <span className={cn("size-4 rounded-full bg-white shadow transition-transform", on && "translate-x-4")} />
      </span>
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-3">{hint}</span>}
      </span>
    </Link>
  );
}

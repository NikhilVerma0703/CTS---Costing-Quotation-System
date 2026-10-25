import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { UNIT_SYMBOL, type EdgeRule } from "@/lib/engine/types";
import { dec4, dim } from "@/lib/engine/format";
import { getEdgeDefaults } from "@/lib/formulas";
import type { VariablesData } from "@/lib/import/variables-fields";
import { num } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { IssuesBanner } from "@/components/ui/IssuesBanner";
import { ExportButtons } from "@/components/ui/ExportButtons";
import { ImportPanel } from "@/components/drawing/ImportPanel";
import { PieceForm } from "@/components/drawing/PieceForm";
import { PiecesTable, type PieceRow } from "@/components/drawing/PiecesTable";
import { UploadedSheets, type SheetRow } from "@/components/drawing/UploadedSheets";
import { VariablesPanel, type CurrentVariables } from "@/components/variables/VariablesPanel";
import { EDGE_RULE_LABEL, type PieceFormInput } from "@/modules/drawing/schema";

export const metadata: Metadata = { title: "Drawing & Variables" };

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && x !== "-"))].sort();
const g = (n: number) => String(+n.toPrecision(10));

function edgeExpr(rule: EdgeRule, L: number, W: number, divisor: number) {
  if (rule === "NONE") return "0";
  return rule === "FULL_PERIMETER" ? `2 × (${dim(L)} + ${dim(W)}) ÷ ${g(divisor)}` : `(${dim(L)} + ${dim(W)}) ÷ ${g(divisor)}`;
}

export default async function DrawingAndVariablesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const tz = process.env.APP_TIMEZONE || "Asia/Kolkata";
  const [pieces, batches, variables, others, edgeDefaults, { result }] = await Promise.all([
    prisma.drawingPiece.findMany({
      where: { projectId, deletedAt: null },
      include: { group: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.importBatch.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { pieces: { where: { deletedAt: null } } } } },
    }),
    prisma.variablesSheet.findUnique({ where: { projectId } }),
    prisma.project.findMany({
      where: { deletedAt: null, id: { not: projectId } },
      orderBy: { updatedAt: "desc" },
      include: { variables: { select: { fileName: true, materialLabel: true } } },
    }),
    getEdgeDefaults(),
    getProjectCalculation(projectId),
  ]);
  const byId = new Map(result.measurements.map((m) => [m.piece.id, m]));
  const conv = new Map(result.conversions.map((c) => [c.unit, c]));
  const checks = result.issues.filter((i) => i.check);
  const flagsOf = new Map<string, string[]>();
  for (const c of checks) if (c.pieceId) flagsOf.set(c.pieceId, [...(flagsOf.get(c.pieceId) ?? []), c.message.replace(/^Dwg \S+ piece \S+: /, "")]);

  const formOf = (p: (typeof pieces)[number]): PieceFormInput => ({
    dwgNo: p.dwgNo,
    group: p.group?.name ?? "",
    area: p.area ?? "",
    pieceNo: p.pieceNo,
    description: p.description,
    length: num(p.length)!,
    width: num(p.width)!,
    dimUnit: p.dimUnit,
    thickness: p.thickness ?? "",
    color: p.color ?? "",
    sinkModel: p.sinkModel ?? "",
    sinkCuts: p.sinkCuts,
    faucetHoles: p.faucetHoles,
    rCorners: p.rCorners,
    joints: p.joints,
    unitsQty: p.unitsQty,
    cuttingRule: p.cuttingRule,
    depRule: p.depRule,
    notes: p.notes ?? "",
  });
  const extraOf = (p: (typeof pieces)[number]) => (p.extra as Record<string, string> | null) ?? {};
  // Column order as in the uploaded sheets (JSON objects don't keep key order), then anything added later.
  const extraColumns = [
    ...new Set([
      ...batches.filter((b) => b._count.pieces > 0).flatMap((b) => (b.report as { extraColumns?: string[] } | null)?.extraColumns ?? []),
      ...pieces.flatMap((p) => Object.keys(extraOf(p))),
    ]),
  ].filter((c) => pieces.some((p) => extraOf(p)[c] !== undefined));

  const rows: PieceRow[] = pieces.map((p) => {
    const m = byId.get(p.id);
    const c = conv.get(p.dimUnit);
    const L = num(p.length)!;
    const W = num(p.width)!;
    return {
      id: p.id,
      source: p.source,
      unitSymbol: UNIT_SYMBOL[p.dimUnit],
      cuttingLf: m?.cuttingLf ?? 0,
      depLf: m?.depLf ?? 0,
      sqftPerPc: m?.sqftPerPc ?? 0,
      totalSqft: m?.totalSqft ?? 0,
      depRuleShort: EDGE_RULE_LABEL[p.depRule],
      formula: c
        ? {
            cutting: `${edgeExpr(p.cuttingRule, L, W, c.length.divisor)} = ${dec4(m?.cuttingLf)}`,
            dep: `${edgeExpr(p.depRule, L, W, c.length.divisor)} = ${dec4(m?.depLf)}`,
            sqft: `${dim(L)} × ${dim(W)} ÷ ${g(c.area.divisor)} = ${dec4(m?.sqftPerPc)}`,
          }
        : { cutting: "", dep: "", sqft: "" },
      extra: extraOf(p),
      flags: flagsOf.get(p.id) ?? [],
      form: formOf(p),
    };
  });

  const sheets: SheetRow[] = batches.map((b) => {
    // Sheets imported before extra columns were kept have only their header names in the report — no values.
    const report = (b.report as { extraColumns?: string[] } | null) ?? {};
    const own = pieces.filter((p) => p.importBatchId === b.id);
    return {
      id: b.id,
      fileName: b.fileName,
      uploadedAt: b.createdAt.toLocaleString("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }),
      uploadedBy: b.createdBy,
      mode: b.mode,
      rowsImported: b.rowsImported,
      activePieces: b._count.pieces,
      extraColumns: report.extraColumns ?? [...new Set(own.flatMap((p) => Object.keys(extraOf(p))))],
      rows: own.map((p) => ({ id: p.id, values: formOf(p), extra: extraOf(p) })),
    };
  });

  const current: CurrentVariables | null = variables
    ? {
        source: variables.source,
        fileName: variables.fileName,
        copiedFromLabel: variables.copiedFromLabel,
        materialLabel: variables.materialLabel,
        updatedAt: variables.updatedAt.toLocaleString("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }),
        values: variables.values as unknown as VariablesData,
        warnings: ((variables.report as { warnings?: string[] } | null)?.warnings ?? []).slice(0, 10),
      }
    : null;
  const reuseOptions = others.map((o) => ({
    id: o.id,
    label: `${o.code} — ${o.name}${o.variables ? ` · ${o.variables.materialLabel ?? o.variables.fileName ?? "variables sheet"}` : " · its rate card"}`,
  }));

  const suggestions = {
    groups: uniq(pieces.map((p) => p.group?.name)),
    areas: uniq(["Kitchen", "MB Vanity", "B2 Vanity", ...pieces.map((p) => p.area)]),
    thicknesses: uniq(["1.5cm", "2cm", "3cm", ...pieces.map((p) => p.thickness)]),
    colors: uniq(pieces.map((p) => p.color)),
    sinkModels: uniq(pieces.map((p) => p.sinkModel)),
  };

  return (
    <>
      <PageHeader title="Drawing & Variables" actions={pieces.length > 0 ? <ExportButtons scope="inputs" projectId={projectId} /> : undefined} />
      <IssuesBanner issues={result.issues.filter((i) => i.fixAt === "import-drawing" && !i.check)} projectId={projectId} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Section
          title={
            <span className="flex items-center gap-2">
              Drawing Summary Sheet <span className="badge bg-bad-bg text-bad-fg">Required</span>
            </span>
          }
        >
          <ImportPanel projectId={projectId} existingCount={pieces.length} />
        </Section>
        <Section
          title={
            <span className="flex items-center gap-2">
              Variables Sheet <span className="badge bg-mute-bg text-mute-fg">Optional</span>
            </span>
          }
        >
          <VariablesPanel projectId={projectId} current={current} reuseOptions={reuseOptions} />
        </Section>
      </div>

      <Section title="Uploaded drawing sheets" bodyClassName="p-0 overflow-x-auto">
        <UploadedSheets projectId={projectId} sheets={sheets} />
      </Section>

      {checks.length > 0 && (
        <section id="checks" className="scroll-mt-4">
          <Section title={`Data checks (${checks.length})`} description="Values to verify against the drawings. Nothing has been changed." bodyClassName="p-0 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th className="th">Check</th>
                  <th className="th">Detail</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.message}>
                    <td className="td whitespace-nowrap">
                      <span className="badge bg-warn-bg text-warn-fg">{c.code.replace(/_/g, " ").toLowerCase()}</span>
                    </td>
                    <td className="td">{c.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        </section>
      )}

      <Section title={`Drawing records — ${pieces.length} rows · ${result.drawingTotals.totalPcs.toLocaleString("en-US")} pcs`}>
        <PiecesTable projectId={projectId} rows={rows} totals={result.drawingTotals} suggestions={suggestions} extraColumns={extraColumns} />
        <details className="mt-4 rounded-lg border border-line">
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-brand">Add a piece manually</summary>
          <div className="border-t border-line p-3">
            <PieceForm projectId={projectId} suggestions={suggestions} defaults={edgeDefaults} />
          </div>
        </details>
      </Section>
    </>
  );
}

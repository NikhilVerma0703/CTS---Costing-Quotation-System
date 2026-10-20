import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getProjectCalculation } from "@/lib/engine/load";
import { UNIT_SYMBOL } from "@/lib/engine/types";
import { num } from "@/lib/utils";
import { PageHeader } from "@/components/ui/PageHeader";
import { Section } from "@/components/ui/Section";
import { ImportPanel } from "@/components/drawing/ImportPanel";
import { PieceForm } from "@/components/drawing/PieceForm";
import { PiecesTable, type PieceRow } from "@/components/drawing/PiecesTable";
import { EDGE_RULE_LABEL } from "@/modules/drawing/schema";

export const metadata: Metadata = { title: "Import Drawing Sheet" };

const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x && x !== "-"))].sort();

export default async function ImportDrawingPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [pieces, batches, { result }] = await Promise.all([
    prisma.drawingPiece.findMany({
      where: { projectId, deletedAt: null },
      include: { group: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.importBatch.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 8 }),
    getProjectCalculation(projectId),
  ]);
  const byId = new Map(result.measurements.map((m) => [m.piece.id, m]));

  const rows: PieceRow[] = pieces.map((p) => {
    const m = byId.get(p.id);
    return {
      id: p.id,
      source: p.source,
      unitSymbol: UNIT_SYMBOL[p.dimUnit],
      cuttingLf: m?.cuttingLf ?? 0,
      depLf: m?.depLf ?? 0,
      sqftPerPc: m?.sqftPerPc ?? 0,
      totalSqft: m?.totalSqft ?? 0,
      depRuleShort: EDGE_RULE_LABEL[p.depRule],
      form: {
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
      },
    };
  });

  const suggestions = {
    groups: uniq(pieces.map((p) => p.group?.name)),
    areas: uniq(["Kitchen", "MB Vanity", "B2 Vanity", ...pieces.map((p) => p.area)]),
    thicknesses: uniq(["1.5cm", "2cm", "3cm", ...pieces.map((p) => p.thickness)]),
    colors: uniq(pieces.map((p) => p.color)),
    sinkModels: uniq(pieces.map((p) => p.sinkModel)),
  };

  return (
    <>
      <PageHeader
        title="Import Drawing Sheet"
        description="Upload the drawing summary sheet (one row per piece). Columns are mapped by name and every row is checked before anything is saved. Pieces can also be added or corrected by hand below."
      />

      <Section title="Import drawing summary" description="Preview first — nothing is saved until you press Import.">
        <ImportPanel projectId={projectId} existingCount={pieces.length} />
        {batches.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-ink-2">Import history ({batches.length})</summary>
            <table className="mt-2 w-full text-[13px]">
              <thead>
                <tr>
                  <th className="th">When</th>
                  <th className="th">File</th>
                  <th className="th">Mode</th>
                  <th className="th num">Rows read</th>
                  <th className="th num">Imported</th>
                  <th className="th">By</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="td whitespace-nowrap">
                      {b.createdAt.toLocaleString("en-IN", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" })}
                    </td>
                    <td className="td">{b.fileName}</td>
                    <td className="td">{b.mode === "REPLACE" ? "Replaced all" : "Added"}</td>
                    <td className="td num">{b.rowsRead}</td>
                    <td className="td num">{b.rowsImported}</td>
                    <td className="td">{b.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </Section>

      <Section
        title={`Drawing records (${pieces.length} rows · ${result.drawingTotals.totalPcs.toLocaleString("en-US")} pcs)`}
        description="Imported and manually entered pieces. Editing a value here updates every calculation immediately."
      >
        <PiecesTable projectId={projectId} rows={rows} totals={result.drawingTotals} suggestions={suggestions} />
      </Section>

      <Section title="Manual entry" description="Same fields as the drawing summary sheet. After adding, Dwg#, Group, Area and unit stay filled for the next piece.">
        <PieceForm projectId={projectId} suggestions={suggestions} />
      </Section>
    </>
  );
}

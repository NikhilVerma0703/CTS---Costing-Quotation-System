"use server";

import { revalidatePath } from "next/cache";
import { prisma, type Tx } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { parseDrawingSheet, type ParseResult } from "@/lib/import/drawing-sheet";
import { pieceSchema, type PieceFormInput } from "./schema";

const MAX_BYTES = 8 * 1024 * 1024;
const blank = (s: string | undefined | null) => (s && s.trim().length ? s.trim() : null);

const refresh = (projectId: string) => revalidatePath(`/projects/${projectId}`, "layout");

async function readUpload(formData: FormData): Promise<{ name: string; data: ArrayBuffer } | string> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return "Choose a .xlsx or .csv file first.";
  if (file.size > MAX_BYTES) return "The file is larger than 8 MB.";
  return { name: file.name, data: await file.arrayBuffer() };
}

async function groupId(tx: Tx, projectId: string, name: string | null): Promise<string | null> {
  if (!name) return null;
  const g = await tx.drawingGroup.upsert({
    where: { projectId_name: { projectId, name } },
    update: {},
    create: { projectId, name },
  });
  return g.id;
}

/** Step 1: read and validate the file. Nothing is saved. */
export async function previewImport(formData: FormData): Promise<ActionResult<ParseResult>> {
  const up = await readUpload(formData);
  if (typeof up === "string") return fail(up);
  const result = await parseDrawingSheet(up.name, up.data);
  return ok(result);
}

/** Step 2: import the valid rows (the file is parsed again on the server). */
export async function commitImport(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number }>> {
  const up = await readUpload(formData);
  if (typeof up === "string") return fail(up);
  const mode = formData.get("mode") === "REPLACE" ? "REPLACE" : "APPEND";
  const parsed = await parseDrawingSheet(up.name, up.data);
  if (parsed.fileErrors.length) return fail(parsed.fileErrors.join(" "));
  const valid = parsed.rows.filter((r) => r.piece);
  if (valid.length === 0) return fail("No valid rows to import.");

  const user = currentUserName();
  try {
    await prisma.$transaction(async (tx) => {
      let replaced = 0;
      if (mode === "REPLACE") {
        const res = await tx.drawingPiece.updateMany({
          where: { projectId, deletedAt: null },
          data: { deletedAt: new Date(), updatedBy: user },
        });
        replaced = res.count;
      }
      const last = await tx.drawingPiece.aggregate({ where: { projectId, deletedAt: null }, _max: { sortOrder: true } });
      let order = last._max.sortOrder ?? 0;

      const batch = await tx.importBatch.create({
        data: {
          projectId,
          fileName: up.name,
          sheetName: parsed.sheetName,
          mode,
          status: "IMPORTED",
          rowsRead: parsed.rows.length,
          rowsImported: valid.length,
          createdBy: user,
          report: {
            headerRow: parsed.headerRow,
            dimUnit: parsed.dimUnit,
            mapping: parsed.mapping,
            unmappedHeaders: parsed.unmappedHeaders,
            fileWarnings: parsed.fileWarnings,
            skipped: parsed.rows.filter((r) => !r.piece).map((r) => ({ row: r.rowNumber, errors: r.errors })),
            warnings: parsed.rows.filter((r) => r.warnings.length).map((r) => ({ row: r.rowNumber, warnings: r.warnings })),
            replacedPieces: replaced,
          },
        },
      });

      const groupIds = new Map<string, string | null>();
      for (const r of valid) {
        const g = r.piece!.group;
        if (g && !groupIds.has(g)) groupIds.set(g, await groupId(tx, projectId, g));
      }

      await tx.drawingPiece.createMany({
        data: valid.map((r) => {
          const p = r.piece!;
          order += 10;
          return {
            projectId,
            groupId: p.group ? groupIds.get(p.group)! : null,
            importBatchId: batch.id,
            source: "IMPORT" as const,
            sortOrder: order,
            dwgNo: p.dwgNo,
            area: p.area,
            pieceNo: p.pieceNo,
            description: p.description,
            length: p.length,
            width: p.width,
            dimUnit: p.dimUnit,
            thickness: p.thickness,
            color: p.color,
            sinkModel: p.sinkModel,
            sinkCuts: p.sinkCuts,
            faucetHoles: p.faucetHoles,
            rCorners: p.rCorners,
            joints: p.joints,
            unitsQty: p.unitsQty,
            cuttingRule: p.cuttingRule,
            depRule: p.depRule,
            notes: p.notes,
            createdBy: user,
            updatedBy: user,
          };
        }),
      });

      await audit(tx, {
        projectId,
        entityType: "ImportBatch",
        entityId: batch.id,
        action: "IMPORT",
        summary: `${mode === "REPLACE" ? `Replaced ${replaced} pieces with` : "Added"} ${valid.length} pieces from ${up.name}` +
          (parsed.errorCount ? ` (${parsed.errorCount} rows skipped)` : ""),
      });
    });
    refresh(projectId);
    return ok(
      { imported: valid.length, skipped: parsed.errorCount },
      `Imported ${valid.length} piece${valid.length === 1 ? "" : "s"}${parsed.errorCount ? `, skipped ${parsed.errorCount}` : ""}`,
    );
  } catch (e) {
    return unexpected(e);
  }
}

/** Manual entry / edit of one piece. */
export async function savePiece(
  projectId: string,
  pieceId: string | null,
  values: PieceFormInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = pieceSchema.safeParse(values);
  if (!parsed.success) return fail("Please correct the highlighted fields.", zodFieldErrors(parsed.error.issues));
  const d = parsed.data;
  const user = currentUserName();
  try {
    const id = await prisma.$transaction(async (tx) => {
      const gid = await groupId(tx, projectId, blank(d.group));
      const data = {
        groupId: gid,
        dwgNo: d.dwgNo,
        area: blank(d.area),
        pieceNo: d.pieceNo,
        description: d.description,
        length: d.length,
        width: d.width,
        dimUnit: d.dimUnit,
        thickness: blank(d.thickness),
        color: blank(d.color),
        sinkModel: blank(d.sinkModel),
        sinkCuts: d.sinkCuts,
        faucetHoles: d.faucetHoles,
        rCorners: d.rCorners,
        joints: d.joints,
        unitsQty: d.unitsQty,
        cuttingRule: d.cuttingRule,
        depRule: d.depRule,
        notes: blank(d.notes),
        updatedBy: user,
      };
      if (pieceId) {
        const before = await tx.drawingPiece.findFirst({ where: { id: pieceId, projectId, deletedAt: null } });
        if (!before) throw new Error("Piece not found");
        await tx.drawingPiece.update({ where: { id: pieceId }, data });
        await audit(tx, {
          projectId,
          entityType: "DrawingPiece",
          entityId: pieceId,
          action: "UPDATE",
          summary: `Edited Dwg ${d.dwgNo} piece ${d.pieceNo}`,
          before: JSON.parse(JSON.stringify(before)),
          after: JSON.parse(JSON.stringify(data)),
        });
        return pieceId;
      }
      const last = await tx.drawingPiece.aggregate({ where: { projectId, deletedAt: null }, _max: { sortOrder: true } });
      const created = await tx.drawingPiece.create({
        data: { ...data, projectId, source: "MANUAL", sortOrder: (last._max.sortOrder ?? 0) + 10, createdBy: user },
      });
      await audit(tx, {
        projectId,
        entityType: "DrawingPiece",
        entityId: created.id,
        action: "CREATE",
        summary: `Added Dwg ${d.dwgNo} piece ${d.pieceNo} manually`,
        after: JSON.parse(JSON.stringify(data)),
      });
      return created.id;
    });
    refresh(projectId);
    return ok({ id }, pieceId ? "Piece updated" : "Piece added");
  } catch (e) {
    if (e instanceof Error && e.message === "Piece not found") return fail("That piece no longer exists.");
    return unexpected(e);
  }
}

/** Soft delete — the row stays in the database for history. */
export async function deletePiece(projectId: string, pieceId: string): Promise<ActionResult> {
  try {
    await prisma.$transaction(async (tx) => {
      const p = await tx.drawingPiece.findFirst({ where: { id: pieceId, projectId, deletedAt: null } });
      if (!p) return;
      await tx.drawingPiece.update({ where: { id: pieceId }, data: { deletedAt: new Date(), updatedBy: currentUserName() } });
      await audit(tx, {
        projectId,
        entityType: "DrawingPiece",
        entityId: pieceId,
        action: "DELETE",
        summary: `Removed Dwg ${p.dwgNo} piece ${p.pieceNo}`,
      });
    });
    refresh(projectId);
    return ok(undefined, "Piece removed");
  } catch (e) {
    return unexpected(e);
  }
}

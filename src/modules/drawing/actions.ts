"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma, type Tx } from "@/lib/db";
import { audit, currentUserName } from "@/lib/audit";
import { fail, ok, unexpected, zodFieldErrors, type ActionResult } from "@/lib/action-result";
import { parseDrawingSheet, type MappingOverrides, type ParseResult } from "@/lib/import/drawing-sheet";
import { getEdgeDefaults } from "@/lib/formulas";
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

/** The user's column answers, sent as JSON with the file. */
function overridesOf(formData: FormData): MappingOverrides {
  const raw = formData.get("mapping");
  if (typeof raw !== "string" || !raw) return {};
  try {
    const v = JSON.parse(raw) as MappingOverrides;
    return { columns: v.columns ?? {}, generate: Array.isArray(v.generate) ? v.generate : [] };
  } catch {
    return {};
  }
}

async function parseUpload(up: { name: string; data: ArrayBuffer }, formData: FormData) {
  return parseDrawingSheet(up.name, up.data, { overrides: overridesOf(formData), edgeDefaults: await getEdgeDefaults() });
}

/** Step 1: read and validate the file (with any column answers). Nothing is saved. */
export async function previewImport(formData: FormData): Promise<ActionResult<ParseResult>> {
  const up = await readUpload(formData);
  if (typeof up === "string") return fail(up);
  return ok(await parseUpload(up, formData));
}

/** Step 2: import the valid rows (the file is parsed again on the server). */
export async function commitImport(
  projectId: string,
  formData: FormData,
): Promise<ActionResult<{ imported: number; skipped: number }>> {
  const up = await readUpload(formData);
  if (typeof up === "string") return fail(up);
  const mode = formData.get("mode") === "REPLACE" ? "REPLACE" : "APPEND";
  const parsed = await parseUpload(up, formData);
  if (parsed.fileErrors.length) return fail(parsed.fileErrors.join(" "));
  if (parsed.needsMapping) return fail("Some columns still need your answer before importing.");
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
            extraColumns: parsed.unmappedHeaders,
            columns: parsed.columns.map((c) => ({ header: c.header, field: c.field, match: c.match })),
            generated: parsed.generated,
            addedDefaults: parsed.addedDefaults,
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
            extra: p.extra ?? undefined,
            sheetValues: p.sheetValues ?? undefined,
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

// ─── Uploaded sheets: edit and delete ───────────────────────────────────────

const editRowSchema = z.object({
  id: z.string().nullable(),
  values: pieceSchema,
  extra: z.record(z.string(), z.string().max(500)),
});

export interface SheetEdit {
  rows: { id: string | null; values: PieceFormInput; extra: Record<string, string> }[];
  deletedIds: string[];
  /** Extra (non-standard) columns, in order, after any rename / add / remove. */
  extraColumns: string[];
}

/**
 * Save the editable table of one uploaded drawing sheet: changed values,
 * added and removed rows, renamed / added / removed extra columns. Every row
 * is checked first; nothing is saved unless all rows are valid.
 */
export async function saveSheetEdits(projectId: string, batchId: string, edit: SheetEdit): Promise<ActionResult<{ changed: number }>> {
  const fieldErrors: Record<string, string> = {};
  const rows = edit.rows.map((r, i) => {
    const parsed = editRowSchema.safeParse(r);
    if (!parsed.success) {
      for (const [k, m] of Object.entries(zodFieldErrors(parsed.error.issues))) fieldErrors[`${i}.${k.replace(/^values\./, "")}`] = m;
      return null;
    }
    return parsed.data;
  });
  if (Object.keys(fieldErrors).length) return fail("Some cells need correcting (highlighted).", fieldErrors);
  const columns = [...new Set(edit.extraColumns.map((c) => c.trim()).filter(Boolean))].slice(0, 60);
  const user = currentUserName();
  try {
    const changed = await prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, projectId } });
      if (!batch) throw new Error("NO_BATCH");
      const existing = await tx.drawingPiece.findMany({ where: { importBatchId: batchId, projectId, deletedAt: null } });
      const byId = new Map(existing.map((p) => [p.id, p]));
      let n = 0;

      if (edit.deletedIds.length) {
        const res = await tx.drawingPiece.updateMany({
          where: { id: { in: edit.deletedIds }, importBatchId: batchId, projectId, deletedAt: null },
          data: { deletedAt: new Date(), updatedBy: user },
        });
        n += res.count;
      }
      const last = await tx.drawingPiece.aggregate({ where: { projectId, deletedAt: null }, _max: { sortOrder: true } });
      let order = last._max.sortOrder ?? 0;
      for (const row of rows) {
        const r = row!;
        const d = r.values;
        const extra = Object.fromEntries(columns.map((c) => [c, r.extra[c] ?? ""]).filter(([, v]) => v !== ""));
        const data = {
          groupId: await groupId(tx, projectId, blank(d.group)),
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
        const extraJson = Object.keys(extra).length ? (extra as Prisma.InputJsonValue) : Prisma.DbNull;
        if (r.id) {
          const before = byId.get(r.id);
          if (!before) continue;
          const keys = Object.keys(data) as (keyof typeof data)[];
          // Compare extra columns key by key: stored JSON does not keep key order.
          const beforeExtra = (before.extra as Record<string, string> | null) ?? {};
          const extraKeys = new Set([...Object.keys(beforeExtra), ...Object.keys(extra)]);
          const same =
            keys.every((k) => k === "updatedBy" || String(before[k] ?? "") === String(data[k] ?? "")) &&
            [...extraKeys].every((k) => (beforeExtra[k] ?? "") === (extra[k] ?? ""));
          if (same) continue;
          // Edited dimensions or quantity make the sheet's own calculated values stale.
          const stale =
            Number(before.length) !== data.length || Number(before.width) !== data.width || before.unitsQty !== data.unitsQty || before.dimUnit !== data.dimUnit;
          await tx.drawingPiece.update({
            where: { id: r.id },
            data: { ...data, extra: extraJson, ...(stale ? { sheetValues: Prisma.DbNull } : {}) },
          });
        } else {
          order += 10;
          await tx.drawingPiece.create({
            data: { ...data, extra: extraJson, projectId, importBatchId: batchId, source: "IMPORT", sortOrder: order, createdBy: user },
          });
        }
        n += 1;
      }
      const report = (batch.report as Record<string, unknown> | null) ?? {};
      await tx.importBatch.update({ where: { id: batchId }, data: { report: { ...report, extraColumns: columns } as Prisma.InputJsonValue } });
      await audit(tx, {
        projectId,
        entityType: "ImportBatch",
        entityId: batchId,
        action: "UPDATE",
        summary: `Edited sheet ${batch.fileName}: ${n} row${n === 1 ? "" : "s"} changed`,
      });
      return n;
    });
    refresh(projectId);
    return ok({ changed }, changed ? `Saved ${changed} change${changed === 1 ? "" : "s"} — every section is recalculated` : "No changes to save");
  } catch (e) {
    if (e instanceof Error && e.message === "NO_BATCH") return fail("That sheet no longer exists.");
    return unexpected(e);
  }
}

/**
 * Permanently delete one uploaded drawing sheet and every piece it brought in
 * (including pieces it replaced earlier, which were kept only for history).
 * Plan groups left empty are removed. Other uploads, manual pieces, rates,
 * formulas and issued quote revisions (frozen copies) are not touched.
 */
export async function deleteImportBatch(projectId: string, batchId: string): Promise<ActionResult> {
  try {
    const active = await prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.findFirst({ where: { id: batchId, projectId } });
      if (!batch) return null;
      const live = await tx.drawingPiece.count({ where: { importBatchId: batchId, deletedAt: null } });
      const removed = await tx.drawingPiece.deleteMany({ where: { importBatchId: batchId, projectId } });
      await tx.importBatch.delete({ where: { id: batchId } });
      await tx.drawingGroup.deleteMany({ where: { projectId, pieces: { none: {} } } });
      await audit(tx, {
        projectId,
        entityType: "ImportBatch",
        entityId: batchId,
        action: "DELETE",
        summary: `Deleted sheet ${batch.fileName} permanently (${live} active piece${live === 1 ? "" : "s"}, ${removed.count} records)`,
      });
      return live;
    });
    refresh(projectId);
    return ok(undefined, active === null ? "Already deleted" : `Sheet deleted — ${active} piece${active === 1 ? "" : "s"} removed from the costing`);
  } catch (e) {
    return unexpected(e);
  }
}

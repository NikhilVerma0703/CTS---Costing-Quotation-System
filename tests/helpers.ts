import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { importProject, type UploadFile } from "@/lib/import";
import { DEFAULT_VARIABLES, type ProjectData } from "@/lib/model";

export const REF = path.resolve(__dirname, "..", "reference-sheets");

export function upload(file: string): UploadFile {
  const buf = readFileSync(path.join(REF, file));
  return { name: path.basename(file), data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
}

export async function importFile(file: string, name?: string): Promise<ProjectData> {
  const result = await importProject({ drawing: upload(file) }, { fallback: DEFAULT_VARIABLES, name });
  if (!result.data) throw new Error(`Import of ${file} failed: ${result.errors.join("; ")}`);
  return result.data;
}

export async function loadBook(file: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(REF, file));
  return wb;
}

/** A cell's value as the workbook last calculated it. ExcelJS leaves `result` empty when the saved result is 0. */
export function cached(ws: ExcelJS.Worksheet, ref: string): number | string | null {
  const raw = ws.getCell(ref).value as unknown;
  if (raw && typeof raw === "object" && ("formula" in raw || "sharedFormula" in raw)) {
    const r = (raw as { result?: unknown }).result;
    return r === undefined ? 0 : (r as number | string);
  }
  return (raw as number | string | null) ?? null;
}

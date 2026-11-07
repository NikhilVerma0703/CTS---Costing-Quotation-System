/** The uploads the workflow promises: Drawing only, Drawing + Variables, odd headers, re-uploads. */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/engine";
import { importProject, inferEdge, parseNumber, replaceDrawing, replaceVariables, type UploadFile } from "@/lib/import";
import { DEFAULT_VARIABLES, variablesForReuse } from "@/lib/model";
import { importFile, upload } from "./helpers";

const opts = { fallback: DEFAULT_VARIABLES };
const LENNAR = "Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx";
const P1633 = "Project_1633_The_Approach_Quote.xlsx";
const PEORIA = "Peoria_Gateway_Quote_Ver10.xlsx";

async function sheetOnly(file: string, keep: string[]): Promise<UploadFile> {
  const wb = new ExcelJS.Workbook();
  const src = upload(file);
  await wb.xlsx.load(src.data as never);
  for (const ws of [...wb.worksheets]) if (!keep.includes(ws.name)) wb.removeWorksheet(ws.id);
  const out = await wb.xlsx.writeBuffer();
  return { name: `${keep.join("+")}.xlsx`, data: out as ArrayBuffer };
}

function csv(text: string): UploadFile {
  return { name: "drawing.csv", data: new TextEncoder().encode(text).buffer as ArrayBuffer };
}

describe("Drawing Summary only: stored variables are used", () => {
  it("generates a full costing from the Drawing sheet alone", async () => {
    const r = await importProject({ drawing: await sheetOnly(LENNAR, ["Drawing Summary"]) }, opts);
    expect(r.errors).toEqual([]);
    const d = r.data!;
    expect(d.pieces.length).toBe(22);
    expect(d.importNotes.join(" ")).toMatch(/No Variables sheet/);
    const result = calculate(d);
    // Stored rates price it, and the numbers match the sheet where the rates are the same.
    const expectedFabrication = await importFile(LENNAR).then((x) => calculate(x).internal.components.cutting);
    expect(result.internal.components.cutting).toBeCloseTo(expectedFabrication, 6);
    expect(result.slabs[0].estimated).toBe(true);
    expect(result.summary.totalCustomer).toBeGreaterThan(0);
  });

  it("splits the stored material rate by color when the drawing has several colors", async () => {
    const r = await importProject({ drawing: await sheetOnly(PEORIA, ["Drawing Summary"]) }, opts);
    const rows = r.data!.variables.rates.filter((x) => x.kind === "material");
    expect(rows.map((x) => x.match)).toEqual(["Pure White", "Calacatta Gold"]);
    expect(rows.every((x) => x.needsConfirm)).toBe(true);
    expect(calculate(r.data!).checks.some((c) => /Confirm/.test(c.text))).toBe(true);
  });

  it("reuses another project's variables without its slab results", async () => {
    const peoria = await importFile(PEORIA);
    const reuse = variablesForReuse(peoria.variables);
    const r = await importProject({ drawing: await sheetOnly(PEORIA, ["Drawing Summary"]) }, { fallback: reuse, fallbackLabel: "Peoria's rate card" });
    const rows = r.data!.variables.rates.filter((x) => x.kind === "material");
    expect(rows.map((x) => x.myCost)).toEqual([4.5, 8.12]);
    expect(rows.every((x) => x.slabs === null && x.usedSqft === null)).toBe(true);
    expect(r.data!.importNotes.join(" ")).toMatch(/Peoria/);
  });
});

describe("Drawing Summary + Variables as two files", () => {
  it.each([
    [LENNAR, 3.5],
    [PEORIA, 4.5],
    [P1633, 3.8],
  ])("%s", async (file, firstRate) => {
    const r = await importProject({ drawing: await sheetOnly(file, ["Drawing Summary"]), variables: await sheetOnly(file, ["Variables"]) }, opts);
    expect(r.errors).toEqual([]);
    expect(r.data!.variables.rates[0].myCost).toBe(firstRate);
    expect(r.data!.importNotes.join(" ")).not.toMatch(/No Variables sheet/);
  });

  it("the 1633 slab counts come from its Variables sheet", async () => {
    const r = await importProject({ drawing: await sheetOnly(P1633, ["Drawing Summary"]), variables: await sheetOnly(P1633, ["Variables"]) }, opts);
    const res = calculate(r.data!);
    expect(res.slabTotals.totalSlabs).toBe(55);
    expect(res.slabs.map((g) => g.usedSource)).toEqual(["percent", "percent"]);
  });

  it("rejects a Variables file that is not one", async () => {
    const r = await importProject({ drawing: await sheetOnly(LENNAR, ["Drawing Summary"]), variables: await sheetOnly(LENNAR, ["Quote Summary"]) }, opts);
    expect(r.errors[0]).toMatch(/doesn't look like a Variables sheet/);
  });
});

describe("The formatted copies read the same as the originals", () => {
  it.each([
    [LENNAR, "formatted/Lennar_NWA_Brighton_Park_Quote_Ver5_Formatted.xlsx"],
    [P1633, "formatted/Project_1633_The_Approach_Quote_Formatted.xlsx"],
    [PEORIA, "formatted/Peoria_Gateway_Quote_Ver10_Formatted.xlsx"],
  ])("%s", async (original, formatted) => {
    const a = calculate(await importFile(original));
    const b = calculate(await importFile(formatted));
    expect(b.rows.length).toBe(a.rows.length);
    expect(b.summary.totalCustomer).toBeCloseTo(a.summary.totalCustomer, 6);
    expect(b.summary.totalInternal).toBeCloseTo(a.summary.totalInternal, 6);
    expect(b.slabTotals.totalSlabs).toBe(a.slabTotals.totalSlabs);
  });
});

describe("Unusual sheets", () => {
  const rows = (header: string) => `${header}\n1,Group A,Kitchen,1,Island Top,100,50,2,3\n1,Group A,Kitchen,2,Return Top,30,25,0,3\nTOTAL,,,,,,,,\n`;

  it("reads a CSV, assumes the standard edge rules, and skips the total row", async () => {
    const r = await importProject({ drawing: csv(rows("Dwg,Group,Area,Piece,Description,L (in),W (in),Sink Cuts,Qty")) }, opts);
    expect(r.errors).toEqual([]);
    const [a, b] = r.data!.pieces;
    expect(r.data!.pieces.length).toBe(2);
    expect(a.cutRule).toBe("perimeter");
    expect(a.depRule).toBe("perimeter"); // island top
    expect(b.depRule).toBe("l+w");
    expect(a.sinkCuts).toBe(2);
    expect(a.qty).toBe(3);
  });

  it("asks which column is which when a required one can't be recognised, then uses the answer", async () => {
    const file = csv(rows("Dwg,Group,Area,Piece,Description,Long Side,W (in),Sink Cuts,Qty"));
    const first = await importProject({ drawing: file }, opts);
    expect(first.mappingNeeded?.missing).toEqual(["length"]);
    const col = first.mappingNeeded!.headers.find((h) => h.text === "Long Side")!.index;
    const second = await importProject({ drawing: file }, { ...opts, mapping: { length: col } });
    expect(second.data!.pieces[0].length).toBe(100);
  });

  it("converts millimetres from the header", async () => {
    const r = await importProject({ drawing: csv("Dwg,Piece,Description,L (mm),W (mm),Qty\n1,1,Top,3048,1524,2\n") }, opts);
    const res = calculate(r.data!);
    expect(r.data!.dimUnit).toBe("mm");
    expect(res.rows[0].sqftPerPc).toBeCloseTo(50, 8);
    expect(res.rows[0].cutLf).toBeCloseTo(30, 8);
  });

  it("keeps columns it has no field for", async () => {
    const r = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Qty,Vendor Ref\n1,1,Top,100,50,2,ABC-9\n") }, opts);
    expect(r.data!.extraColumns).toEqual(["Vendor Ref"]);
    expect(r.data!.pieces[0].extra).toEqual({ "Vendor Ref": "ABC-9" });
  });

  it("keeps a real piece whose wording starts with Total, and still skips the total row", async () => {
    const r = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Qty\n1,1,Total Wall Top,100,50,2\n,,TOTAL,,,2\n") }, opts);
    expect(r.data!.pieces.map((p) => p.description)).toEqual(["Total Wall Top"]);
    expect(r.data!.importNotes.join(" ")).not.toMatch(/skipped/);
  });

  it("says when a row is dropped or a count can't be read, instead of quietly using 0", async () => {
    const r = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Sink Cuts,Qty\n1,1,Top,100,50,2 ea,3\n1,2,Top,,50,0,3\n1,3,Top,100,50,-,many\n") }, opts);
    const notes = r.data!.importNotes.join(" | ");
    expect(r.data!.pieces.length).toBe(2);
    expect(r.data!.pieces[0].sinkCuts).toBe(0);
    expect(notes).toMatch(/"2 ea" under Sink Cuts is not a number/);
    expect(notes).toMatch(/Row 3 .* was skipped/);
    expect(notes).toMatch(/"many" under Qty is not a number/);
    expect(notes).not.toMatch(/"-"/);
  });

  it("says which edge rules it assumed when the sheet has no LF columns", async () => {
    const bare = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Qty\n1,1,Top,100,50,2\n") }, opts);
    expect(bare.data!.importNotes.join(" ")).toMatch(/No Cutting LF column.*No DE&P LF column/);
    const full = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Qty,Cutting LF,DE&P LF\n1,1,Top,120,60,2,30,15\n") }, opts);
    expect(full.data!.importNotes.join(" ")).not.toMatch(/column/);
    expect(full.data!.pieces[0]).toMatchObject({ cutRule: "perimeter", depRule: "l+w", cutLf: null, depLf: null });
  });

  it("says when a Variables sheet leaves a rate empty", async () => {
    const variables: UploadFile = { name: "variables.csv", data: new TextEncoder().encode("Cost Item,Unit,My Cost,Customer Charge\nCutting,per linear ft,,0.3\nSink Cutout,per cutout,2,\n").buffer as ArrayBuffer };
    const r = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Qty\n1,1,Top,100,50,2\n"), variables }, opts);
    const notes = r.data!.importNotes.join(" | ");
    expect(notes).toMatch(/Cutting: My Cost is empty/);
    expect(notes).toMatch(/Sink Cutout: Customer Charge is empty, so it follows My Cost/);
    const res = calculate(r.data!);
    const sink = r.data!.variables.rates.find((x) => x.kind === "sink")!;
    expect(res.rates[sink.id].customer).toBe(2);
  });

  it("reads a DE&P length column in its own unit, whatever unit the sizes are in", async () => {
    const r = await importProject({ drawing: csv("Dwg,Piece,Description,L (mm),W (mm),Qty,DE&P (in),Cutting LF\n1,1,Top,3048,1524,2,120,30\n") }, opts);
    const d = r.data!;
    expect(d.labels.depIn).toBe("DE&P (mm)");
    expect(d.pieces[0].depRule).toBe("l"); // 120 in = 10 ft = L
    expect(d.pieces[0].depLf).toBeNull();
    expect(calculate(d).rows[0].depLf).toBeCloseTo(10, 8);
  });

  it("says so when a file can't be used", async () => {
    const bad = await importProject({ drawing: { name: "x.pdf", data: new ArrayBuffer(4) } }, opts);
    expect(bad.errors[0]).toMatch(/only .xlsx and .csv/);
    const junk = await importProject({ drawing: { name: "x.xlsx", data: new TextEncoder().encode("not a workbook").buffer as ArrayBuffer } }, opts);
    expect(junk.errors[0]).toMatch(/could not be read/);
    const noPieces = await importProject({ drawing: csv("Dwg,Piece,Description,L (in),W (in),Qty\n") }, opts);
    expect(noPieces.errors[0]).toMatch(/no pieces/);
  });
});

describe("A workbook is checked against its own results on upload", () => {
  it("stays quiet when they agree", async () => {
    for (const file of [LENNAR, PEORIA, P1633, "Project_1633_The_Approach_Quote.calculated.xlsx"]) {
      const d = await importFile(file);
      expect(d.importNotes.join(" "), file).not.toMatch(/uploaded workbook shows/);
    }
  });
  it("speaks up when a figure was typed over a formula", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(upload(LENNAR).data as never);
    // A cost cell typed over: its row and the sheet total no longer follow the rates.
    wb.getWorksheet("Internal Costing")!.getCell("P26").value = 70000;
    const out = await wb.xlsx.writeBuffer();
    const r = await importProject({ drawing: { name: "typed-over.xlsx", data: out as ArrayBuffer } }, opts);
    const notes = r.data!.importNotes.join(" ");
    expect(notes).toMatch(/Total Cost on Internal Costing as 70,000, but its inputs calculate to 69,844\.4/);
    // The numbers themselves still come from the inputs.
    expect(calculate(r.data!).internal.total).toBeCloseTo(69844.3999424342, 6);
  });
});

describe("Re-uploading into an existing project", () => {
  it("says when it clears hand-edited cost cells", async () => {
    const d = await importFile(LENNAR);
    d.overrides.internal[d.pieces[0].id] = { sink: 9, cutting: 1 };
    const variables = await replaceVariables(d, await sheetOnly(LENNAR, ["Variables"]));
    expect(variables.data!.overrides.internal).toEqual({});
    expect(variables.data!.importNotes.join(" ")).toMatch(/2 hand-edited cost cells were cleared/);
    const drawing = await replaceDrawing(d, await sheetOnly(LENNAR, ["Drawing Summary"]));
    expect(drawing.data!.importNotes.join(" ")).toMatch(/2 hand-edited cost cells were cleared/);
  });

  it("a new Variables sheet keeps the pieces and the slab counts", async () => {
    const d = await importFile(LENNAR);
    const r = await replaceVariables(d, await sheetOnly(PEORIA, ["Variables"]));
    expect(r.errors).toEqual([]);
    expect(r.data!.pieces.length).toBe(22);
    expect(r.data!.variables.rates[0].myCost).toBe(4.5);
    expect(calculate(r.data!).slabTotals.totalSlabs).toBeGreaterThan(0);
  });

  it("a new Drawing Summary keeps the rates and clears edits that pointed at old pieces", async () => {
    const d = await importFile(LENNAR);
    d.overrides.internal[d.pieces[0].id] = { sink: 9 };
    const r = await replaceDrawing(d, await sheetOnly(PEORIA, ["Drawing Summary"]));
    expect(r.data!.pieces.length).toBe(83);
    expect(r.data!.variables.rates[0].myCost).toBe(3.5);
    expect(r.data!.overrides.internal).toEqual({});
    expect(r.data!.importNotes.join(" ")).toMatch(/re-run CutList/);
  });
});

describe("Small parsers", () => {
  it("parseNumber", () => {
    expect(parseNumber("93 1/4")).toBe(93.25);
    expect(parseNumber("3/4")).toBe(0.75);
    expect(parseNumber("1,234.5")).toBe(1234.5);
    expect(parseNumber("$3.50")).toBe(3.5);
    expect(parseNumber("Rs 200,000")).toBe(200000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
  });

  it("inferEdge keeps a rounded figure as typed, and an exact one as the rule alone", () => {
    expect(inferEdge((2 * (83.5 + 37.75)) / 12, 83.5, 37.75, 12)).toEqual({ rule: "perimeter", typed: null });
    expect(inferEdge(20.2083, 83.5, 37.75, 12)).toEqual({ rule: "perimeter", typed: 20.2083 });
    expect(inferEdge(2.0625, 24.75, 4, 12)).toEqual({ rule: "l", typed: null });
    expect(inferEdge(99, 24.75, 4, 12)).toEqual({ rule: "manual", typed: 99 });
  });
});

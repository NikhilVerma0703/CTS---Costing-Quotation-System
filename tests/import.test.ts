import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDrawingSheet } from "@/lib/import/drawing-sheet";
import { BRIGHTON_PARK } from "@/lib/reference/brighton-park";

const file = path.resolve(__dirname, "..", "reference-sheets", "2_Drawing_Summary.xlsx");
const buf = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const csv = (s: string) => buf(Buffer.from(s, "utf-8"));

describe("drawing sheet import", () => {
  it("reads the reference Drawing Summary exactly", async () => {
    const r = await parseDrawingSheet("2_Drawing_Summary.xlsx", buf(fs.readFileSync(file)));
    expect(r.fileErrors).toEqual([]);
    expect(r.headerRow).toBe(4);
    expect(r.dimUnit).toBe("IN");
    expect(r.rows).toHaveLength(22); // TOTAL row skipped
    expect(r.errorCount).toBe(0);
    expect(r.rows.flatMap((x) => x.warnings)).toEqual([]); // sheet's own P..T agree with the engine
    r.rows.forEach((row, i) => {
      const ref = BRIGHTON_PARK.pieces[i];
      const p = row.piece!;
      expect(p.dwgNo).toBe(ref.dwgNo);
      expect(p.pieceNo).toBe(ref.pieceNo);
      expect(p.group).toBe(ref.group);
      expect(p.length).toBe(ref.length);
      expect(p.width).toBe(ref.width);
      expect(p.unitsQty).toBe(ref.unitsQty);
      expect(p.sinkCuts).toBe(ref.sinkCuts);
      expect(p.joints).toBe(ref.joints);
      expect(p.depRule).toBe(ref.depRule); // read back from DE&P LF
      expect(p.sinkModel).toBe(ref.sinkModel);
    });
  });

  it("accepts mm, alternate headers and fractions from CSV", async () => {
    const r = await parseDrawingSheet(
      "x.csv",
      csv('Drawing No,Plan Group,Room,Pc,Desc,Length (mm),Width (mm),Qty,Sink Cutouts,Remarks\n12,"G, 1",Kitchen,1,Island Top,2368.55,1136.65,4,1,"ok"\n'),
    );
    expect(r.ok).toBe(true);
    expect(r.dimUnit).toBe("MM");
    expect(r.rows[0].piece).toMatchObject({ dwgNo: "12", group: "G, 1", pieceNo: "1", unitsQty: 4, sinkCuts: 1 });
    expect(r.rows[0].piece!.depRule).toBe("FULL_PERIMETER"); // island, no DE&P column
  });

  it("rejects bad rows but keeps good ones", async () => {
    const r = await parseDrawingSheet(
      "x.csv",
      csv("Dwg#,Piece,Description,L (in),W (in),Units Qty,Sink Cuts\n1,1,Top,10,20,5,0\n2,,Top,abc,-3,1.5,x\n3,1,Top,93 1/4,44 3/4,2,\n"),
    );
    expect(r.validCount).toBe(2);
    expect(r.errorCount).toBe(1);
    const bad = r.rows[1];
    expect(bad.piece).toBeNull();
    expect(bad.errors.join(" ")).toMatch(/Piece is empty/);
    expect(bad.errors.join(" ")).toMatch(/not a number/);
    expect(r.rows[2].piece!.length).toBe(93.25);
  });

  it("asks for a missing required column instead of guessing", async () => {
    const r = await parseDrawingSheet("x.csv", csv("Dwg#,Piece,Description,L (in),W (in)\n1,1,Top,10,20\n"));
    expect(r.ok).toBe(false);
    expect(r.needsMapping).toBe(true);
    expect(r.missingRequired).toEqual(["unitsQty"]);
  });

  it("recognises differently named columns and keeps extra ones", async () => {
    const r = await parseDrawingSheet(
      "x.csv",
      csv(
        "DWG NO,Unit Type / Group,Area,Piece,Description,Length (in),Width (in),Sink Cuts,Units Qty,Sqft / Piece,Qty AS,Qty R,Total Units\n" +
          "4,BERGA,Kitchen,1,Island Top,93.25,44.75,1,53,28.98,30,23,53\n",
      ),
    );
    expect(r.ok).toBe(true);
    expect(r.mapping).toMatchObject({ dwgNo: "DWG NO", group: "Unit Type / Group", length: "Length (in)", sqftPerPc: "Sqft / Piece" });
    expect(r.columns.find((c) => c.header === "Unit Type / Group")!.match).toBe("auto");
    expect(r.unmappedHeaders).toEqual(["Qty AS", "Qty R", "Total Units"]);
    const p = r.rows[0].piece!;
    expect(p.group).toBe("BERGA");
    expect(p.extra).toEqual({ "Qty AS": "30", "Qty R": "23", "Total Units": "53" });
    expect(p.sheetValues).toEqual({ sqftPerPc: 28.98 });
    expect(r.addedDefaults).toContain("faucetHoles");
  });

  it("flags an ambiguous column and applies the user's choice", async () => {
    const sheet = csv("Dwg#,Piece,Description,L,W,Qty,Joints,Joint DE&P\n1,1,Top,10,20,2,0,3\n");
    const first = await parseDrawingSheet("x.csv", sheet);
    const col = first.columns.find((c) => c.header === "Joint DE&P")!;
    expect(col.match).toBe("ambiguous");
    expect(col.candidates).toEqual(["depLf"]); // Joints already has its own column
    expect(first.needsMapping).toBe(true);
    const second = await parseDrawingSheet("x.csv", sheet, { overrides: { columns: { [col.index]: "extra" } } });
    expect(second.ok).toBe(true);
    expect(second.rows[0].piece!.extra).toEqual({ "Joint DE&P": "3" });
  });

  it("uses Total Pcs for Units Qty and generates piece numbers only when agreed", async () => {
    const sheet = csv("Drawing,Area,L (in),W (in),Total Pcs\n7,Kitchen,30,20,4\n7,Kitchen,10,20,2\n");
    const ask = await parseDrawingSheet("x.csv", sheet);
    expect([...ask.missingRequired].sort()).toEqual(["description", "pieceNo"]);
    const r = await parseDrawingSheet("x.csv", sheet, { overrides: { generate: ["pieceNo", "description"] } });
    expect(r.ok).toBe(true);
    expect(r.rows.map((x) => x.piece!.pieceNo)).toEqual(["1", "2"]);
    expect(r.rows[0].piece).toMatchObject({ unitsQty: 4, description: "Kitchen" });
    expect(r.fileWarnings.join(" ")).toMatch(/Total Pcs/);
  });

  it("takes edge rules from the stored standard formulas", async () => {
    const r = await parseDrawingSheet("x.csv", csv("Dwg#,Piece,Description,L,W,Units Qty\n1,1,Top,10,20,1\n"), {
      edgeDefaults: { cuttingRule: "ONE_LENGTH_ONE_WIDTH", depRule: "NONE", islandDepRule: "FULL_PERIMETER" },
    });
    expect(r.rows[0].piece).toMatchObject({ cuttingRule: "ONE_LENGTH_ONE_WIDTH", depRule: "NONE" });
  });
});

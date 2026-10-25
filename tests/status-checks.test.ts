import { describe, expect, it } from "vitest";
import { calculateProject, edgeLength } from "@/lib/engine/calculate";
import { projectStatus } from "@/lib/status";
import { DEFAULT_EDGE_RULES, STANDARD_FORMULAS, edgeExpression } from "@/lib/reference/standard-formulas";
import { referenceEngineInput } from "./helpers/reference-input";

describe("project and quote status", () => {
  const base = { stored: "DRAFT" as const, pieceRows: 22, issues: [], ready: true, liveQuote: 86151.15, latestRevision: null };

  it("follows the data, not the stored label", () => {
    expect(projectStatus({ ...base, pieceRows: 0, ready: false }).stage).toBe("SETUP");
    expect(projectStatus(base)).toMatchObject({ stage: "READY", quote: { label: "Draft — not issued", value: 86151.15 } });
    // Seeded as QUOTED with no revision: not quoted.
    expect(projectStatus({ ...base, stored: "QUOTED" }).stage).toBe("READY");
  });

  it("names the reason a quote is blocked", () => {
    const s = projectStatus({
      ...base,
      ready: false,
      issues: [{ severity: "error", code: "NO_SLAB_COUNT", message: "Slab count missing" }],
    });
    expect(s.stage).toBe("IN_PROGRESS");
    expect(s.quote).toMatchObject({ label: "Slab count missing", value: null });
  });

  it("shows issued and changed-since revisions", () => {
    const rev = { revisionNo: 1, quoteNumber: "Q-X-R1", totalQuote: 86151.15 };
    expect(projectStatus({ ...base, latestRevision: rev })).toMatchObject({ stage: "QUOTED", quote: { label: "Issued Q-X-R1", value: 86151.15 } });
    expect(projectStatus({ ...base, latestRevision: rev, liveQuote: 90000 }).quote.label).toBe("Changed since R1");
    expect(projectStatus({ ...base, stored: "WON", latestRevision: rev }).stage).toBe("WON");
  });
});

describe("data checks", () => {
  it("leaves the reference workbook clean", () => {
    const r = calculateProject(referenceEngineInput());
    expect(r.issues.filter((i) => i.check)).toEqual([]);
  });

  it("flags suspicious values without changing any figure", () => {
    const input = referenceEngineInput();
    const clean = calculateProject(input);
    input.pieces[0] = { ...input.pieces[0], length: 2368.55, sinkModel: "ASI-2003", sinkCuts: 0 }; // mm typed into an inch sheet
    input.pieces[1] = { ...input.pieces[1], sheetValues: { sqftPerPc: 7 } };
    input.pieces.push({ ...input.pieces[2], id: "dup" });
    const r = calculateProject(input);
    const codes = r.issues.filter((i) => i.check).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["UNIT_SUSPECT", "LARGER_THAN_SLAB", "SINK_WITHOUT_CUTOUT", "SHEET_MISMATCH", "DUPLICATE_PIECE"]));
    expect(r.issues.filter((i) => i.check).every((i) => i.severity === "warning")).toBe(true);
    // Checks never touch the numbers: piece 2 still uses the formula, not the sheet's 7.
    expect(r.measurements[1].sqftPerPc).toBe(clean.measurements[1].sqftPerPc);
  });

  it("flags a Variables sheet built on a different drawing total", () => {
    const input = { ...referenceEngineInput(), variablesSheet: { fileName: "v.xlsx", totalSqft: 15000, packingPerSqft: 0.42 } };
    expect(calculateProject(input).issues.map((i) => i.code)).toContain("VARIABLES_SQFT_CHANGED");
  });
});

describe("standard formula registry", () => {
  it("has unique codes and edge expressions that match the engine", () => {
    const codes = STANDARD_FORMULAS.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const f of STANDARD_FORMULAS.filter((x) => x.edgeRule)) {
      expect(f.expression).toBe(edgeExpression(f.edgeRule!));
      // 10 × 20 in: the expression and the engine give the same LF.
      const lf = edgeLength(f.edgeRule!, 10, 20) / 12;
      expect(lf).toBeCloseTo(f.edgeRule === "FULL_PERIMETER" ? 5 : 2.5, 10);
    }
    expect(DEFAULT_EDGE_RULES).toEqual({
      cuttingRule: STANDARD_FORMULAS.find((f) => f.code === "CUTTING_LF")!.edgeRule,
      depRule: STANDARD_FORMULAS.find((f) => f.code === "DEP_LF")!.edgeRule,
      islandDepRule: STANDARD_FORMULAS.find((f) => f.code === "DEP_LF_ISLAND")!.edgeRule,
    });
  });
});

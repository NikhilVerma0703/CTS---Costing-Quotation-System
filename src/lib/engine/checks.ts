/**
 * Data checks: values that look wrong and should be verified against the
 * drawings. They are warnings only — the engine never changes a value because
 * of them, and they never block the quote. Each names the piece it is about.
 */
import type { DrawingTotals, EngineInput, Issue, PieceMeasurement } from "./types";

const FT_PER: Record<string, number> = { IN: 1 / 12, MM: 1 / 304.8, CM: 1 / 30.48, FT: 1, M: 1 / 0.3048 };
const near = (a: number, b: number) => Math.abs(a - b) <= 0.005 + 1e-6 * Math.abs(b);
const r4 = (n: number) => +n.toFixed(4);
const hasSinkModel = (s: string | null) => !!s && !/^[-–—\s]*$/.test(s) && !/^(none|n\/?a|no)$/i.test(s.trim());

export function dataChecks(input: EngineInput, measurements: PieceMeasurement[], totals: DrawingTotals): Issue[] {
  const out: Issue[] = [];
  const flag = (m: PieceMeasurement, code: string, text: string) =>
    out.push({
      severity: "warning",
      check: true,
      code,
      pieceId: m.piece.id,
      fixAt: "import-drawing",
      message: `Dwg ${m.piece.dwgNo} piece ${m.piece.pieceNo}: ${text}`,
    });

  const slab = input.slabSpec;
  const slabFt = slab ? [slab.width * FT_PER[slab.unit], slab.depth * FT_PER[slab.unit]].sort((a, b) => b - a) : null;
  const seen = new Map<string, PieceMeasurement>();

  for (const m of measurements) {
    const p = m.piece;
    // A dimension in the wrong unit is the commonest data error.
    if (p.dimUnit === "IN" && (p.length > 400 || p.width > 400)) {
      flag(m, "UNIT_SUSPECT", `${p.length} × ${p.width} in is very large — check the unit (mm?).`);
    } else if (p.dimUnit === "MM" && p.length < 100 && p.width < 100) {
      flag(m, "UNIT_SUSPECT", `${p.length} × ${p.width} mm is very small — check the unit (inches?).`);
    }
    if (m.sqftPerPc > 0 && m.sqftPerPc < 0.1) flag(m, "TINY_PIECE", `only ${r4(m.sqftPerPc)} sqft per piece — check L and W.`);

    // Bigger than one slab in both orientations but no joint recorded.
    if (slabFt && p.joints === 0) {
      const [a, b] = [m.lengthFt, m.widthFt].sort((x, y) => y - x);
      if (a > slabFt[0] + 1e-9 || b > slabFt[1] + 1e-9) {
        flag(m, "LARGER_THAN_SLAB", `larger than one slab (${slab!.width} × ${slab!.depth} ${slab!.unit.toLowerCase()}) but Joints = 0.`);
      }
    }

    if (hasSinkModel(p.sinkModel) && p.sinkCuts === 0) flag(m, "SINK_WITHOUT_CUTOUT", `sink model "${p.sinkModel}" but Sink Cuts = 0.`);

    // The sheet's own calculated columns against the standard formulas.
    const sv = p.sheetValues;
    if (sv) {
      const pairs: [string, number | undefined, number][] = [
        ["Cutting LF", sv.cuttingLf, m.cuttingLf],
        ["DE&P LF", sv.depLf, m.depLf],
        ["Sqft/Pc", sv.sqftPerPc, m.sqftPerPc],
        ["Total Sqft", sv.totalSqft, m.totalSqft],
      ];
      for (const [label, sheet, system] of pairs) {
        if (sheet !== undefined && !near(sheet, system)) {
          flag(m, "SHEET_MISMATCH", `${label} in the uploaded sheet is ${r4(sheet)}, the standard formula gives ${r4(system)} (system value used).`);
        }
      }
    }

    const key = `${p.group ?? ""}|${p.dwgNo}|${p.pieceNo}`.toLowerCase();
    const first = seen.get(key);
    if (first) flag(m, "DUPLICATE_PIECE", `same Group / Dwg# / Piece as "${first.piece.description}" — counted twice?`);
    else seen.set(key, m);
  }

  // Variables sheet figures built on a different drawing total.
  const vs = input.variablesSheet;
  if (vs?.totalSqft && totals.totalSqft > 0 && Math.abs(vs.totalSqft - totals.totalSqft) / totals.totalSqft > 0.001) {
    out.push({
      severity: "warning",
      check: true,
      code: "VARIABLES_SQFT_CHANGED",
      fixAt: "cost-inputs",
      message:
        `Variables sheet${vs.fileName ? ` (${vs.fileName})` : ""} was worked out on ${vs.totalSqft.toLocaleString("en-US", { maximumFractionDigits: 2 })} sqft; ` +
        `the drawings now total ${totals.totalSqft.toLocaleString("en-US", { maximumFractionDigits: 2 })} sqft. Packing per sqft is recalculated on the drawings.`,
    });
  }
  return out;
}

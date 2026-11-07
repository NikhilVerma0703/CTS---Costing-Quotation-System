/** Rules that aren't visible from the reference workbooks alone. */
import { describe, expect, it } from "vitest";
import { calculate, edgeLf, rateRowFor } from "@/lib/engine";
import { amountInWords, int, money, num, parseNumber, pct } from "@/lib/format";
import { DEFAULT_VARIABLES, emptyProject, variablesForReuse, type Piece, type RateRow } from "@/lib/model";

const piece = (over: Partial<Piece> = {}): Piece => ({
  id: "p1", dwg: "1", group: "A", area: "Kitchen", piece: "1", description: "Top", length: 100, width: 50, thickness: "2cm", color: "White", sinkModel: "", sinkCuts: 0, faucetHoles: 0, rCorners: 0, joints: 0, qty: 2, cutRule: "perimeter", cutLf: null, depRule: "l+w", depLf: null, jointDepIn: null, notes: "", ...over,
});
const rate = (over: Partial<RateRow>): RateRow => ({ id: "r", kind: "material", label: "M", unit: "per sqft", match: null, myCost: 1, customer: null, ...over });

describe("edge rules", () => {
  it("work out linear feet, and a typed figure wins", () => {
    expect(edgeLf("perimeter", null, 100, 50, 12)).toBe(25);
    expect(edgeLf("l+w", null, 100, 50, 12)).toBe(12.5);
    expect(edgeLf("l", null, 120, 50, 12)).toBe(10);
    expect(edgeLf("w", null, 100, 60, 12)).toBe(5);
    expect(edgeLf("manual", null, 100, 50, 12)).toBe(0);
    expect(edgeLf("perimeter", 7, 100, 50, 12)).toBe(7);
  });
});

describe("which rate prices a piece", () => {
  const white = rate({ id: "w", match: "White" });
  const cm3 = rate({ id: "c", match: "3cm" });
  it("uses the only row for everything", () => {
    expect(rateRowFor([rate({ id: "x" })], "material", piece()).row?.id).toBe("x");
  });
  it("prefers color, then thickness, for material", () => {
    expect(rateRowFor([cm3, white], "material", piece({ thickness: "3cm" })).row?.id).toBe("w");
    expect(rateRowFor([cm3, white], "material", piece({ color: "Grey", thickness: "3cm" })).row?.id).toBe("c");
  });
  it("is case-insensitive", () => {
    expect(rateRowFor([cm3, white], "material", piece({ color: "WHITE" })).row?.id).toBe("w");
  });
  it("falls back to an open row, or else takes the last and says it found no match (Peoria's IF sends anything else to its last rate)", () => {
    const open = rate({ id: "o", match: null });
    expect(rateRowFor([white, open], "material", piece({ color: "Grey" }))).toMatchObject({ row: { id: "o" }, matched: true });
    expect(rateRowFor([white, cm3], "material", piece({ color: "Grey" }))).toMatchObject({ row: { id: "c" }, matched: false });
  });
  it("a piece with no matching material is flagged", () => {
    const d = emptyProject();
    d.pieces = [piece({ color: "Grey" })];
    d.variables.rates = [rate({ id: "w", match: "White" }), rate({ id: "c", match: "3cm" }), ...DEFAULT_VARIABLES.rates.filter((r) => r.kind !== "material")];
    expect(calculate(d).checks.some((c) => /match no material rate/.test(c.text))).toBe(true);
  });
});

describe("hand-entered rates", () => {
  it("a cleared Customer Charge follows My Cost again", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    const cut = d.variables.rates.find((r) => r.kind === "cutting")!;
    cut.customer = null;
    cut.myCost = 0.5;
    const r = calculate(d);
    expect(r.rates[cut.id].customer).toBe(0.5);
    expect(r.rows[0].customer.costs.cutting).toBeCloseTo(25 * 0.5, 10);
  });
  it("flags a charge below cost, but not an equal one", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    const cut = d.variables.rates.find((r) => r.kind === "cutting")!;
    cut.customer = cut.myCost;
    expect(calculate(d).checks.some((c) => /Cutting: Customer Charge is below/.test(c.text))).toBe(false);
    cut.customer = 0.01;
    expect(calculate(d).checks.some((c) => /Cutting: Customer Charge is below/.test(c.text))).toBe(true);
  });
});

describe("things the engine flags instead of guessing", () => {
  const flagged = (d: ReturnType<typeof emptyProject>, re: RegExp) => calculate(d).checks.some((c) => re.test(c.text));
  it("a piece no DE&P rate applies to", () => {
    const d = emptyProject();
    d.pieces = [piece({ thickness: "1.5cm" })];
    const rest = DEFAULT_VARIABLES.rates.filter((r) => r.kind !== "dep");
    d.variables.rates = [...rest, rate({ id: "d3", kind: "dep", label: "3cm DE&P", match: "3cm" }), rate({ id: "d2", kind: "dep", label: "2cm DE&P", match: "2cm" })];
    expect(flagged(d, /match no DE&P rate/)).toBe(true);
    d.pieces = [piece({ thickness: "2cm" })];
    expect(flagged(d, /match no DE&P rate/)).toBe(false);
  });
  it("two rates that apply to the same thing", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    const rest = DEFAULT_VARIABLES.rates.filter((r) => r.kind !== "material");
    d.variables.rates = [rate({ id: "a", label: "First", match: "2cm" }), rate({ id: "b", label: "Second", match: "2CM " }), ...rest];
    expect(flagged(d, /First and Second both apply/)).toBe(true);
  });
  it("a typed Cutting or DE&P LF, which won't follow L and W", () => {
    const d = emptyProject();
    d.pieces = [piece({ cutRule: "manual", cutLf: 7 })];
    expect(flagged(d, /typed Cutting or DE&P LF/)).toBe(true);
  });
  it("a typed packing rate that isn't what the calculation gives", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    expect(flagged(d, /packing calculation gives/)).toBe(false);
    d.variables.rates.find((r) => r.kind === "packing")!.myCost = 0.5;
    expect(flagged(d, /Packing: a typed rate is in use/)).toBe(true);
  });
  it("a slab-basis Customer material charge that differs from My Cost, which the workbooks don't allow for", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    const m = d.variables.rates.find((r) => r.kind === "material")!;
    expect(flagged(d, /differs from My Cost/)).toBe(false);
    m.customer = 9;
    expect(flagged(d, /differs from My Cost/)).toBe(true);
    d.variables.pricing = "piece";
    expect(flagged(d, /differs from My Cost/)).toBe(false);
  });
});

describe("display rounding follows Excel", () => {
  it("rounds to 15 significant digits, then half up", () => {
    // These are the cells that were a cent out: Excel shows $3.08, $2.00 and $2.56.
    expect(money(10.25 * 0.3)).toBe("$3.08");
    expect(money((114 / 12) * 0.21)).toBe("$2.00");
    expect(money((146 / 12) * 0.21)).toBe("$2.56");
    expect(money(1.005)).toBe("$1.01");
    expect(money(2.675)).toBe("$2.68");
    expect(money(-3.0749999999999997)).toBe("-$3.08");
    expect(num(0.125)).toBe("0.13");
    expect(num(1234567.895)).toBe("1,234,567.90");
    expect(pct(0.82639811, 1)).toBe("82.6%");
    expect(int(1530.5)).toBe("1,531");
  });
  it("is for display only: the calculation keeps every digit", () => {
    const d = emptyProject();
    d.pieces = [piece({ length: 100.5, width: 22.25, qty: 3 })];
    const r = calculate(d);
    expect(r.rows[0].cutLf).toBe((2 * (100.5 + 22.25)) / 12);
    expect(r.rows[0].internal.costs.cutting).toBe(((2 * (100.5 + 22.25)) / 12) * 0.21);
  });
});

describe("parsing what people type", () => {
  it("fractions, including negative and written ones", () => {
    expect(parseNumber("93 1/4")).toBe(93.25);
    expect(parseNumber("1/2")).toBe(0.5);
    expect(parseNumber("-1 1/2")).toBe(-1.5);
    expect(parseNumber("-3/4")).toBe(-0.75);
    expect(parseNumber('102¾"')).toBe(102.75);
    expect(parseNumber("¾")).toBe(0.75);
    expect(parseNumber("1/0")).toBeNull();
  });
});

describe("hand-edited cost cells", () => {
  const project = () => {
    const d = emptyProject();
    d.pieces = [piece()];
    d.variables.rates.find((r) => r.kind === "material")!.slabs = 1;
    return d;
  };
  it("are flagged, because they no longer follow rate changes", () => {
    const d = project();
    expect(calculate(d).checks.some((c) => /typed by hand/.test(c.text))).toBe(false);
    d.overrides.customer.p1 = { sink: 10, joint: 1 };
    const flag = calculate(d).checks.find((c) => /Customer Quote: 2 cost cells are typed by hand/.test(c.text));
    expect(flag?.tab).toBe("customer");
    d.overrides.customer.p1 = { sink: 10 };
    expect(calculate(d).checks.some((c) => /Customer Quote: 1 cost cell is typed by hand/.test(c.text))).toBe(true);
  });
  it("on Material say they can't reach a firm quote priced on slabs, and move it when priced on pieces", () => {
    const d = project();
    const before = calculate(d).summary.totalCustomer;
    d.overrides.customer.p1 = { material: 500 };
    const slab = calculate(d);
    expect(slab.summary.totalCustomer).toBeCloseTo(before, 8);
    expect(slab.checks.some((c) => /Material cell.*not the firm quote/.test(c.text))).toBe(true);
    d.variables.pricing = "piece";
    const piecePriced = calculate(d);
    expect(piecePriced.summary.customerMaterial).toBeCloseTo(1000, 8);
    expect(piecePriced.checks.some((c) => /not the firm quote/.test(c.text))).toBe(false);
  });
  it("for a piece no longer in the drawing are ignored", () => {
    const d = project();
    d.overrides.internal.gone = { sink: 10 };
    const r = calculate(d);
    expect(r.checks.some((c) => /typed by hand/.test(c.text))).toBe(false);
    expect(r.internal.components.sink).toBe(0);
  });
});

describe("what the totals rest on", () => {
  it("marks the totals as estimated until every material with pieces has a slab count", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    expect(calculate(d).summary.slabsEstimated).toBe(true);
    d.variables.rates.find((r) => r.kind === "material")!.slabs = 2;
    expect(calculate(d).summary.slabsEstimated).toBe(false);
  });
  it("priced on piece sqft, the estimate still sets the wastage markup, until a used % is typed", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    d.variables.pricing = "piece";
    expect(calculate(d).summary.slabsEstimated).toBe(true);
    d.variables.rates.find((r) => r.kind === "material")!.usedPct = 0.9;
    expect(calculate(d).summary.slabsEstimated).toBe(false);
  });
  it("flags a negative rate from an uploaded sheet", () => {
    const d = emptyProject();
    d.pieces = [piece()];
    d.variables.rates.find((r) => r.kind === "cutting")!.myCost = -1;
    expect(calculate(d).checks.some((c) => /Cutting: a rate is negative/.test(c.text))).toBe(true);
  });
});

describe("rates reused from another project", () => {
  it("carry rates but not that project's slab results", () => {
    const v = structuredClone(DEFAULT_VARIABLES);
    const m = v.rates[0];
    Object.assign(m, { slabs: 40, slabAdjust: 2, usedSqft: 900, usedPct: 0.9, note: "x" });
    v.packingSqftTyped = 100;
    v.drivers = [{ id: "d", label: "x", pieces: 1, piecesPerSlab: 1, dedicatedSlabs: 1, wastePerSlabSqIn: 1, note: "" }];
    const out = variablesForReuse(v);
    expect(out.rates[0]).toMatchObject({ slabs: null, slabAdjust: 0, usedSqft: null, usedPct: null, needsConfirm: true, myCost: 3.5 });
    expect(out.rates[0].note).toBeUndefined();
    expect(out.packingSqftTyped).toBeNull();
    expect(out.drivers).toEqual([]);
    expect(v.rates[0].slabs).toBe(40);
  });
});

describe("the amount in words on the PDF", () => {
  it("reads correctly", () => {
    expect(amountInWords(86151.15)).toBe("US Dollars Eighty-Six Thousand One Hundred Fifty-One and Fifteen Cents Only.");
    expect(amountInWords(1000)).toBe("US Dollars One Thousand Only.");
    expect(amountInWords(0)).toBe("US Dollars Zero Only.");
    expect(amountInWords(122414.06)).toBe("US Dollars One Hundred Twenty-Two Thousand Four Hundred Fourteen and Six Cents Only.");
  });
  it("always says the cents the printed figure shows, even on a half cent", () => {
    for (const v of [1.005, 1.015, 2.675, 1000.125, 86151.155, 0.995]) {
      const cents = money(v).split(".")[1];
      const words = amountInWords(v);
      if (cents === "00") expect(words).not.toMatch(/Cents/);
      else expect(words).toMatch(/ and .* Cents Only\.$/);
      const dollars = money(v).replace(/[$,]/g, "").split(".")[0];
      expect(amountInWords(Number(dollars))).toBe(words.replace(/ and .* Cents Only\.$/, " Only."));
    }
  });
});

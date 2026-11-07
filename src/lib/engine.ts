/**
 * The calculation engine: one pure function from a project's inputs to every
 * number on all seven sheets. It runs in the browser for instant recalculation
 * and on the server for exports, so the two can never disagree.
 *
 * Operation order follows the Excel formulas, so results match the reference
 * workbooks to floating-point precision (tests/golden.test.ts checks each cell).
 */
import { money, num } from "./format";
import { COST_KEYS, UNITS_PER_FOOT, type CostKey, type DimUnit, type EdgeRule, type Piece, type ProjectData, type RateRow, type SlabDriver } from "./model";

export type Side = "internal" | "customer";

export interface Line {
  costs: Record<CostKey, number>;
  /** Cost cells holding a hand-edited value instead of the calculated one. */
  edited: Partial<Record<CostKey, number>>;
  perPc: number;
  total: number;
}

export interface RowResult {
  piece: Piece;
  cutLf: number;
  depLf: number;
  sqftPerPc: number;
  totalPcs: number;
  totalSqft: number;
  /** The rate row pricing each cost column for this piece. */
  rateRows: Partial<Record<CostKey, RateRow>>;
  internal: Line;
  customer: Line;
  /** Price/Pc ÷ Sqft/Pc. */
  pricePerSqft: number;
}

export interface SideTotals {
  /** SUMPRODUCT(column, qty). */
  components: Record<CostKey, number>;
  qty: number;
  total: number;
  material: number;
  /** Total less the Material column. */
  fabrication: number;
}

export interface SlabGroup {
  rate: RateRow;
  /** Piece sqft in the drawing priced by this material. */
  drawingSqft: number;
  /** The count in use: entered, or estimated when none has been entered. */
  slabs: number;
  estimated: boolean;
  adjustment: number;
  totalSlabs: number;
  purchased: number;
  used: number;
  usedSource: "drawing" | "typed" | "percent";
  wasted: number;
  utilization: number | null;
  wastagePct: number | null;
  /** Wasted % + the extra %; applied to piece material only when pricing is "piece". */
  markup: number;
  materialCost: number;
  materialCharge: number;
}

/** One material's share of the totals. Adds up to the material figures in the summary, however material is priced. */
export interface MaterialSplit {
  rate: RateRow;
  totalSlabs: number;
  sqft: number;
  markup: number;
  internal: number;
  customer: number;
}

export interface DriverResult extends SlabDriver {
  shareOfSlabs: number | null;
  wasteSqft: number;
  shareOfWaste: number | null;
}

export interface Check {
  level: "warn" | "info";
  text: string;
  tab?: "variables" | "drawing" | "slab" | "internal" | "customer" | "summary";
}

export interface Result {
  rows: RowResult[];
  drawing: { pcs: number; sqft: number; sinkCuts: number; faucetHoles: number; rCorners: number; joints: number; cutLf: number; depLf: number };
  slabArea: number;
  packing: { totalLocal: number; usd: number; sqftBasis: number; sqftIsTyped: boolean; perSqft: number };
  /** Rate per side, by rate row id. */
  rates: Record<string, { my: number; customer: number }>;
  internal: SideTotals;
  customer: SideTotals;
  slabs: SlabGroup[];
  slabTotals: { slabs: number; adjustment: number; totalSlabs: number; purchased: number; used: number; wasted: number; utilization: number | null; wastagePct: number | null; materialCost: number; materialCharge: number };
  materialSplit: MaterialSplit[];
  drivers: DriverResult[];
  summary: {
    unitTypes: number;
    /** Sum of each group's Units; null when a group has more than one quantity. */
    totalUnits: number | null;
    vanityPcs: number;
    nonVanityPcs: number;
    internalMaterial: number;
    customerMaterial: number;
    totalInternal: number;
    totalCustomer: number;
    margin: number;
    marginPct: number | null;
    pricePerSlab: number | null;
    myCostPerSqft: number | null;
    customerPerSqft: number | null;
    /** The totals rest on an estimated slab count: no CutList figure has been entered yet. */
    slabsEstimated: boolean;
  };
  checks: Check[];
}

const safeDiv = (a: number, b: number): number | null => (b > 0 || b < 0 ? a / b : null);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Linear feet along the edges a rule names (Cutting LF, DE&P LF). */
export function edgeLf(rule: EdgeRule, typed: number | null, L: number, W: number, perFoot: number): number {
  if (typed !== null) return typed;
  switch (rule) {
    case "perimeter":
      return (2 * (L + W)) / perFoot; // =2*(F5+G5)/12
    case "l+w":
      return (L + W) / perFoot; // =(F5+G5)/12
    case "l":
      return L / perFoot;
    case "w":
      return W / perFoot;
    case "manual":
      return 0;
  }
}

export const slabAreaOf = (width: number, depth: number, unit: DimUnit) => (width * depth) / UNITS_PER_FOOT[unit] ** 2; // =B5*B6/144

/**
 * The rate row pricing one cost column of one piece. With one row for a kind,
 * that row prices everything; with several, the piece's sink model, color or
 * thickness picks it.
 */
export function rateRowFor(rates: RateRow[], kind: CostKey, piece: Piece): { row: RateRow | undefined; matched: boolean } {
  const list = rates.filter((r) => r.kind === kind);
  if (list.length <= 1) return { row: list[0], matched: true };
  const keys = kind === "sink" ? [piece.sinkModel] : kind === "material" ? [piece.color, piece.thickness] : [piece.thickness, piece.color];
  for (const key of keys) {
    if (!key) continue;
    const hit = list.find((r) => r.match && same(r.match, key));
    if (hit) return { row: hit, matched: true };
  }
  const open = list.find((r) => !r.match);
  // Matching nothing takes the last row: Peoria's IF(D4="Pure White",C12,C13) sends anything else to its last rate, and 1633's formulas all use its last.
  return { row: open ?? list[list.length - 1], matched: Boolean(open) };
}

function emptyCosts(): Record<CostKey, number> {
  return { material: 0, cutting: 0, dep: 0, sink: 0, faucet: 0, rcorner: 0, joint: 0, packing: 0 };
}

export function calculate(d: ProjectData): Result {
  const v = d.variables;
  const perFoot = UNITS_PER_FOOT[d.dimUnit] ?? 12;
  const areaDiv = perFoot * perFoot;
  const checks: Check[] = [];

  // Drawing Summary: measurements per piece.
  const measured = d.pieces.map((p) => {
    const sqftPerPc = (p.length * p.width) / areaDiv; // =F5*G5/144
    const totalPcs = p.qty; // =O5
    const totalSqft = sqftPerPc * totalPcs; // =R5*S5
    return { piece: p, cutLf: edgeLf(p.cutRule, p.cutLf, p.length, p.width, perFoot), depLf: edgeLf(p.depRule, p.depLf, p.length, p.width, perFoot), sqftPerPc, totalPcs, totalSqft };
  });
  const drawing = { pcs: 0, sqft: 0, sinkCuts: 0, faucetHoles: 0, rCorners: 0, joints: 0, cutLf: 0, depLf: 0 };
  for (const m of measured) {
    drawing.pcs += m.totalPcs; // =SUM(S5:S26)
    drawing.sqft += m.totalSqft; // =SUM(T5:T26)
    drawing.sinkCuts += m.piece.sinkCuts * m.piece.qty; // =SUMPRODUCT(K5:K26,O5:O26)
    drawing.faucetHoles += m.piece.faucetHoles * m.piece.qty;
    drawing.rCorners += m.piece.rCorners * m.piece.qty;
    drawing.joints += m.piece.joints * m.piece.qty;
    drawing.cutLf += m.cutLf * m.piece.qty;
    drawing.depLf += m.depLf * m.piece.qty;
  }

  // Packing: containers (Rs) → USD → per sqft.
  const totalLocal = v.containers.reduce((s, c) => s + c.cost * c.count, 0);
  const usd = safeDiv(totalLocal, v.exchangeRate) ?? 0; // =B23*B24/B25
  const typedApplies = v.packingSqftTyped !== null && (!v.packingSqftRoundedCopy || Math.abs(v.packingSqftTyped - drawing.sqft) <= 0.01);
  const sqftBasis = typedApplies ? (v.packingSqftTyped as number) : drawing.sqft;
  const perSqft = safeDiv(usd, sqftBasis) ?? 0; // =B26/B27

  // Rates per side.
  const rates: Result["rates"] = {};
  for (const r of v.rates) {
    const my = r.myCost ?? (r.kind === "packing" ? perSqft : 0);
    // Each side of packing links to the calculation on its own (=B28 in both C19 and D19), so a typed My Cost doesn't move the customer's price.
    rates[r.id] = { my, customer: r.customer ?? (r.kind === "packing" ? perSqft : my) }; // =C12
  }

  // Slab Calculation: one group per material row.
  const slabArea = slabAreaOf(v.slabWidth, v.slabDepth, v.slabUnit);
  const materialRows = v.rates.filter((r) => r.kind === "material");
  const sqftByMaterial = new Map<string, number>();
  let unmatchedMaterial = 0;
  let unmatchedDep = 0;
  let unmatchedSink = 0;
  const rateRowsOf = measured.map((m) => {
    const out: Partial<Record<CostKey, RateRow>> = {};
    for (const key of COST_KEYS) {
      const { row, matched } = rateRowFor(v.rates, key, m.piece);
      if (row) out[key] = row;
      if (!matched && key === "material") unmatchedMaterial++;
      if (!matched && key === "dep") unmatchedDep++;
      if (!matched && key === "sink" && m.piece.sinkCuts > 0) unmatchedSink++;
    }
    if (out.material) sqftByMaterial.set(out.material.id, (sqftByMaterial.get(out.material.id) ?? 0) + m.totalSqft);
    return out;
  });

  const slabs: SlabGroup[] = materialRows.map((rate) => {
    const drawingSqft = sqftByMaterial.get(rate.id) ?? 0;
    const entered = rate.slabs ?? null;
    const estimated = entered === null;
    const count = estimated ? (slabArea > 0 && v.estimateUtilization > 0 ? Math.ceil(drawingSqft / (slabArea * v.estimateUtilization)) : 0) : entered;
    const adjustment = rate.slabAdjust ?? 0;
    const totalSlabs = count + adjustment; // =B5+B6
    const purchased = totalSlabs * slabArea; // =B7*Variables!$B$7
    const usedPct = rate.usedPct ?? null;
    let used = drawingSqft; // ='Drawing Summary'!T27
    let usedSource: SlabGroup["usedSource"] = "drawing";
    if (usedPct !== null) {
      used = purchased * usedPct; // =B7*B8
      usedSource = "percent";
    } else if ((rate.usedSqft ?? null) !== null) {
      used = rate.usedSqft as number;
      usedSource = "typed";
    }
    const wasted = purchased - used; // =B8-B9
    // A typed used % stands on its own, whatever the slab count (=Variables!$B$33, =1-B33); otherwise used ÷ purchased.
    const utilization = usedPct ?? safeDiv(used, purchased); // =B9/B8
    const wastagePct = utilization === null ? null : 1 - utilization; // =1-B9
    const r = rates[rate.id];
    return {
      rate,
      drawingSqft,
      slabs: count,
      estimated,
      adjustment,
      totalSlabs,
      purchased,
      used,
      usedSource,
      wasted,
      utilization,
      wastagePct,
      markup: (wastagePct ?? 0) + v.wastageExtra, // =B35+0.02
      materialCost: purchased * r.my, // =B8*Variables!$C$12
      // The customer pays slab material at cost: Project Summary's customer line reads this same My Cost cell (Lennar B15, Peoria B14).
      materialCharge: purchased * r.my,
    };
  });
  const totalOf = (f: (g: SlabGroup) => number) => slabs.reduce((s, g) => s + f(g), 0);
  const purchasedAll = totalOf((g) => g.purchased);
  const usedAll = totalOf((g) => g.used);
  const wastedAll = totalOf((g) => g.wasted);
  const wastagePctAll = purchasedAll > 0 ? wastedAll / purchasedAll : 0; // =IF(D7>0,D11/D7,0)
  const slabTotals: Result["slabTotals"] = {
    slabs: totalOf((g) => g.slabs),
    adjustment: totalOf((g) => g.adjustment),
    totalSlabs: totalOf((g) => g.totalSlabs),
    purchased: purchasedAll,
    used: usedAll,
    wasted: wastedAll,
    utilization: 1 - wastagePctAll, // =1-D10
    wastagePct: wastagePctAll,
    materialCost: totalOf((g) => g.materialCost),
    materialCharge: totalOf((g) => g.materialCharge),
  };
  const markupOf = new Map(slabs.map((g) => [g.rate.id, g.markup]));

  // Internal Costing and Customer Quote.
  const lineFor = (side: Side, m: (typeof measured)[number], rows: Partial<Record<CostKey, RateRow>>): Line => {
    const rate = (key: CostKey) => {
      const row = rows[key];
      if (!row) return 0;
      return side === "internal" ? rates[row.id].my : rates[row.id].customer;
    };
    const p = m.piece;
    const costs = emptyCosts();
    costs.material = m.sqftPerPc * rate("material"); // =E4*Variables!$C$12
    if (v.pricing === "piece" && rows.material) costs.material = m.sqftPerPc * rate("material") * (1 + (markupOf.get(rows.material.id) ?? 0)); // =G4*Variables!$C$13*(1+Variables!$B$38)
    costs.cutting = m.cutLf * rate("cutting"); // ='Drawing Summary'!P5*Variables!$C$13
    costs.dep = m.depLf * rate("dep");
    costs.sink = p.sinkCuts * rate("sink");
    costs.faucet = p.faucetHoles * rate("faucet");
    costs.rcorner = p.rCorners * rate("rcorner");
    costs.joint = p.joints * rate("joint");
    costs.packing = m.sqftPerPc * rate("packing"); // =E4*Variables!$C$19
    const edited: Line["edited"] = {};
    const overrides = d.overrides[side][p.id];
    if (overrides) {
      for (const key of COST_KEYS) {
        const value = overrides[key];
        if (value !== undefined) {
          edited[key] = costs[key]; // the calculated value it replaces
          costs[key] = value;
        }
      }
    }
    let perPc = 0;
    for (const key of COST_KEYS) perPc += costs[key]; // =SUM(G4:N4)
    return { costs, edited, perPc, total: perPc * p.qty }; // =O4*F4
  };

  const rows: RowResult[] = measured.map((m, i) => {
    const internal = lineFor("internal", m, rateRowsOf[i]);
    const customer = lineFor("customer", m, rateRowsOf[i]);
    return { ...m, rateRows: rateRowsOf[i], internal, customer, pricePerSqft: safeDiv(customer.perPc, m.sqftPerPc) ?? 0 }; // =IF(G5>0,P5/G5,0)
  });

  const totals = (side: Side): SideTotals => {
    const components = emptyCosts();
    let qty = 0;
    let total = 0;
    for (const r of rows) {
      const line = r[side];
      for (const key of COST_KEYS) components[key] += line.costs[key] * r.piece.qty; // =SUMPRODUCT(G4:G25,$F$4:$F$25)
      qty += r.piece.qty; // =SUM(F4:F25)
      total += line.total; // =SUM(P4:P25)
    }
    return { components, qty, total, material: components.material, fabrication: total - components.material }; // =P26-G26
  };
  const internal = totals("internal");
  const customer = totals("customer");

  // Each material's share of the totals: slabs purchased, or the Material column, as the project prices it.
  const materialSplit: MaterialSplit[] = slabs.map((g) => {
    const share = (side: Side) => rows.reduce((s, row) => s + (row.rateRows.material?.id === g.rate.id ? row[side].costs.material * row.piece.qty : 0), 0);
    return {
      rate: g.rate,
      totalSlabs: g.totalSlabs,
      sqft: g.drawingSqft,
      markup: g.markup,
      internal: v.pricing === "slab" ? g.materialCost : share("internal"),
      customer: v.pricing === "slab" ? g.materialCharge : share("customer"),
    };
  });

  // Slab driver analysis.
  const drivers: DriverResult[] = v.drivers.map((dr) => {
    const wasteSqft = (dr.dedicatedSlabs * dr.wastePerSlabSqIn) / 144; // =B17*2114/144
    return { ...dr, shareOfSlabs: safeDiv(dr.dedicatedSlabs, slabTotals.totalSlabs), wasteSqft, shareOfWaste: safeDiv(wasteSqft, slabTotals.wasted) }; // =B17/B7, =B19/B10
  });

  // Project Summary.
  const groupQty = new Map<string, Set<number>>();
  for (const p of d.pieces) {
    const key = p.group.trim().toLowerCase();
    if (!key) continue;
    if (!groupQty.has(key)) groupQty.set(key, new Set());
    groupQty.get(key)!.add(p.qty);
  }
  const eachGroupOneQty = groupQty.size > 0 && [...groupQty.values()].every((s) => s.size === 1);
  const vanityPcs = d.pieces.reduce((s, p) => s + (/vanity/i.test(p.area) ? p.qty : 0), 0);
  const internalMaterial = v.pricing === "slab" ? slabTotals.materialCost : internal.material;
  const customerMaterial = v.pricing === "slab" ? slabTotals.materialCharge : customer.material;
  const totalInternal = internal.fabrication + internalMaterial; // =B11+B12
  const totalCustomer = customer.fabrication + customerMaterial; // =B14+B15
  const margin = totalCustomer - totalInternal; // =B16-B13
  const summary: Result["summary"] = {
    unitTypes: groupQty.size,
    totalUnits: eachGroupOneQty ? [...groupQty.values()].reduce((s, q) => s + [...q][0], 0) : null,
    vanityPcs,
    nonVanityPcs: drawing.pcs - vanityPcs,
    internalMaterial,
    customerMaterial,
    totalInternal,
    totalCustomer,
    margin,
    marginPct: safeDiv(margin, totalCustomer), // =B19/B16
    pricePerSlab: safeDiv(totalCustomer, slabTotals.totalSlabs), // =B16/B7
    myCostPerSqft: safeDiv(totalInternal, drawing.sqft), // =B13/$B$6
    customerPerSqft: safeDiv(totalCustomer, drawing.sqft), // =B16/$B$6
    // Priced on slabs, the count sets the material. Priced on pieces, it sets the wastage markup unless a used % is typed.
    slabsEstimated: slabs.some((g) => g.estimated && g.drawingSqft > 0 && (v.pricing === "slab" || g.usedSource !== "percent")),
  };

  // Checks: things to look at. They never change a number.
  const warn = (text: string, tab?: Check["tab"]) => checks.push({ level: "warn", text, tab });
  if (d.pieces.length === 0) warn("No pieces yet. Upload a Drawing Summary or add a piece.", "drawing");
  if (!(v.exchangeRate > 0)) warn("Exchange rate must be above 0, so packing can be worked out.", "variables");
  const badPieces = d.pieces.filter((p) => !(p.length > 0) || !(p.width > 0));
  if (badPieces.length) warn(`${badPieces.length} piece(s) have a zero length or width.`, "drawing");
  const zeroQty = d.pieces.filter((p) => !(p.qty > 0));
  if (zeroQty.length) warn(`${zeroQty.length} piece(s) have quantity 0 and add nothing.`, "drawing");
  const lastRate = (kind: CostKey) => v.rates.filter((r) => r.kind === kind).at(-1)?.label;
  if (unmatchedMaterial) warn(`${unmatchedMaterial} piece(s) match no material rate, so the last one (${lastRate("material")}) is used. Set "Applies to" on the Variables tab.`, "variables");
  if (unmatchedDep) warn(`${unmatchedDep} piece(s) match no DE&P rate, so the last one (${lastRate("dep")}) is used. Set "Applies to" on the Variables tab.`, "variables");
  if (unmatchedSink) warn(`${unmatchedSink} piece(s) have a sink model with no rate of its own, so the last one (${lastRate("sink")}) is used.`, "variables");
  for (const kind of ["material", "dep", "sink"] as const) {
    const seen = new Map<string, RateRow>();
    for (const r of v.rates.filter((x) => x.kind === kind && x.match)) {
      const key = (r.match as string).trim().toLowerCase();
      const first = seen.get(key);
      if (first) warn(`${first.label} and ${r.label} both apply to "${r.match}", so ${r.label} is never used. Set "Applies to" on the Variables tab.`, "variables");
      else seen.set(key, r);
    }
  }
  const typedLf = d.pieces.filter((p) => p.cutRule === "manual" || p.depRule === "manual").length;
  if (typedLf) warn(`${typedLf} piece(s) have a typed Cutting or DE&P LF, which stays as typed when L or W changes.`, "drawing");
  const toConfirm = v.rates.filter((r) => r.needsConfirm);
  if (toConfirm.length) warn(`Confirm ${toConfirm.map((r) => r.label).join(", ")}: the rate came from stored variables.`, "variables");
  for (const g of slabs) {
    if (g.estimated && g.drawingSqft > 0) {
      warn(`${g.rate.label}: ${g.slabs} slabs is an estimate at ${Math.round(v.estimateUtilization * 100)}% utilization. Enter the CutList Optimizer count for a firm figure.`, "slab");
    }
    if (!g.estimated && g.drawingSqft === 0 && g.totalSlabs > 0 && materialRows.length > 1) {
      warn(`${g.rate.label}: ${g.totalSlabs} slabs entered, but no piece in the drawing uses this material.`, "slab");
    }
    if (!g.estimated && g.drawingSqft > g.purchased + 0.5) {
      warn(`${g.rate.label}: ${g.totalSlabs} slabs give ${fmt(g.purchased)} sqft, less than the ${fmt(g.drawingSqft)} sqft of pieces. Check the slab count.`, "slab");
    }
    if (g.usedSource === "typed" && Math.abs(g.used - g.drawingSqft) > Math.max(1, g.drawingSqft * 0.01)) {
      warn(`${g.rate.label}: used area ${fmt(g.used)} sqft is typed from the optimizer, and the drawing now totals ${fmt(g.drawingSqft)} sqft. Re-run CutList or update it.`, "slab");
    }
  }
  if (typedApplies && !v.packingSqftRoundedCopy && Math.abs(sqftBasis - drawing.sqft) > 0.01) {
    warn(`Packing is spread over a typed ${fmt(sqftBasis)} sqft, and the drawing totals ${fmt(drawing.sqft)} sqft.`, "variables");
  }
  for (const r of v.rates) {
    if (rates[r.id].my < 0 || rates[r.id].customer < 0) warn(`${r.label}: a rate is negative.`, "variables");
    if (r.kind !== "packing" && rates[r.id].customer < rates[r.id].my) warn(`${r.label}: Customer Charge is below My Cost.`, "variables");
    if (r.kind === "packing" && perSqft > 0 && (Math.abs(rates[r.id].my - perSqft) > 0.00005 || Math.abs(rates[r.id].customer - perSqft) > 0.00005)) {
      warn(`${r.label}: a typed rate is in use, and the packing calculation gives ${money(perSqft, 4)} per sqft.`, "variables");
    }
    if (r.kind === "material" && v.pricing === "slab" && rates[r.id].customer !== rates[r.id].my) {
      warn(`${r.label}: Customer Charge differs from My Cost. As on the sheets, the firm quote charges slab material at My Cost ("no markup"), so this charge only moves the Material column on Customer Quote, which is for reference.`, "variables");
    }
  }
  for (const side of ["internal", "customer"] as const) {
    const sheet = side === "internal" ? "Internal Costing" : "Customer Quote";
    const edited = rows.reduce((n, row) => n + Object.keys(row[side].edited).length, 0);
    if (edited) warn(`${sheet}: ${edited} cost cell${edited === 1 ? " is" : "s are"} typed by hand, so ${edited === 1 ? "it doesn't" : "they don't"} follow rate changes.`, side);
    const material = rows.filter((row) => row[side].edited.material !== undefined).length;
    if (material && v.pricing === "slab") warn(`${sheet}: ${material} hand-edited Material cell${material === 1 ? "" : "s"} change the sheet total but not the firm quote, which prices material on slabs purchased.`, side);
  }
  if (totalCustomer > 0 && margin < 0) warn("Total Customer Quote is below Total Internal Cost: the margin is negative.");
  if (d.pieces.length > 0 && !d.meta.customerName?.trim()) warn('Customer PDF: no customer yet, so the "To" line is left off. Add it under Customer PDF details.', "summary");

  return {
    rows,
    drawing,
    slabArea,
    packing: { totalLocal, usd, sqftBasis, sqftIsTyped: typedApplies, perSqft },
    rates,
    internal,
    customer,
    slabs,
    slabTotals,
    materialSplit,
    drivers,
    summary,
    checks,
  };
}

const fmt = (n: number) => num(n);

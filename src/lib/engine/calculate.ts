/**
 * The calculation engine — the single place where every derived number in the
 * system is produced. Each step names the workbook cells it reproduces
 * (see docs/SHEET-ANALYSIS.md). Operation order follows the Excel formulas so
 * results agree with the workbooks to floating-point precision.
 */
import {
  AREA_SYMBOL,
  UNIT_SYMBOL,
  type AppliedConversion,
  type ConversionRuleInput,
  type CostDriver,
  type CostLine,
  type CostSheet,
  type DrawingTotals,
  type EdgeRule,
  type EngineInput,
  type EngineResult,
  type Issue,
  type LengthUnit,
  type PackingResult,
  type PieceMeasurement,
  type ProjectSummaryResult,
  type ResolvedRate,
  type SlabResult,
} from "./types";

const div = (a: number, b: number): number | null => (b === 0 || !Number.isFinite(b) ? null : a / b);

/** value × multiplier ÷ divisor (in→ft is ×1 ÷12, so 2*(L+W)/12 is reproduced exactly). */
export function applyRule(value: number, rule: Pick<ConversionRuleInput, "multiplier" | "divisor">): number {
  return (value * rule.multiplier) / rule.divisor;
}

function findRule(
  rules: ConversionRuleInput[],
  type: "LENGTH" | "AREA",
  from: string,
  to: string,
): ConversionRuleInput | null {
  if (from === to) return { measurementType: type, fromUnit: from, toUnit: to, multiplier: 1, divisor: 1 };
  return rules.find((r) => r.measurementType === type && r.fromUnit === from && r.toUnit === to) ?? null;
}

/** Linear measure along the edges named by the rule, in the piece's own unit. */
export function edgeLength(rule: EdgeRule, length: number, width: number): number {
  switch (rule) {
    case "FULL_PERIMETER":
      return 2 * (length + width);
    case "ONE_LENGTH_ONE_WIDTH":
      return length + width;
    case "NONE":
      return 0;
  }
}

export function edgeRuleFormula(rule: EdgeRule): string {
  switch (rule) {
    case "FULL_PERIMETER":
      return "2 × (L + W)";
    case "ONE_LENGTH_ONE_WIDTH":
      return "(L + W)";
    case "NONE":
      return "0";
  }
}

function driverValue(m: PieceMeasurement, driver: CostDriver): number {
  switch (driver) {
    case "PIECE_SQFT":
      return m.sqftPerPc;
    case "CUTTING_LF":
      return m.cuttingLf;
    case "DEP_LF":
      return m.depLf;
    case "SINK_CUTS":
      return m.piece.sinkCuts;
    case "FAUCET_HOLES":
      return m.piece.faucetHoles;
    case "R_CORNERS":
      return m.piece.rCorners;
    case "JOINTS":
      return m.piece.joints;
  }
}

export const DRIVER_LABEL: Record<CostDriver, string> = {
  PIECE_SQFT: "Sqft/Pc",
  CUTTING_LF: "Cutting LF",
  DEP_LF: "DE&P LF",
  SINK_CUTS: "Sink Cuts",
  FAUCET_HOLES: "Faucet Holes",
  R_CORNERS: "R-Corners",
  JOINTS: "Joints",
};

// ─── Step 1: measurements (Drawing Summary P–T, row 27) ─────────────────────

function measure(input: EngineInput, issues: Issue[]) {
  const conversions = new Map<LengthUnit, AppliedConversion | null>();
  const conversionFor = (unit: LengthUnit): AppliedConversion | null => {
    if (conversions.has(unit)) return conversions.get(unit)!;
    const length = findRule(input.conversionRules, "LENGTH", UNIT_SYMBOL[unit], "ft");
    const area = findRule(input.conversionRules, "AREA", AREA_SYMBOL[unit], "sqft");
    const conv = length && area ? { unit, length, area } : null;
    if (!conv) {
      issues.push({
        severity: "error",
        code: "MISSING_CONVERSION",
        message: `No active conversion rule from ${UNIT_SYMBOL[unit]} to ft / ${AREA_SYMBOL[unit]} to sqft.`,
        fixAt: "unit-conversion",
      });
    }
    conversions.set(unit, conv);
    return conv;
  };

  const measurements: PieceMeasurement[] = [];
  for (const piece of input.pieces) {
    const conv = conversionFor(piece.dimUnit);
    if (!conv) continue;
    if (!(piece.length > 0) || !(piece.width > 0)) {
      issues.push({
        severity: "error",
        code: "BAD_DIMENSION",
        message: `Dwg ${piece.dwgNo} piece ${piece.pieceNo}: length and width must be greater than 0.`,
        fixAt: "import-drawing",
      });
    }
    if (!(piece.unitsQty > 0)) {
      issues.push({
        severity: "warning",
        code: "ZERO_QTY",
        message: `Dwg ${piece.dwgNo} piece ${piece.pieceNo} has Units Qty 0 — it adds nothing to the quote.`,
        fixAt: "import-drawing",
      });
    }
    const { length: L, width: W } = piece;
    const cuttingLf = applyRule(edgeLength(piece.cuttingRule, L, W), conv.length); // P = 2*(F+G)/12
    const depLf = applyRule(edgeLength(piece.depRule, L, W), conv.length); // Q
    const sqftPerPc = applyRule(L * W, conv.area); // R = F*G/144
    const totalPcs = piece.unitsQty; // S = O
    measurements.push({
      piece,
      lengthFt: applyRule(L, conv.length),
      widthFt: applyRule(W, conv.length),
      cuttingLf,
      depLf,
      sqftPerPc,
      totalPcs,
      totalSqft: sqftPerPc * totalPcs, // T = R*S
    });
  }

  const totals: DrawingTotals = {
    pieceRows: measurements.length,
    totalPcs: 0,
    totalSqft: 0,
    sinkCutouts: 0,
    faucetHoles: 0,
    rCorners: 0,
    joints: 0,
    cuttingLf: 0,
    depLf: 0,
  };
  for (const m of measurements) {
    const q = m.piece.unitsQty;
    totals.totalPcs += m.totalPcs; // S27 = SUM(S)
    totals.totalSqft += m.totalSqft; // T27 = SUM(T)
    totals.sinkCutouts += m.piece.sinkCuts * q; // K27 = SUMPRODUCT(K,O)
    totals.faucetHoles += m.piece.faucetHoles * q;
    totals.rCorners += m.piece.rCorners * q;
    totals.joints += m.piece.joints * q;
    totals.cuttingLf += m.cuttingLf * q;
    totals.depLf += m.depLf * q;
  }

  const applied = [...conversions.values()].filter((c): c is AppliedConversion => c !== null);
  return { measurements, totals, conversions: applied, conversionFor };
}

// ─── Step 2: packing (Variables B23:B28) ────────────────────────────────────

function packingCalc(input: EngineInput, totalSqft: number, issues: Issue[]): PackingResult | null {
  const p = input.packing;
  if (!p) return null;
  if (!(p.exchangeRate > 0)) {
    issues.push({
      severity: "error",
      code: "BAD_EXCHANGE_RATE",
      message: "Packing exchange rate must be greater than 0.",
      fixAt: "cost-inputs",
    });
    return { totalLocal: p.containerCostLocal * p.containerCount, totalQuoteCurrency: 0, perSqft: null };
  }
  const totalLocal = p.containerCostLocal * p.containerCount;
  const totalQuoteCurrency = (p.containerCostLocal * p.containerCount) / p.exchangeRate; // B26 = B23*B24/B25
  return { totalLocal, totalQuoteCurrency, perSqft: div(totalQuoteCurrency, totalSqft) }; // B28 = B26/B27
}

// ─── Step 3: rates (Variables C12:D19) ──────────────────────────────────────

function resolveRates(input: EngineInput, packing: PackingResult | null, issues: Issue[]): ResolvedRate[] {
  const rows = [...input.costInputs].sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map((row) => {
    let myCost: number | null;
    if (row.myCostMode === "PACKING_PER_SQFT") {
      myCost = packing?.perSqft ?? null;
      if (myCost === null) {
        issues.push({
          severity: "error",
          code: "PACKING_UNAVAILABLE",
          message: `${row.name}: packing per sqft can't be worked out — enter the packing figures and at least one drawing piece.`,
          fixAt: "cost-inputs",
        });
      }
    } else {
      myCost = row.myCost;
      if (myCost === null) {
        issues.push({
          severity: "error",
          code: "MISSING_MY_COST",
          message: `${row.name}: My Cost is empty.`,
          fixAt: "cost-inputs",
        });
      }
    }

    let customerCharge: number | null;
    if (row.customerChargeMode === "SAME_AS_MY_COST") {
      customerCharge = myCost;
    } else {
      customerCharge = row.customerCharge;
      if (customerCharge === null) {
        issues.push({
          severity: "error",
          code: "MISSING_CUSTOMER_CHARGE",
          message: `${row.name}: Customer Charge is empty.`,
          fixAt: "cost-inputs",
        });
      }
    }
    if (myCost !== null && myCost < 0) {
      issues.push({ severity: "error", code: "NEGATIVE_RATE", message: `${row.name}: My Cost is negative.`, fixAt: "cost-inputs" });
    }
    if (customerCharge !== null && customerCharge < 0) {
      issues.push({ severity: "error", code: "NEGATIVE_RATE", message: `${row.name}: Customer Charge is negative.`, fixAt: "cost-inputs" });
    }
    if (myCost !== null && customerCharge !== null && customerCharge < myCost) {
      issues.push({
        severity: "warning",
        code: "BELOW_COST",
        message: `${row.name}: Customer Charge (${customerCharge}) is below My Cost (${myCost}).`,
        fixAt: "cost-inputs",
      });
    }

    return {
      code: row.code,
      name: row.name,
      unitLabel: row.unitLabel,
      driver: row.driver,
      isMaterial: row.isMaterial,
      myCost,
      myCostMode: row.myCostMode,
      customerCharge,
      customerChargeMode: row.customerChargeMode,
    };
  });
}

// ─── Step 4: costing (Internal Costing / Customer Quote) ────────────────────

function costSheet(side: "internal" | "customer", measurements: PieceMeasurement[], rates: ResolvedRate[]): CostSheet {
  const rateOf = (r: ResolvedRate) => (side === "internal" ? r.myCost : r.customerCharge) ?? 0;
  const componentTotals: Record<string, number> = Object.fromEntries(rates.map((r) => [r.code, 0]));
  let grandTotal = 0;
  let totalQty = 0;

  const lines: CostLine[] = measurements.map((m) => {
    const components: Record<string, number> = {};
    let perPc = 0;
    for (const r of rates) {
      const amount = driverValue(m, r.driver) * rateOf(r); // e.g. G = E*C12, H = P*C13
      components[r.code] = amount;
      perPc += amount; // O = SUM(G:N)
    }
    const qty = m.piece.unitsQty;
    const total = perPc * qty; // P = O*F
    for (const r of rates) componentTotals[r.code] += components[r.code] * qty; // row 26 SUMPRODUCT
    grandTotal += total; // P26 = SUM(P)
    totalQty += qty;
    return { piece: m.piece, sqftPerPc: m.sqftPerPc, unitsQty: qty, components, perPc, total };
  });

  const materialTotal = rates.filter((r) => r.isMaterial).reduce((s, r) => s + componentTotals[r.code], 0);
  return {
    side,
    lines,
    componentTotals,
    materialTotal,
    fabricationTotal: grandTotal - materialTotal, // Project Summary B11 = P26 − G26
    grandTotal,
    totalQty,
  };
}

// ─── Step 5: slab calculation (sheet 6) ─────────────────────────────────────

function slabCalc(
  input: EngineInput,
  rates: ResolvedRate[],
  usedSqft: number,
  conversionFor: (u: LengthUnit) => AppliedConversion | null,
  issues: Issue[],
): SlabResult | null {
  if (!input.slabSpec) {
    issues.push({ severity: "error", code: "NO_SLAB_SPEC", message: "Slab size is not set.", fixAt: "cost-inputs" });
    return null;
  }
  if (!input.slab) {
    issues.push({
      severity: "error",
      code: "NO_SLAB_COUNT",
      message: "Slab count (from the nesting optimizer) is not entered — slab-basis material can't be priced.",
      fixAt: "slab-calculation",
    });
    return null;
  }
  const conv = conversionFor(input.slabSpec.unit);
  if (!conv) return null;

  const slabAreaSqft = applyRule(input.slabSpec.width * input.slabSpec.depth, conv.area); // Variables B7 = B5*B6/144
  const adjustmentTotal = input.slab.adjustments.reduce((s, a) => s + a.slabs, 0);
  const totalSlabs = input.slab.optimizerSlabs + adjustmentTotal; // B7 = B5+B6
  const purchasedSqft = totalSlabs * slabAreaSqft; // B8
  const wasteSqft = purchasedSqft - usedSqft; // B10
  const material = rates.filter((r) => r.isMaterial);
  if (material.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_MATERIAL_RATE",
      message: "No material cost item — slab material can't be priced.",
      fixAt: "cost-inputs",
    });
  }
  const materialRateMyCost = material.reduce((s, r) => s + (r.myCost ?? 0), 0);
  const materialRateCustomer = material.reduce((s, r) => s + (r.customerCharge ?? 0), 0);

  if (totalSlabs <= 0) {
    issues.push({ severity: "error", code: "NO_SLABS", message: "Total slabs must be greater than 0.", fixAt: "slab-calculation" });
  } else if (wasteSqft < 0) {
    issues.push({
      severity: "error",
      code: "SLABS_TOO_FEW",
      message: `Purchased slab area (${purchasedSqft.toFixed(2)} sqft) is less than the piece area (${usedSqft.toFixed(2)} sqft). Re-run the optimizer or correct the slab count.`,
      fixAt: "slab-calculation",
    });
  }

  const sqInToSqft = conversionFor("IN")?.area ?? { multiplier: 1, divisor: 144 };
  return {
    slabAreaSqft,
    optimizerSlabs: input.slab.optimizerSlabs,
    adjustmentTotal,
    totalSlabs,
    purchasedSqft,
    usedSqft, // B9 = Drawing!T27
    wasteSqft,
    utilization: div(usedSqft, purchasedSqft), // B11
    materialRateMyCost,
    materialRateCustomer,
    materialCost: purchasedSqft * materialRateMyCost, // B12 = B8*C12
    materialCharge: purchasedSqft * materialRateCustomer, // customer side; = B12 while D12 = C12
    drivers: input.slab.drivers.map((d) => {
      const driverWaste = applyRule(d.dedicatedSlabs * d.wastePerSlabSqIn, sqInToSqft); // B19 = B17*2114/144
      return {
        ...d,
        shareOfSlabs: div(d.dedicatedSlabs, totalSlabs), // B18
        wasteSqft: driverWaste,
        shareOfWaste: div(driverWaste, wasteSqft), // B20
      };
    }),
  };
}

// ─── Step 6: project summary (sheet 7) ──────────────────────────────────────

function summarize(
  totals: DrawingTotals,
  internal: CostSheet,
  customer: CostSheet,
  slab: SlabResult | null,
): ProjectSummaryResult {
  const fabricationMyCost = internal.fabricationTotal; // B11
  const slabMaterialMyCost = slab?.materialCost ?? 0; // B12
  const totalInternalCost = fabricationMyCost + slabMaterialMyCost; // B13
  const fabricationCustomer = customer.fabricationTotal; // B14
  const slabMaterialCustomer = slab?.materialCharge ?? 0; // B15
  const totalQuote = fabricationCustomer + slabMaterialCustomer; // B16
  const grossMargin = totalQuote - totalInternalCost; // B19
  return {
    totalPcs: totals.totalPcs,
    totalSqft: totals.totalSqft,
    totalSlabs: slab?.totalSlabs ?? 0,
    sinkCutouts: totals.sinkCutouts,
    fabricationMyCost,
    slabMaterialMyCost,
    totalInternalCost,
    fabricationCustomer,
    slabMaterialCustomer,
    totalQuote,
    grossMargin,
    grossMarginPct: div(grossMargin, totalQuote), // B20
    pricePerSlab: slab ? div(totalQuote, slab.totalSlabs) : null, // B21
    myCostPerSqft: div(totalInternalCost, totals.totalSqft), // B25
    customerPerSqft: div(totalQuote, totals.totalSqft), // C25
  };
}

// ─── Entry point ────────────────────────────────────────────────────────────

export function calculateProject(input: EngineInput): EngineResult {
  const issues: Issue[] = [];

  const { measurements, totals, conversions, conversionFor } = measure(input, issues);
  if (input.pieces.length === 0) {
    issues.push({
      severity: "error",
      code: "NO_PIECES",
      message: "No drawing pieces yet — import the drawing summary sheet or add pieces manually.",
      fixAt: "import-drawing",
    });
  }
  if (input.costInputs.length === 0) {
    issues.push({ severity: "error", code: "NO_RATES", message: "No cost inputs set.", fixAt: "cost-inputs" });
  }

  const packing = packingCalc(input, totals.totalSqft, issues);
  const rates = resolveRates(input, packing, issues);
  const internal = costSheet("internal", measurements, rates);
  const customer = costSheet("customer", measurements, rates);
  const slab = slabCalc(input, rates, totals.totalSqft, conversionFor, issues);
  const summary = summarize(totals, internal, customer, slab);

  if (summary.totalQuote > 0 && summary.grossMargin < 0) {
    issues.push({
      severity: "warning",
      code: "NEGATIVE_MARGIN",
      message: "Total customer quote is below total internal cost (negative margin).",
      fixAt: "cost-inputs",
    });
  }

  // De-duplicate identical messages (e.g. one missing rule hit by many pieces).
  const seen = new Set<string>();
  const unique = issues.filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true)));

  return {
    conversions,
    measurements,
    drawingTotals: totals,
    packing,
    rates,
    internal,
    customer,
    slab,
    summary,
    issues: unique,
    ready: !unique.some((i) => i.severity === "error"),
  };
}

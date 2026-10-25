import "server-only";
import { prisma } from "@/lib/db";
import { getProject, getProjectCalculation } from "@/lib/engine/load";
import { DRIVER_LABEL } from "@/lib/engine/calculate";
import { subtotals } from "@/lib/engine/subtotals";
import { UNIT_SYMBOL, type CostSheet, type EngineResult } from "@/lib/engine/types";
import { buildLiveQuote } from "@/modules/quote/build";
import { DEFAULT_OPTIONS } from "@/lib/pdf/quote-data";
import { getProjectsOverview } from "@/lib/projects-overview";
import { dashboardData } from "@/lib/dashboard";
import { extraFieldsOf } from "@/lib/project-fields";
import { dec2, dec4, money, pct, rate } from "@/lib/engine/format";
import type { Cell, ExportDoc, ExportTable } from "./types";

export const PROJECT_SCOPES = [
  "inputs",
  "cost-inputs",
  "internal-costing",
  "customer-charges",
  "slab-calculation",
  "project-summary",
  "final-quote",
] as const;
export const GLOBAL_SCOPES = ["projects", "dashboard"] as const;
export type ExportScope = (typeof PROJECT_SCOPES)[number] | (typeof GLOBAL_SCOPES)[number];

/** The customer quote is only exported once it has no blocking issue, as for the PDF. */
export class QuoteNotReady extends Error {
  constructor(public issues: string[]) {
    super("The quote can't be produced yet:\n- " + issues.join("\n- "));
  }
}

const MODE_LABEL: Record<string, string> = { MANUAL: "Entered", PACKING_PER_SQFT: "From packing", SAME_AS_MY_COST: "= My Cost" };
const RULE_LABEL: Record<string, string> = { FULL_PERIMETER: "2 × (L + W)", ONE_LENGTH_ONE_WIDTH: "L + W", NONE: "0" };
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");

// ─── Shared tables ──────────────────────────────────────────────────────────

function costSheetTables(result: EngineResult, sheet: CostSheet): ExportTable[] {
  const internal = sheet.side === "internal";
  const rateOf = (code: string) => {
    const r = result.rates.find((x) => x.code === code)!;
    return internal ? r.myCost : r.customerCharge;
  };
  const perLabel = internal ? "Cost/Pc" : "Price/Pc";
  const totalLabel = internal ? "Total Cost" : "Total Price";
  const perPiece: ExportTable = {
    title: "Per piece",
    columns: [
      { header: "Dwg#", width: 0.8 },
      { header: "Group", width: 2 },
      { header: "Area", width: 1.4 },
      { header: "Piece", width: 0.7 },
      { header: "Description", width: 2.2 },
      { header: "Sqft/Pc", format: "dec4" },
      { header: "Units Qty", format: "int", width: 0.8 },
      ...result.rates.map((r) => ({ header: `${r.name.replace(/\s*\(.*\)$/, "")} $`, format: "dec2" as const })),
      { header: perLabel, format: "money" },
      { header: totalLabel, format: "money", width: 1.3 },
    ],
    rows: sheet.lines.map((l) => [
      l.piece.dwgNo,
      l.piece.group,
      l.piece.area,
      l.piece.pieceNo,
      l.piece.description,
      l.sqftPerPc,
      l.unitsQty,
      ...result.rates.map((r) => l.components[r.code]),
      l.perPc,
      l.total,
    ]),
    footer: ["TOTAL", null, null, null, null, null, sheet.totalQty, ...result.rates.map((r) => sheet.componentTotals[r.code]), null, sheet.grandTotal],
    note: "Material here is piece-sqft basis for reference; the quote uses slab-basis material (Project Summary).",
  };
  const byItem: ExportTable = {
    title: "By cost item",
    columns: [{ header: "Cost item", width: 2.5 }, { header: "Driver", width: 1.4 }, { header: "Rate", format: "rate" }, { header: "Amount", format: "money" }, { header: "Share", format: "pct" }],
    rows: result.rates.map((r) => [r.name, DRIVER_LABEL[r.driver], rateOf(r.code), sheet.componentTotals[r.code], sheet.grandTotal ? sheet.componentTotals[r.code] / sheet.grandTotal : null]),
    footer: ["Total (piece-basis material)", null, null, sheet.grandTotal, null],
  };
  const s = result.summary;
  const fab = internal ? s.fabricationMyCost : s.fabricationCustomer;
  const mat = internal ? s.slabMaterialMyCost : s.slabMaterialCustomer;
  const firm = internal ? s.totalInternalCost : s.totalQuote;
  const buildUp: ExportTable = {
    title: "Build-up",
    columns: [{ header: "Line", width: 3 }, { header: "Amount", format: "money" }],
    rows: [
      ["Total, piece-basis material", sheet.grandTotal],
      ["Less: piece-basis material", -sheet.materialTotal],
      ["Fabrication", fab],
      [`Add: slab-basis material (${s.totalSlabs} slabs)`, mat],
    ],
    footer: [internal ? "Total internal cost" : "Total quotation value", firm],
  };
  const sub = (by: "group" | "area"): ExportTable => ({
    title: by === "group" ? "By group" : "By area",
    columns: [{ header: by === "group" ? "Group" : "Area", width: 3 }, { header: "Rows", format: "int" }, { header: "Pieces", format: "int" }, { header: "Sqft", format: "dec2" }, { header: internal ? "Cost" : "Price", format: "money" }, { header: "Share", format: "pct" }],
    rows: subtotals(result, sheet, by).map((e) => [e.key, e.rows, e.pcs, e.sqft, e.total, e.share]),
  });
  return [perPiece, byItem, buildUp, sub("group"), sub("area")];
}

// ─── Builders ───────────────────────────────────────────────────────────────

async function projectDoc(scope: (typeof PROJECT_SCOPES)[number], projectId: string): Promise<ExportDoc> {
  const [project, { input, result }] = await Promise.all([getProject(projectId), getProjectCalculation(projectId)]);
  const cur = project.currency;
  const base = {
    currency: cur,
    generatedAt: new Date().toISOString(),
    subtitle: `${project.code} · ${project.name}${project.customerName ? ` · ${project.customerName}` : ""}`,
    meta: [] as [string, string][],
  };
  const name = (s: string) => fileSafe(`${project.code}_${s}`);
  const s = result.summary;

  switch (scope) {
    case "inputs": {
      const pieces = await prisma.drawingPiece.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, extra: true } });
      const extraKeys = [...new Set(pieces.flatMap((p) => Object.keys((p.extra as Record<string, string> | null) ?? {})))];
      const extraOf = new Map(pieces.map((p) => [p.id, (p.extra as Record<string, string> | null) ?? {}]));
      const checks = result.issues.filter((i) => i.check);
      return {
        ...base,
        fileBase: name("Drawing_Summary"),
        title: "Drawing Summary",
        audience: "general",
        meta: [["Pieces", `${result.drawingTotals.pieceRows} rows · ${result.drawingTotals.totalPcs.toLocaleString("en-US")} pcs`], ["Total sqft", result.drawingTotals.totalSqft.toFixed(2)]],
        tables: [
          {
            title: "Drawing Summary",
            columns: [
              { header: "Dwg#", width: 0.8 }, { header: "Group", width: 2 }, { header: "Area", width: 1.3 }, { header: "Piece", width: 0.7 }, { header: "Description", width: 2.2 },
              { header: "L", format: "dec2" }, { header: "W", format: "dec2" }, { header: "Unit", width: 0.6 }, { header: "Thickness", width: 1 }, { header: "Color", width: 1 }, { header: "Sink Model", width: 1.2 },
              { header: "Sink Cuts", format: "int" }, { header: "Faucet Holes", format: "int" }, { header: "R-Corners", format: "int" }, { header: "Joints", format: "int" }, { header: "Units Qty", format: "int" },
              { header: "Cutting LF", format: "dec4" }, { header: "DE&P LF", format: "dec4" }, { header: "Sqft/Pc", format: "dec4" }, { header: "Total Pcs", format: "int" }, { header: "Total Sqft", format: "dec2" },
              { header: "DE&P rule", width: 1 }, { header: "Notes", width: 2 },
              ...extraKeys.map((k) => ({ header: k, width: 1.2 })),
            ],
            rows: result.measurements.map((m) => {
              const p = m.piece;
              const ex = extraOf.get(p.id) ?? {};
              return [
                p.dwgNo, p.group, p.area, p.pieceNo, p.description, p.length, p.width, UNIT_SYMBOL[p.dimUnit], p.thickness, p.color, p.sinkModel,
                p.sinkCuts, p.faucetHoles, p.rCorners, p.joints, p.unitsQty, m.cuttingLf, m.depLf, m.sqftPerPc, m.totalPcs, m.totalSqft,
                RULE_LABEL[p.depRule], p.notes, ...extraKeys.map((k) => ex[k] ?? null),
              ] as Cell[];
            }),
            footer: [
              "TOTAL", null, null, null, null, null, null, null, null, null, null, result.drawingTotals.sinkCutouts, result.drawingTotals.faucetHoles, result.drawingTotals.rCorners, result.drawingTotals.joints,
              null, result.drawingTotals.cuttingLf, result.drawingTotals.depLf, null, result.drawingTotals.totalPcs, result.drawingTotals.totalSqft, null, null, ...extraKeys.map(() => null),
            ],
            note: "Cutting LF = 2 × (L + W) ÷ 12 · DE&P LF per the piece's edge rule ÷ 12 · Sqft/Pc = L × W ÷ 144 · Total Sqft = Sqft/Pc × Units Qty. Totals of counts and LF are × Units Qty.",
          },
          {
            title: "Data checks",
            columns: [{ header: "Check", width: 1.4 }, { header: "Detail", width: 6 }],
            rows: checks.map((c) => [c.code.replace(/_/g, " ").toLowerCase(), c.message]),
          },
        ],
      };
    }
    case "cost-inputs": {
      return {
        ...base,
        fileBase: name("Cost_Inputs"),
        title: "Cost Inputs",
        audience: "internal",
        meta: input.slabSpec ? [["Material basis", input.slabSpec.materialBasis ?? "—"]] : [],
        tables: [
          {
            title: "Rates",
            columns: [{ header: "Cost item", width: 2.4 }, { header: "Unit", width: 1.2 }, { header: "Driver", width: 1.2 }, { header: "My Cost", format: "rate" }, { header: "My Cost from", width: 1 }, { header: "Customer Charge", format: "rate" }, { header: "Customer from", width: 1 }],
            rows: result.rates.map((r) => [r.name, r.unitLabel, DRIVER_LABEL[r.driver], r.myCost, MODE_LABEL[r.myCostMode], r.customerCharge, MODE_LABEL[r.customerChargeMode]]),
          },
          {
            title: "Slab and packing",
            columns: [{ header: "Item", width: 3 }, { header: "Value", width: 2 }],
            rows: [
              ["Slab width", input.slabSpec ? `${input.slabSpec.width} ${UNIT_SYMBOL[input.slabSpec.unit]}` : "—"],
              ["Slab depth", input.slabSpec ? `${input.slabSpec.depth} ${UNIT_SYMBOL[input.slabSpec.unit]}` : "—"],
              ["Slab area (sqft)", result.slab ? result.slab.slabAreaSqft.toFixed(4) : "—"],
              ["Container cost", input.packing ? `${input.packing.localCurrency} ${input.packing.containerCostLocal.toLocaleString("en-IN")}` : "—"],
              ["Containers", input.packing ? String(input.packing.containerCount) : "—"],
              ["Exchange rate", input.packing ? `${input.packing.exchangeRate} ${input.packing.localCurrency}/${cur}` : "—"],
              ["Total packing", result.packing ? money(result.packing.totalQuoteCurrency, cur) : "—"],
              ["Packing per sqft", result.packing ? rate(result.packing.perSqft, cur) : "—"],
            ],
          },
        ],
      };
    }
    case "internal-costing":
      return {
        ...base,
        fileBase: name("Internal_Costing"),
        title: "Internal Costing (My Cost)",
        audience: "internal",
            meta: [["Total internal cost", money(s.totalInternalCost, cur)], ["Rate per sqft", rate(s.myCostPerSqft, cur)]],
        tables: costSheetTables(result, result.internal),
      };
    case "customer-charges":
      return {
        ...base,
        fileBase: name("Customer_Charges"),
        title: "Customer Charges",
        audience: "customer",
        meta: [["Total quotation", money(s.totalQuote, cur)], ["Rate per sqft", rate(s.customerPerSqft, cur)]],
        tables: costSheetTables(result, result.customer),
      };
    case "slab-calculation": {
      const sl = result.slab;
      return {
        ...base,
        fileBase: name("Slab_Calculation"),
        title: "Slab Calculation",
        audience: "internal",
        tables: [
          {
            title: "Slabs",
            columns: [{ header: "Item", width: 3 }, { header: "Value", width: 1.5 }, { header: "Formula", width: 2.4 }],
            rows: sl
              ? [
                  ["Slabs per optimizer run", String(sl.optimizerSlabs), "input"],
                  ["Adjustments", String(sl.adjustmentTotal), "Σ adjustments"],
                  ["Total slabs", String(sl.totalSlabs), "optimizer + adjustments"],
                  ["Slab area (sqft)", dec4(sl.slabAreaSqft), "W × D ÷ 144"],
                  ["Slab area purchased (sqft)", dec2(sl.purchasedSqft), "total slabs × slab sqft"],
                  ["Used area (sqft)", dec2(sl.usedSqft), "Σ Total Sqft"],
                  ["Waste (sqft)", dec2(sl.wasteSqft), "purchased − used"],
                  ["Utilization", pct(sl.utilization), "used ÷ purchased"],
                  ["Material rate — My Cost", rate(sl.materialRateMyCost, cur), "per sqft"],
                  ["Slab-basis material — My Cost", money(sl.materialCost, cur), "purchased sqft × My Cost rate"],
                  ["Material rate — customer", rate(sl.materialRateCustomer, cur), "per sqft"],
                  ["Slab-basis material — customer", money(sl.materialCharge, cur), "purchased sqft × customer rate"],
                ]
              : [["Slab count not entered", "", ""]],
          },
          {
            title: "Slab drivers",
            columns: [{ header: "Driver pieces", width: 2.5 }, { header: "Pieces", format: "int" }, { header: "Pieces/slab", format: "dec2" }, { header: "Dedicated slabs", format: "int" }, { header: "Share of slabs", format: "pct" }, { header: "Waste (sqft)", format: "dec2" }, { header: "Share of waste", format: "pct" }, { header: "Note", width: 3 }],
            rows: (sl?.drivers ?? []).map((d) => [d.label, d.pieces, d.piecesPerSlab, d.dedicatedSlabs, d.shareOfSlabs, d.wasteSqft, d.shareOfWaste, d.note]),
          },
        ],
      };
    }
    case "project-summary": {
      const full = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
      return {
        ...base,
        fileBase: name("Project_Summary"),
        title: "Project Summary",
        audience: "internal",
        meta: extraFieldsOf(full).map((f) => [f.label, f.value] as [string, string]),
        tables: [
          {
            title: "Scope",
            columns: [{ header: "Item", width: 3 }, { header: "Value", width: 1.5 }],
            rows: [["Pieces", s.totalPcs.toLocaleString("en-US")], ["Piece sqft", dec2(s.totalSqft)], ["Slabs required", String(s.totalSlabs)], ["Sink cutouts", s.sinkCutouts.toLocaleString("en-US")]],
          },
          {
            title: "Cost build-up",
            columns: [{ header: "Line", width: 3 }, { header: "Amount", format: "money" }],
            rows: [
              ["Fabrication — My Cost", s.fabricationMyCost],
              [`Slab-basis material — My Cost (${s.totalSlabs} slabs)`, s.slabMaterialMyCost],
              ["TOTAL INTERNAL COST", s.totalInternalCost],
              ["Fabrication — customer", s.fabricationCustomer],
              ["Material — customer (slab basis)", s.slabMaterialCustomer],
              ["TOTAL CUSTOMER QUOTE", s.totalQuote],
              ["Gross margin", s.grossMargin],
              ["Customer price per slab", s.pricePerSlab],
            ],
          },
          {
            title: "Key rates",
            columns: [{ header: "", width: 3 }, { header: "Value", width: 1.5 }],
            rows: [["My Cost per sqft", rate(s.myCostPerSqft, cur)], ["Customer per sqft", rate(s.customerPerSqft, cur)], ["Gross margin %", pct(s.grossMarginPct)]],
          },
        ],
      };
    }
    case "final-quote": {
      // Customer copy: built only from the customer view, as the PDF is.
      const { data } = await buildLiveQuote(projectId, DEFAULT_OPTIONS);
      const v = data.view;
      if (!v.ready) throw new QuoteNotReady(v.blockingIssues);
      return {
        ...base,
        fileBase: fileSafe(data.quoteNumber.replace(/\s*\(draft\)/, "_draft")),
        title: `Quotation ${data.quoteNumber}`,
        subtitle: `${data.project.name}${data.project.customerName ? ` · ${data.project.customerName}` : ""}`,
        audience: "customer",
        meta: [["Quote date", new Date(data.issuedAt).toLocaleDateString("en-US")], ["Valid until", new Date(data.validUntil).toLocaleDateString("en-US")], ...(v.materialBasis ? [["Material", v.materialBasis] as [string, string]] : [])],
        tables: [
          {
            title: "Piece schedule",
            columns: [{ header: "Dwg#", width: 0.8 }, { header: "Group", width: 2 }, { header: "Area", width: 1.3 }, { header: "Piece", width: 0.7 }, { header: "Description", width: 2.4 }, { header: "L", format: "dec2" }, { header: "W", format: "dec2" }, { header: "Sink", width: 1.1 }, { header: "Qty", format: "int" }, { header: "Sqft/Pc", format: "dec2" }, { header: "Total Sqft", format: "dec2" }],
            rows: v.pieces.map((p) => [p.dwgNo, p.group, p.area, p.pieceNo, p.description, p.length, p.width, p.sinkModel, p.unitsQty, p.sqftPerPc, p.totalSqft]),
            footer: ["TOTAL", null, null, null, null, null, null, null, v.scope.totalPcs, null, v.scope.totalSqft],
          },
          {
            title: "Price",
            columns: [{ header: "", width: 3 }, { header: "Amount", width: 1.5 }],
            rows: [["Countertop area", `${dec2(v.scope.totalSqft)} sqft`], ["Rate per sqft", rate(v.pricing.ratePerSqft, cur)]],
            footer: ["TOTAL QUOTATION", money(v.pricing.totalQuote, cur)],
          },
          ...(data.notes.length ? [{ title: "Notes", columns: [{ header: "Note", width: 6 }], rows: data.notes.map((n) => [n]) }] : []),
        ],
      };
    }
  }
}

async function globalDoc(scope: (typeof GLOBAL_SCOPES)[number]): Promise<ExportDoc> {
  const base = { currency: "USD", generatedAt: new Date().toISOString(), meta: [] as [string, string][] };
  if (scope === "projects") {
    const rows = await getProjectsOverview();
    return {
      ...base,
      fileBase: "CTS_All_Projects",
      title: "All Projects",
      audience: "general",
      tables: [
        {
          title: "All Projects",
          columns: [{ header: "Code", width: 1 }, { header: "Project", width: 3 }, { header: "Customer", width: 1.6 }, { header: "Status", width: 1.2 }, { header: "Quote status", width: 1.8 }, { header: "Pieces", format: "int" }, { header: "Sqft", format: "dec2" }, { header: "Customer quote", format: "money" }, { header: "Latest revision", width: 1.4 }],
          rows: rows.map((p) => [p.code, p.name, p.customerName, p.status.label, p.status.quote.label, p.result.drawingTotals.totalPcs, p.result.drawingTotals.totalSqft, p.status.quote.value, p.latestRevision?.quoteNumber ?? null]),
        },
      ],
    };
  }
  const d = await dashboardData();
  return {
    ...base,
    fileBase: "CTS_Dashboard",
    title: "CTS Dashboard",
    audience: "internal",
    meta: [["Projects", String(d.kpis.totalProjects)], ["Quoted value (issued)", money(d.kpis.issuedValue)], ["Pipeline (ready, not issued)", money(d.kpis.pipelineValue)]],
    tables: [
      {
        title: "Projects by status",
        columns: [{ header: "Status", width: 2 }, { header: "Projects", format: "int" }, { header: "Quote value", format: "money" }],
        rows: d.byStatus.map((s) => [s.label, s.count, s.value]),
      },
      {
        title: "Customers",
        columns: [{ header: "Customer", width: 2.5 }, { header: "Projects", format: "int" }, { header: "Sqft", format: "dec2" }, { header: "Internal cost", format: "money" }, { header: "Quote value", format: "money" }, { header: "Margin", format: "money" }, { header: "Margin %", format: "pct" }],
        rows: d.customers.map((c) => [c.customer, c.projects, c.sqft, c.internalCost, c.quote, c.margin, c.marginPct]),
      },
      {
        title: "Projects",
        columns: [{ header: "Code", width: 1 }, { header: "Project", width: 2.6 }, { header: "Customer", width: 1.5 }, { header: "Status", width: 1.2 }, { header: "Sqft", format: "dec2" }, { header: "Slabs", format: "int" }, { header: "Internal cost", format: "money" }, { header: "Customer quote", format: "money" }, { header: "Margin %", format: "pct" }, { header: "$/sqft", format: "rate" }, { header: "Latest revision", width: 1.3 }],
        rows: d.projects.map((p) => [p.code, p.name, p.customer, p.status, p.sqft, p.slabs, p.internalCost, p.quote, p.marginPct, p.perSqft, p.revision]),
        note: "Internal cost, quote and margin are shown only where the costing is complete (no blocking issues).",
      },
    ],
  };
}

export async function buildExport(scope: ExportScope, projectId: string | null): Promise<ExportDoc> {
  if ((GLOBAL_SCOPES as readonly string[]).includes(scope)) return globalDoc(scope as (typeof GLOBAL_SCOPES)[number]);
  if (!projectId) throw new Error("Project is required");
  return projectDoc(scope as (typeof PROJECT_SCOPES)[number], projectId);
}

export const isScope = (s: string | null): s is ExportScope => !!s && ([...PROJECT_SCOPES, ...GLOBAL_SCOPES] as string[]).includes(s);

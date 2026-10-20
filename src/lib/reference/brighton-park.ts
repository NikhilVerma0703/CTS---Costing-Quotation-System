/**
 * Reference data taken from the seven uploaded CTS workbooks
 * (reference-sheets/). Used by the seed script to load the Lennar NWA
 * Brighton Park project, and by the golden tests.
 */
import type { CostDriver, CustomerChargeMode, EdgeRule, LengthUnit, MyCostMode } from "@/lib/engine/types";

/** Cost item catalog — order matches the costing sheets' columns G–N. */
export const COST_ITEMS: {
  code: string;
  name: string;
  unitLabel: string;
  driver: CostDriver;
  isMaterial: boolean;
  sortOrder: number;
}[] = [
  { code: "MATERIAL", name: "Material", unitLabel: "per sqft", driver: "PIECE_SQFT", isMaterial: true, sortOrder: 10 },
  { code: "CUTTING", name: "Cutting", unitLabel: "per linear ft", driver: "CUTTING_LF", isMaterial: false, sortOrder: 20 },
  { code: "DEP", name: "DE&P (Edge Polish)", unitLabel: "per linear ft", driver: "DEP_LF", isMaterial: false, sortOrder: 30 },
  { code: "SINK", name: "Sink Cutout", unitLabel: "per cutout", driver: "SINK_CUTS", isMaterial: false, sortOrder: 40 },
  { code: "FAUCET", name: "Faucet Hole", unitLabel: "per hole", driver: "FAUCET_HOLES", isMaterial: false, sortOrder: 50 },
  { code: "RCORNER", name: "R-Corner", unitLabel: "per corner", driver: "R_CORNERS", isMaterial: false, sortOrder: 60 },
  { code: "JOINT", name: "Joint", unitLabel: "per joint", driver: "JOINTS", isMaterial: false, sortOrder: 70 },
  { code: "PACKING", name: "Packing", unitLabel: "per sqft", driver: "PIECE_SQFT", isMaterial: false, sortOrder: 80 },
];

/** System conversion rules: value × multiplier ÷ divisor. */
export const CONVERSION_RULES: {
  measurementType: "LENGTH" | "AREA";
  fromUnit: string;
  toUnit: string;
  multiplier: number;
  divisor: number;
  description: string;
}[] = [
  { measurementType: "LENGTH", fromUnit: "in", toUnit: "ft", multiplier: 1, divisor: 12, description: "12 inches = 1 foot" },
  { measurementType: "LENGTH", fromUnit: "mm", toUnit: "ft", multiplier: 1, divisor: 304.8, description: "304.8 mm = 1 foot" },
  { measurementType: "LENGTH", fromUnit: "cm", toUnit: "ft", multiplier: 1, divisor: 30.48, description: "30.48 cm = 1 foot" },
  { measurementType: "LENGTH", fromUnit: "m", toUnit: "ft", multiplier: 1, divisor: 0.3048, description: "0.3048 m = 1 foot" },
  { measurementType: "AREA", fromUnit: "sq in", toUnit: "sqft", multiplier: 1, divisor: 144, description: "144 sq in = 1 sqft" },
  { measurementType: "AREA", fromUnit: "sq mm", toUnit: "sqft", multiplier: 1, divisor: 92903.04, description: "92,903.04 sq mm = 1 sqft" },
  { measurementType: "AREA", fromUnit: "sq cm", toUnit: "sqft", multiplier: 1, divisor: 929.0304, description: "929.0304 sq cm = 1 sqft" },
  { measurementType: "AREA", fromUnit: "sq m", toUnit: "sqft", multiplier: 1, divisor: 0.09290304, description: "0.09290304 sq m = 1 sqft" },
];

export const BRIGHTON_PARK = {
  project: {
    code: "LEN-NWA-BP",
    name: "Lennar NWA Brighton Park - Countertop Project",
    customerName: "Lennar",
    siteAddress: "NWA Brighton Park",
    versionLabel: "Ver 5",
    description:
      "Countertop costing per Project #1624 Ver11 format. Source: Allied Stone shop drawings Rev #0 (09/26/2026); quantities per LENNAR BOM rev 1.",
  },
  slabSpec: { width: 136, depth: 78, unit: "IN" as LengthUnit, materialBasis: "1.5cm - Color TBD" },
  packing: { containerLabel: "40ft container", containerCostLocal: 200000, containerCount: 3, localCurrency: "INR", exchangeRate: 95 },
  rates: [
    { code: "MATERIAL", label: "1.5cm Material (color TBD)", myCostMode: "MANUAL", myCost: 3.5, customerChargeMode: "SAME_AS_MY_COST", customerCharge: null, note: "CONFIRMED (Ver2 Rev1): 1.5cm material $3.50/sqft (was $4.50 placeholder). Customer side follows (no markup on material)." },
    { code: "CUTTING", label: "Cutting", myCostMode: "MANUAL", myCost: 0.21, customerChargeMode: "MANUAL", customerCharge: 0.3, note: null },
    { code: "DEP", label: "DE&P (Edge Polish)", myCostMode: "MANUAL", myCost: 0.25, customerChargeMode: "MANUAL", customerCharge: 0.4, note: null },
    { code: "SINK", label: "Sink Cutout", myCostMode: "MANUAL", myCost: 2, customerChargeMode: "MANUAL", customerCharge: 4, note: null },
    { code: "FAUCET", label: "Faucet Hole", myCostMode: "MANUAL", myCost: 2, customerChargeMode: "MANUAL", customerCharge: 3, note: null },
    { code: "RCORNER", label: "R-Corner", myCostMode: "MANUAL", myCost: 2, customerChargeMode: "MANUAL", customerCharge: 3, note: null },
    { code: "JOINT", label: "Joint", myCostMode: "MANUAL", myCost: 0, customerChargeMode: "MANUAL", customerCharge: 0, note: null },
    { code: "PACKING", label: "Packing", myCostMode: "PACKING_PER_SQFT", myCost: null, customerChargeMode: "SAME_AS_MY_COST", customerCharge: null, note: "Derived: packing USD ÷ total project sqft." },
  ] as {
    code: string;
    label: string;
    myCostMode: MyCostMode;
    myCost: number | null;
    customerChargeMode: CustomerChargeMode;
    customerCharge: number | null;
    note: string | null;
  }[],
  slab: {
    optimizerSlabs: 261,
    sourceNote: "CutList Optimizer report brighton_park_rev_1.pdf (10/7/2026, 46 pages, LENNAR BOM rev 1 qty) | stock 136 x 78 in | kerf 0.2 in",
    kerfIn: 0.2,
    adjustments: [
      { slabs: -1, reason: "Slab freed by Dwg 7 Pc 5A 53->50 (3 x 124x34.25 at 2/slab) - rerun optimizer to confirm" },
    ],
    drivers: [
      {
        label: "124 x 34.25 Kitchen Tops (Dwg 4/7/9)",
        pieces: 208,
        piecesPerSlab: 2,
        dedicatedSlabs: 104,
        wastePerSlabSqIn: 2114,
        note: "207 pcs at 2/slab; 1 more piece nested on optimizer p.10. Pieces per slab per optimizer pp.37-40.",
      },
    ],
  },
  notes: [
    // Customer-visible scope notes, reworded from the sheet's assumptions (no internal figures).
    { visibility: "CUSTOMER" as const, text: "Material: 1.5cm quartz, single colour (colour to be confirmed), priced on a full-slab basis." },
    { visibility: "CUSTOMER" as const, text: "Quantities per LENNAR BOM rev 1; dimensions per Allied Stone shop drawings Rev #0 (09/26/2026)." },
    { visibility: "CUSTOMER" as const, text: "Edge polish: island tops polished on the full perimeter; all other pieces on one length and one width edge." },
    { visibility: "CUSTOMER" as const, text: "Sink cutouts for ASI-2003 (kitchen) and ASI-C6 (vanity) included where shown. Faucet holes and radius corners are not included unless added to the drawings." },
    { visibility: "CUSTOMER" as const, text: "Hand chamfering is excluded." },
    { visibility: "CUSTOMER" as const, text: "Packing in 40ft export containers is included." },
    { visibility: "INTERNAL" as const, text: "Ver5: CHANGE - Dwg 7 Pc 5A qty 53 -> 50 (3 fewer 124 x 34.25 tops, 3 fewer sink cutouts: 1,531 pcs / 15,828.28 sqft, 639 cutouts). Slabs 261 -> 260 (ESTIMATE: 3 pcs at 2/slab frees 1 slab of the rev 1 optimizer run - rerun CutList Optimizer to confirm)." },
    { visibility: "INTERNAL" as const, text: "Ver4: CHANGE - Rate-per-sqft breakup removed - Project Summary shows final rate per sqft only. No pricing change from Ver3." },
    { visibility: "INTERNAL" as const, text: "1. CHANGE (Ver2 Rev1): 1.5cm material rate confirmed at $3.50/sqft (was $4.50 placeholder)." },
    { visibility: "INTERNAL" as const, text: "Ver3: CHANGE - Quantities per LENNAR BOM rev 1 - Dwg 1 Pc 1 51->53, Dwg 4 Pc 1A 50->53, Dwg 7 Pc 5A 50->53, Dwg 9 Pc 8A 100->105 (+13 pcs; 1,534 pcs / 15,916.76 sqft). Spares on Pc 1/1A/5A carry sink cutouts (642 total); 8A none." },
    { visibility: "INTERNAL" as const, text: "Ver3: CHANGE - Slabs per CutList Optimizer rev 1 (brighton_park_rev_1.pdf, 10/7/2026) = 261 (was 255); optimizer used area matches Drawing Summary sqft." },
    { visibility: "INTERNAL" as const, text: "OPEN: BOM calls 1A/5A/8A (124 x 34.25) 'Kitchen Island'. Priced as perimeter run (DE&P = one L + one W). If freestanding islands, DE&P becomes full perimeter on 211 pieces." },
    { visibility: "INTERNAL" as const, text: "2. CHANGE (Ver2): Packing = 3 x 40ft containers (confirmed) @ Rs 200,000 each (was Rs 145,000), Rs 95/USD, spread over total piece sqft." },
    { visibility: "INTERNAL" as const, text: "3. Material costed on a SLAB basis: 260 slabs x 73.67 sqft x $3.50. Customer material charge = cost (no markup), as on #1624." },
    { visibility: "INTERNAL" as const, text: "4. Cutting LF = full perimeter 2(L+W)/12 on every piece (no splashes/aprons on these drawings)." },
    { visibility: "INTERNAL" as const, text: "5. DE&P LF: Kitchen Island Top (Dwg 1 Pc 1, BERGA group) = full perimeter 2(L+W)/12; all other pieces = one L + one W edge (L+W)/12, per #1624 Ver9 rule. 'No Polish' edges on Dwg 9 are not deducted." },
    { visibility: "INTERNAL" as const, text: "6. Hand Chamfering excluded (removed in #1624 Ver7)." },
    { visibility: "INTERNAL" as const, text: "7. Faucet holes = 0 and R-Corners = 0: faucet field blank on both cutout templates and no eased corners called out. Add counts in Drawing Summary cols L/M if required." },
    { visibility: "INTERNAL" as const, text: "8. Sink cutouts: ASI-2003 (kitchen) and ASI-C6 (vanity) at one uniform rate. Dwg 9 kitchens and Dwg 10 MB vanities have NO sink - confirmed by BOM rev 1." },
    { visibility: "INTERNAL" as const, text: "9. Joints flagged on Dwg 4/7/9 L-shapes (1A/1B, 2A/2B etc.) at $0 per joint, per #1624 precedent." },
    { visibility: "INTERNAL" as const, text: "10. Color shown as 'COLOR' on all drawings - single color/rate assumed. BERGA MB vanity qty 66 confirmed by BOM rev 1." },
  ],
  pieces: 
[
    {
      "dwgNo": "1",
      "group": "BERGA/CORNWALL/RIO/ARUB",
      "area": "Kitchen",
      "pieceNo": "1",
      "description": "Island Top",
      "length": 93.25,
      "width": 44.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-2003",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 53,
      "depRule": "FULL_PERIMETER",
      "notes": "Qty 53 per LENNAR BOM rev 1 (51 + 2 spares). 12\" internal detail line - confirm"
    },
    {
      "dwgNo": "1",
      "group": "BERGA/CORNWALL/RIO/ARUB",
      "area": "Kitchen",
      "pieceNo": "2",
      "description": "Return Top",
      "length": 34.75,
      "width": 25.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 51,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": null
    },
    {
      "dwgNo": "1",
      "group": "BERGA/CORNWALL/RIO/ARUB",
      "area": "Kitchen",
      "pieceNo": "3",
      "description": "Main Run Top",
      "length": 67.5,
      "width": 25.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 51,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": null
    },
    {
      "dwgNo": "1",
      "group": "BERGA/CORNWALL/RIO/ARUB",
      "area": "Kitchen",
      "pieceNo": "4",
      "description": "Countertop",
      "length": 34.75,
      "width": 25.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 51,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": null
    },
    {
      "dwgNo": "2",
      "group": "BERGA/CORNWALL/RIO/ARUB",
      "area": "MB Vanity",
      "pieceNo": "5",
      "description": "MB Vanity Top (double sink)",
      "length": 87,
      "width": 22.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-C6",
      "sinkCuts": 2,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 66,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Qty 66 confirmed by LENNAR BOM rev 1"
    },
    {
      "dwgNo": "3",
      "group": "BERGA/CORNWALL/RIO/ARUB",
      "area": "B2 Vanity",
      "pieceNo": "6",
      "description": "B2 Vanity Top",
      "length": 38.75,
      "width": 22.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-C6",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 51,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": null
    },
    {
      "dwgNo": "4",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 1 (As Shown)",
      "area": "Kitchen",
      "pieceNo": "1A",
      "description": "Main Run Top (w/ 1-5/8\" back strip)",
      "length": 124,
      "width": 34.25,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-2003",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 53,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Qty 53 per LENNAR BOM rev 1 (50 + 3 spares). Joined to 1B; BOM calls it Kitchen Island"
    },
    {
      "dwgNo": "4",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 1 (As Shown)",
      "area": "Kitchen",
      "pieceNo": "1B",
      "description": "Return Top",
      "length": 25.75,
      "width": 16.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 1A at seam"
    },
    {
      "dwgNo": "4",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 1 (As Shown)",
      "area": "Kitchen",
      "pieceNo": "2A",
      "description": "Return Top",
      "length": 25.75,
      "width": 17.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 2B at seam"
    },
    {
      "dwgNo": "4",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 1 (As Shown)",
      "area": "Kitchen",
      "pieceNo": "2B",
      "description": "Countertop",
      "length": 45.5,
      "width": 25.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 2A at seam"
    },
    {
      "dwgNo": "5",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 1 (As Shown)",
      "area": "MB Vanity",
      "pieceNo": "3",
      "description": "MB Vanity Top",
      "length": 50.75,
      "width": 22.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-C6",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": null
    },
    {
      "dwgNo": "7",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 2 (Reverse)",
      "area": "Kitchen",
      "pieceNo": "5A",
      "description": "Main Run Top (w/ 1-5/8\" back strip)",
      "length": 124,
      "width": 34.25,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-2003",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Qty 50 (Ver5 change: was 53 per BOM rev 1 - no spares). Mirror of Dwg 4; joined to 5B"
    },
    {
      "dwgNo": "7",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 2 (Reverse)",
      "area": "Kitchen",
      "pieceNo": "5B",
      "description": "Return Top",
      "length": 25.75,
      "width": 16.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 5A at seam"
    },
    {
      "dwgNo": "7",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 2 (Reverse)",
      "area": "Kitchen",
      "pieceNo": "6A",
      "description": "Return Top",
      "length": 25.75,
      "width": 17.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 6B at seam"
    },
    {
      "dwgNo": "7",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 2 (Reverse)",
      "area": "Kitchen",
      "pieceNo": "6B",
      "description": "Countertop",
      "length": 45.5,
      "width": 25.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 6A at seam"
    },
    {
      "dwgNo": "8",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 2 (Reverse)",
      "area": "MB Vanity",
      "pieceNo": "7",
      "description": "MB Vanity Top",
      "length": 50.75,
      "width": 22.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-C6",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 50,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Mirror of Dwg 5"
    },
    {
      "dwgNo": "9",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 3 (No Sink)",
      "area": "Kitchen",
      "pieceNo": "8A",
      "description": "Main Run Top",
      "length": 124,
      "width": 34.25,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 105,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Qty 105 per LENNAR BOM rev 1 (100 + 5 spares). No sink (confirmed); 'No Polish' front section; joined to 8B"
    },
    {
      "dwgNo": "9",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 3 (No Sink)",
      "area": "Kitchen",
      "pieceNo": "8B",
      "description": "Return Top",
      "length": 25.75,
      "width": 16.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 100,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "'No Polish' edge; joined to 8A"
    },
    {
      "dwgNo": "9",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 3 (No Sink)",
      "area": "Kitchen",
      "pieceNo": "9A",
      "description": "Return Top",
      "length": 25.75,
      "width": 17.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 100,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "'No Polish' edge; joined to 9B"
    },
    {
      "dwgNo": "9",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 3 (No Sink)",
      "area": "Kitchen",
      "pieceNo": "9B",
      "description": "Countertop",
      "length": 45.5,
      "width": 25.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 1,
      "unitsQty": 100,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Joined to 9A at seam"
    },
    {
      "dwgNo": "10",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - Set 3 (No Sink)",
      "area": "MB Vanity",
      "pieceNo": "10",
      "description": "MB Vanity Top",
      "length": 50.75,
      "width": 22.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "-",
      "sinkCuts": 0,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 100,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "No sink cutout (confirmed by BOM rev 1)"
    },
    {
      "dwgNo": "6",
      "group": "BONDS/MAYS/AARON/DIMAGGIO/GEHRIG/WANGER - All Units (B2 Vanity)",
      "area": "B2 Vanity",
      "pieceNo": "4",
      "description": "B2 Vanity Top",
      "length": 38.75,
      "width": 22.75,
      "thickness": "1.5cm",
      "color": "TBD",
      "sinkModel": "ASI-C6",
      "sinkCuts": 1,
      "faucetHoles": 0,
      "rCorners": 0,
      "joints": 0,
      "unitsQty": 200,
      "depRule": "ONE_LENGTH_ONE_WIDTH",
      "notes": "Covers all 200 units of plan group (50+50+100)"
    }
  ] as {
    dwgNo: string;
    group: string;
    area: string;
    pieceNo: string;
    description: string;
    length: number;
    width: number;
    thickness: string;
    color: string;
    sinkModel: string;
    sinkCuts: number;
    faucetHoles: number;
    rCorners: number;
    joints: number;
    unitsQty: number;
    depRule: EdgeRule;
    notes: string | null;
  }[],
};

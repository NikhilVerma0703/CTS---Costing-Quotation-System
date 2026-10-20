# Reference sheet analysis — Lennar NWA Brighton Park (CTS)

This is what the seven uploaded workbooks actually do, cell by cell. Every formula in the app is taken from here; nothing below is invented. Cell references are to the uploaded files (copies are in `reference-sheets/`).

## 1. How the sheets connect

```
                ┌──────────────────────────────┐
                │ 2. Drawing Summary           │  ← raw drawing data (inputs)
                │   L, W (in), counts, qty     │
                │   → Cutting LF, DE&P LF,     │
                │     Sqft/Pc, Total Sqft      │
                └──────┬───────────────┬───────┘
          T27 total sqft│               │ per-piece drivers
                        ▼               │
┌──────────────────────────────┐        │
│ 1. Variables (rate card)     │        │
│   slab size → slab sqft      │        │
│   My Cost / Customer Charge  │        │
│   packing: Rs → USD → /sqft  │        │
└──────┬────────────┬──────────┘        │
       │ C-column   │ D-column          │
       ▼            ▼                   ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────┐
│ 3. Internal  │ │ 4. Customer  │ │ 6. Slab Calc     │
│   Costing    │ │   Quote      │ │  slabs × slab    │
│  (My Cost)   │ │ (Cust. rate) │ │  sqft × C12      │
└──────┬───────┘ └──┬────────┬──┘ └───────┬──────────┘
       │            │        ▼            │
       │            │  ┌────────────┐     │
       │            │  │5. Quote    │     │
       │            │  │  Summary   │     │
       │            │  └────────────┘     │
       ▼            ▼                     ▼
     ┌─────────────────────────────────────────┐
     │ 7. Project Summary                      │
     │  fabrication (pieces) + material (slabs)│
     │  → totals, margin, $/slab, $/sqft       │
     └─────────────────────────────────────────┘
```

Note the loop: **Variables!B27 reads Drawing Summary!T27** (total sqft) to spread packing per sqft, and the costing sheets then multiply that rate back by each piece's sqft. It is not circular in values (packing is a fixed USD total), but it means **any drawing change also changes the packing rate**, so packing must be recomputed whenever drawings change.

## 2. Sheet 1 — Variables (rate card)

| Cell | Meaning | Type | Value / formula |
|---|---|---|---|
| B5 | Slab width | input (in) | 136 |
| B6 | Slab depth | input (in) | 78 |
| B7 | Slab area | **calc** | `B5*B6/144` = 73.6667 sqft |
| B8 | Material basis | input text | "1.5cm - Color TBD" |
| B23 | 40ft container cost | input (Rs) | 200,000 |
| B24 | Number of containers | input | 3 |
| B25 | Exchange rate | input (Rs/USD) | 95 |
| B26 | Total packing USD | **calc** | `B23*B24/B25` = 6,315.79 |
| B27 | Total project sqft | **link** | `Drawing Summary!T27` = 15,828.28 |
| B28 | Packing per sqft | **calc** | `B26/B27` = 0.39902 |

Cost inputs table (A11:D19):

| Cost item | Unit | My Cost (C) | Customer Charge (D) | Driver it multiplies |
|---|---|---|---|---|
| 1.5cm Material | per sqft | 3.50 | **`=C12`** (follows My Cost, "no markup") | Sqft/Pc |
| Cutting | per linear ft | 0.21 | 0.30 | Cutting LF |
| DE&P (Edge Polish) | per linear ft | 0.25 | 0.40 | DE&P LF |
| Sink Cutout | per cutout | 2 | 4 | Sink Cuts |
| Faucet Hole | per hole | 2 | 3 | Faucet Holes |
| R-Corner | per corner | 2 | 3 | R-Corners |
| Joint | per joint | 0 | 0 | Joints |
| Packing | per sqft | **`=B28`** | **`=B28`** | Sqft/Pc |

So two rates are not typed numbers: Material's customer charge *follows* My Cost, and Packing (both columns) is *derived* from the packing calculation. The app keeps that behaviour as a per-rate setting ("same as My Cost", "from packing calculation") instead of hard-coding it.

## 3. Sheet 2 — Drawing Summary (the import format)

Header row 4, data rows 5–26 (22 pieces), totals row 27.

| Col | Field | Type | Notes |
|---|---|---|---|
| A | Dwg# | input | integer, repeats across pieces |
| B | Group | input | plan group, e.g. "BERGA/CORNWALL/RIO/ARUB" |
| C | Area | input | Kitchen / MB Vanity / B2 Vanity |
| D | Piece | input | text ("1", "1A", "5B") |
| E | Description | input | |
| F | L (in) | input | inches |
| G | W (in) | input | inches |
| H | Thickness | input | "1.5cm" |
| I | Color | input | "TBD" |
| J | Sink Model | input | ASI-2003 / ASI-C6 / "-" |
| K | Sink Cuts | input | per piece |
| L | Faucet Holes | input | per piece |
| M | R-Corners | input | per piece |
| N | Joints | input | per piece |
| O | Units Qty | input | |
| P | Cutting LF | **calc** | `2*(L+W)/12` on every piece |
| Q | DE&P LF | **calc** | Island Top (row 5 only): `2*(L+W)/12`; every other piece: `(L+W)/12` |
| R | Sqft/Pc | **calc** | `L*W/144` |
| S | Total Pcs | **calc** | `=O` |
| T | Total Sqft | **calc** | `R*S` |
| U | Notes | input | |

Totals: K27 = `SUMPRODUCT(K,O)` = 639 sink cutouts; S27 = `SUM(S)` = 1,531 pcs; T27 = `SUM(T)` = 15,828.28 sqft.

**DE&P rule is per piece, not a formula you can derive from the row.** The sheet hard-codes it by row (title says "Kitchen Island Top = full perimeter, all other pieces = one L + one W edge"). The app stores it as a per-piece *DE&P edge rule* (Full perimeter / One L + one W). On import it is read back from the sheet's own DE&P LF value; on manual entry it is chosen in the form.

## 4. Sheet 3 — Internal Costing (My Cost)

One row per drawing piece (rows 4–25). Every cost column is *driver × My Cost rate*:

| Col | Formula |
|---|---|
| E Sqft/Pc | `Drawing!R` |
| F Units Qty | `Drawing!O` |
| G Material $ | `E × C12` |
| H Cutting $ | `Drawing!P × C13` |
| I DE&P $ | `Drawing!Q × C14` |
| J Sink $ | `Drawing!K × C15` |
| K Faucet $ | `Drawing!L × C16` |
| L R-Corner $ | `Drawing!M × C17` |
| M Joint $ | `Drawing!N × C18` |
| N Packing $ | `E × C19` |
| O Cost/Pc | `SUM(G:N)` |
| P Total Cost | `O × F` |

Totals row 26: each component = `SUMPRODUCT(component, qty)`; P26 = `SUM(P)` = **$69,844.40**. The sheet notes that this material figure is *piece-basis, for reference only*; the real quote uses slab-basis material.

## 5. Sheet 4 — Customer Quote

Identical structure to sheet 3, with every rate taken from column **D** (Customer Charge) instead of C. P26 = **$74,513.46**. Column names are Price/Pc and Total Price.

## 6. Sheet 5 — Quote Summary (= the "Customer Charges Summary" page)

Per piece: Dwg#, Group, Area, Piece, Description, Units Qty, Sqft/Pc, Total Sqft (all from Drawing Summary), Price/Pc and Total Price (from Customer Quote). Totals: 1,531 pcs, 15,828.28 sqft, $74,513.46 (labelled "piece-basis material").

There is no internal equivalent among the seven sheets. The **Internal Costing Summary** page is built the same way from sheet 3 (Cost/Pc, Total Cost) — the same columns and sums, no new formulas.

## 7. Sheet 6 — Slab Calculation

| Cell | Meaning | Type | Value |
|---|---|---|---|
| B5 | Slabs per CutList Optimizer run | **input** (from external optimizer PDF) | 261 |
| B6 | Adjustment (5A qty 53→50 frees 1 slab) | **input** | −1 |
| B7 | Total slabs | calc `B5+B6` | 260 |
| B8 | Slab area purchased | calc `B7 × Variables!B7` | 19,153.33 sqft |
| B9 | Used area | link `Drawing!T27` | 15,828.28 |
| B10 | Waste | calc `B8−B9` | 3,325.05 |
| B11 | Utilization | calc `B9/B8` | 82.64 % |
| B12 | Slab-basis material cost | calc `B8 × Variables!C12` | **$67,036.67** |
| B15 | Driver pieces (124×34.25 tops) | input | 208 |
| B16 | Pieces per slab | input | 2 |
| B17 | Dedicated slabs | input | 104 |
| B18 | Share of slabs | calc `B17/B7` | 40 % |
| B19 | Waste on those slabs | calc `B17 × 2114 / 144` (2,114 sq in waste each — input) | 1,526.78 sqft |
| B20 | Share of waste | calc `B19/B10` | 45.9 % |

**Slab count is not calculated in the workbook** — it comes from an external nesting tool (CutList Optimizer) plus manual adjustments. The app therefore takes the optimizer count and adjustments as inputs and does not try to nest pieces itself.

## 8. Sheet 7 — Project Summary

| Cell | Meaning | Formula | Value |
|---|---|---|---|
| B5 | Pieces | `Drawing!S27` | 1,531 |
| B6 | Piece sqft | `Drawing!T27` | 15,828.28 |
| B7 | Slabs | `Slab!B7` | 260 |
| B8 | Sink cutouts | `Drawing!K27` | 639 |
| B11 | Fabrication, My Cost | `Internal!P26 − Internal!G26` (total minus piece material) | 14,445.42 |
| B12 | Slab-basis material | `Slab!B12` | 67,036.67 |
| B13 | **Total internal cost** | `B11+B12` | **81,482.09** |
| B14 | Fabrication, customer | `Quote!P26 − Quote!G26` | 19,114.49 |
| B15 | Material to customer | `Slab!B12` (slab basis, no markup) | 67,036.67 |
| B16 | **Total customer quote** | `B14+B15` | **86,151.15** |
| B19 | Gross margin $ | `B16−B13` | 4,669.06 |
| B20 | Gross margin % | `B19/B16` | 5.42 % |
| B21 | Customer price per slab | `B16/B7` | 331.35 |
| B25 | My Cost $/sqft | `B13/B6` | 5.1479 |
| C25 | Customer $/sqft | `B16/B6` | 5.4429 |

Rows 28–42 are notes/assumptions and a version log; the app stores these as project notes, each marked internal or customer-visible.

## 9. Points to confirm (the app follows the sheet until told otherwise)

1. **Customer material charge.** Project Summary B15 uses Slab!B12, which is priced at the **My Cost** material rate (C12). Today C12 = D12 so it makes no difference. The app prices customer slab material at the *customer* material rate, which is set to "same as My Cost" — identical result now, and if you ever add a markup on material it will flow through. If you'd rather it always stays at cost, that's a one-line switch.
2. **Packing on the customer side** follows the same derived rate as My Cost (D19 = B28). Kept as is.
3. **Unit for Packing and Material** is per sqft of *piece* area (Sqft/Pc), not slab area — as in the sheets.
4. **Island DE&P rule** — the sheet's open note says 1A/5A/8A may be freestanding islands (full-perimeter DE&P on 211 pieces). The per-piece edge rule lets you flip those three rows when confirmed.
5. **Slab count** stays an input from CutList Optimizer (rerun after quantity changes).
6. **Customer PDF content.** Ver4 note says the summary shows the final rate per sqft only. The PDF therefore shows scope (piece schedule with sizes, quantities and sqft), total quote value and rate per sqft, plus customer-visible notes — no cost, margin, or per-component rates.

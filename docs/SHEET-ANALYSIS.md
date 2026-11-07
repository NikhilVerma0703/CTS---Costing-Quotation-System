# How the workbooks calculate

The tool's rules come from three workbooks, read cell by cell: Lennar NWA Brighton Park Ver5, Project 1633 The Approach, and Peoria Gateway Ver10. Copies are in `reference-sheets/`. They follow one workflow and differ in the places listed here; the tool handles all of them with one engine.

## The workflow

```
Drawing Summary ──► piece sizes, counts, quantities ──┐
                                                      ├─► Internal Costing (My Cost rates)
Variables ───────► rates, slab size, packing ─────────┤
                                                      ├─► Customer Quote (Customer Charge rates) ─► Quote Summary
Slab Calculation ► slabs, used area, wastage ─────────┘
                                 └───────────────────────► Project Summary
```

Packing links back to the drawing: its rate per sqft is spread over the Drawing Summary total, so a drawing change moves the packing rate on every row.

## Formulas

| Figure | Formula |
|---|---|
| Sqft/Pc | L × W ÷ 144 |
| Total Pcs | Units Qty |
| Total Sqft | Sqft/Pc × Total Pcs |
| Cutting LF | Its rule ÷ 12 (below), or the sheet's typed figure |
| DE&P LF | Its rule ÷ 12 (below), or the sheet's typed figure |
| Slab Area | Slab Width × Slab Depth ÷ 144 |
| Total Packing (USD) | Sum of (container cost × count) ÷ exchange rate |
| Packing per Sqft | Total Packing (USD) ÷ Total Project Sqft |
| Material $ | Sqft/Pc × rate (× (1 + wastage markup) when pricing on piece sqft) |
| Cutting $, DE&P $ | LF × rate |
| Sink, Faucet, R-Corner, Joint $ | Count × rate |
| Packing $ | Sqft/Pc × Packing per Sqft |
| Cost/Pc, Price/Pc | Sum of the eight cost columns |
| Total Cost, Total Price | Cost/Pc × Units Qty |
| Sheet totals | SUMPRODUCT(column, Units Qty); grand total is the sum of the row totals |
| Price/Sqft | Price/Pc ÷ Sqft/Pc |
| Total slabs | Optimizer count + adjustment |
| Purchased sqft | Total slabs × Slab Area |
| Used sqft | Drawing sqft, or typed from the optimizer, or Purchased × used % |
| Wasted sqft | Purchased − Used |
| Utilization, Wastage % | Used ÷ Purchased; 1 − Utilization |
| Wastage markup | Wastage % + extra (2%) |
| Slab-basis material | Purchased × My Cost, on the customer's line too ("no markup") |
| Fabrication | Sheet total − sheet Material total |
| Total Internal, Total Customer | Fabrication + material (slab-basis, or the Material column) |
| Gross Margin $, % | Customer − Internal; ÷ Customer |
| Price per slab, $/sqft | Total Customer ÷ slabs; Total ÷ piece sqft |

## Rounding

None of the three workbooks uses a rounding function anywhere: the only functions in them are SUM, SUMPRODUCT, IF, NOT, ISNUMBER and SEARCH. So nothing is rounded in the calculation, in the workbooks or here. Rounding happens only when a figure is shown, the way Excel does it: to 15 significant digits, then half up. That is why 10.25 × $0.30, held in binary as 3.0749999999999997, shows as $3.08 in both.

As in Excel, shown figures can look a cent out when added by hand, because each is rounded from its full value.

## Where the three differ

| | Lennar Ver5 | Project 1633 | Peoria Ver10 | How the tool handles it |
|---|---|---|---|---|
| **Group column** | Group | Unit Type | Group | The upload's own heading is kept |
| **Size columns** | L, W | Width, Depth | L, W | Width × Depth maps to L × W; headings kept |
| **Quantity column** | Units Qty | Units | Units Qty | Recognised; heading kept |
| **Material rate** | One | By thickness (3cm, 2cm) | By color (Pure White, Calacatta Gold) | One row per material, each with "Applies to" |
| **How a piece gets its rate** | One rate for all | Every formula points at the 2cm row, whatever Thick says | `IF(color="Pure White",row 12,row 13)`: anything else takes the last | By its color or thickness; a piece matching nothing takes the last rate and is flagged |
| **Material priced on** | Slabs purchased | Piece sqft + wastage % | Slabs purchased | A setting on Slab Calculation, detected on upload |
| **Customer's material** | Slabs × My Cost, "no markup" (B15 reads Slab Calculation's My Cost cell) | Piece sqft × Customer Charge × (1 + markup) | Slabs × My Cost, "no markup" (B14 likewise) | Follows the setting above, in each customer's way |
| **Material Customer Charge cell** | `=C12` | Typed | Typed, so raising My Cost alone moves the firm quote but not this cell | Linked or typed, as read from the sheet |
| **Packing rate** | C19 and D19 each `=B28` | C24 and D24 each `=B47` | C23 and D23 each `=$B$30` | Each side follows the calculation on its own, so typing one leaves the other |
| **DE&P rate** | One | By thickness | One | As material |
| **Sink rate** | One | By model | One | One row per model, or one for all |
| **Cutting LF** | 2(L+W), as a formula | 2(L+W), hidden in each cost formula | Typed: 2(L+W), or L only when W ≤ 6 in | A rule per piece, read from the sheet's figures |
| **DE&P LF** | L+W; 2(L+W) on the island, as formulas | Typed inches, always equal to Width | Typed: L+W; 2(L+W) on Island Tops | As Cutting LF |
| **Rounded LF** | No | No | Yes, to 4 decimals | Kept as typed so costs match, then replaced by the rule once L or W changes |
| **Packing** | Rs × 3 containers | 40ft + 20ft rows | One 40ft | A container list |
| **Project sqft for packing** | Linked | Linked | Typed 2,761.33 | Typed value kept while it matches the drawing, then the live total takes over |
| **Slab results live in** | Slab Calculation | Variables | Slab Calculation | All read |
| **Used area** | Drawing sqft | Used % | Typed sqft | All supported |
| **Slab Calculation layout** | One block | One column per thickness | One block per color | One column per material |
| **Identity columns** | Dwg#, Group, Piece, Description | Unit Type, Units, Area, Piece, Description, Thick | Dwg#, Group, Piece, Color | Every sheet shows all of them |

Columns in the 1633 Customer Quote named differently: **Fabrication** is Cutting $, **Edge Finishing** is DE&P $, **Sink Cutout** is Sink $, **Faucet Holes** is Faucet $. The tool uses one set of names, and the unlabelled column S there is now **Price/Sqft**.

## Deliberate differences from the originals

1. **1633 Project Summary financials.** B17:B20 point at empty rows 202 and 203, so the original shows $0 for Total Internal Cost, Total Customer Quote and Gross Margin. The tool uses the real totals: $113,353.66, $122,414.06 and $9,060.39.
2. **1633 Slab Calculation D6** adds two per-slab areas to give 147.33. It means nothing, so the total is left blank.
3. **1633 "Total Pieces (Splash)"** counts every piece in a vanity area, including vanity tops. The number is unchanged; the label now says "vanity areas", and "Counter" says "non-vanity areas".
4. **1633 Slab Calculation title** said Project #1758. Titles now come from the project name.
5. **1633 stray cell S202** on Internal Costing (`=Q202/3776`, always 0) is not carried over.

## Figures the originals type by hand, which the tool keeps live

These don't change any figure in the three workbooks as they stand. They matter once an input changes: the original keeps the old figure, and the tool follows the input.

| Workbook | Typed in the original | In the tool |
|---|---|---|
| Peoria | Cutting LF and DE&P LF on every row | Worked out from L and W once either changes |
| Peoria | Total Project Sqft (2,761.33) | Follows the drawing once it moves |
| Peoria | Wasted area on Slab Calculation | Purchased − used |
| 1633 | Cutting length, DE&P length and every count, inside each cost formula (`=((271.5/12))*Variables!$C$14`) | From the piece's sizes and counts |
| 1633 | Quantity, on four sheets separately | One quantity, everywhere |
| 1633 | Total Unit Types (24) and Total Units (343) | Counted from the drawing; Total Units isn't shown once a unit type has mixed quantities, because it would be a guess |

## What can't be verified from the sheets

The tool flags these on screen rather than guessing:

1. **The slab count isn't in the Drawing Summary or the Lennar and Peoria Variables sheets.** It comes from CutList Optimizer. Until it is entered the tool estimates at 85% utilization and marks every total "(est.)". Lennar's two sheets alone give 253 slabs and $84,346.32; with the real 261 − 1 they give the workbook's $86,151.15. A simple nesting calculation was tried in place of the flat 85% and was no more reliable: Lennar 267 against the real 260 (flat: 253), Peoria Pure White 38–39 against 39 (flat: 42).
2. **A markup on slab-priced material.** Lennar and Peoria charge it at My Cost and call it "no markup", whatever their Customer Charge cell says, so the tool does too. A different Customer Charge moves only the Material column on Customer Quote, which is for reference, and the tool says so when it happens. Charging a markup on slab material would be a new rule: neither sheet has one.
3. **Packing, material and rates with no Variables sheet.** The stored rate card is a starting point, not a project's real figures: the tool asks you to confirm the material rate.
4. **A hand-typed cost cell** doesn't follow rate changes. It is highlighted in amber and listed, and on a slab-priced project a typed Material $ can't reach the firm quote.
5. **A workbook whose saved results disagree with its inputs**, for example a figure typed over a formula. The upload says which figure and uses the calculated one.

## Points in the source data worth checking

- **1633:** 55 slabs give 4,052 sqft, but the pieces total 17,978 sqft. At least 245 slabs would be needed. The material price uses the 12% markup from the 90% used inputs, so check those too. The tool flags this.
- **1633:** the Slab Calculation sheet is titled **Project #1758**, not #1633. With the shortfall above, its slab counts and used % may belong to another project. They set the 12% markup, so they reach the quote.
- **1633:** 34 slabs of 3cm are listed, but all 187 pieces are 2cm. The tool flags this.
- **1633:** all 187 cost formulas point at the 2cm rates, whatever the Thick column says. All pieces are 2cm, so no figure is affected. The tool goes by Thick, so a piece changed to 3cm takes the 3cm rates, which the original wouldn't. This one rule is inferred from the rate table, not from a formula.
- **1633:** "Joint DE&P (in)" holds 19.5 on two rows and is never charged, in the original or here.
- **1633:** a 20ft container is listed at Rs 0, so only the 40ft is charged for.
- **Peoria:** Cutting LF and DE&P LF are typed. The rule for each piece is read from its figure (Cutting: 2(L+W) on 33 pieces, L alone on the 50 narrow ones), and used once its L or W changes. Only the DE&P rule is stated in the sheet.
- **Peoria:** any color other than "Pure White" is charged at the Calacatta Gold rate by its formula, even a misspelled one. The tool does the same, and flags it.
- **Lennar:** its rule that the customer pays material at cost is recorded as "as on #1624", Peoria's project number, and its Variables subtitle says "Project #1624 Ver11 format". That text is the workbook's own: no Peoria data is in it.
- **Peoria:** two totals are both right but mean different things: $19,237.37 prices material on piece sqft, and the firm quote of $20,990.44 prices it on slabs. The tool labels them.
- **Peoria:** Project Summary note 2 still says Super White is $3.58/sqft, and the Variables subtitle says Ver 7. Notes are kept as written.
- **Peoria:** the typed used areas differ slightly from the drawing: 2,611.13 against 2,611.07 sqft for Pure White, 150.260 against 150.265 for Calacatta Gold. Only Slab Calculation's waste and utilization use them, not the quote.
- **Lennar:** the workbook's own note leaves open whether 1A/5A/8A are freestanding islands. If they are, DE&P becomes full perimeter on 211 pieces. The tool follows the sheet (L+W).
- **Slab driver figures** on Lennar (208 pieces, 104 dedicated slabs) are typed analysis figures: they don't follow the drawing, in the original or here.
- **Any note or subtitle** quoting a figure ("260 slabs", "$3.50/sqft") is text and won't change when the figure does.

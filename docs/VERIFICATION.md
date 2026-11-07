# Verification

How the tool's numbers were checked against the three original workbooks.

## 1. Engine against the original workbooks (`npm test`, `tests/golden.test.ts`)

Each workbook is uploaded through the real importer, the real engine runs, and the result is compared with the values the workbook itself holds, to within one part in ten million. Expected values are read from the workbooks and never typed in.

| Workbook | Cells compared | Differences |
|---|---:|---:|
| Lennar Ver5 | 1,075 | 0 |
| Peoria Ver10 | 3,875 | 0 |
| Project 1633 | 9,024 | 0 |
| **Total** | **13,974** | **0** |

Project 1633's original holds no calculated values, so its expected values come from an untouched copy calculated by Excel (`reference-sheets/Project_1633_The_Approach_Quote.calculated.xlsx`); the upload itself is the raw original. The cells intentionally not compared are listed in [SHEET-ANALYSIS.md](SHEET-ANALYSIS.md).

## 2. Excel against the engine and the originals

Each project was exported, opened in Microsoft Excel, recalculated in full by Excel's own formula engine, and read back. This checks the exported formulas independently of the engine.

| Project | Excel vs engine (both cost sheets) | Excel vs original (cost sheets, Quote Summary) | Excel vs original Project Summary | Formula errors |
|---|---:|---:|---:|---:|
| Lennar Ver5 | 458, 0 differ | 661, 0 differ | 13, 0 differ | 0 |
| Peoria Ver10 | 1,678, 0 differ | 2,427, 0 differ | 11, 0 differ | 0 |
| Project 1633 | 3,758, 0 differ | 5,615, 0 differ | 9, 0 differ | 0 |

Headline figures, from Excel:

| Project | Total Internal Cost | Total Customer Quote | Gross Margin |
|---|---:|---:|---:|
| Lennar Ver5 | $81,482.09 | $86,151.15 | $4,669.06 (5.42%) |
| Peoria Ver10 | $19,505.71 | $20,990.44 | $1,484.74 (7.07%) |
| Project 1633 | $113,353.66 | $122,414.06 | $9,060.39 (7.40%) |

Project 1633's original shows $0 for these three, from a broken reference. The figures above are its real sheet totals (Internal Costing Q191, Customer Quote Q192).

## 3. Dynamic recalculation (`tests/recalc.test.ts`)

Each test changes one input and checks the dependent numbers against values worked out by hand from the sheet formulas, and that unrelated numbers don't move:

- Cutting My Cost moves Internal only; Cutting Customer Charge moves Customer Quote, Quote Summary and margin only.
- Material My Cost moves a Customer Charge that follows it, and slab material on both sides.
- Slab count moves purchased, waste, utilization, material, price per slab and the slab driver shares.
- Containers, exchange rate and drawing size move the packing rate; the packing total stays right.
- A drawing edit reaches every sheet.
- A hand-edited cost cell moves Cost/Pc, totals, Quote Summary, Project Summary and margin, and clearing it restores everything.
- Used % moves the wastage markup and Material; a sink model's rate moves only that model's pieces; a piece's thickness or color picks its rates.
- Empty projects and a zero exchange rate give flags, not errors.

## 4. Worked examples

Each one starts from the untouched Lennar project, with the expected figure worked out from the sheet formulas. Section 6 works every control in the running app with real clicks and keystrokes.

| Change | Result |
|---|---|
| Cutting My Cost 0.21 → 0.42 | Internal $85,681.63, Margin $469.52, Customer unchanged |
| Sink $ typed as $10 on row 1 of Customer Quote | Customer $86,469.15, Price/Pc $139.09, row total $7,371.70 |
| Exchange rate 95 → 100 | Packing $6,000.00, Internal $81,166.30, Customer $85,835.36 |
| Units Qty 53 → 100 on row 1 | 1,578 pieces, 17,190.28 sqft, across all sheets |
| DE&P rule L+W → 2(L+W) on piece 2 (34.75 × 25.75, qty 51) | Customer +$102.85, Internal +$64.28 |

Also checked in the running app: Undo, reload persistence, a non-number being refused, and uploads of a Drawing Summary alone, a CSV with an unrecognised column, and a replacement Variables sheet.

## 5. Uploads (`tests/import.test.ts`, `tests/export.test.ts`)

Drawing only, Drawing + Variables as two files, full workbooks, the earlier formatted copies, CSV, millimetres, unknown columns, unusable files, and re-uploading an exported workbook, which gives back the same numbers on every row.

To re-run the automated checks: `npm test`. The Excel checks in sections 2 and 6 need Microsoft Excel and aren't part of `npm test`.

## 6. The full audit, on the finished code (2026-11-07)

Every result here is from the final version of the code. Each check compares the tool with something independent of it: Excel's own formula engine, the values saved in the workbooks, or the change a test set out to make.

### Every cell accounted for

Every numeric and formula cell in the three workbooks was listed, then compared with the tool or explained.

| Workbook | Numeric and formula cells | Compared as numbers | Row text compared | Wrong | Left out |
|---|---:|---:|---:|---:|---|
| Lennar Ver5 | 1,290 | 1,004 | 396 | 0 | Dwg# repeated on three sheets (66 cells) |
| Peoria Ver10 | 4,642 | 3,563 | 1,411 | 0 | Dwg# repeated on three sheets (249 cells) |
| Project 1633 | 8,127 | 8,120 | 4,114 | 0 | S202, D6, B17:B20 ([deliberate differences](SHEET-ANALYSIS.md)) and B192, a typed quantity total of 2,536 that equals the tool's |

### Excel under changed inputs

The strongest check of dynamic recalculation. Each scenario changes inputs in hidden Excel, Excel recalculates with its own formula engine, and every calculated cell is compared with what the tool gives for the same change. The scenarios cover every rate on both sides, raised and lowered; containers and exchange rate; slab size, slab counts, adjustments, used area and used %; quantities up, down and to zero; sizes; sink, faucet, corner and joint counts; seeded random mixes; and, for each customer, the cells its own sheets link (typed over), the branches of its own rate rule, and every row changing at once.

| Workbook | Originals: scenarios | Cells | Differ | Tool's exports: scenarios | Cells | Differ |
|---|---:|---:|---:|---:|---:|---:|
| Lennar Ver5 | 42 | 34,734 | 0 | 52 | 40,811 | 0 |
| Peoria Ver10 | 36 | 106,452 | 0 | 41 | 113,255 | 0 |
| Project 1633 | 40 | 256,186 | 0 | 45 | 291,954 | 0 |
| **Total** | **118** | **397,372** | **0** | **138** | **446,020** | **0** |

Where an original types a figure by hand, the scenario has to allow for it, because the tool keeps that figure live:

- **Peoria:** wasted area, project sqft and the LF of a resized piece were set to follow the sheet in the scenarios that move them.
- **1633:** a quantity is changed on all four sheets that type it, and the LF inside the cost formulas is rewritten when a size changes. "Total Units" (typed 343) is left out of the scenarios that change a quantity.

Three more Excel checks:

| Check | Compared | Differ | Error cells |
|---|---:|---:|---:|
| Exports of 23 differently shaped projects: pieces added or all removed, two materials, an unmatched material, drawing only, millimetres, zero exchange rate | 74,624 cells | 0 | 0 |
| Exports of the three projects after all the on-screen changes below | 16,291 cells | 0 | 0 |
| Figures as displayed: the tool's text against what Excel shows (Lennar 805, Peoria 2,540, 1633 5,277) | 8,622 figures | 0 | n/a |

### Every control, on every screen

A browser test on the production build works each real control: cells, rule pickers, buttons. After each change it checks that the saved document holds exactly that change, then compares every figure on all seven tabs with the engine, which the checks above tie to Excel.

| Project | Changes | Checks | Failed |
|---|---:|---:|---:|
| Lennar Ver5 | 76 | 139,533 | 0 |
| Peoria Ver10 | 75 | 484,708 | 0 |
| Project 1633 | 67 | 953,079 | 0 |
| Adding and removing rate, container and slab driver rows | 13 | 23,321 | 0 |
| **Total** | **231** | **1,600,641** | **0** |

Each of the three project runs also ends with Undo, checked the same way.

### Uploads and downloads

Run through the server: full workbooks, the formatted copies, Drawing and Variables as separate files, Drawing only (with the same project's rates, or the stored rate card), and replacing a sheet in an open project. Every path that has the slab counts gives the workbook's totals.

| Upload | Slabs | Internal | Customer |
|---|---:|---:|---:|
| Lennar: Drawing + Variables, no slab count in those files | 253 (est.) | $79,677.26 | $84,346.32 |
| Lennar: the CutList count entered (261, then −1) | 260 | $81,482.09 | $86,151.15 |
| Peoria: Drawing + Variables, no slab counts in those files | 45 (est.) | $20,500.21 | $21,984.94 |
| Peoria: the CutList figures entered (39 + 3, and the used areas) | 42 | $19,505.71 | $20,990.44 |

The estimate is flagged on screen until a count is entered. A simple nesting estimate was tried in place of the flat 85% and was no more reliable: Lennar 267 against the real 260 (flat: 253), Peoria Pure White 38–39 against 39 (flat: 42).

The customer PDF of each edited project shows the engine's total, amount in words and sqft on one page, with no internal cost or margin on it.

### What the audit found and fixed

Each was fixed at its cause. No business formula was changed.

| What was wrong | Example | Cause and fix |
|---|---|---|
| Displayed cents one off from Excel, on 9 reference cells | Lennar Customer Quote H9: $3.07, Excel $3.08. 1633 Internal Costing I5: $1.99, Excel $2.00 | 10.25 × $0.30 is held as 3.0749999999999997, and Excel rounds at 15 significant digits first. One shared fix in `format.ts`; calculations are untouched |
| Material Cost Split wrong on piece-priced projects | 1633 showed $16,788.63; the project charges $94,633.96 | It always showed slab-basis figures. It now follows how the project prices material, on screen and in Excel |
| Wastage markup followed the slab count | 1633: 2cm slabs set to 0 dropped the markup from 12% to 2%, taking $8,449.46 off | A typed used % now stands on its own, as `=1-B33` does in the workbook |
| Totals not marked "(est.)" | Piece-priced totals resting on an estimated slab count | The flag now follows what the totals rest on |
| Excel download out of step with the tool | Rounded LF and project sqft stayed stale after an edit in Excel; a color, thickness or sink model change didn't pick the new rate; #DIV/0! at exchange rate 0; a circular reference with no pieces | Each formula rebuilt to mirror the engine |
| Hand-edited cells lost on re-upload | Re-uploading an export changed its totals | They are now restored from the export |
| Importer filled gaps silently | Pieces named "Total…" dropped; unreadable counts read as 0; empty rates; an unmatched DE&P or duplicate "Applies to" used the first row | Now kept, or flagged |
| DE&P length converted with the wrong unit | A DE&P column in inches on a drawing in another unit | The column now uses its own unit |
| Typed project sqft lost on re-upload | The same Peoria Drawing moved packing slightly, with a false "drawing changed" note | A rounded copy of the same drawing's total is kept |
| A failed save could still download | A stale PDF or Excel | Blocked until the save succeeds |
| Drawing-only upload ignored the project's own rates | Stored rate card used on a known project | Same project's rates are now used automatically |
| Number entry and words | "-1 1/2" read as -0.5; "102¾" refused; amount in words could differ from the digits by a cent | Fixed where numbers are read and where words are built |

Items that the sheets can't settle were not guessed: they are listed in [SHEET-ANALYSIS.md](SHEET-ANALYSIS.md), under "What can't be verified from the sheets".

## 7. Customer PDF format (2026-11-07)

Checked against the marked-up Lennar PDF, with its red-lined items removed. No figure changed.

| Upload | Project line | Customer block | Value | Terms |
|---|---|---|---:|---|
| Lennar Drawing + Variables, typed name "#Lennar" | Lennar NWA Brighton Park - Countertop Project | To: Lennar, Site: NWA Brighton Park, Q-LEN-NWA-BP-R1 | $84,346.32 (est.) | The four agreed terms |
| The same, CutList count entered (261, then −1) | As above | As above | $86,151.15 | The four agreed terms |
| Peoria workbook, nothing agreed | #1624 Peoria Gateway - Club Countertop Project | Left off until a customer is entered, and the yellow bar asks for it | $20,990.44 | Worked out from its sheets |
| Project 1633 workbook, nothing agreed | #1633 - The Approach | As above | $122,414.06 | Worked out from its sheets, on piece pricing |

Each was uploaded through the running server and its PDF read back and looked at: one page, with the agreed layout. Also worked in the running app: typing a customer clears the prompt; edited terms and remarks reach the PDF; clearing edited terms returns to the worked-out ones; a new upload of the same project keeps its details; an upload of a different project gets none of them. The PDF's title, terms and details are covered in `tests/quote-details.test.ts`.

**Left out or kept on purpose, for you to overrule:**

- **"Prepared By"** is gone from the details and from the signature row, as the written instructions asked. The mark-up strikes only "Costing In-charge" in the signature row.
- **The grey line under the description** ("1,531 pieces · 639 sink cutouts · 260 slabs") has no red line, but it repeats the figures struck elsewhere, so it isn't printed.
- **"REMARKS: Draft"** has no red line, so it is printed for Lennar. It is a field: clear it under Customer PDF details.

## 8. Customer by customer (2026-11-07)

Run on the three files as supplied: `Lennar_NWA_Brighton_Park_Quote_Ver5 (1).xlsx`, `Peoria_Gateway_Quote_Ver10.xlsx` and `Project_1633_The_Approach_Quote.xlsx`. Each is byte-for-byte the copy in `reference-sheets/`. None has a hidden sheet, row or column.

### Each customer's own rules, read from its formulas

| | Lennar | Peoria | Project 1633 |
|---|---|---|---|
| Pieces, rate rows | 22, 8 | 83, 9 | 187, 13 |
| Material priced on | Slabs purchased | Slabs purchased | Piece sqft × (1 + wastage markup) |
| Customer's material | At My Cost (`B15` reads Slab Calculation `B12 = B8*C12`) | At My Cost (`B14` reads `B23`) | Customer Charge × (1 + markup) |
| Which rate a piece takes | One rate | `IF(color="Pure White",row 12,row 13)` | Every formula points at the 2cm rows |
| Packing rate | C19 and D19 each `=B28` | C23 and D23 each `=$B$30` | C24 and D24 each `=B47` |
| Typed by hand in the sheet | Nothing | LF, wasted area, project sqft | LF, counts and quantity inside each cost formula |

The full comparison is in [SHEET-ANALYSIS.md](SHEET-ANALYSIS.md). All three share the same fabrication rates (Cutting $0.21/$0.30, DE&P $0.25/$0.40, Sink $2/$4, Faucet $2/$3, R-Corner $2/$3, Joint $0); their materials, containers and slab results differ.

### Found and fixed

Typing over each cell a customer's sheet links, and following each branch of its own rate rule in Excel, turned up four places where the tool didn't do what that customer's formula does. Each is fixed in the engine and the Excel export alike.

| Customer | What the sheet does | Before (tool vs Excel) | Now |
|---|---|---|---|
| Lennar, Peoria | Charges the customer slab material at My Cost: their label says "no markup" | Peoria, My Cost alone raised: Excel $22,687.72, tool $20,990.44 | Matches. A different Customer Charge moves only the reference Material column, and the tool says so |
| All three | Each side of packing links to the calculation, so a typed My Cost leaves the customer's rate alone | Lennar: Excel $86,151.15, tool $87,749.50 | Matches |
| Peoria | A color other than "Pure White" takes the last rate (its IF's else branch) | Excel $119.83 per piece, tool $66.41 | Matches, and still flagged |
| Project 1633 | With no slabs at all, overall wastage is 0% and usage 100% (`IF(D7>0,…,0)`, `=1-D10`) | Excel 100%, tool blank | Matches |

Testing the three customers side by side through the running server found ways for one customer's data to reach another's:

| What happened | Fixed by |
|---|---|
| Two customers whose sheets were titled only "Drawing Summary" (or "Countertop Project", "Project Summary", "Costing Sheet") were taken for one project, so the second got the first one's rates and customer details | Titles are compared word for word, and a title made only of generic words never matches |
| A typed name of "Project #16" took the rates of #1633; "Brighton Parkside" got Brighton Park's agreed details | The same: "16" isn't "1633", and "Parkside" isn't "Park" |
| A Drawing from one customer with the Variables of another gave no warning | Flagged on upload, and when a replacement sheet names another project |
| After editing and leaving, the project list showed the old totals; coming back with the browser's Back button showed the old figures, and the next edit would have saved them over the newer ones | The page saves before it leaves and drops the browser's cached copies; checked on every route |

Also checked and found sound: parallel PDF and Excel downloads for all three (36 at once) each carry their own customer's total; editing one customer leaves the others' saved data untouched; no export or PDF names another customer; saving one customer's rates as the stored rate card changes no existing project and carries no slab results. 65 isolation checks in all, every one passing.

### Text

Every piece of text in each workbook was looked for in the tool's export. None is lost: the only text not found word for word is reworded labels and sheet titles.

## 9. Every Variables value, one at a time (2026-11-07)

Every value on each customer's Variables sheet, and the slab inputs that act the same way, was raised by a quarter and then lowered by a quarter, one at a time.

| | Lennar | Peoria | Project 1633 | Total |
|---|---:|---:|---:|---:|
| Values | 24 | 27 | 36 | 87 |
| Single changes | 48 | 54 | 72 | 174 |
| Original in Excel: cells compared | 39,696 | 159,678 | 461,160 | 660,534 |
| Tool's download in Excel: cells compared | 37,100 | 148,090 | 467,142 | 652,332 |
| Differences | 0 | 0 | 0 | 0 |

Every one of the 174 changes on the tool's download took exactly one edit in Excel: the value changed once, in one place, and every dependent figure followed. For each value the test also recorded which sheets moved. The only values that move nothing are ones with nothing to act on: Lennar has no faucet holes or R-corners, and on 1633 no piece is 3cm or uses the M2505 ADA or LS-C6ADA sink.

Changing a material's Customer Charge on Lennar or Peoria moves Customer Quote and Quote Summary but not the firm total: that is their formula (customer material at My Cost), and Excel does the same.

The same test was run on screen through the real cells of the Variables tab. After each change it checked that the saved project held only that change, then checked every figure on all seven tabs. Lennar: 22 values, 44 changes, 80,414 checks. Peoria: 24 values, 48 changes, 308,356 checks. No failures. The slab inputs are on the Slab Calculation tab and are covered by the runs in section 6.

## 10. Final interface (2026-11-07)

Unneeded helper text was removed and the interface was restyled for deployment. No figure, formula, saved field or workflow changed. Re-run on the restyled production build: all 166 automated tests, plus Lennar's full on-screen run (76 changes, 139,533 checks) and its Variables run (44 changes, 80,414 checks). No failures.

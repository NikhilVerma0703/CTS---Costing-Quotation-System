# CTS Costing Tool (Pacific Surfaces)

Upload a Drawing Summary and get every costing sheet. Change any value and everything recalculates at once.

**Upload Drawing Summary (required) + Variables sheet (optional) → Variables, Drawing Summary, Internal Costing, Customer Quote, Quote Summary, Slab Calculation, Project Summary.**

No Variables sheet? If the same project is already in the list, its own rates are used (and its slab counts, if the drawing still totals the same sqft). Otherwise the stored rate card is used, or the rates from any project you choose. A full workbook also works: its Variables and Slab sheets are read automatically.

## Run it

You need Node.js 20+ and PostgreSQL (the Windows service your other apps use).

First time: copy `.env.example` to `.env`, put your `postgres` password in both lines, then:

```bash
npm run setup
```

This installs everything, creates the `pacific_costing_tool` database, sets up the stored rate card and loads the three reference projects. To run the tool:

```bash
npm run dev
```

Open http://localhost:3000. For other PCs on the network, run `npm run build` and `npm start`, then open `http://<this-PC's-IP>:3000`.

| Command | What it does |
|---|---|
| `npm test` | Checks the engine against every calculated cell of the reference workbooks, plus imports, recalculation and exports |
| `npm run typecheck` | TypeScript check |
| `npm run db:seed` | Stored rate card and reference projects (safe to re-run; never overwrites) |

## Using it

**Project list:** upload to start a new costing, open or delete a project. Totals show for each one.

**Inside a project:** the headline figures stay on screen above seven tabs, one per sheet. Blue values are typed inputs; black ones are calculated. Calculated cost cells can still be typed over.

| Tab | What you can change | What it works out |
|---|---|---|
| **Variables** | Slab size, every rate (My Cost and Customer Charge), containers, exchange rate. Upload a replacement sheet, or save these rates as the stored rate card. | Slab area, packing per sqft |
| **Drawing Summary** | Every piece: sizes, quantities, sink cuts, edge rules. Add or remove pieces, or upload a new sheet. | Cutting LF, DE&P LF, Sqft/Pc, totals |
| **Internal Costing** | Any cost cell (typing over it highlights it in amber; clearing it goes back to the calculation) | Cost/Pc, Total Cost, totals on My Cost rates |
| **Customer Quote** | As above | Price/Pc, Total Price, Price/Sqft on Customer Charge rates |
| **Quote Summary** | Nothing: it reads from the sheets above | Per-piece and total price |
| **Slab Calculation** | Slab counts, adjustments, used area or used %, how material is priced, slab driver analysis | Purchased, used, wasted, utilization, wastage markup, slab-basis material |
| **Project Summary** | Notes; customer details, project title, quotation number, terms and remarks for the PDF | Scope, cost build-up, margin, $/slab, $/sqft, material split |

Enter or Tab commits a cell; Enter and the arrow keys move up and down a column; Escape cancels. Everything saves by itself. **Undo** (Ctrl+Z) steps back through the last 50 changes.

**Things to check:** the yellow bar lists anything worth a look: estimated slab counts, rates still to confirm, too few slabs for the drawing, pieces with no matching rate, hand-typed cost cells and LF figures, a negative margin, a customer still to enter for the PDF. Checks never change a number.

**Slab counts** come from CutList Optimizer and aren't in the Drawing Summary. Until one is entered, the slab count and the totals that rest on it are marked "(est.)".

**On upload**, a workbook that carries its own results is checked against what its inputs calculate to, and any difference is listed, such as a figure typed over a formula.

**Download Excel** gives all seven sheets with live formulas, so the file keeps recalculating in Excel, including when a color, thickness or sink model changes. Uploading it again brings back the same project, hand-edited cells included.

**Customer PDF** gives a one-page quotation, built only from customer figures: customer, site, project, reference and material; quotation number, dates and value; the total in figures and words; terms, remarks and signature boxes. It shows no rate, slab count, piece count or internal figure.

- **Customer and site** aren't in the sheets, so enter them once under Customer PDF details on Project Summary. A new upload of the same project keeps them. Lennar NWA Brighton Park starts with its agreed details.
- **Terms** are worked out from the project's own sheets and keep up with its inputs until you edit them.
- **The button reads "Customer PDF (est.)"** while the figure rests on an estimated slab count.

Nothing is rounded in the calculation, as in the workbooks. Figures are rounded only when shown, the way Excel rounds them.

## How it is built

Next.js 15 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 6 · ExcelJS · @react-pdf/renderer · Vitest.

**One rule: only inputs are saved; every number is calculated.** A project is one JSON document (`src/lib/model.ts`): pieces, variables, slab inputs, notes, hand-edited cells. `calculate()` in `src/lib/engine.ts` turns it into every figure on all seven sheets. It is a pure function that runs in the browser, which is why recalculation is instant, and on the server for exports, so the two can't disagree.

```
prisma/schema.prisma      two tables: Project, StoredVariables
src/lib/model.ts          the data model and the starting rate card
src/lib/engine.ts         all calculation
src/lib/import.ts         reads uploaded sheets by header and label
src/lib/export-xlsx.ts    writes the seven-sheet workbook with live formulas
src/lib/quote-pdf.tsx     the customer PDF
src/lib/quote-details.ts  the PDF's customer details and worked-out terms
src/components/           project list, workspace, one component per sheet
src/app/api/              save, upload, Excel, PDF
tests/                    golden, recalculation, import and export tests
reference-sheets/         the workbooks the tests compare against
```

See [docs/SHEET-ANALYSIS.md](docs/SHEET-ANALYSIS.md) for the calculation rules and how the three workbooks differ, and [docs/VERIFICATION.md](docs/VERIFICATION.md) for the results.

## Neon (production)

Set `DATABASE_URL` to Neon's pooled connection string and `DIRECT_URL` to the direct one, then run `npx prisma db push` and `npm run db:seed` once.

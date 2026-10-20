# Pacific Surfaces — Costing & Quotation System

Drawing-based countertop costing and quotation. Import the drawing summary sheet, convert units, keep the rate card (My Cost / Customer Charges), and the system works out internal costing, customer charges, both summaries, slab calculation, project summary and a customer-ready PDF quote. Change any input and every page and the PDF follow immediately.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 6 · Zod · ExcelJS · @react-pdf/renderer · Vitest. Same conventions as the other Pacific Surfaces sub-ERPs. No Docker, no sign-in (for now).

**Accuracy:** `npm test` checks the calculation engine against every calculated cell of the seven reference workbooks in `reference-sheets/` (Drawing Summary P–T, both costing sheets row by row, Quote Summary, Slab Calculation, Project Summary). See `docs/SHEET-ANALYSIS.md` for the formulas and `docs/ARCHITECTURE.md` for the design.

---

## First run (Windows, local — no Docker)

You need **Node.js 20+** and **PostgreSQL 16** (the same Windows service your other ERPs use — check with `Get-Service postgresql*` in PowerShell).

### 1. `.env`

Copy `.env.example` to `.env` and put your `postgres` password into **both** `DATABASE_URL` and `DIRECT_URL`:

```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/pacific_costing_quotation?schema=public"
DIRECT_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/pacific_costing_quotation?schema=public"
```

(If the password contains `@ # / : %`, write them as `%40 %23 %2F %3A %25`.) The `pacific_costing_quotation` database is created by the next step — it is separate from your other ERP databases.

Also set `COMPANY_NAME`, `COMPANY_ADDRESS`, `COMPANY_EMAIL`, `COMPANY_PHONE` — they print on the PDF header.

### 2. Install, create tables, seed

```powershell
npm install
npx prisma db push
npm run db:seed
```

(`npm run setup` runs the same three.) The seed loads the cost item catalog, the unit conversion rules and the reference project **Lennar NWA Brighton Park (Ver 5)** exactly as in the uploaded workbooks — total customer quote $86,151.15.

### 3. Run

```powershell
npm run dev
```

Open http://localhost:3000.

For other PCs on the network: `npm run build`, then `npm start`, and open `http://<this-PC's-IP>:3000`.

---

## Workflow

| Section | What it does |
|---|---|
| **Import Drawing Sheet** | Upload the drawing summary `.xlsx` / `.csv`. Columns are matched by name, the L/W unit is read from the header (`L (in)`, `L (mm)`), every row is validated and previewed before saving. Replace all or add. Manual entry form below with the same fields. |
| **Unit Conversion** | Conversion rules (in→ft ÷12, sq in→sqft ÷144, mm, cm, m…) — editable. Shows every formula and each piece's actual Cutting LF / DE&P LF / Sqft with the numbers. Edge rules per piece can be switched here. |
| **Cost Inputs** | Unit · Cost Item · My Cost · Customer Charges. Material customer rate can follow My Cost; Packing rate comes from the packing calculation (containers × Rs ÷ exchange rate ÷ total sqft). Slab size and packing figures. Full change history. |
| 1. Internal Costing | Per piece: drawing quantity × My Cost rate for every item. |
| 2. Customer Charges | Same with customer rates. |
| 3. Internal Costing Summary | Per piece, build-up, by cost item, by group, by area. |
| 4. Customer Charges Summary | The Quote Summary sheet + the same breakdowns. |
| 5. Slab Calculation | Optimizer slab count + adjustments → purchased / used / waste sqft, utilization, slab-basis material. |
| 6. Project Summary | Scope, cost build-up, margin, $/slab, final $/sqft; internal notes and customer quote notes. |
| 7. Final Quote / PDF | Preview, draft PDF (always the latest inputs), **Issue revision** (freezes a numbered copy: Q-CODE-R1, R2…), revision history with PDFs. |

Purple = internal (My Cost) — never on the customer PDF. Green = customer-facing.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm test` | Engine vs reference workbooks + importer tests |
| `npm run typecheck` | TypeScript check |
| `npm run db:push` | Apply `prisma/schema.prisma` to the database |
| `npm run db:seed` | Catalog, conversion rules, reference project (safe to re-run; never overwrites edits) |
| `npm run db:reset` | **Wipes** this app's database and seeds fresh |
| `npm run db:studio` | Browse the database |

## Neon (production)

Set `DATABASE_URL` to Neon's **pooled** connection string and `DIRECT_URL` to the **direct** one, then `npx prisma db push` and `npm run db:seed` once. No code changes — the Prisma client runs through the `pg` driver adapter in both places.

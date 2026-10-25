# Architecture — Costing & Quotation System

Stack, conventions and palette match the other Pacific Surfaces sub-ERPs (pacific-lab-erp, pacific-accounts-erp): Next.js 15 App Router, TypeScript, Tailwind CSS 4, PostgreSQL 16 (local Windows service; Neon in production), Prisma 6 with the `pg` driver adapter, Zod, ExcelJS, Vitest. No Docker, no sign-in.

## The one rule: inputs are stored, results are computed

The database stores **only inputs** — drawing pieces, conversion rules, cost rates, packing figures, slab inputs, notes. Every derived number (LF, sqft, costs, totals, slab area, margin, rates per sqft) is produced by a single pure function:

```
src/lib/engine/calculate.ts
calculateProject(inputs: EngineInput): EngineResult
```

Every page — Internal Costing, Customer Charges, both summaries, Slab Calculation, Project Summary and the PDF — calls `getProjectCalculation(projectId)` (`src/lib/engine/load.ts`), which loads the current inputs and runs the engine once per request. Because nothing derived is saved, nothing can go stale: change a rate, a drawing row, a conversion rule or the exchange rate, and the next page view everywhere reflects it. Server actions call `revalidatePath` for the project after every write.

The engine has no database or React code, so it is unit-tested directly against the uploaded workbooks (`tests/engine.golden.test.ts` reproduces every row and total of sheets 1–7).

### History

Live numbers are always current; history is kept two ways:

- **Audit log** — every create / update / delete of an input writes an `AuditLog` row with before/after values (e.g. "Cutting customer charge 0.30 → 0.35").
- **Quote revisions** — "Issue revision" on the Final Quote page freezes the full engine input *and* result as JSON in `QuoteRevision` (Rev 1, Rev 2…). Older revisions' PDFs can be regenerated exactly, even after rates change.

Inngest is not used yet: every calculation is a few milliseconds and synchronous. It becomes useful for things like emailing issued quotes or bulk re-imports, and plugs in at `src/inngest/` without touching the engine.

## Engine pipeline

```
DrawingPiece rows ─┐
ConversionRules ───┼─► 1. measurements   per piece: L,W → ft; Cutting LF; DE&P LF; Sqft/Pc; totals
                   │
PackingConfig ─────┼─► 2. packing        Rs × containers ÷ fx = USD; ÷ total sqft = $/sqft
CostInputs ────────┼─► 3. rates          resolve My Cost & Customer rate per item
                   │                     (manual | same-as-my-cost | from-packing)
                   ├─► 4. costing ×2     per piece: driver × rate per item → per-pc, × qty → total
SlabSpec/Inputs ───┼─► 5. slab           slabs, purchased/used/waste sqft, utilization, material $
                   └─► 6. summary        fabrication (total − piece material) + slab material,
                                         margin, $/slab, $/sqft
                       7. issues[]       missing rates, zero sqft, no slabs, … (shown as banners)
```

Each cost item has a **driver** (`PIECE_SQFT`, `CUTTING_LF`, `DEP_LF`, `SINK_CUTS`, `FAUCET_HOLES`, `R_CORNERS`, `JOINTS`) and a flag `isMaterial`. Adding a new charge that uses an existing driver (e.g. a sealing charge per sqft) is a new Cost Input row — no code change.

## Database (see `prisma/schema.prisma`)

```
Project ─┬─ SlabSpec (1:1)          slab width/depth + unit, material basis
         ├─ PackingConfig (1:1)     container cost (Rs), count, exchange rate
         ├─ SlabInput (1:1)         optimizer slab count + source
         │    ├─ SlabAdjustment     ± slabs with reason
         │    └─ SlabDriver         driver-piece analysis rows
         ├─ ProjectCostInput ──► CostItem      My Cost / Customer Charge per item
         ├─ DrawingGroup                       normalized plan groups
         ├─ DrawingPiece ──► DrawingGroup, ImportBatch
         ├─ ImportBatch                        each file import + validation report
         ├─ ProjectNote                        internal / customer-visible notes
         └─ QuoteRevision                      frozen input + result snapshots
UnitConversionRule (global)                    in→ft, mm→ft, sq in→sqft, …
CostItem (global catalog)                      code, unit, driver, isMaterial
AuditLog (global)                              entity, action, before/after
```

Conventions: cuid ids, `createdAt`/`updatedAt` everywhere, `deletedAt` soft delete on business records (pieces, notes, cost inputs, projects), status enums on Project/ImportBatch/QuoteRevision, `Decimal` for every stored number, unique constraints (`Project.code`, `[projectId, costItemId]`, `[projectId, revisionNo]`, `[projectId, name]` on groups, `[fromUnit, toUnit]` on rules) and indexes on the search fields (dwg no, group, area, status). All multi-row writes (import, replace, issue revision) run in a transaction together with their audit entry.

## Code layout

```
src/
  app/
    page.tsx                         All Projects (landing) + New Project
    dashboard/                       KPIs, by status, by customer, by project
    formulas/                        standard formulas + unit conversion rules
    projects/[projectId]/
      layout.tsx                     validates the project (shell is in (app)/layout)
      import-drawing/                Drawing & Variables: uploads, sheets, data checks, pieces
      cost-inputs/                   rates, slab spec, packing, comparison with other projects
      internal-costing/              My Cost per piece · ?view=summary
      customer-charges/              customer price per piece · ?view=summary
      slab-calculation/
      project-summary/
      final-quote/                   preview, PDF, revisions
      unit-conversion/, internal-summary/, customer-summary/   redirects (old links)
    api/projects/[projectId]/quote-pdf/route.ts   customer PDF (draft or issued revision)
    api/export/route.ts              Excel / PDF export of any section
  lib/
    engine/                          pure calculation (types, calculate, format)
    import/drawing-sheet.ts          ExcelJS parser, column mapping, validation
    pdf/QuoteDocument.tsx            customer PDF (@react-pdf/renderer)
    db.ts, audit.ts, action-result.ts
  components/                        shell, tables, forms, stat tiles
  modules/<section>/actions.ts       server actions (Zod-validated, transactional, audited)
  lib/reference/brighton-park.ts     reference data from the workbooks (seed + tests)
```

## Uploads, formulas and checks

- **Drawing sheet** (`src/lib/import/drawing-sheet.ts`): headers are matched exactly, then by their words; a header that could be two fields, or a required field with no column, is returned as a question (`needsMapping`) and the user's answers are sent back with the file. Unknown columns are stored per piece in `DrawingPiece.extra`; the sheet's own calculated columns in `DrawingPiece.sheetValues` (checked, never used). Edit / delete of an upload: `saveSheetEdits`, `deleteImportBatch` in `modules/drawing/actions.ts`.
- **Variables sheet** (`src/lib/import/variables-sheet.ts`): read by label; formula cells keep their meaning (=B28 → packing, =C12 → same as My Cost). Stored in `VariablesSheet` (one per project, uploaded or reused) and applied to SlabSpec / PackingConfig / ProjectCostInput, which the engine reads. Edits on Cost Inputs are written back to it (`syncVariablesFromInputs`).
- **Standard formulas** (`StandardFormula`, defined in `src/lib/reference/standard-formulas.ts`): the permanent, versioned record of the formulas the engine implements. The edge formulas (Cutting LF, DE&P LF, island DE&P) carry the rule new uploads and manual entries use; changing one needs a reason and is audited.
- **Data checks** (`src/lib/engine/checks.ts`): warnings with `check: true` and the piece they concern. They never change a value or block the quote.
- **Status** (`src/lib/status.ts`): project and quote status worked out from pieces, blocking issues and issued revisions; the stored `Project.status` only carries Won / Lost / Archived.
- **Exports** (`src/lib/export/`): each section builds one `ExportDoc`, written as Excel (ExcelJS) or PDF (@react-pdf).

## Customer PDF boundary

The PDF and the Final Quote page are built from a **customer view** of the result (`toCustomerView()` in the engine) that simply does not contain internal fields — My Cost rates, internal totals, margin. It is a separate type, so TypeScript stops internal values from being passed to the PDF by mistake.

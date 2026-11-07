import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { calculate } from "@/lib/engine";
import { importProject, type UploadFile } from "@/lib/import";
import { DEFAULT_VARIABLES, emptyProject } from "@/lib/model";
import { agreedDetails, defaultTerms, differentProjects, fillBlanks, sameTitle, tellsProject, termsFor, withCustomerDetails } from "@/lib/quote-details";
import { buildQuotePdf } from "@/lib/quote-pdf";

const file = (name: string): UploadFile => {
  const buf = readFileSync(path.join(process.cwd(), "reference-sheets", name));
  return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer };
};
const load = async (name: string, typed?: string) => (await importProject({ drawing: file(name) }, { fallback: DEFAULT_VARIABLES, name: typed })).data!;

const LENNAR = "Lennar_NWA_Brighton_Park_Quote_Ver5.xlsx";
const PEORIA = "Peoria_Gateway_Quote_Ver10.xlsx";
const P1633 = "Project_1633_The_Approach_Quote.xlsx";

describe("Terms worked out from a project's own sheets", () => {
  it("Lennar: the same kinds of term as the agreed quotation, two of them word for word", async () => {
    const d = await load(LENNAR);
    const terms = defaultTerms(d, calculate(d));
    expect(terms).toEqual([
      "Material: 1.5cm - Color TBD, priced on a full-slab basis.",
      "Quantities and dimensions per Allied Stone shop drawings Rev #0 (09/26/2026).",
      "Sink cutouts for ASI-2003 (kitchen) and ASI-C6 (vanity) included where shown. Faucet holes and radius corners are not included unless added to the drawings.",
      "Packing in 40ft export containers is included.",
    ]);
    const agreed = agreedDetails(d.meta)!.details.terms!;
    expect(terms[2]).toBe(agreed[2]);
    expect(terms[3]).toBe(agreed[3]);
  });

  it("Peoria: faucet holes and corners are on its drawings, so they are included, not excluded", async () => {
    const d = await load(PEORIA);
    const terms = defaultTerms(d, calculate(d));
    expect(terms[0]).toBe("Material: 2cm - Pure White (Super White) / Calacatta Gold, priced on a full-slab basis.");
    expect(terms[1]).toBe("Quantities and dimensions per the project drawings.");
    expect(terms[2]).toBe("Sink cutouts for Q6201 (kitchen), VBM7008 (vanity) and M2201 ADA (kitchen) included where shown. Faucet holes and radius corners included where shown.");
    expect(terms[3]).toBe("Packing in 40ft export containers is included.");
  });

  it("1633: priced on pieces; its 20ft container costs Rs 0, so only the 40ft is being charged for", async () => {
    const d = await load(P1633);
    let terms = defaultTerms(d, calculate(d));
    expect(terms[0]).toBe("Material: Jazz White, priced on piece area including wastage.");
    expect(terms[3]).toBe("Packing in 40ft export containers is included.");
    d.variables.containers[1].cost = 100000;
    terms = defaultTerms(d, calculate(d));
    expect(terms[3]).toBe("Packing in 40ft and 20ft export containers is included.");
  });

  it("They follow the inputs", async () => {
    const d = await load(LENNAR);
    d.variables.pricing = "piece";
    d.variables.containers[0].label = "20ft";
    d.pieces[0].faucetHoles = 1;
    const terms = defaultTerms(d, calculate(d));
    expect(terms[0]).toContain("priced on piece area including wastage");
    expect(terms[2]).toContain("Faucet holes included where shown. Radius corners are not included unless added to the drawings.");
    expect(terms[3]).toBe("Packing in 20ft export containers is included.");
  });

  it("With no material text, no containers and no sinks, they still read properly", () => {
    const d = emptyProject();
    d.variables.containers = [];
    d.pieces = [{ id: "p", dwg: "", group: "", area: "", piece: "1", description: "", length: 10, width: 10, thickness: "", color: "", sinkModel: "", sinkCuts: 0, faucetHoles: 0, rCorners: 0, joints: 0, qty: 1, cutRule: "perimeter", cutLf: null, depRule: "l+w", depLf: null, jointDepIn: null, notes: "" }];
    expect(defaultTerms(d, calculate(d))).toEqual([
      "Material priced on a full-slab basis.",
      "Quantities and dimensions per the project drawings.",
      "Sink cutouts, faucet holes and radius corners are not included unless added to the drawings.",
    ]);
  });

  it("Terms entered for the project take their place", async () => {
    const d = await load(LENNAR);
    const r = calculate(d);
    expect(termsFor(d, r)).toEqual(defaultTerms(d, r));
    d.meta.terms = ["Only this."];
    expect(termsFor(d, r)).toEqual(["Only this."]);
  });
});

describe("Customer details on an upload", () => {
  it("A typed short name stays the project's name; the sheet's title goes on the PDF", async () => {
    const d = await load(LENNAR, "#Lennar");
    expect(d.meta.name).toBe("#Lennar");
    expect(d.meta.quoteTitle).toBe("Lennar NWA Brighton Park - Countertop Project");
  });

  it("A typed name doesn't lose the sheet's reference number", async () => {
    const d = await load(PEORIA, "Peoria");
    expect(d.meta.code).toBe("1624");
  });

  it("With no typed name there is nothing separate to keep", async () => {
    const d = await load(PEORIA);
    expect(d.meta.quoteTitle).toBe("");
  });

  it("Agreed details reach only the project they were agreed for", () => {
    const meta = emptyProject().meta;
    expect(agreedDetails({ ...meta, name: "#Lennar", quoteTitle: "Lennar NWA Brighton Park - Countertop Project" })).not.toBeNull();
    expect(agreedDetails({ ...meta, name: "Lennar NWA Brighton Park" })).not.toBeNull();
    expect(agreedDetails({ ...meta, name: "Lennar Phoenix Heights" })).toBeNull();
    expect(agreedDetails({ ...meta, name: "#Lennar" })).toBeNull();
  });

  it("Filling in never overwrites", () => {
    const meta = { ...emptyProject().meta, customerName: "Typed", terms: ["Typed term"] };
    const out = fillBlanks(meta, { customerName: "Other", siteAddress: "Site", terms: ["Other term"] });
    expect(out.customerName).toBe("Typed");
    expect(out.siteAddress).toBe("Site");
    expect(out.terms).toEqual(["Typed term"]);
  });

  it("An upload of the agreed project gets its details", async () => {
    const out = withCustomerDetails(await load(LENNAR, "#Lennar"), null);
    expect(out.meta).toMatchObject({ name: "#Lennar", customerName: "Lennar", siteAddress: "NWA Brighton Park", code: "LEN-NWA-BP", quoteNumber: "Q-LEN-NWA-BP-R1", remarks: "Draft" });
    expect(out.meta.terms).toHaveLength(4);
  });

  it("A new upload keeps what was entered on the project already here, ahead of the agreed details", async () => {
    const here = { ...emptyProject().meta, customerName: "Lennar Homes LLC", siteAddress: "Edited site", validityDays: 45, remarks: "" };
    const out = withCustomerDetails(await load(LENNAR, "#Lennar"), { meta: here });
    expect(out.meta.name).toBe("#Lennar");
    expect(out.meta.customerName).toBe("Lennar Homes LLC");
    expect(out.meta.siteAddress).toBe("Edited site");
    expect(out.meta.validityDays).toBe(45);
    expect(out.meta.code).toBe("LEN-NWA-BP"); // nothing entered there, so the agreed one
  });

  it("A project with nothing agreed stays blank, and the checks ask for the customer", async () => {
    const out = withCustomerDetails(await load(PEORIA), null);
    expect(out.meta.customerName).toBe("");
    const flag = calculate(out).checks.find((c) => /no customer yet/.test(c.text));
    expect(flag?.tab).toBe("summary");
    out.meta.customerName = "Someone";
    expect(calculate(out).checks.some((c) => /no customer yet/.test(c.text))).toBe(false);
  });
});

describe("Keeping customers apart", () => {
  it.each([
    ["Lennar NWA Brighton Park", "Lennar NWA Brighton Park - Countertop Project"],
    ["Project #1633 - The Approach", "Project #1633 The Approach"],
    ["#1624 Peoria Gateway", "Project #1624 Peoria Gateway - Club Countertop Project"],
    ["Project #1624", "Project #1624 Peoria Gateway - Club Countertop Project"],
    ["Riverside", "Riverside"],
  ])("%s and %s are the same project", (a, b) => {
    expect(sameTitle(a, b)).toBe(true);
    expect(sameTitle(b, a)).toBe(true);
  });

  it.each([
    ["Drawing Summary", "Drawing Summary"], // says nothing about whose it is
    ["Countertop Project", "Countertop Project"],
    ["Project Summary", "Project Summary"],
    ["Costing Sheet", "Costing Sheet"],
    ["Project #16", "Project #1624 Peoria Gateway - Club Countertop Project"], // a number's start isn't the number
    ["Project #16", "Project #1633 - The Approach"],
    ["Project #1624 Peoria Heights", "Project #1624 Peoria Gateway"], // same number, different words
    ["Lennar NWA Brighton Parkside", "Lennar NWA Brighton Park"], // a word's start isn't the word
    ["Lennar", "Lennar NWA Brighton Park"], // one customer, many sites
    ["Lennar NWA", "Lennar NWA Brighton Park"],
    ["Lennar Phoenix Heights", "Lennar NWA Brighton Park"],
    ["Project #1624 Peoria Gateway", "Project #1633 - The Approach"],
    ["", ""],
  ])("%s and %s are not", (a, b) => {
    expect(sameTitle(a, b)).toBe(false);
  });

  it("A sheet with a generic title has nothing to say", () => {
    for (const t of ["Drawing Summary", "Project Summary", "Countertop Project", "Quote", ""]) expect(tellsProject(t)).toBe(false);
    for (const t of ["Lennar NWA Brighton Park", "Project #1633", "The Approach"]) expect(tellsProject(t)).toBe(true);
  });

  it("Two sheets clearly from different projects are told apart; one saying nothing isn't", () => {
    expect(differentProjects("Lennar NWA Brighton Park", "Project #1624 Peoria Gateway")).toBe(true);
    expect(differentProjects("Project #1633 The Approach", "Project #1624 Peoria Gateway")).toBe(true);
    expect(differentProjects("Lennar Phoenix", "Lennar NWA Brighton Park")).toBe(true);
    expect(differentProjects("Lennar NWA Brighton Park", "Lennar NWA Brighton Park - Countertop Project")).toBe(false);
    expect(differentProjects("Riverside Towers", "Riverside Towers Phase 2")).toBe(false);
    expect(differentProjects("Drawing Summary", "Lennar NWA Brighton Park")).toBe(false);
    expect(differentProjects("", "Lennar NWA Brighton Park")).toBe(false);
  });

  it("A Drawing Summary with a generic title never reaches the PDF as the project's title", async () => {
    const r = await importProject({ drawing: { name: "Riverside job.csv", data: new TextEncoder().encode("Drawing Summary\nPiece,L,W,Qty\nA,10,10,1\n").buffer as ArrayBuffer } }, { fallback: DEFAULT_VARIABLES, name: "Typed name" });
    expect(r.data?.meta.name).toBe("Typed name");
    expect(r.data?.meta.quoteTitle).toBe("");
  });

  const twoFiles = async (drawing: string, variables: string) => (await importProject({ drawing: file(drawing), variables: file(variables) }, { fallback: DEFAULT_VARIABLES })).data!;

  it.each([
    [LENNAR, PEORIA],
    [LENNAR, P1633],
    [PEORIA, LENNAR],
    [PEORIA, P1633],
    [P1633, LENNAR],
    [P1633, PEORIA],
  ])("A Drawing from %s with Variables from %s is flagged, and takes the drawing's title", async (a, b) => {
    const d = await twoFiles(a, b);
    expect(d.importNotes.some((n) => /look like different projects/.test(n))).toBe(true);
    expect(d.meta.name).toBe({ [LENNAR]: "Lennar NWA Brighton Park", [PEORIA]: "Project #1624 Peoria Gateway", [P1633]: "Project #1633 The Approach" }[a]);
    expect(agreedDetails(d.meta) !== null).toBe(a === LENNAR);
  });

  it.each([[LENNAR], [PEORIA], [P1633]])("%s's own two sheets aren't flagged", async (a) => {
    expect((await twoFiles(a, a)).importNotes.some((n) => /look like different projects/.test(n))).toBe(false);
  });
});

describe("Each customer's own rule, as its formulas have it", () => {
  const rateOf = (d: Awaited<ReturnType<typeof load>>, re: RegExp) => d.variables.rates.find((r) => re.test(r.label))!;

  it("Peoria: raising My Cost alone moves the customer's firm quote, because Project Summary B14 reads the My Cost cells", async () => {
    const d = await load(PEORIA);
    const before = calculate(d);
    const white = rateOf(d, /Pure White/);
    white.myCost = 5;
    const r = calculate(d);
    expect(r.rates[white.id].customer).toBe(4.5); // typed in D12, so it stays
    expect(r.rows[0].customer.costs.material).toBeCloseTo(before.rows[0].customer.costs.material, 8);
    const slabs = r.slabs.find((g) => g.rate.id === white.id)!;
    expect(r.summary.customerMaterial - before.summary.customerMaterial).toBeCloseTo(slabs.purchased * 0.5, 6);
    expect(r.summary.customerMaterial).toBeCloseTo(r.summary.internalMaterial, 8);
  });

  it("Peoria: a color matching no rate takes the last rate, as its IF's else branch does, and is flagged", async () => {
    const d = await load(PEORIA);
    const piece = d.pieces.find((p) => p.color === "Pure White")!;
    piece.color = "Unknown Stone";
    const r = calculate(d);
    const row = r.rows.find((x) => x.piece.id === piece.id)!;
    expect(row.rateRows.material?.label).toMatch(/Calacatta/);
    expect(r.checks.some((c) => /1 piece\(s\) match no material rate, so the last one \(Calacatta Gold 2cm\) is used/.test(c.text))).toBe(true);
  });

  it("1633: with no slabs at all the overall wastage is 0% and usage 100%, as D10's IF and D8 have it", async () => {
    const d = await load(P1633);
    for (const r of d.variables.rates) if (r.kind === "material") r.slabs = 0;
    const t = calculate(d).slabTotals;
    expect(t.wastagePct).toBe(0);
    expect(t.utilization).toBe(1);
  });

  it("1633: material follows the Customer Charge there, because its firm total is the sheet total", async () => {
    const d = await load(P1633);
    const before = calculate(d);
    const m = rateOf(d, /^2cm Material/);
    m.customer = 6;
    const r = calculate(d);
    expect(r.summary.customerMaterial).toBeGreaterThan(before.summary.customerMaterial);
    expect(r.summary.totalInternal).toBeCloseTo(before.summary.totalInternal, 6);
  });
});

describe("The customer PDF", () => {
  const pages = (buffer: Buffer) => buffer.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;

  it.each([LENNAR, PEORIA, P1633])("%s: one page, with its worked-out terms", async (name) => {
    const { buffer, fileName } = await buildQuotePdf(await load(name), "ABC123");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(pages(buffer)).toBe(1);
    expect(fileName).toMatch(/\.pdf$/);
  });

  it("The agreed Lennar details give the agreed quotation number", async () => {
    const { fileName, buffer } = await buildQuotePdf(withCustomerDetails(await load(LENNAR, "#Lennar"), null), "ABC123");
    expect(fileName).toBe("Q-LEN-NWA-BP-R1.pdf");
    expect(pages(buffer)).toBe(1);
  });
});

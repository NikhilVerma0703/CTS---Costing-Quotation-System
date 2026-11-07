/**
 * What the customer PDF prints besides the figures: the customer's details and
 * the terms. No server or browser code here: the PDF, the upload and the Project
 * Summary form all share it.
 */
import type { Result } from "./engine";
import type { ProjectData, ProjectMeta } from "./model";

/** Words that appear in every customer's sheets, so they say nothing about whose project it is. */
const GENERIC = new Set("project projects drawing drawings summary quote quotation costing cost sheet template countertop countertops rate card variables internal customer slab calculation the a an and of for full scope final copy new".split(" "));

/** A title's words. "Project #1633" and "#1633" are the same project, so the leading word goes. */
const wordsOf = (title: string) => {
  const words = title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return words[0] === "project" ? words.slice(1) : words;
};
const telling = (words: string[]) => words.filter((w) => !GENERIC.has(w));
const startsWith = (long: string[], short: string[]) => short.length > 0 && short.every((w, i) => w === long[i]);

/** Whether a title says anything about whose project it is. "Drawing Summary" doesn't. */
export const tellsProject = (title: string) => telling(wordsOf(title)).length > 0;

/**
 * Whether two titles are the same project, so rates and customer details may pass between them. Word for word, so
 * "Project #16" isn't #1624 and "Brighton Parkside" isn't Brighton Park. A shorter title must say enough to stand for
 * the longer one: a project number, or three telling words.
 */
export function sameTitle(a: string, b: string): boolean {
  const [x, y] = [wordsOf(a), wordsOf(b)];
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (!startsWith(long, short)) return false;
  const words = telling(short);
  if (short.length === long.length) return words.length > 0;
  return words.length >= 3 || words.some((w) => /^\d{3,}$/.test(w));
}

/** Whether two titles clearly name different projects: both say something, and neither starts like the other. */
export function differentProjects(a: string, b: string): boolean {
  const [x, y] = [wordsOf(a), wordsOf(b)];
  return telling(x).length > 0 && telling(y).length > 0 && !startsWith(x, y) && !startsWith(y, x);
}

/** What identifies a project: its sheet's title if a name was typed over it, or else its name. */
export const projectTitle = (meta: Pick<ProjectMeta, "name" | "quoteTitle">) => meta.quoteTitle || meta.name;

/** Details agreed for a project. Its sheets don't hold them, so an upload whose title starts with this one gets them. */
const AGREED: { title: string; details: Partial<ProjectMeta> }[] = [
  {
    title: "Lennar NWA Brighton Park",
    details: {
      quoteTitle: "Lennar NWA Brighton Park - Countertop Project",
      customerName: "Lennar",
      siteAddress: "NWA Brighton Park",
      code: "LEN-NWA-BP",
      version: "Ver 5",
      quoteNumber: "Q-LEN-NWA-BP-R1",
      terms: [
        "Material: 1.5cm quartz, single colour (colour to be confirmed), priced on a full-slab basis.",
        "Quantities per LENNAR BOM rev 1; dimensions per Allied Stone shop drawings Rev #0 (09/26/2026).",
        "Sink cutouts for ASI-2003 (kitchen) and ASI-C6 (vanity) included where shown. Faucet holes and radius corners are not included unless added to the drawings.",
        "Packing in 40ft export containers is included.",
      ],
      remarks: "Draft",
    },
  },
];

export function agreedDetails(meta: Pick<ProjectMeta, "name" | "quoteTitle">) {
  return AGREED.find((a) => [meta.quoteTitle ?? "", meta.name].some((t) => sameTitle(t, a.title))) ?? null;
}

const isBlank = (value: unknown) => value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** Fills only what is still blank: what a sheet says or a person typed always stands. */
export function fillBlanks(meta: ProjectMeta, details: Partial<ProjectMeta>): ProjectMeta {
  const out: Record<string, unknown> = { ...meta };
  for (const [key, value] of Object.entries(details)) if (isBlank(out[key])) out[key] = value;
  return out as unknown as ProjectMeta;
}

/** A new upload of a project already here keeps what was entered for it. */
function carryDetails(meta: ProjectMeta, from: ProjectMeta): ProjectMeta {
  const details: Partial<ProjectMeta> = { ...from };
  delete details.name;
  return { ...fillBlanks(meta, details), validityDays: from.validityDays };
}

/** Customer details for an upload: its own first, then what this project already has, then anything agreed for it. */
export function withCustomerDetails(upload: ProjectData, same: { meta: ProjectMeta } | null): ProjectData {
  const carried = same ? carryDetails(upload.meta, same.meta) : upload.meta;
  const agreed = agreedDetails(carried);
  return { ...upload, meta: agreed ? fillBlanks(carried, agreed.details) : carried };
}

const listOf = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** Where a sink model is used, when all its areas agree. */
function sinkPlace(areas: Set<string>): string {
  const places = new Set([...areas].map((a) => (/vanity|bath|restroom/i.test(a) ? "vanity" : /kitchen/i.test(a) ? "kitchen" : "")));
  return places.size === 1 ? [...places][0] : "";
}

function cutoutsTerm(d: ProjectData, r: Result): string {
  const models = new Map<string, Set<string>>();
  for (const p of d.pieces) {
    const model = p.sinkModel.trim();
    if (p.sinkCuts > 0 && p.qty > 0 && model && model !== "-") models.set(model, (models.get(model) ?? new Set()).add(p.area));
  }
  const named = [...models].map(([model, areas]) => (sinkPlace(areas) ? `${model} (${sinkPlace(areas)})` : model));
  const included: string[] = [];
  const excluded: string[] = [];
  (r.drawing.faucetHoles > 0 ? included : excluded).push("faucet holes");
  (r.drawing.rCorners > 0 ? included : excluded).push("radius corners");
  if (r.drawing.sinkCuts === 0) excluded.unshift("sink cutouts");
  const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  return [
    r.drawing.sinkCuts > 0 ? `Sink cutouts${named.length ? ` for ${listOf(named)}` : ""} included where shown.` : "",
    included.length ? `${capital(listOf(included))} included where shown.` : "",
    excluded.length ? `${capital(listOf(excluded))} are not included unless added to the drawings.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The terms a project's own sheets support, so a new upload has them from the start and they keep up with its inputs. */
export function defaultTerms(d: ProjectData, r: Result): string[] {
  const v = d.variables;
  const terms: string[] = [];

  const materials =
    v.materialBasis.trim() ||
    r.slabs
      .filter((g) => g.drawingSqft > 0 && !/^material$/i.test(g.rate.label.trim()))
      .map((g) => g.rate.label)
      .join(", ");
  const basis = v.pricing === "slab" ? "priced on a full-slab basis" : "priced on piece area including wastage";
  terms.push(materials ? `Material: ${materials}, ${basis}.` : `Material ${basis}.`);

  const source = /^\s*source:\s*([^|]+)/i.exec(d.sheetNotes.drawing ?? "")?.[1].trim();
  terms.push(`Quantities and dimensions per ${source || "the project drawings"}.`);

  terms.push(cutoutsTerm(d, r));

  // A row costing nothing isn't being charged for: 1633 lists a 20ft container at Rs 0.
  const containers = [...new Set(v.containers.filter((c) => c.count > 0 && c.cost > 0).map((c) => c.label.replace(/\s*containers?\s*$/i, "").trim()))].filter(Boolean);
  if (containers.length && r.packing.usd > 0) terms.push(`Packing in ${listOf(containers)} export containers is included.`);

  return terms;
}

/** What the PDF prints: the terms entered for this project, or else the ones its sheets support. */
export const termsFor = (d: ProjectData, r: Result): string[] => (d.meta.terms.length ? d.meta.terms : defaultTerms(d, r));

/** Project sections, in workflow order. One place drives the sidebar and the "next step" links. */
export type SectionIcon =
  | "FileSpreadsheet"
  | "BadgeDollarSign"
  | "Calculator"
  | "Receipt"
  | "LayoutGrid"
  | "PieChart"
  | "FileText";

export type SectionGroup = "Inputs" | "Costing" | "Summary & Quote";
export const SECTION_GROUPS: SectionGroup[] = ["Inputs", "Costing", "Summary & Quote"];

export interface SectionDef {
  slug: string;
  label: string;
  short: string;
  group: SectionGroup;
  icon: SectionIcon;
  /** Shows internal (My Cost) data — marked so it is never mistaken for customer data. */
  internal?: boolean;
}

export const SECTIONS: SectionDef[] = [
  { slug: "import-drawing", label: "Drawing & Variables", short: "Drawing & Variables", group: "Inputs", icon: "FileSpreadsheet" },
  { slug: "cost-inputs", label: "Cost Inputs", short: "Cost Inputs", group: "Inputs", icon: "BadgeDollarSign", internal: true },
  { slug: "internal-costing", label: "Internal Costing", short: "Internal Costing", group: "Costing", icon: "Calculator", internal: true },
  { slug: "customer-charges", label: "Customer Charges", short: "Customer Charges", group: "Costing", icon: "Receipt" },
  { slug: "slab-calculation", label: "Slab Calculation", short: "Slab Calculation", group: "Costing", icon: "LayoutGrid", internal: true },
  { slug: "project-summary", label: "Project Summary", short: "Project Summary", group: "Summary & Quote", icon: "PieChart", internal: true },
  { slug: "final-quote", label: "Final Quote / PDF", short: "Final Quote", group: "Summary & Quote", icon: "FileText" },
];

/** Section links an issue can point at; Unit Conversion now lives with the standard formulas. */
export const sectionHref = (projectId: string, slug: string) =>
  slug === "unit-conversion" ? "/formulas" : `/projects/${projectId}/${slug}`;

/** Project sections, in workflow order. One place drives the sidebar and the "next step" links. */
export type SectionIcon =
  | "FileSpreadsheet"
  | "Ruler"
  | "BadgeDollarSign"
  | "Calculator"
  | "Receipt"
  | "ClipboardList"
  | "ClipboardCheck"
  | "LayoutGrid"
  | "PieChart"
  | "FileText";

export type SectionGroup = "Inputs" | "Costing & Calculations" | "Output";
export const SECTION_GROUPS: SectionGroup[] = ["Inputs", "Costing & Calculations", "Output"];

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
  { slug: "import-drawing", label: "Import Drawing Sheet", short: "Import Drawing", group: "Inputs", icon: "FileSpreadsheet" },
  { slug: "unit-conversion", label: "Unit Conversion", short: "Unit Conversion", group: "Inputs", icon: "Ruler" },
  { slug: "cost-inputs", label: "Cost Inputs", short: "Cost Inputs", group: "Inputs", icon: "BadgeDollarSign", internal: true },
  { slug: "internal-costing", label: "Internal Costing (My Cost)", short: "1. Internal Costing", group: "Costing & Calculations", icon: "Calculator", internal: true },
  { slug: "customer-charges", label: "Customer Charges (Custom Quote)", short: "2. Customer Charges", group: "Costing & Calculations", icon: "Receipt" },
  { slug: "internal-summary", label: "Internal Costing Summary", short: "3. Internal Summary", group: "Costing & Calculations", icon: "ClipboardList", internal: true },
  { slug: "customer-summary", label: "Customer Charges Summary", short: "4. Customer Summary", group: "Costing & Calculations", icon: "ClipboardCheck" },
  { slug: "slab-calculation", label: "Slab Calculation", short: "5. Slab Calculation", group: "Costing & Calculations", icon: "LayoutGrid", internal: true },
  { slug: "project-summary", label: "Project Summary", short: "6. Project Summary", group: "Costing & Calculations", icon: "PieChart", internal: true },
  { slug: "final-quote", label: "Final Quote / PDF", short: "7. Final Quote / PDF", group: "Output", icon: "FileText" },
];

export const sectionHref = (projectId: string, slug: string) => `/projects/${projectId}/${slug}`;

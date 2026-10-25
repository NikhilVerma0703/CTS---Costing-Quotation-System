import { redirect } from "next/navigation";

/** Unit conversion rules and formulas are shared by all projects: they live on Formulas & Units. */
export default function UnitConversionPage() {
  redirect("/formulas");
}

import Link from "next/link";
import { AlertTriangle, SearchCheck, XCircle } from "lucide-react";
import type { Issue } from "@/lib/engine/types";
import { sectionHref } from "@/modules/registry";

/**
 * Calculation problems: errors stop the quote from being issued; warnings
 * don't. Data checks (values to verify) are summarised in one line that
 * links to the full list on Drawing & Variables.
 */
export function IssuesBanner({ issues, projectId, only }: { issues: Issue[]; projectId: string; only?: "error" | "warning" }) {
  const list = only ? issues.filter((i) => i.severity === only) : issues;
  if (list.length === 0) return null;
  const errors = list.filter((i) => i.severity === "error");
  const warnings = list.filter((i) => i.severity === "warning" && !i.check);
  const checks = list.filter((i) => i.check);
  return (
    <div className="mb-5 space-y-2">
      {errors.length > 0 && (
        <div className="rounded-xl border border-bad-fg/30 bg-bad-bg px-4 py-3 text-sm text-bad-fg">
          <p className="flex items-center gap-2 font-semibold">
            <XCircle className="size-4" /> {errors.length === 1 ? "1 problem" : `${errors.length} problems`} to fix before the quote can be issued
          </p>
          <ul className="mt-1.5 space-y-1 pl-6">
            {errors.map((i) => (
              <li key={i.message} className="list-disc">
                {i.message}{" "}
                {i.fixAt && (
                  <Link className="font-semibold underline" href={sectionHref(projectId, i.fixAt)}>
                    Fix
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-warn-fg/25 bg-warn-bg px-4 py-3 text-sm text-warn-fg">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" /> {warnings.length === 1 ? "1 thing to check" : `${warnings.length} things to check`}
          </p>
          <ul className="mt-1.5 space-y-1 pl-6">
            {warnings.map((i) => (
              <li key={i.message} className="list-disc">
                {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {checks.length > 0 && (
        <Link
          href={`${sectionHref(projectId, "import-drawing")}#checks`}
          className="flex items-center gap-2 rounded-xl border border-warn-fg/25 bg-warn-bg px-4 py-2.5 text-sm font-semibold text-warn-fg hover:underline"
        >
          <SearchCheck className="size-4" /> {checks.length} data value{checks.length === 1 ? "" : "s"} to verify against the drawings
        </Link>
      )}
    </div>
  );
}

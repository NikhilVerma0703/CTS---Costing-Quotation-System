import { FileDown, FileSpreadsheet } from "lucide-react";

/** Export Excel / Export PDF for a section (or a global page when no project). */
export function ExportButtons({ scope, projectId }: { scope: string; projectId?: string }) {
  const href = (format: "xlsx" | "pdf") => `/api/export?scope=${scope}${projectId ? `&project=${projectId}` : ""}&format=${format}`;
  return (
    <>
      <a className="btn-secondary btn-sm" href={href("xlsx")}>
        <FileSpreadsheet className="size-4" /> Export Excel
      </a>
      <a className="btn-secondary btn-sm" href={href("pdf")}>
        <FileDown className="size-4" /> Export PDF
      </a>
    </>
  );
}

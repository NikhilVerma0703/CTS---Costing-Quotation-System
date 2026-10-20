import { SideTag } from "./SideTag";

export function PageHeader({
  title,
  description,
  actions,
  side,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  side?: "internal" | "customer";
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">{title}</h1>
          {side && <SideTag side={side} />}
        </div>
        {description && <p className="mt-1 max-w-3xl text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

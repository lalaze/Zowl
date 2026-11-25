import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 h-1.5 w-10 rounded-full border border-divider bg-primary" />
        <h1 className="text-[1.75rem] font-black tracking-[-0.01em] text-foreground sm:text-[2.1rem]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-sm font-semibold leading-6 text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

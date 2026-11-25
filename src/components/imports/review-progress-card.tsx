"use client";

import { ClipboardCheck } from "lucide-react";

import { useT } from "@/components/i18n/i18n-provider";

/**
 * Review progress card: how far an import or recognition review has got,
 * with processed / total and a completion state.
 */
export function ReviewProgressCard({
  processed,
  total,
  description,
}: {
  processed: number;
  total: number;
  description?: string;
}) {
  const t = useT();
  const safeTotal = Math.max(total, 0);
  const safeProcessed = Math.min(Math.max(processed, 0), safeTotal);
  const percent = safeTotal === 0
    ? 0
    : Math.round((safeProcessed / safeTotal) * 100);
  const complete = safeTotal > 0 && safeProcessed === safeTotal;

  return (
    <section
      aria-label={t("Review progress", "核对进度")}
      className="rounded-[20px] border-2 border-divider bg-surface px-4 py-4 sm:px-5"
    >
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-tint-amber text-foreground">
          <ClipboardCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-black text-foreground">
            {t("Review progress", "核对进度")}
            <span className="text-xs font-extrabold text-muted">
              {t(
                `Reviewed ${safeProcessed} / ${safeTotal} records`,
                `已核对 ${safeProcessed} / ${safeTotal} 条`,
              )}
            </span>
          </p>
          <div
            aria-label={t(`${percent}% reviewed`, `已核对 ${percent}%`)}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="mt-2 h-4 overflow-hidden rounded-full border-2 border-divider bg-surface-muted"
            role="progressbar"
          >
            <div
              className="h-full rounded-r-full border-r-2 border-divider bg-primary transition-[width] duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <span className="shrink-0 text-lg font-black tabular-nums text-foreground">
          {percent}%
        </span>
      </div>
      <p className="mt-2.5 text-[11px] font-semibold text-muted">
        {complete
          ? t("Review complete. Ready to confirm the import.", "核对完成，可以确认导入了。")
          : (description ??
            t(
              "Review every record before confirming the import",
              "确认导入前请逐条核对",
            ))}
      </p>
    </section>
  );
}

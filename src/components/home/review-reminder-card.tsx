import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Owl } from "@/components/brand/owl";
import { translator, type Locale } from "@/lib/i18n/locale";

export type ReminderItem = {
  id: string;
  count: number;
};

/**
 * The owl points out screenshot jobs, import batches and captured payment
 * notifications still waiting for review. Renders nothing when there is
 * nothing to review.
 */
export function ReviewReminderCard({
  screenshotJobs,
  importBatches,
  notificationCount = 0,
  locale = "en",
}: {
  screenshotJobs: ReminderItem[];
  importBatches: ReminderItem[];
  notificationCount?: number;
  locale?: Locale;
}) {
  const t = translator(locale);
  if (
    screenshotJobs.length === 0 &&
    importBatches.length === 0 &&
    notificationCount === 0
  ) {
    return null;
  }
  const screenshotCount = screenshotJobs.reduce(
    (total, job) => total + job.count,
    0,
  );
  const importCount = importBatches.reduce(
    (total, batch) => total + batch.count,
    0,
  );

  return (
    <section
      aria-label={t("Pending review reminders", "待核对提醒")}
      className="rounded-[28px] bg-tint-amber px-4 py-4 sm:px-5"
    >
      <div className="flex items-center gap-3">
        <Owl className="size-12" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-foreground">
            {t("A few things need your eyes", "有几项需要你看一眼")}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-muted">
            {t("Review these to complete your ledger", "核对之后，账本才算完整")}
          </p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {screenshotJobs.length ? (
          <Link
            href={`/imports/screenshots/${screenshotJobs[0].id}/review`}
            className="group flex items-center justify-between gap-3 rounded-[18px] bg-surface px-4 py-3 outline-none transition hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-foreground">
                {locale === "zh"
                  ? `${screenshotCount} 张截图待核对`
                  : `${screenshotCount} ${screenshotCount === 1 ? "screenshot" : "screenshots"} awaiting review`}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold text-muted">
                {t(
                  "Screenshot recognition · Confirm before posting",
                  "截图识别 · 确认后入账",
                )}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </Link>
        ) : null}
        {importBatches.length ? (
          <Link
            href={`/imports/files/${importBatches[0].id}/review`}
            className="group flex items-center justify-between gap-3 rounded-[18px] bg-surface px-4 py-3 outline-none transition hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-foreground">
                {locale === "zh"
                  ? `${importCount} 条导入记录待核对`
                  : `${importCount} import ${importCount === 1 ? "record" : "records"} awaiting review`}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold text-muted">
                {t("Statement import · Confirm before posting", "账单导入 · 确认后入账")}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </Link>
        ) : null}
        {notificationCount ? (
          <Link
            href="/imports/notifications"
            className="group flex items-center justify-between gap-3 rounded-[18px] bg-surface px-4 py-3 outline-none transition hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="min-w-0">
              <span className="block text-sm font-black text-foreground">
                {locale === "zh"
                  ? `${notificationCount} 条支付通知待核对`
                  : `${notificationCount} payment ${notificationCount === 1 ? "notification" : "notifications"} awaiting review`}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold text-muted">
                {t("Review inbox · Confirm before posting", "待核对 · 确认后入账")}
              </span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}

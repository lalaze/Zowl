import {
  BellRing,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  ScanLine,
} from "lucide-react";
import Link from "next/link";

import { Owl } from "@/components/brand/owl";
import type { ReminderItem } from "@/components/home/review-reminder-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n/locale";

export function DesktopReviewQueueCard({
  locale,
  notificationCount,
  pendingCount,
  reminderBatches,
  reminderJobs,
}: {
  locale: Locale;
  notificationCount: number;
  pendingCount: number;
  reminderBatches: ReminderItem[];
  reminderJobs: ReminderItem[];
}) {
  const t = translator(locale);

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden px-5 pb-5 pt-3">
      <div className="flex shrink-0 items-center gap-2">
        <Owl className="size-7" />
        <h2 className="text-[13px] font-black text-foreground">
          {t("To review", "待核对")}
        </h2>
        <span className="ml-auto rounded-full bg-tint-leaf px-2.5 py-0.5 text-[10px] font-black text-income">
          {pendingCount
            ? t(
                `${pendingCount} ${pendingCount === 1 ? "item" : "items"} awaiting review`,
                `${pendingCount} 项待核对`,
              )
            : t("Nothing pending", "暂无待办")}
        </span>
      </div>

      <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {pendingCount ? (
          <>
            {notificationCount ? (
              <Link
                className="flex h-[60px] items-center gap-3 rounded-[18px] bg-tint-berry px-3 transition hover:brightness-[0.98]"
                href="/imports/notifications"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-foreground">
                  <BellRing className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-black text-foreground">
                    {t(
                      "Payment notifications awaiting review",
                      "支付通知待核对",
                    )}
                  </span>
                  <span className="mt-1 block truncate text-[9px] font-bold text-muted">
                    {t(
                      `${notificationCount} captured · Review inbox`,
                      `已采集 ${notificationCount} 条 · 待核对`,
                    )}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted" />
              </Link>
            ) : null}
            {reminderJobs.slice(0, 2).map((job) => (
              <Link
                className="flex h-[60px] items-center gap-3 rounded-[18px] bg-tint-sky px-3 transition hover:brightness-[0.98]"
                href={`/imports/screenshots/${job.id}/review`}
                key={`job-${job.id}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-foreground">
                  <ScanLine className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-black text-foreground">
                    {t("Screenshots awaiting review", "截图待核对")}
                  </span>
                  <span className="mt-1 block truncate text-[9px] font-bold text-muted">
                    {t(
                      `${job.count} screenshots · Confirm before posting`,
                      `${job.count} 张截图 · 确认后入账`,
                    )}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted" />
              </Link>
            ))}
            {reminderBatches.slice(0, 2).map((batch) => (
              <Link
                className="flex h-[60px] items-center gap-3 rounded-[18px] bg-tint-amber px-3 transition hover:brightness-[0.98]"
                href={`/imports/files/${batch.id}/review`}
                key={`batch-${batch.id}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface text-foreground">
                  <FileSpreadsheet className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-black text-foreground">
                    {t("Import batch awaiting review", "导入批次待核对")}
                  </span>
                  <span className="mt-1 block truncate text-[9px] font-bold text-muted">
                    {t(
                      `${batch.count} records · Confirm before posting`,
                      `${batch.count} 条记录 · 确认后入账`,
                    )}
                  </span>
                </span>
                <ChevronRight className="size-3.5 shrink-0 text-muted" />
              </Link>
            ))}
          </>
        ) : (
          <div className="grid h-full place-content-center justify-items-center gap-1 text-center">
            <Owl className="mb-1 size-14" />
            <p className="text-[12px] font-black text-foreground">
              {t("Nothing awaiting review", "没有待核对的内容")}
            </p>
            <p className="text-[9px] font-bold text-muted">
              {t("Your ledger is up to date", "账本已是最新")}
            </p>
          </div>
        )}
      </div>

      <Button
        asChild
        className="mt-3 h-10 w-full shrink-0 rounded-[14px] text-[13px]"
      >
        <Link href="/imports">
          <CircleDollarSign className="size-4" />
          {t("View imports", "查看导入")}
        </Link>
      </Button>
      <p className="mt-2 shrink-0 text-center text-[9px] font-bold text-muted">
        {t(
          "Every candidate requires confirmation before posting",
          "每条候选都需确认后才会入账",
        )}
      </p>
    </Card>
  );
}

import { ChevronRight, ScanLine } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { NotificationInbox } from "@/components/transactions/notification-inbox";
import { Card } from "@/components/ui/card";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { getTForRender } from "@/lib/i18n/server";
import { notificationCaptureService } from "@/services/notification-capture-service";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";
import { transactionService } from "@/services/transaction-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Review inbox", "待核对") };
}

export default async function ReviewInboxPage() {
  const user = await requireCurrentUserForRender();
  const t = await getTForRender();
  const pending = screenshotRecognitionService.pendingJobs(user.id);
  const categories = transactionService
    .listCategories(user.id)
    .filter((category) => category.kind !== "income");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Review inbox", "待核对")}
        description={t(
          "Screenshots and payment notifications waiting for your confirmation. Skipping creates no transaction.",
          "等待你确认的截图和支付通知。跳过不会生成交易。",
        )}
      />
      {pending.length ? (
        <Card className="overflow-hidden">
          {pending.map((job, index) => (
            <Link
              className={`flex items-center gap-3 px-5 py-4 transition hover:bg-surface-muted ${index ? "border-t-2 border-divider" : ""}`}
              href={`/imports/screenshots/${job.id}/review`}
              key={job.id}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-tint-sky text-foreground">
                <ScanLine className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-foreground">
                  {t(
                    `${job.totalCount} ${job.totalCount === 1 ? "screenshot" : "screenshots"}`,
                    `${job.totalCount} 张截图`,
                  )}
                </span>
                <span className="mt-0.5 block text-xs font-semibold text-muted">
                  {job.status === "processing"
                    ? t("Recognizing", "识别中")
                    : t("Awaiting review", "待核对")}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-subtle" />
            </Link>
          ))}
        </Card>
      ) : null}
      <NotificationInbox
        categories={categories}
        initialPage={notificationCaptureService.list(user.id, {})}
      />
    </div>
  );
}

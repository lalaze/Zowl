import { BellRing, Camera, ChevronRight, FileSpreadsheet, History } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Owl } from "@/components/brand/owl";
import { ReviewReminderCard } from "@/components/home/review-reminder-card";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/locale";
import { getLocaleForRender, getTForRender } from "@/lib/i18n/server";
import { importSourceLabel, importStatusLabel } from "@/lib/import-display";
import { formatTransactionDate } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";
import { importService } from "@/services/import-service";
import { notificationCaptureService } from "@/services/notification-capture-service";
import { screenshotRecognitionService } from "@/services/screenshot-recognition-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Import", "导入") };
}

const pillBase =
  "inline-flex items-center rounded-full border-2 border-divider px-2 py-0.5 text-[10px] font-extrabold";

export default async function ImportsPage() {
  const user = await requireCurrentUserForRender();
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const notificationCount = notificationCaptureService.list(user.id, { limit: 1 }).pendingCount;
  const batches = importService.listBatches(user.id);
  const recognitionJobs = screenshotRecognitionService.listJobs(user.id, 10);
  // 待确认前置：复核中的批次/识别任务置顶为可行动的队列
  const reviewingBatches = batches
    .filter((batch) => batch.status === "reviewing")
    .map((batch) => ({ id: batch.id, count: batch.totalCount }));
  const reviewingJobs = screenshotRecognitionService.pendingJobs(user.id)
    .filter((job) => job.status === "reviewing")
    .map((job) => ({ id: job.id, count: job.totalCount }));
  const options = [
    {
      href: "/imports/screenshots",
      icon: Camera,
      title: t("Recognize payment screenshots", "识别支付截图"),
      description: t(
        "Upload one or more images and confirm before saving",
        "上传一张或多张图片，确认后再保存",
      ),
      stage: t("Available", "已开放"),
    },
    {
      href: "/imports/files",
      icon: FileSpreadsheet,
      title: t("Import a statement file", "导入账单文件"),
      description: t("Alipay, WeChat Pay CSV / XLSX", "支付宝、微信支付 CSV / XLSX"),
      stage: t("Available", "已开放"),
    },
    {
      href: "/imports/notifications",
      icon: BellRing,
      title: t("Review inbox", "待核对"),
      description: notificationCount
        ? t(
            `${notificationCount} payment notification${notificationCount === 1 ? "" : "s"} awaiting confirmation`,
            `${notificationCount} 条支付通知待确认`,
          )
        : t("Payment notifications captured on your phone", "手机上采集到的支付通知"),
      stage: notificationCount
        ? t(`${notificationCount} pending`, `${notificationCount} 条待确认`)
        : t("Up to date", "已处理完"),
      attention: notificationCount > 0,
    },
  ];
  const tints = ["bg-tint-sky", "bg-tint-amber", "bg-tint-berry"];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Import", "导入")}
        description={t(
          "All imports are previewed first and require confirmation before posting.",
          "所有导入内容都会先预览，确认后才会入账。",
        )}
      />
      <ReviewReminderCard
        importBatches={reviewingBatches}
        locale={locale}
        screenshotJobs={reviewingJobs}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((item, index) => (
          <Link key={item.href} href={item.href}>
            <Card className={cn("group flex h-full items-center gap-4 p-5 transition", tints[index])}>
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-divider bg-surface text-foreground"><item.icon className="size-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2"><span className="font-black text-foreground">{item.title}</span><span className={cn(pillBase, item.attention ? "bg-tint-amber text-foreground" : "bg-tint-leaf text-foreground")}>{item.stage}</span></span>
                <span className="mt-1 block text-sm font-medium text-muted">{item.description}</span>
              </span>
              <ChevronRight className="size-4 text-subtle transition group-hover:translate-x-0.5 group-hover:text-accent-text" />
            </Card>
          </Link>
        ))}
      </div>
      <section>
        <div className="mb-3 flex items-center gap-2"><History className="size-4 text-subtle" /><h2 className="text-base font-black text-foreground">{t("Recent imports", "最近导入")}</h2></div>
        {batches.length ? (
          <Card className="overflow-hidden">
            {batches.map((batch, index) => (
              <Link key={batch.id} href={`/imports/files/${batch.id}/${batch.status === "completed" ? "result" : "review"}`} className={`flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-muted ${index ? "border-t-2 border-divider" : ""}`}>
                <div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{batch.fileName}</p><p className="mt-1 text-xs font-medium text-muted">{importSourceLabel(batch.source, locale)} · {formatTransactionDate(batch.createdAt, true, locale)}</p></div>
                <div className="flex shrink-0 flex-col items-end gap-1.5"><span className={cn(pillBase, batch.status === "completed" ? "bg-tint-leaf text-foreground" : "bg-tint-amber text-foreground")}>{importStatusLabel(batch.status, locale)}</span><p className="text-xs font-semibold text-subtle">{batch.status === "completed" ? t(`Success ${batch.importedCount} transactions`, `成功 ${batch.importedCount} 笔`) : t(`Total ${batch.totalCount} rows`, `共 ${batch.totalCount} 行`)}</p></div>
              </Link>
            ))}
          </Card>
        ) : <Card className="flex items-center gap-4 border-dashed p-5"><Owl className="w-14 shrink-0" /><span className="text-sm font-medium text-muted">{t("No imports yet. Your first import batch will appear here.", "还没有导入记录，完成第一次导入后会显示在这里。")}</span></Card>}
      </section>
      {recognitionJobs.length ? (
        <section>
          <div className="mb-3 flex items-center gap-2"><Camera className="size-4 text-subtle" /><h2 className="text-base font-black text-foreground">{t("Recent screenshot recognition", "最近截图识别")}</h2></div>
          <Card className="overflow-hidden">
            {recognitionJobs.map((job, index) => (
              <Link key={job.id} href={`/imports/screenshots/${job.id}/${job.status === "completed" ? "result" : "review"}`} className={`flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-surface-muted ${index ? "border-t-2 border-divider" : ""}`}>
                <div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{t(`${job.totalCount} payment screenshots`, `${job.totalCount} 张支付截图`)}</p><p className="mt-1 text-xs font-medium text-muted">{formatTransactionDate(job.createdAt, true, locale)} · {job.providerId === "mock" ? t("Mock / Manual completion", "Mock / 手动补录") : t("Structured recognition", "结构化识别")}</p></div>
                <div className="flex shrink-0 flex-col items-end gap-1.5"><span className={cn(pillBase, job.status === "completed" ? "bg-tint-leaf text-foreground" : job.status === "failed" ? "bg-tint-berry text-danger" : "bg-tint-amber text-foreground")}>{job.status === "completed" ? t("Completed", "已完成") : job.status === "reviewing" ? t("Awaiting confirmation", "待确认") : job.status === "failed" ? t("Task failed", "任务失败") : t("Processing", "处理中")}</span><p className="text-xs font-semibold text-subtle">{job.status === "completed" ? t(`Added ${job.importedCount} transactions`, `新增 ${job.importedCount} 笔`) : t(`Pending ${job.totalCount} images`, `待处理 ${job.totalCount} 张`)}</p></div>
              </Link>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

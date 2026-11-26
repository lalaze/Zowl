import { AlertCircle, ArrowRight, CheckCircle2, Download, RotateCcw, Rows3, SkipForward } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Owl } from "@/components/brand/owl";
import { ImportStepper } from "@/components/imports/import-stepper";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentUserForRender } from "@/lib/auth/session";
import { translator, type Translate } from "@/lib/i18n/locale";
import { getLocaleForRender, getTForRender } from "@/lib/i18n/server";
import { importSourceLabel } from "@/lib/import-display";
import { formatMoney } from "@/lib/money";
import { importService } from "@/services/import-service";
import type { NormalizedImportTransaction } from "@/services/import-service/types";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTForRender();
  return { title: t("Import results", "导入结果") };
}

function resultLabel(code: string | null, t: Translate) {
  switch (code) {
    case "IMPORTED":
      return t("Transaction added", "已新增交易");
    case "ENRICHED_CAPTURE_POSTED":
      return t("Notification candidate enriched and posted", "已补全通知候选并入账");
    case "ENRICHED_TRANSACTION":
      return t("Existing transaction enriched with a new revision", "已补全现有交易并生成新版本");
    case "SKIPPED_DUPLICATE":
      return t("Exact duplicate skipped", "确定重复，已跳过");
    case "SKIPPED_POSSIBLE_DUPLICATE":
      return t("Possible duplicate found during confirmation; safely skipped", "确认时发现疑似重复，已安全跳过");
    case "SKIPPED_INVALID":
      return t("Invalid fields; not imported", "字段无效，未导入");
    case "SKIPPED_BY_USER":
      return t("Skipped by user", "已手动跳过");
    case "WRITE_FAILED":
      return t("Write failed", "写入失败");
    default:
      return t("Processed", "已处理");
  }
}

export default async function ImportResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireCurrentUserForRender();
  const { batchId } = await params;
  const query = await searchParams;
  const page = Number.parseInt(query.page ?? "1", 10);
  const review = importService.getReview(user.id, batchId, { page: Number.isFinite(page) ? page : 1 });
  if (review.batch.status !== "completed") redirect(`/imports/files/${batchId}/review`);
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const sourceLabel = importSourceLabel(review.batch.source, locale);
  const stats = [
    { key: "created", label: t("New transactions", "新增交易"), value: review.batch.createdCount, icon: CheckCircle2, tone: "bg-tint-leaf text-income" },
    { key: "enriched", label: t("Enriched transactions", "补全交易"), value: review.batch.enrichedCount, icon: CheckCircle2, tone: "bg-tint-sky text-foreground" },
    { key: "duplicates", label: t("Duplicates skipped", "重复跳过"), value: review.batch.duplicateCount, icon: SkipForward, tone: "bg-tint-amber text-amber-700 dark:text-amber-300" },
    { key: "skipped", label: t("Manually skipped", "手动跳过"), value: review.batch.skippedCount, icon: Rows3, tone: "bg-tint-berry text-foreground" },
    { key: "failed", label: t("Failed records", "失败记录"), value: review.batch.failedCount, icon: AlertCircle, tone: "bg-tint-berry text-danger" },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={t("Import complete", "导入完成")}
        description={t(
          `${sourceLabel} transactions processed. Reasons are retained for all skipped and failed items.`,
          `${sourceLabel}交易已处理完毕，所有跳过和失败项都保留了原因。`,
        )}
        action={<Button asChild variant="outline" size="sm"><a href={`/api/files/${review.batch.fileId}`}><Download className="size-4" />{t("Original file", "原始文件")}</a></Button>}
      />
      <Card><CardContent className="p-5 sm:p-6"><ImportStepper current={3} /></CardContent></Card>

      <Card className="overflow-hidden">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <span className="rounded-full border-2 border-divider bg-tint-leaf px-3 py-1 text-xs font-extrabold text-foreground">{t("All recorded!", "都记好啦！")}</span>
          <Owl className="mt-3 w-24" />
          <h2 className="mt-4 text-2xl font-black text-foreground">{t(
            `${review.batch.createdCount} added, ${review.batch.enrichedCount} enriched`,
            `新增 ${review.batch.createdCount} 笔，补全 ${review.batch.enrichedCount} 笔`,
          )}</h2>
          <p className="mt-2 text-sm font-medium text-muted">{t("File:", "文件：")}{review.fileName}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><Button asChild size="lg"><Link href="/transactions">{t("View transactions", "查看交易")}<ArrowRight className="size-4" /></Link></Button><Button asChild variant="outline"><Link href="/imports/files"><RotateCcw className="size-4" />{t("Import more", "继续导入")}</Link></Button></div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">{stats.map((stat) => <Card key={stat.key}><CardContent className="flex items-center gap-3 p-4"><span className={`grid size-10 shrink-0 place-items-center rounded-2xl border-2 border-divider ${stat.tone}`}><stat.icon className="size-4" /></span><div><p className="text-xs font-semibold text-muted">{stat.label}</p><p className="text-xl font-black tabular-nums text-foreground">{stat.value}</p></div></CardContent></Card>)}</section>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b-2 border-divider bg-surface-muted px-5 py-3"><h2 className="text-sm font-black text-foreground">{t("Processing details", "处理明细")}</h2><span className="text-xs font-medium text-muted">{t(
          `Page ${review.pagination.page} / ${review.pagination.totalPages} page`,
          `第 ${review.pagination.page} / ${review.pagination.totalPages} 页`,
        )}</span></div>
        {review.items.map((item) => {
          const data = item.normalizedData as NormalizedImportTransaction | null;
          return <div key={item.id} className="flex items-center justify-between gap-4 border-t-2 border-divider px-5 py-3 first:border-t-0"><div className="min-w-0"><p className="truncate text-sm font-black text-foreground">{data?.merchantName ?? data?.description ?? t(`Row ${item.rowNumber}`, `第 ${item.rowNumber} 行`)}</p><p className="mt-0.5 text-xs font-medium text-muted">{resultLabel(item.resultCode, t)}</p></div><div className="flex shrink-0 items-center gap-2">{data?.amountMinor != null ? <span className="text-sm font-black tabular-nums text-foreground">{formatMoney(data.amountMinor, data.currency)}</span> : null}{item.resultTransactionId ? <Button asChild variant="ghost" size="sm"><Link href={`/transactions/${item.resultTransactionId}`}>{t("Details", "详情")}</Link></Button> : <Badge variant={item.resultCode === "WRITE_FAILED" ? "danger" : "default"}>{t("Not written", "未写入")}</Badge>}</div></div>;
        })}
        {review.pagination.totalPages > 1 ? <div className="flex justify-between border-t-2 border-divider p-3"><Button asChild variant="outline" size="sm"><Link href={`?page=${Math.max(1, review.pagination.page - 1)}`}>{t("Previous", "上一页")}</Link></Button><Button asChild variant="outline" size="sm"><Link href={`?page=${Math.min(review.pagination.totalPages, review.pagination.page + 1)}`}>{t("Next", "下一页")}</Link></Button></div> : null}
      </Card>
    </div>
  );
}

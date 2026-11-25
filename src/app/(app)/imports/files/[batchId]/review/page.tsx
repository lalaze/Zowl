import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Download, FileWarning, Rows3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ConfirmImportButton } from "@/components/imports/confirm-import-button";
import { AiClassificationRunner } from "@/components/categories/ai-classification-runner";
import { ImportDuplicateReviewDialog } from "@/components/imports/import-duplicate-review-dialog";
import { ImportErrorReviewDialog } from "@/components/imports/import-error-review-dialog";
import { ImportReviewList } from "@/components/imports/import-review-list";
import { ImportStepper } from "@/components/imports/import-stepper";
import { MappingEditor } from "@/components/imports/mapping-editor";
import { ReviewProgressCard } from "@/components/imports/review-progress-card";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireCurrentUser } from "@/lib/auth/session";
import { translator } from "@/lib/i18n/locale";
import { getLocale, getT } from "@/lib/i18n/server";
import { importSourceLabel } from "@/lib/import-display";
import { importService } from "@/services/import-service";
import { transactionService } from "@/services/transaction-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Import preview", "导入预览") };
}

export default async function ImportReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{
    page?: string;
    filter?: string;
    reviewDuplicates?: string;
    reviewErrors?: string;
  }>;
}) {
  const user = await requireCurrentUser();
  const { batchId } = await params;
  const query = await searchParams;
  const requestedPage = Number.parseInt(query.page ?? "1", 10);
  const filter = query.filter === "pending" || query.filter === "errors"
    ? query.filter
    : "all";
  const review = importService.getReview(user.id, batchId, {
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
    filter,
  });
  if (review.batch.status === "completed") redirect(`/imports/files/${batchId}/result`);
  const locale = await getLocale();
  const t = translator(locale);
  const categories = transactionService.listCategories(user.id);
  const aiMetadata = importService.getAiCategorizationMetadata(user.id);
  const reviewingDuplicates = query.reviewDuplicates === "1";
  const reviewingErrors = query.reviewErrors === "1" && !reviewingDuplicates;
  const nextError = reviewingErrors
    ? importService.getNextUnresolvedError(user.id, batchId)
    : null;
  const nextDuplicate = reviewingDuplicates
    ? importService.getNextUnresolvedDuplicate(user.id, batchId)
    : null;
  const matchedTransaction = nextDuplicate?.item.duplicateTransactionId
    ? transactionService.get(
        user.id,
        nextDuplicate.item.duplicateTransactionId,
      )
    : null;
  const importCount = review.decisionCounts.import + review.decisionCounts.importAnyway;
  const unresolvedCount = review.issueCounts.unresolvedInvalid + review.issueCounts.unresolvedDuplicate + review.issueCounts.unresolvedEnrichment;
  const processedCount = importCount + review.decisionCounts.skip;
  const stats = [
    { key: "rows", label: t("File rows", "文件行数"), value: review.batch.totalCount, icon: Rows3, tone: "bg-tint-berry text-foreground", href: null as string | null },
    { key: "ready", label: t("Ready to import", "准备导入"), value: importCount, icon: CheckCircle2, tone: "bg-tint-leaf text-income", href: null },
    {
      key: "duplicates",
      label: t("Duplicate alerts", "重复提示"),
      value: review.batch.duplicateCount,
      icon: AlertTriangle,
      tone: "bg-tint-amber text-amber-700 dark:text-amber-300",
      href: review.issueCounts.unresolvedDuplicate > 0
        ? "?reviewDuplicates=1"
        : review.batch.duplicateCount > 0
          ? "?filter=pending&page=1"
          : null,
    },
    {
      key: "errors",
      label: t("Parsing errors", "解析错误"),
      value: review.batch.failedCount,
      icon: FileWarning,
      tone: "bg-tint-berry text-danger",
      href: review.issueCounts.unresolvedInvalid > 0
        ? "?reviewErrors=1"
        : review.batch.failedCount > 0
          ? "?filter=errors&page=1"
          : null,
    },
  ];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2"><Link href="/imports/files"><ArrowLeft className="size-4" />{t("Choose another file", "重新选择文件")}</Link></Button>
      <PageHeader
        title={t("Review imported transactions", "核对导入的交易")}
        description={t(
          "Fix or explicitly skip red error items. Yellow duplicate items also require a decision.",
          "红色错误项需要修正或明确跳过；黄色重复项也需要你做出选择。",
        )}
        action={<div className="flex items-center gap-2"><span className="inline-flex items-center rounded-full border-2 border-divider bg-tint-sky px-2.5 py-1 text-xs font-extrabold text-foreground">{importSourceLabel(review.batch.source, locale)}</span><Button asChild variant="outline" size="sm"><a href={`/api/files/${review.batch.fileId}`}><Download className="size-4" />{t("Original file", "原始文件")}</a></Button></div>}
      />
      <Card><CardContent className="p-5 sm:p-6"><ImportStepper current={2} /></CardContent></Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const body = (
            <CardContent className="flex items-center gap-3 p-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-2xl border-2 border-divider ${stat.tone}`}><stat.icon className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted">{stat.label}</p>
                <p className="mt-0.5 text-xl font-black tabular-nums text-foreground">{stat.value}</p>
              </div>
              {stat.href ? <ChevronRight className="size-4 shrink-0 text-muted transition group-hover:translate-x-0.5" /> : null}
            </CardContent>
          );
          return stat.href ? (
            <Link key={stat.key} href={stat.href} className="group outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-[24px]">
              <Card className="h-full transition group-hover:-translate-y-0.5">{body}</Card>
            </Link>
          ) : (
            <Card key={stat.key}>{body}</Card>
          );
        })}
      </section>

      <ReviewProgressCard
        processed={processedCount}
        total={review.batch.totalCount}
      />

      {review.batch.source === "other" ? <MappingEditor batchId={batchId} headers={review.batch.detectedHeaders ?? []} initialMapping={review.batch.fieldMapping ?? {}} /> : null}

      <AiClassificationRunner
        endpoint={`/api/imports/files/${batchId}/ai-classify`}
        enabled={aiMetadata.enabled}
      />

      {review.issueCounts.invalid > 0 || review.pagination.filter === "errors" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-divider bg-tint-sky px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <FileWarning className="size-4 shrink-0 text-danger" />
            {review.pagination.filter === "errors"
              ? t(
                  `Showing only ${review.pagination.totalCount} parsing errors`,
                  `仅显示 ${review.pagination.totalCount} 条解析错误`,
                )
              : review.issueCounts.unresolvedInvalid > 0
                ? t(
                    `There are ${review.issueCounts.unresolvedInvalid} parsing errors to resolve`,
                    `有 ${review.issueCounts.unresolvedInvalid} 条解析错误待处理`,
                  )
                : t(
                    `There are ${review.issueCounts.invalid} parsing errors, all marked to skip`,
                    `共 ${review.issueCounts.invalid} 条解析错误，均已标记跳过`,
                  )}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link
              href={
                review.pagination.filter === "errors"
                  ? "?page=1"
                  : review.issueCounts.unresolvedInvalid > 0
                    ? "?reviewErrors=1"
                    : "?filter=errors&page=1"
              }
            >
              {review.pagination.filter === "errors"
                ? t("View all", "查看全部")
                : review.issueCounts.unresolvedInvalid > 0
                  ? t("Review each item", "逐条处理")
                  : t("View errors", "查看错误")}
            </Link>
          </Button>
        </div>
      ) : null}

      {review.issueCounts.unresolvedDuplicate > 0 || review.pagination.filter === "pending" ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-divider bg-tint-amber px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            {review.pagination.filter === "pending"
              ? t(
                  `Showing only ${review.pagination.totalCount} pending records`,
                  `仅显示 ${review.pagination.totalCount} 条待处理记录`,
                )
              : t(
                  `There are ${review.issueCounts.unresolvedDuplicate} possible duplicates to resolve`,
                  `有 ${review.issueCounts.unresolvedDuplicate} 条疑似重复待处理`,
                )}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href={review.pagination.filter === "pending" ? "?page=1" : "?reviewDuplicates=1"}>
              {review.pagination.filter === "pending"
                ? t("View all", "查看全部")
                : t("Review each item", "逐条处理")}
            </Link>
          </Button>
        </div>
      ) : null}

      {review.issueCounts.unresolvedEnrichment > 0 ? (
        <div className="rounded-2xl border-2 border-divider bg-tint-amber px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-bold text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-amber-700 dark:text-amber-300" />
            {t(
              `There are ${review.issueCounts.unresolvedEnrichment} bill enrichment conflicts. Choose the current or imported value for each field below.`,
              `有 ${review.issueCounts.unresolvedEnrichment} 条账单补全冲突，请在下方逐项选择保留当前值或采用账单中的值。`,
            )}
          </p>
        </div>
      ) : null}

      <ImportReviewList batchId={batchId} items={review.items} categories={categories} pagination={review.pagination} />

      <Card className="sticky bottom-20 z-10 lg:bottom-4">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-sm font-black text-foreground">{t("Written to the ledger only after confirmation", "确认后才会写入账本")}</p><p className="mt-1 text-xs font-medium text-muted">{t(
            `Skip ${review.decisionCounts.skip} items; unresolved errors: ${review.issueCounts.unresolvedInvalid} items; unresolved possible duplicates: ${review.issueCounts.unresolvedDuplicate} items; enrichment conflicts: ${review.issueCounts.unresolvedEnrichment} transactions`,
            `跳过 ${review.decisionCounts.skip} 条；错误待处理 ${review.issueCounts.unresolvedInvalid} 条；疑似重复待处理 ${review.issueCounts.unresolvedDuplicate} 条；补全冲突 ${review.issueCounts.unresolvedEnrichment} 笔`,
          )}</p></div>
          <ConfirmImportButton batchId={batchId} importCount={importCount} unresolvedCount={unresolvedCount} />
        </CardContent>
      </Card>

      {reviewingErrors ? (
        <ImportErrorReviewDialog
          key={nextError?.id ?? "complete"}
          batchId={batchId}
          item={nextError}
          categories={categories}
          remainingCount={review.issueCounts.unresolvedInvalid}
        />
      ) : null}

      {reviewingDuplicates ? (
        <ImportDuplicateReviewDialog
          key={nextDuplicate?.item.id ?? "complete"}
          batchId={batchId}
          item={nextDuplicate?.item ?? null}
          matchedItem={nextDuplicate?.matchedItem ?? null}
          matchedTransaction={matchedTransaction}
          categories={categories}
          remainingCount={review.issueCounts.unresolvedDuplicate}
        />
      ) : null}
    </div>
  );
}

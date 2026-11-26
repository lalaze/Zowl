"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleHelp,
  LoaderCircle,
  Pencil,
  SkipForward,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AiCategorySuggestionNotice } from "@/components/categories/ai-category-suggestion-notice";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { formatMoney } from "@/lib/money";
import { formatTransactionDate } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";
import type {
  BillEnrichmentField,
  BillEnrichmentResolution,
} from "@/services/import-service/types";

import {
  ImportItemEditor,
  type CategoryOption,
  type ReviewItem,
} from "./import-item-editor";
import { patchImportItem } from "./import-review-api";

const statusPillBase =
  "inline-flex items-center gap-1 rounded-full border-2 border-divider px-2.5 py-0.5 text-[11px] font-extrabold";

function StatusBadge({ item }: { item: ReviewItem }) {
  const t = useT();
  if (item.validationErrors.length) return <span className={cn(statusPillBase, "bg-tint-berry text-danger")}><XCircle className="size-3" />{item.decision === "skip" ? t("Parsing error · Skipped", "解析错误 · 已跳过") : t("Parsing error · Pending", "解析错误 · 待处理")}</span>;
  if (item.enrichmentData?.status === "conflict") return <span className={cn(statusPillBase, "bg-tint-amber-strong text-foreground")}><CircleHelp className="size-3" />{t("Enrichment conflict · Choose values", "补齐冲突 · 待选择")}</span>;
  if (item.enrichmentData?.status === "ready") return <span className={cn(statusPillBase, "bg-tint-leaf text-foreground")}><Check className="size-3" />{item.enrichmentData.targetKind === "notification_capture" ? t("Enrich and post notification candidate", "补齐并入账通知候选") : t("Enrich existing record", "补齐已有记录")}</span>;
  if (item.duplicateStatus === "duplicate") return <span className={cn(statusPillBase, "bg-danger text-white")}>{t("Exact duplicate", "确定重复")}</span>;
  if (item.duplicateStatus === "possible_duplicate" && item.decision === "skip") return <span className={cn(statusPillBase, "bg-surface-muted text-muted")}><CircleHelp className="size-3" />{t("Possible duplicate · Skipped", "疑似重复 · 已跳过")}</span>;
  if (item.duplicateStatus === "possible_duplicate" && item.decision === "import_anyway") return <span className={cn(statusPillBase, "bg-tint-amber-strong text-foreground")}><CircleHelp className="size-3" />{t("Possible duplicate · Will import", "疑似重复 · 将导入")}</span>;
  if (item.duplicateStatus === "possible_duplicate") return <span className={cn(statusPillBase, "bg-tint-amber-strong text-foreground")}><CircleHelp className="size-3" />{t("Possible duplicate · Choose action", "疑似重复 · 待选择")}</span>;
  if (item.decision === "skip") return <span className={cn(statusPillBase, "bg-surface-muted text-muted")}>{t("Skipped", "已跳过")}</span>;
  return <span className={cn(statusPillBase, "bg-tint-leaf text-foreground")}><Check className="size-3" />{t("Ready to import", "可导入")}</span>;
}

function ReviewRow({
  batchId,
  item,
  categories,
}: {
  batchId: string;
  item: ReviewItem;
  categories: CategoryOption[];
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = item.normalizedData;

  async function patchRow(body: Record<string, unknown>, fallback: string) {
    setPending(true);
    setError(null);
    try {
      const result = await patchImportItem(batchId, item.id, body, {
        fallback,
        network: t(
          "Network connection failed. Try again later",
          "网络连接失败，请稍后重试",
        ),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  function decide(decision: "skip" | "import" | "import_anyway") {
    return patchRow(
      { action: "decision", decision },
      t("Operation failed", "操作失败"),
    );
  }

  function adoptAiSuggestion() {
    return patchRow(
      { action: "adopt_ai" },
      t("AI Failed to adopt category suggestion", "AI 分类建议采用失败"),
    );
  }

  function resolveEnrichment(
    field: BillEnrichmentField,
    resolution: BillEnrichmentResolution,
  ) {
    return patchRow(
      {
        action: "resolve_enrichment",
        resolutions: { [field]: resolution },
      },
      t("Failed to save enrichment choices", "补齐选择保存失败"),
    );
  }

  const enrichment = item.enrichmentData;
  const enrichmentFieldLabels: Record<BillEnrichmentField, string> = {
    merchantName: t("Merchant", "商户"),
    description: t("Item description", "商品描述"),
    paymentMethod: t("Payment method", "支付方式"),
    categoryId: t("Category", "分类"),
  };

  return (
    <article className={cn("border-t-2 border-divider px-4 py-4 first:border-t-0 sm:px-5", item.validationErrors.length > 0 && "bg-tint-sky/40")}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-extrabold text-subtle">{t(`Row ${item.rowNumber}`, `第 ${item.rowNumber} 行`)}</span>
            <StatusBadge item={item} />
            {data?.categoryName ? <span className={cn(statusPillBase, "bg-tint-sky text-foreground")}>{data.categoryName}</span> : null}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1.3fr_0.7fr_1fr] sm:items-center">
            <div className="min-w-0"><p className="truncate font-black text-foreground">{data?.merchantName ?? data?.description ?? t("Merchant needed", "待补充商户")}</p><p className="mt-1 truncate text-xs font-medium text-muted">{data?.description ?? t("No transaction description", "无交易说明")}</p></div>
            <div><p className="text-xs font-semibold text-subtle">{t("Amount", "金额")}</p><p className="mt-1 font-black tabular-nums text-foreground">{data?.amountMinor != null ? formatMoney(data.amountMinor, data.currency) : t("Needs correction", "待修正")}</p></div>
            <div><p className="text-xs font-semibold text-subtle">{t("Transaction time", "交易时间")}</p><p className="mt-1 text-sm font-bold text-foreground">{data?.transactionTime ? formatTransactionDate(data.transactionTime, true, locale) : t("Needs correction", "待修正")}</p></div>
          </div>

          {item.validationErrors.length || item.warnings.length ? (
            <div className="mt-3 space-y-1.5">
              {item.validationErrors.map((issue) => <p key={`${issue.field}-${issue.code}`} className="flex items-start gap-1.5 text-xs font-semibold text-danger"><XCircle className="mt-0.5 size-3.5 shrink-0" />{localizeServerMessage(issue.message, locale)}</p>)}
              {item.warnings.map((warning) => <p key={warning.code} className="flex items-start gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{localizeServerMessage(warning.message, locale)}</p>)}
            </div>
          ) : null}

          {data?.categorySuggestion ? (
            <AiCategorySuggestionNotice
              suggestion={data.categorySuggestion}
              pending={pending}
              className="mt-3 sm:flex-row sm:items-center sm:justify-between"
              actionClassName="sm:self-auto"
              onAdopt={adoptAiSuggestion}
            />
          ) : null}

          {enrichment?.status === "conflict" ? (
            <div className="mt-3 rounded-2xl border-2 border-divider bg-tint-amber p-3">
              <p className="text-sm font-black text-foreground">{t("Imported values differ from confirmed values. Choose each field", "账单内容与已确认的内容不同，请逐项选择")}</p>
              <div className="mt-3 space-y-3">
                {enrichment.conflicts.map((field) => (
                  <div key={field} className="grid gap-2 rounded-xl bg-surface p-3 sm:grid-cols-[7rem_1fr_1fr] sm:items-center">
                    <p className="text-xs font-extrabold text-muted">{enrichmentFieldLabels[field]}</p>
                    <Button type="button" variant={enrichment.resolutions[field] === "keep_current" ? "default" : "outline"} size="sm" disabled={pending} onClick={() => resolveEnrichment(field, "keep_current")}>
                      {t("Keep current:", "保留当前：")}{enrichment.current?.[field] ?? t("Empty", "空")}
                    </Button>
                    <Button type="button" variant={enrichment.resolutions[field] === "use_bill" ? "default" : "outline"} size="sm" disabled={pending} onClick={() => resolveEnrichment(field, "use_bill")}>
                      {t("Use statement:", "采用账单：")}{enrichment.proposed[field] ?? t("Empty", "空")}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : enrichment?.status === "ready" ? (
            <p className="mt-3 rounded-xl bg-tint-leaf px-3 py-2 text-xs font-bold text-foreground">
              {t("After confirming the batch:", "确认整批后将")}
              {enrichment.targetKind === "notification_capture"
                ? t("enrich and post the notification candidate", "补齐通知候选并入账")
                : t("append an amendment to the existing transaction", "为已有交易追加修改")}
              {t("; Amount, currency, and transaction time remain unchanged.", "；金额、币种和交易时间保持不变。")}
            </p>
          ) : null}

          <details className="mt-3 text-xs font-medium text-muted"><summary className="cursor-pointer font-bold hover:text-foreground">{t("View original row", "查看原始行")} <ChevronDown className="inline size-3" /></summary><dl className="mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-surface-muted p-3 sm:grid-cols-2">{Object.entries(item.rawData).filter((entry) => String(entry[1] ?? "").trim()).map(([key, value]) => <div key={key} className="flex min-w-0 gap-2"><dt className="shrink-0 text-subtle">{key}</dt><dd className="truncate text-foreground">{String(value)}</dd></div>)}</dl></details>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 lg:w-44 lg:justify-end">
          {!enrichment || enrichment.status === "ambiguous" ? <Button type="button" variant="outline" size="sm" onClick={() => setEditing((value) => !value)}><Pencil className="size-3.5" />{item.validationErrors.length ? t("Correct manually", "手动修正") : t("Edit", "编辑")}</Button> : null}
          {item.validationErrors.length ? (
            item.decision === "skip" ? (
              <Button type="button" variant="ghost" size="sm" disabled><SkipForward className="size-3.5" />{t("Selected to skip", "已选择跳过")}</Button>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide("skip")}><SkipForward className="size-3.5" />{t("Skip this item", "跳过此笔")}</Button>
            )
          ) : item.duplicateStatus === "duplicate" ? (
            <Button type="button" variant="ghost" size="sm" disabled>{t("Duplicate skipped", "已跳过重复")}</Button>
          ) : item.duplicateStatus === "possible_duplicate" ? (
            item.decision === "import_anyway" ? (
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide("skip")}>{t("Change to skip", "改为跳过")}</Button>
            ) : item.decision === "skip" ? (
              <Button type="button" variant="default" size="sm" disabled={pending} onClick={() => decide("import_anyway")}>{t("Change to import anyway", "改为仍然导入")}</Button>
            ) : (
              <><Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide("skip")}>{t("Skip", "跳过")}</Button><Button type="button" variant="default" size="sm" disabled={pending} onClick={() => decide("import_anyway")}>{t("Import anyway", "仍然导入")}</Button></>
            )
          ) : item.decision === "skip" ? (
            <Button type="button" variant="default" size="sm" disabled={pending} onClick={() => decide("import")}>{t("Change to import", "改为导入")}</Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => decide("skip")}>{t("Skip", "跳过")}</Button>
          )}
          {pending ? <LoaderCircle className="size-4 animate-spin text-subtle" /> : null}
          {error ? <p className="w-full text-right text-xs font-semibold text-danger">{error}</p> : null}
        </div>
      </div>
      {editing ? <ImportItemEditor batchId={batchId} item={item} categories={categories} onClose={() => setEditing(false)} /> : null}
    </article>
  );
}

export function ImportReviewList({
  batchId,
  items,
  categories,
  pagination,
}: {
  batchId: string;
  items: ReviewItem[];
  categories: CategoryOption[];
  pagination: {
    page: number;
    totalPages: number;
    totalCount: number;
    filter: "all" | "pending" | "errors";
  };
}) {
  const t = useT();
  const pageHref = (page: number) =>
    `?${pagination.filter === "all" ? "" : `filter=${pagination.filter}&`}page=${page}`;
  return (
    <div className="overflow-hidden rounded-[24px] border-2 border-divider bg-surface">
      <div className="flex items-center justify-between gap-3 border-b-2 border-divider bg-surface-muted px-4 py-3 sm:px-5">
        <p className="text-sm font-black text-foreground">{t("Transaction details", "交易明细")}</p>
        <p className="text-xs font-medium text-muted">{t(`Page ${pagination.page} / ${pagination.totalPages} · Total ${pagination.totalCount} rows`, `第 ${pagination.page} / ${pagination.totalPages} 页 · 共 ${pagination.totalCount} 行`)}</p>
      </div>
      {items.length === 0 ? <p className="px-4 py-10 text-center text-sm font-medium text-muted">{t("No records match the current filters", "当前筛选下没有记录")}</p> : null}
      {items.map((item) => <ReviewRow key={item.id} batchId={batchId} item={item} categories={categories} />)}
      {pagination.totalPages > 1 ? (
        <nav className="flex items-center justify-between border-t-2 border-divider px-4 py-3" aria-label={t("Import preview pagination", "导入预览分页")}>
          <Button asChild variant="outline" size="sm" className={cn(pagination.page <= 1 && "pointer-events-none opacity-50")}><Link href={pageHref(Math.max(1, pagination.page - 1))}>{t("Previous", "上一页")}</Link></Button>
          <Button asChild variant="outline" size="sm" className={cn(pagination.page >= pagination.totalPages && "pointer-events-none opacity-50")}><Link href={pageHref(Math.min(pagination.totalPages, pagination.page + 1))}>{t("Next", "下一页")}</Link></Button>
        </nav>
      ) : null}
    </div>
  );
}

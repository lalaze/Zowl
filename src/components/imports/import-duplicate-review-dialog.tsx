"use client";

import {
  AlertTriangle,
  CircleHelp,
  ExternalLink,
  LoaderCircle,
  Pencil,
  SkipForward,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Owl } from "@/components/brand/owl";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Button } from "@/components/ui/button";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { formatMoney } from "@/lib/money";
import {
  formatTransactionDate,
  transactionSourceLabel,
  transactionTypeLabel,
} from "@/lib/transaction-display";
import { cn } from "@/lib/utils";
import type { NormalizedImportTransaction } from "@/services/import-service/types";
import type { TransactionView } from "@/types/transaction";

import {
  ImportItemEditor,
  type CategoryOption,
  type ReviewItem,
} from "./import-item-editor";
import { patchImportItem } from "./import-review-api";
import {
  ImportReviewDialogShell,
  useImportReviewDialog,
} from "./import-review-dialog-shell";

export type DuplicateMatchTransaction = Pick<
  TransactionView,
  | "id"
  | "type"
  | "amountMinor"
  | "currency"
  | "merchantName"
  | "description"
  | "transactionTime"
  | "source"
  | "paymentMethod"
>;

type ComparableTransaction = {
  type: NormalizedImportTransaction["type"];
  amountMinor: number | null;
  currency: string;
  merchantName: string | null;
  description: string | null;
  transactionTime: string | null;
  source: TransactionView["source"];
  paymentMethod: string | null;
};

function ComparisonCard({
  label,
  description,
  data,
  transactionId,
  tone,
}: {
  label: string;
  description: string;
  data: ComparableTransaction | null;
  transactionId?: string;
  tone: "current" | "matched";
}) {
  const t = useT();
  const locale = useLocale();
  return (
    <section
      className={cn(
        "rounded-2xl border-2 border-divider p-4",
        tone === "current" ? "bg-tint-berry" : "bg-tint-amber",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p
            className={cn(
              "text-xs font-extrabold uppercase tracking-wide",
              tone === "current" ? "text-accent-text" : "text-amber-800 dark:text-amber-300",
            )}
          >
            {label}
          </p>
          <p className="mt-1 text-xs font-medium text-muted">{description}</p>
        </div>
        {data ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            <span className="inline-flex items-center rounded-full border-2 border-divider bg-surface px-2 py-0.5 text-[10px] font-extrabold text-foreground">{transactionSourceLabel(data.source, locale)}</span>
            {data.type ? <span className="inline-flex items-center rounded-full border-2 border-divider bg-surface px-2 py-0.5 text-[10px] font-extrabold text-foreground">{transactionTypeLabel(data.type, locale)}</span> : null}
          </div>
        ) : null}
      </div>

      {data ? (
        <div className="mt-4 space-y-3">
          <div>
            <p className="truncate font-black text-foreground">
              {data.merchantName ?? data.description ?? t("No counterparty provided", "未填写交易对方")}
            </p>
            <p className="mt-1 truncate text-xs font-medium text-muted">
              {data.description ?? t("No transaction description", "无交易说明")}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs font-semibold text-subtle">{t("Amount", "金额")}</dt>
              <dd className="mt-1 font-black tabular-nums text-foreground">
                {data.amountMinor != null
                  ? formatMoney(data.amountMinor, data.currency)
                  : t("Incomplete", "待补充")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-subtle">{t("Transaction time", "交易时间")}</dt>
              <dd className="mt-1 font-bold text-foreground">
                {data.transactionTime
                  ? formatTransactionDate(data.transactionTime, true, locale)
                  : t("Incomplete", "待补充")}
              </dd>
            </div>
          </dl>
          {data.paymentMethod ? (
            <p className="text-xs font-medium text-muted">
              {t("Payment method:", "支付方式：")}<span className="font-semibold text-foreground">{data.paymentMethod}</span>
            </p>
          ) : null}
          {transactionId ? (
            <Button asChild variant="ghost" size="sm" className="-ml-3">
              <Link href={`/transactions/${transactionId}`} target="_blank">
                {t("View transaction details", "查看交易详情")} <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-surface/80 p-4 text-sm font-medium text-muted">
          {t(
            "No matching transaction is available to display. Decide using the match details above.",
            "没有可展示的匹配交易，请根据上方的重复依据作出选择。",
          )}
        </div>
      )}
    </section>
  );
}

export function ImportDuplicateReviewDialog({
  batchId,
  item,
  matchedItem,
  matchedTransaction,
  categories,
  remainingCount,
}: {
  batchId: string;
  item: ReviewItem | null;
  matchedItem: ReviewItem | null;
  matchedTransaction: DuplicateMatchTransaction | null;
  categories: CategoryOption[];
  remainingCount: number;
}) {
  const { close, router } = useImportReviewDialog(batchId, "reviewDuplicates");
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [pendingDecision, setPendingDecision] = useState<
    "skip" | "import_anyway" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "skip" | "import_anyway") {
    if (!item) return;
    setPendingDecision(decision);
    setError(null);
    try {
      const result = await patchImportItem(
        batchId,
        item.id,
        { action: "decision", decision },
        {
          fallback: t("Processing failed. Try again later", "处理失败，请稍后重试"),
          network: t(
            "Network connection failed. Try again later",
            "网络连接失败，请稍后重试",
          ),
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPendingDecision(null);
    }
  }

  function startEditing() {
    setEditorSession((session) => session + 1);
    setEditing(true);
  }

  const currentData = item?.normalizedData ?? null;
  const matchedData =
    matchedItem?.normalizedData ?? matchedTransaction ?? null;
  const duplicateReason = item?.warnings.find(
    (warning) => warning.code === "DUPLICATE_MATCH",
  )?.message;

  return (
    <ImportReviewDialogShell
      backdropLabel={t("Close duplicate review", "关闭重复核对")}
      titleId="import-duplicate-dialog-title"
      descriptionId="import-duplicate-dialog-description"
      badge={
        <span
          className={cn(
            "inline-flex items-center rounded-full border-2 border-divider px-2.5 py-0.5 text-[11px] font-extrabold",
            item
              ? "bg-tint-amber-strong text-foreground"
              : "bg-tint-leaf text-foreground",
          )}
        >
          {item
            ? t(
                `Remaining: ${remainingCount} transactions`,
                `还剩 ${remainingCount} 笔`,
              )
            : t("Review complete", "核对完成")}
        </span>
      }
      subtitle={t("Review possible duplicates", "逐笔核对疑似重复")}
      title={
        item
          ? t(
              `Row ${item.rowNumber} may be a duplicate`,
              `第 ${item.rowNumber} 行可能重复`,
            )
          : t("All possible duplicates resolved", "所有疑似重复均已处理")
      }
      description={
        item
          ? t(
              "Compare the transactions, then skip, edit, or import anyway.",
              "请对比两笔交易，选择跳过、修改或仍然导入。",
            )
          : t(
              "Return to review to continue checking or confirm the import.",
              "现在可以返回核对页，继续检查或确认导入。",
            )
      }
      onClose={close}
    >
      {!item ? (
        <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
          <div>
            <Owl className="mx-auto w-20" />
            <p className="mt-4 font-black text-foreground">
              {t("All possible duplicates reviewed", "疑似重复已逐笔核对完毕")}
            </p>
            <Button
              type="button"
              variant="default"
              className="mt-5"
              onClick={close}
            >
              {t("Back to transaction review", "返回交易核对")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="p-5 sm:p-6">
          <div className="rounded-2xl border-2 border-divider bg-tint-amber p-4">
            <p className="flex items-center gap-2 text-sm font-black text-foreground">
              <AlertTriangle className="size-4 text-amber-700 dark:text-amber-300" />
              {t("Reason for possible duplicate", "疑似重复依据")}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground/80">
              {duplicateReason
                ? localizeServerMessage(duplicateReason, locale)
                : t(
                    "Key fields in these transactions are very similar",
                    "两笔交易的关键字段高度相似",
                  )}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ComparisonCard
              label={t("Current import", "本次导入")}
              description={t(`File row ${item.rowNumber}`, `文件第 ${item.rowNumber} 行`)}
              data={currentData}
              tone="current"
            />
            <ComparisonCard
              label={t("Potential duplicate", "可能重复的交易")}
              description={
                matchedItem
                  ? t(
                      `Batch row ${matchedItem.rowNumber}`,
                      `本批次第 ${matchedItem.rowNumber} 行`,
                    )
                  : t("Existing ledger record", "账本中的已有记录")
              }
              data={matchedData}
              transactionId={matchedTransaction?.id}
              tone="matched"
            />
          </div>

          <div
            aria-hidden={!editing}
            inert={!editing}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-[360ms] ease-in-out motion-reduce:transition-none",
              editing
                ? "grid-rows-[1fr] opacity-100"
                : "pointer-events-none grid-rows-[0fr] opacity-0",
            )}
          >
            <div
              className={cn(
                "min-h-0 overflow-hidden transition-transform duration-[360ms] ease-in-out motion-reduce:transition-none",
                editing ? "translate-y-0" : "translate-y-3",
              )}
            >
              <ImportItemEditor
                key={`${item.id}-${editorSession}`}
                batchId={batchId}
                item={item}
                categories={categories}
                onClose={() => setEditing(false)}
              />
            </div>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-rose-600">{error}</p>
          ) : null}

          <div
            aria-hidden={editing}
            inert={editing}
            className={cn(
              "grid transition-[grid-template-rows,opacity] duration-[240ms] ease-in-out motion-reduce:transition-none",
              editing
                ? "pointer-events-none grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pendingDecision !== null}
                  onClick={() => decide("skip")}
                >
                  {pendingDecision === "skip" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <SkipForward className="size-4" />
                  )}
                  {pendingDecision === "skip"
                    ? t("Skipping…", "正在跳过…")
                    : t("Skip this item", "跳过此笔")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pendingDecision !== null}
                  onClick={startEditing}
                >
                  <Pencil className="size-4" />
                  {t("Edit manually", "手动修改")}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700"
                  disabled={pendingDecision !== null}
                  onClick={() => decide("import_anyway")}
                >
                  {pendingDecision === "import_anyway" ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <CircleHelp className="size-4" />
                  )}
                  {pendingDecision === "import_anyway"
                    ? t("Confirming…", "正在确认…")
                    : t("Import anyway", "仍然导入")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ImportReviewDialogShell>
  );
}

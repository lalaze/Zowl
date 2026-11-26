"use client";

import {
  AlertCircle,
  ChevronDown,
  LoaderCircle,
  Pencil,
  SkipForward,
} from "lucide-react";
import { useRef, useState } from "react";

import { Owl } from "@/components/brand/owl";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { formatMoney } from "@/lib/money";
import { formatTransactionDate } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

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

export function ImportErrorReviewDialog({
  batchId,
  item,
  categories,
  remainingCount,
}: {
  batchId: string;
  item: ReviewItem | null;
  categories: CategoryOption[];
  remainingCount: number;
}) {
  const { close, router } = useImportReviewDialog(batchId, "reviewErrors");
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRegionRef = useRef<HTMLDivElement>(null);

  async function skip() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const result = await patchImportItem(
        batchId,
        item.id,
        { action: "decision", decision: "skip" },
        {
          fallback: t("Failed to skip. Try again later", "跳过失败，请稍后重试"),
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
      setPending(false);
    }
  }

  function startEditing() {
    setEditorSession((session) => session + 1);
    setEditing(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        editorRegionRef.current?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "nearest",
        });
      });
    });
  }

  const data = item?.normalizedData;

  return (
    <ImportReviewDialogShell
      backdropLabel={t("Close error review", "关闭错误核对")}
      titleId="import-error-dialog-title"
      descriptionId="import-error-dialog-description"
      badge={
        <Badge variant={item ? "danger" : "success"}>
          {item
            ? t(
                `Remaining: ${remainingCount} transactions`,
                `还剩 ${remainingCount} 笔`,
              )
            : t("Review complete", "核对完成")}
        </Badge>
      }
      subtitle={t("Review parsing errors", "逐笔处理解析错误")}
      title={
        item
          ? t(
              `Row ${item.rowNumber} needs attention`,
              `第 ${item.rowNumber} 行需要处理`,
            )
          : t("All parsing errors resolved", "所有解析错误均已处理")
      }
      description={
        item
          ? t(
              "Correct the fields and import, or explicitly skip this item.",
              "请修正字段后导入，或明确跳过这一笔。",
            )
          : t(
              "Return to review to resolve duplicates or confirm the import.",
              "现在可以返回核对页，继续处理重复提示或确认导入。",
            )
      }
      onClose={close}
    >
      {!item ? (
        <div className="grid min-h-full place-items-center px-6 py-12 text-center">
          <div>
            <Owl className="mx-auto w-20" />
            <p className="mt-4 font-black text-foreground">
              {t("All error records reviewed", "错误记录已逐笔处理完毕")}
            </p>
            <Button type="button" className="mt-5" onClick={close}>
              {t("Back to transaction review", "返回交易核对")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-full flex-col p-5 sm:p-6">
          <div className="rounded-2xl border-2 border-divider bg-tint-sky p-4">
            <p className="flex items-center gap-2 text-sm font-black text-danger">
              <AlertCircle className="size-4" />
              {t("Parsing failure reason", "解析失败原因")}
            </p>
            <div className="mt-2 space-y-1.5">
              {item.validationErrors.map((issue) => (
                <p
                  key={`${issue.field}-${issue.code}`}
                  className="text-sm font-semibold text-danger"
                >
                  {localizeServerMessage(issue.message, locale)}
                </p>
              ))}
            </div>
          </div>

          <div className="mt-4 grid gap-3 rounded-2xl border-2 border-divider bg-tint-berry p-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold text-subtle">
                {t("Counterparty", "交易对方")}
              </p>
              <p className="mt-1 font-black text-foreground">
                {data?.merchantName ?? data?.description ?? t("Incomplete", "待补充")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-subtle">
                {t("Amount", "金额")}
              </p>
              <p className="mt-1 font-black tabular-nums text-foreground">
                {data?.amountMinor != null
                  ? formatMoney(data.amountMinor, data.currency)
                  : t("Needs correction", "待修正")}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-subtle">
                {t("Transaction time", "交易时间")}
              </p>
              <p className="mt-1 font-bold text-foreground">
                {data?.transactionTime
                  ? formatTransactionDate(data.transactionTime, true, locale)
                  : t("Needs correction", "待修正")}
              </p>
            </div>
          </div>

          <details className="mt-4 rounded-2xl border-2 border-divider bg-surface p-3 text-xs text-muted">
            <summary className="cursor-pointer font-extrabold text-foreground">
              {t("View original file row", "查看原始文件行")}{" "}
              <ChevronDown className="inline size-3" />
            </summary>
            <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-surface-muted p-3 sm:grid-cols-2">
              {Object.entries(item.rawData)
                .filter((entry) => String(entry[1] ?? "").trim())
                .map(([key, value]) => (
                  <div key={key} className="flex min-w-0 gap-2">
                    <dt className="shrink-0 text-subtle">{key}</dt>
                    <dd className="truncate font-semibold text-foreground">
                      {String(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>

          <div
            ref={editorRegionRef}
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
            <p className="mt-4 rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2 text-sm font-semibold text-danger">
              {error}
            </p>
          ) : null}

          <div
            aria-hidden={editing}
            inert={editing}
            className={cn(
              "mt-auto grid transition-[grid-template-rows,opacity] duration-[240ms] ease-in-out motion-reduce:transition-none",
              editing
                ? "pointer-events-none grid-rows-[0fr] opacity-0"
                : "grid-rows-[1fr] opacity-100",
            )}
          >
            <div className="min-h-0 overflow-hidden">
              <div className="flex flex-col-reverse gap-2 pt-6 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={skip}
                >
                  {pending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <SkipForward className="size-4" />
                  )}
                  {pending ? t("Skipping…", "正在跳过…") : t("Skip this item", "跳过此笔")}
                </Button>
                <Button type="button" onClick={startEditing}>
                  <Pencil className="size-4" />
                  {t("Edit manually", "手动修改")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ImportReviewDialogShell>
  );
}

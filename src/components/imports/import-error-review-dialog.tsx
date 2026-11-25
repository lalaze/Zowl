"use client";

import {
  AlertCircle,
  ChevronDown,
  LoaderCircle,
  Pencil,
  SkipForward,
  X,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Owl } from "@/components/brand/owl";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import {
  ImportItemEditor,
  type CategoryOption,
  type ReviewItem,
} from "@/components/imports/import-review-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { formatMoney } from "@/lib/money";
import { formatTransactionDate } from "@/lib/transaction-display";
import { cn } from "@/lib/utils";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useT();
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [editorSession, setEditorSession] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRegionRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("reviewErrors");
    const query = nextParams.toString();
    router.replace(
      `/imports/files/${batchId}/review${query ? `?${query}` : ""}`,
    );
  }, [batchId, router, searchParams]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close]);

  async function skip() {
    if (!item) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/imports/files/${batchId}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "decision", decision: "skip" }),
        },
      );
      const payload = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setError(payload.error?.message ?? t("Failed to skip. Try again later", "跳过失败，请稍后重试"));
        return;
      }
      router.refresh();
    } catch {
      setError(t("Network connection failed. Try again later", "网络连接失败，请稍后重试"));
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label={t("Close error review", "关闭错误核对")}
        className="absolute inset-0 bg-slate-950/55"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-error-dialog-title"
        aria-describedby="import-error-dialog-description"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[24px] border-2 border-divider bg-surface sm:max-w-3xl sm:rounded-[24px]"
      >
        <div className="z-10 flex shrink-0 items-start justify-between gap-4 border-b-2 border-divider bg-surface px-5 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={item ? "danger" : "success"}>
                {item
                  ? t(`Remaining: ${remainingCount} transactions`, `还剩 ${remainingCount} 笔`)
                  : t("Review complete", "核对完成")}
              </Badge>
              <span className="text-xs font-semibold text-subtle">
                {t("Review parsing errors", "逐笔处理解析错误")}
              </span>
            </div>
            <h2
              id="import-error-dialog-title"
              className="mt-2 text-xl font-black text-foreground"
            >
              {item
                ? t(`Row ${item.rowNumber} needs attention`, `第 ${item.rowNumber} 行需要处理`)
                : t("All parsing errors resolved", "所有解析错误均已处理")}
            </h2>
            <p
              id="import-error-dialog-description"
              className="mt-1 text-sm font-medium text-muted"
            >
              {item
                ? t(
                    "Correct the fields and import, or explicitly skip this item.",
                    "请修正字段后导入，或明确跳过这一笔。",
                  )
                : t(
                    "Return to review to resolve duplicates or confirm the import.",
                    "现在可以返回核对页，继续处理重复提示或确认导入。",
                  )}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Close", "关闭")}
            onClick={close}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth">
          {!item ? (
            <div className="grid min-h-full place-items-center px-6 py-12 text-center">
              <div>
                <Owl className="mx-auto w-20" />
                <p className="mt-4 font-black text-foreground">
                  {t("All error records reviewed", "错误记录已逐笔处理完毕")}
                </p>
                <Button
                  type="button"
                  className="mt-5"
                  onClick={close}
                >
                  {t("Back to transaction review", "返回交易核对")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex min-h-full flex-col p-5 sm:p-6">
              <div className="rounded-2xl border-2 border-divider bg-tint-sky p-4">
                <p className="flex items-center gap-2 text-sm font-black text-danger">
                  <AlertCircle className="size-4" />{t("Parsing failure reason", "解析失败原因")}
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
                  <p className="text-xs font-semibold text-subtle">{t("Counterparty", "交易对方")}</p>
                  <p className="mt-1 font-black text-foreground">
                    {data?.merchantName ?? data?.description ?? t("Incomplete", "待补充")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">{t("Amount", "金额")}</p>
                  <p className="mt-1 font-black tabular-nums text-foreground">
                    {data?.amountMinor != null
                      ? formatMoney(data.amountMinor, data.currency)
                      : t("Needs correction", "待修正")}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-subtle">{t("Transaction time", "交易时间")}</p>
                  <p className="mt-1 font-bold text-foreground">
                    {data?.transactionTime
                      ? formatTransactionDate(data.transactionTime, true, locale)
                      : t("Needs correction", "待修正")}
                  </p>
                </div>
              </div>

              <details className="mt-4 rounded-2xl border-2 border-divider bg-surface p-3 text-xs text-muted">
                <summary className="cursor-pointer font-extrabold text-foreground">
                  {t("View original file row", "查看原始文件行")} <ChevronDown className="inline size-3" />
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
                <p className="mt-4 rounded-2xl border-2 border-divider bg-tint-berry px-3 py-2 text-sm font-semibold text-danger">{error}</p>
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
                    <Button
                      type="button"
                      onClick={startEditing}
                    >
                      <Pencil className="size-4" />{t("Edit manually", "手动修改")}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

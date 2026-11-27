"use client";

import type { TransactionView } from "@/types/transaction";

import { CheckCircle2, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import {
  QuickScreenshotEntry,
  type QuickScreenshotCompletedResult,
  type QuickScreenshotProviderInfo,
} from "@/components/transactions/quick-screenshot-entry";
import {
  TransactionForm,
  type TransactionCategoryOption,
} from "@/components/transactions/transaction-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Kept from the zeMoney name: renaming it would reset existing users' preferred entry mode.
const entryModeStorageKey = "zemoney-entry-mode";

function isInteractiveTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      Boolean(
        target.closest(
          "a, button, input, select, textarea, [contenteditable='true'], [role='combobox'], [role='textbox']",
        ),
      ))
  );
}

export function QuickTransactionEntry({
  categories,
  recentTransactions,
  recognitionProvider,
  triggerClassName,
  triggerLayout = "inline",
}: {
  categories: TransactionCategoryOption[];
  recentTransactions?: TransactionView[];
  recognitionProvider: QuickScreenshotProviderInfo;
  triggerClassName?: string;
  /** badge 模式用于首页快捷操作宫格：彩色图标徽章 + 下方文字 */
  triggerLayout?: "inline" | "badge";
}) {
  const router = useRouter();
  const t = useT();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entryMode, setEntryMode] = useState<"manual" | "screenshot">(
    "manual",
  );
  const [dirty, setDirty] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [success, setSuccess] = useState<{
    message: string;
    href: string;
    linkLabel: string;
  } | null>(null);

  const restoreTriggerFocus = useCallback(() => {
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openDialog = useCallback(() => {
    if (submitting) return;
    setSuccess(null);
    const preferred = window.localStorage.getItem(entryModeStorageKey);
    setEntryMode(preferred === "screenshot" && !["mock", "unavailable"].includes(recognitionProvider.id) ? "screenshot" : "manual");
    setDirty(false);
    setDiscardPrompt(false);
    setOpen(true);
  }, [submitting, recognitionProvider.id]);

  const closeDialog = useCallback(() => {
    if (submitting) return;
    if (dirty) { setDiscardPrompt(true); return; }
    setOpen(false);
    restoreTriggerFocus();
  }, [dirty, restoreTriggerFocus, submitting]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();

    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);

  useEffect(() => {
    if (!open || entryMode !== "manual") return;
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLInputElement>("#amount")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [entryMode, open]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (
        open ||
        event.defaultPrevented ||
        event.repeat ||
        event.key.toLowerCase() !== "n" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isInteractiveTarget(event.target) ||
        !window.matchMedia("(min-width: 1024px)").matches
      ) {
        return;
      }

      event.preventDefault();
      openDialog();
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open, openDialog]);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(null), 6_000);
    return () => window.clearTimeout(timeout);
  }, [success]);

  function handleCreated(transactionId: string) {
    setSubmitting(false);
    setOpen(false);
    setSuccess({
      message: t("Transaction posted", "这笔交易已入账"),
      href: `/transactions/${transactionId}`,
      linkLabel: t("View details", "查看详情"),
    });
    router.refresh();
    restoreTriggerFocus();
  }

  function handleScreenshotCompleted(result: QuickScreenshotCompletedResult) {
    setSubmitting(false);
    setOpen(false);
    const transactionId = result.transactionIds[0];
    setSuccess(
      transactionId
        ? {
            message: t("Screenshot recognized and posted automatically", "截图已识别并自动入账"),
            href: `/transactions/${transactionId}`,
            linkLabel: t("View details", "查看详情"),
          }
        : {
            message: t("Matched an existing transaction; no duplicate posted", "已识别为已有交易，没有重复入账"),
            href: `/imports/screenshots/${result.jobId}/result`,
            linkLabel: t("View result", "查看结果"),
          },
    );
    router.refresh();
    restoreTriggerFocus();
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="default"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-keyshortcuts="N"
        className={triggerClassName}
        title={t("Quick entry (N)", "快捷记账（N）")}
        onClick={openDialog}
      >
        {triggerLayout === "badge" ? (
          <>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl border-2 border-divider bg-tint-amber text-foreground">
              <SquarePen className="size-5" />
            </span>
            {t("Add transaction", "记一笔")}
          </>
        ) : (
          <>
            <SquarePen className="size-4" />
            {t("Add transaction", "记一笔")}
            <kbd
              aria-hidden="true"
              className="ml-1 hidden rounded border border-white/30 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white/80 lg:inline"
            >
              N
            </kbd>
          </>
        )}
      </Button>

      {open ? (
        <dialog
          ref={dialogRef}
          aria-labelledby="quick-transaction-title"
          aria-describedby="quick-transaction-description"
          className="fixed inset-0 m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-[28px] border-2 border-divider bg-surface-raised p-0 text-foreground backdrop:bg-slate-950/55 sm:m-auto sm:max-w-xl sm:rounded-[28px]"
          onCancel={(event) => {
            event.preventDefault();
            closeDialog();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div className="flex max-h-[92dvh] flex-col">
            <header className="flex shrink-0 items-start justify-between gap-4 border-b-2 border-divider px-5 py-4 sm:px-6">
              <div>
                <h2
                  id="quick-transaction-title"
                  className="text-xl font-black tracking-tight text-foreground"
                >
                  {t("Quick entry", "快捷记账")}
                </h2>
                <p
                  id="quick-transaction-description"
                  className="mt-1 text-sm text-muted"
                >
                  {t(
                    "Enter details manually, or add a screenshot for AI automatic posting",
                    "手动快速填写，或放入截图让 AI 自动记账",
                  )}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("Close quick entry", "关闭快捷记账")}
                disabled={submitting}
                onClick={closeDialog}
              >
                <X className="size-4" />
              </Button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6 sm:py-6">
              <div
                role="tablist"
                aria-label={t("Quick entry method", "快捷记账方式")}
                className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border-2 border-divider bg-surface-strong p-1"
              >
                {[
                  ["manual", t("Manual entry", "手动记账")],
                  ["screenshot", t("Automatic screenshot entry", "截图自动记账")],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={entryMode === value}
                    disabled={submitting}
                    className={cn(
                      "h-10 rounded-xl border-2 text-sm font-bold transition",
                      entryMode === value
                        ? "border-divider bg-tint-amber text-foreground"
                        : "border-transparent text-muted hover:text-foreground",
                    )}
                    onClick={() => {
                      setEntryMode(value as "manual" | "screenshot");
                      window.localStorage.setItem(entryModeStorageKey, value);
                      if (value === "manual") window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLInputElement>("#amount")?.focus());
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div hidden={entryMode !== "manual"}>
                <TransactionForm
                  mode="create"
                  layout="quick"
                  categories={categories}
                  recentTransactions={recentTransactions}
                  onCancel={closeDialog}
                  onCreated={handleCreated}
                  onSubmittingChange={setSubmitting}
                  onDirtyChange={setDirty}
                />
              </div>
              <div hidden={entryMode !== "screenshot"}>
                <QuickScreenshotEntry
                  active={entryMode === "screenshot"}
                  provider={recognitionProvider}
                  onCompleted={handleScreenshotCompleted}
                  onPendingChange={setSubmitting}
                />
              </div>
              {discardPrompt ? <div role="alert" className="mt-4 space-y-2 rounded-xl border p-3">
                <p>{t("Discard your unfinished transaction?", "放弃这笔未完成的交易？")}</p>
                <Button type="button" variant="outline" onClick={() => setDiscardPrompt(false)}>{t("Keep editing", "继续编辑")}</Button>
                <Button type="button" onClick={() => { setOpen(false); restoreTriggerFocus(); }}>{t("Discard draft", "放弃草稿")}</Button>
              </div> : null}
            </div>
          </div>
        </dialog>
      ) : null}

      {success ? (
        <div
          role="status"
          className="fixed bottom-24 left-4 right-4 z-[70] flex items-center gap-3 rounded-2xl border-2 border-divider bg-tint-leaf px-4 py-3 text-sm text-foreground lg:bottom-6 lg:left-auto lg:right-6 lg:w-auto lg:min-w-80"
        >
          <CheckCircle2 className="size-5 shrink-0 text-income" />
          <span className="min-w-0 flex-1 font-semibold">
            {success.message}
          </span>
          <Link
            href={success.href}
            className="shrink-0 font-extrabold text-accent-text underline underline-offset-4 hover:text-foreground"
          >
            {success.linkLabel}
          </Link>
          <button
            type="button"
            aria-label={t("Dismiss posting confirmation", "关闭入账成功提示")}
            className="grid size-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface"
            onClick={() => setSuccess(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}

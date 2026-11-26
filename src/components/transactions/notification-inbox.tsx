"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { decimalToMinor } from "@/lib/money";
import { Owl } from "@/components/brand/owl";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiRequestError, requestApi } from "@/lib/client-api";
import { localeTag } from "@/lib/i18n/locale";
import { transactionSourceLabel } from "@/lib/transaction-display";
import type { notificationCaptureService } from "@/services/notification-capture-service";

type Page = ReturnType<typeof notificationCaptureService.list>;
type Item = Page["items"][number];
const money = (item: Item) => `${item.currency} ${(item.amountMinor / 100).toFixed(2)}`;

export function NotificationInbox({ initialPage, categories }: { initialPage: Page; categories: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  // English shows the raw platform key as before; Chinese shows its name.
  const platformName = (platform: Item["platform"]) =>
    locale === "zh" ? transactionSourceLabel(platform, locale) : platform;
  const dateTime = (value: string) => new Date(value).toLocaleString(localeTag(locale));
  const [page, setPage] = useState(initialPage);
  const [history, setHistory] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Item | null>(null);
  const [review, setReview] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const formatError = (caught: unknown) =>
    caught instanceof ApiRequestError
      ? `Error: ${caught.message}`
      : String(caught);
  async function load(number = page.pagination.page, completed = history) {
    const next = await requestApi<Page>(
      `/api/captures/notifications?page=${number}&status=${completed ? "completed" : "reviewing"}`,
      {
        fallbackError: t("Could not refresh inbox", "无法刷新收件箱"),
        requireData: true,
      },
    );
    if (number > next.pagination.totalPages) return load(next.pagination.totalPages, completed);
    setPage(next); setSelected(new Set()); setHistory(completed);
  }
  async function navigate(number: number, completed = history) {
    setBusy(true); setError(null);
    try { await load(number, completed); } catch (error) { setError(formatError(error)); } finally { setBusy(false); }
  }
  async function confirm(items: Item[], decision = "post") {
    setBusy(true); setError(null); setMessage(null);
    try {
      const single = items[0]!;
      const batch = decision === "post" && items.every((item) => item.duplicateStatus === "unique");
      await requestApi(!batch ? `/api/captures/notifications/${single.id}/confirm` : "/api/captures/notifications/confirm", {
        method: "POST",
        json: !batch ? { decision, assessmentDigest: single.duplicateStatus === "possible_duplicate" ? single.duplicateAssessmentDigest : undefined } : { items: items.map((item) => ({ id: item.id, version: item.confirmationVersion })) },
        fallbackError: t("Review changed candidates individually before posting", "候选已变化，请逐条核对后再入账"),
      });
      setReview(null);
      setMessage(
        decision === "skip"
          ? t("Skipped", "已跳过")
          : single.duplicateStatus === "duplicate" && items.length === 1
            ? t("Linked to existing transaction; no new posting", "已关联到已有交易，没有新入账")
            : t("Posting confirmed", "已确认入账"),
      );
      router.refresh();
    } catch (error) { setReview(null); setError(formatError(error)); }
    finally {
      try { await load(); } catch { setError(t("Result may be complete. Refresh the inbox to check before retrying.", "操作可能已完成。请先刷新收件箱确认，再决定是否重试。")); }
      setBusy(false);
    }
  }
  async function saveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(null);
    try {
      await requestApi(`/api/captures/notifications/${editing.id}`, {
        method: "PATCH",
        json: { amountMinor: decimalToMinor(String(form.get("amount")), editing.currency),
          merchantName: form.get("merchantName") || null, categoryId: form.get("categoryId") || null,
          transactionTime: new Date(String(form.get("transactionTime"))).toISOString(),
          description: editing.description, paymentMethod: editing.paymentMethod },
        fallbackError: t("Could not update candidate", "无法更新候选"),
      });
      setEditing(null); await load();
    } catch (error) { setError(formatError(error)); } finally { setBusy(false); }
  }
  const categoryName = (id: string | null) =>
    categories.find((category) => category.id === id)?.name ?? t("Uncategorized", "未分类");
  const fieldClass =
    "mt-1.5 h-11 w-full rounded-2xl border-2 border-divider bg-surface-muted px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:bg-surface";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-base font-black text-foreground">
          {history
            ? t("Recently processed", "最近处理")
            : t(
                `${page.pendingCount} payment ${page.pendingCount === 1 ? "notification" : "notifications"} awaiting review`,
                `${page.pendingCount} 条支付通知待核对`,
              )}
        </h2>
        <Button
          disabled={busy}
          onClick={() => void navigate(1, !history)}
          size="sm"
          variant="outline"
        >
          {history ? t("Pending", "待处理") : t("Recently processed", "最近处理")}
        </Button>
        <Button
          disabled={busy}
          onClick={() => void navigate(page.pagination.page)}
          size="sm"
          variant="outline"
        >
          {t("Refresh", "刷新")}
        </Button>
      </div>
      {error ? (
        <p
          className="rounded-2xl bg-tint-berry px-4 py-3 text-sm font-bold text-danger"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {message ? (
        <p
          className="rounded-2xl bg-tint-leaf px-4 py-3 text-sm font-bold text-income"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {selected.size ? (
        <Button
          disabled={busy}
          onClick={() =>
            setReview(page.items.filter((item) => selected.has(item.id)))
          }
        >
          {t(`Review ${selected.size} selected`, `核对所选 ${selected.size} 条`)}
        </Button>
      ) : null}
      {editing ? (
        <Card className="border-2 border-divider p-5">
          <form className="space-y-3" onSubmit={(event) => void saveEdit(event)}>
            <h3 className="font-black text-foreground">{t("Edit candidate", "编辑候选")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-bold text-muted">
                {t(`Amount (${editing.currency})`, `金额（${editing.currency}）`)}
                <input
                  className={fieldClass}
                  defaultValue={(editing.amountMinor / 100).toFixed(2)}
                  inputMode="decimal"
                  name="amount"
                  required
                />
              </label>
              <label className="block text-sm font-bold text-muted">
                {t("Merchant", "商户")}
                <input
                  className={fieldClass}
                  defaultValue={editing.merchantName ?? ""}
                  maxLength={120}
                  name="merchantName"
                />
              </label>
              <label className="block text-sm font-bold text-muted">
                {t("Category", "分类")}
                <select
                  className={fieldClass}
                  defaultValue={editing.categoryId ?? ""}
                  name="categoryId"
                >
                  <option value="">{t("Uncategorized", "未分类")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-bold text-muted">
                {t("Transaction time", "交易时间")}
                <input
                  className={fieldClass}
                  defaultValue={new Date(
                    new Date(editing.transactionTime).getTime() -
                      new Date(editing.transactionTime).getTimezoneOffset() *
                        60000,
                  )
                    .toISOString()
                    .slice(0, 16)}
                  name="transactionTime"
                  required
                  type="datetime-local"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} type="submit">
                {t("Save and recheck", "保存并重新检查")}
              </Button>
              <Button
                disabled={busy}
                onClick={() => setEditing(null)}
                type="button"
                variant="outline"
              >
                {t("Cancel edit", "取消编辑")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
      {review ? (
        <section
          aria-label={t("Confirm reviewed transactions", "确认核对后的交易")}
          className="space-y-3 rounded-[28px] border-2 border-primary bg-tint-amber p-5"
          role="region"
        >
          <h3 className="font-black text-foreground">{t("Check before posting", "入账前请核对")}</h3>
          {review.map((item) => (
            <div
              className="space-y-1 rounded-2xl bg-surface px-4 py-3 text-sm"
              key={item.id}
            >
              <p className="font-bold text-foreground">
                {item.merchantName || platformName(item.platform)} · {money(item)} ·{" "}
                {dateTime(item.transactionTime)}
              </p>
              {item.duplicateTransactionId ? (
                <Link
                  className="font-extrabold text-accent-text underline-offset-4 hover:underline"
                  href={`/transactions/${item.duplicateTransactionId}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("Compare with matching transaction", "与相似交易对比")}
                </Link>
              ) : null}
              {item.duplicateStatus === "possible_duplicate" ? (
                <p className="font-semibold text-muted">
                  {t(
                    "A bank debit and payment notice may describe the same purchase. Post only if these are separate transactions.",
                    "一笔银行扣款和一条支付通知可能是同一笔消费。只有确认是两笔不同的交易时才入账。",
                  )}
                </p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void confirm(review)}>
              {review.some((item) => item.duplicateStatus === "possible_duplicate")
                ? t("Post anyway", "仍然入账")
                : t("Confirm and post", "确认入账")}
            </Button>
            <Button
              disabled={busy}
              onClick={() => setReview(null)}
              variant="outline"
            >
              {t("Keep reviewing", "继续核对")}
            </Button>
          </div>
        </section>
      ) : null}
      {page.items.length === 0 ? (
        <Card className="flex items-center gap-4 border-2 border-dashed border-divider p-5">
          <Owl className="w-12 shrink-0" />
          <p className="text-sm font-semibold text-muted">
            {history
              ? t("No processed payment notifications.", "没有已处理的支付通知。")
              : t("No pending payment notifications.", "没有待处理的支付通知。")}
          </p>
        </Card>
      ) : null}
      {page.items.map((item) => (
        <Card className="space-y-3 p-5" key={item.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-black text-foreground">
                {item.merchantName || platformName(item.platform)} · {money(item)}
              </h3>
              <p className="mt-1 text-xs font-semibold text-muted">
                {dateTime(item.transactionTime)} ·{" "}
                {platformName(item.platform)} · {categoryName(item.categoryId)}
              </p>
            </div>
            {item.status === "completed" ? (
              <Badge variant={item.resultTransactionId ? "success" : "default"}>
                {item.resultCode === "AUTO_POSTED"
                  ? t("Automatically posted", "已自动入账")
                  : item.resultCode === "SKIPPED_DUPLICATE"
                    ? t("Linked to existing transaction", "已关联已有交易")
                    : item.resultTransactionId
                      ? t("Posted", "已入账")
                      : t("Skipped", "已跳过")}
              </Badge>
            ) : (
              <Badge
                variant={
                  item.duplicateStatus === "unique" ? "info" : "warning"
                }
              >
                {item.duplicateStatus === "possible_duplicate"
                  ? t("Possible duplicate — compare before posting", "疑似重复，请对比后再入账")
                  : item.duplicateStatus === "duplicate"
                    ? t("Already recorded — confirmation links the existing transaction", "已记录过，确认后会关联到已有交易")
                    : t("Ready for review", "待核对")}
              </Badge>
            )}
          </div>
          {item.status === "completed" ? (
            item.resultTransactionId || item.duplicateTransactionId ? (
              <Link
                className="inline-block text-sm font-extrabold text-accent-text underline-offset-4 hover:underline"
                href={`/transactions/${item.resultTransactionId || item.duplicateTransactionId}`}
              >
                {t("View, amend or void transaction", "查看、修改或作废交易")}
              </Link>
            ) : null
          ) : (
            <>
              {item.duplicateStatus === "unique" ? (
                <label className="flex items-center gap-2 text-sm font-semibold text-muted">
                  <input
                    checked={selected.has(item.id)}
                    className="size-4 accent-[var(--primary)]"
                    disabled={busy}
                    onChange={(event) =>
                      setSelected((previous) => {
                        const next = new Set(previous);
                        if (event.target.checked) next.add(item.id);
                        else next.delete(item.id);
                        return next;
                      })
                    }
                    type="checkbox"
                  />
                  {t("Select for batch review", "选中以批量核对")}
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() => {
                    setReview(null);
                    setEditing(item);
                  }}
                  size="sm"
                  variant="outline"
                >
                  {t("Edit", "编辑")}
                </Button>
                <Button
                  disabled={busy || editing !== null}
                  onClick={() => setReview([item])}
                  size="sm"
                >
                  {t("Review and post", "核对并入账")}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => void confirm([item], "skip")}
                  size="sm"
                  variant="outline"
                >
                  {t("Skip", "跳过")}
                </Button>
              </div>
            </>
          )}
        </Card>
      ))}
      {page.pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <Button
            disabled={busy || page.pagination.page <= 1}
            onClick={() => void navigate(page.pagination.page - 1)}
            size="sm"
            variant="outline"
          >
            {t("Previous", "上一页")}
          </Button>
          <span className="text-sm font-bold text-muted">
            {t(
              `Page ${page.pagination.page} of ${page.pagination.totalPages}`,
              `第 ${page.pagination.page} / ${page.pagination.totalPages} 页`,
            )}
          </span>
          <Button
            disabled={busy || page.pagination.page >= page.pagination.totalPages}
            onClick={() => void navigate(page.pagination.page + 1)}
            size="sm"
            variant="outline"
          >
            {t("Next", "下一页")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

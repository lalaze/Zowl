"use client";

import { createOperationId } from "@/lib/operation-id";

import { LoaderCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { Owl } from "@/components/brand/owl";
import { CategoryGlyph } from "@/components/categories/category-glyph";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { TransactionTypeBadge } from "@/components/transactions/transaction-type-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { localeTag, type Locale } from "@/lib/i18n/locale";
import { formatMoney, formatSignedMoney } from "@/lib/money";
import { transactionTitle } from "@/lib/order-details";
import {
  formatTransactionDate,
  isIncoming,
} from "@/lib/transaction-display";
import { cn } from "@/lib/utils";
import type { TransactionView } from "@/types/transaction";

/** Daily group date format: transactions are descending by time, with consecutive entries on the same day grouped together */
function dayLabelFormatter(locale: Locale) {
  return new Intl.DateTimeFormat(localeTag(locale), {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** Whichever of merchant and description the title does not already show. */
function secondaryText(item: TransactionView) {
  const title = transactionTitle(item);
  const other = title === item.description ? item.merchantName : item.description;
  return other && other !== title ? other : null;
}

/** Transaction icon badge tint: income/refund leaf, transfer amber, expense berry */
function badgeBackground(type: TransactionView["type"]) {
  if (isIncoming(type)) return "bg-tint-leaf";
  if (type === "transfer") return "bg-tint-amber";
  return "bg-tint-berry";
}

export function TransactionList({
  items,
  totalCount,
  filtered = false,
}: {
  items: TransactionView[];
  totalCount: number;
  filtered?: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const locale = useLocale();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voidOperationRef = useRef<{ key: string; id: string } | null>(null);
  const allSelected = useMemo(
    () => items.length > 0 && selected.size === items.length,
    [items.length, selected.size],
  );
  const dayGroups = useMemo(() => {
    type DayGroup = {
      key: string;
      label: string;
      items: TransactionView[];
      expenseMinor: number;
      incomeMinor: number;
      hasForeignCurrency: boolean;
    };
    const dayKey = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const now = new Date();
    const todayKey = dayKey(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayKey = dayKey(yesterday);

    const dayFormatter = dayLabelFormatter(locale);
    const groups: DayGroup[] = [];
    for (const item of items) {
      const date = new Date(item.transactionTime);
      const key = dayKey(date);
      let group = groups[groups.length - 1];
      if (group?.key !== key) {
        const baseLabel = dayFormatter.format(date);
        const prefix =
          key === todayKey
            ? t("Today · ", "今天 · ")
            : key === yesterdayKey
              ? t("Yesterday · ", "昨天 · ")
              : "";
        group = {
          key,
          label: `${prefix}${baseLabel}`,
          items: [],
          expenseMinor: 0,
          incomeMinor: 0,
          hasForeignCurrency: false,
        };
        groups.push(group);
      }
      group.items.push(item);
      // 小计只汇总 CNY，避免多币种直接相加产生误导（与统计口径一致）
      if (item.currency === "CNY") {
        if (isIncoming(item.type)) group.incomeMinor += item.amountMinor;
        else if (item.type !== "transfer") group.expenseMinor += item.amountMinor;
      } else {
        group.hasForeignCurrency = true;
      }
    }
    return groups;
  }, [items, locale, t]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkVoid() {
    if (!selected.size) return;
    if (!window.confirm(
          t(
            `Void the selected ${selected.size} transactions?`,
            `确定作废选中的 ${selected.size} 笔交易？`,
          ),
        )) return;

    const targets = items
      .filter((item) => selected.has(item.id))
      .map((item) => ({
        transactionId: item.id,
        expectedRevisionId: item.currentRevisionId,
      }));
    if (
      targets.length !== selected.size ||
      targets.some((target) => !target.expectedRevisionId)
    ) {
      setError(t("Selected transaction revisions changed. Refresh and try again", "所选交易的版本已变化，请刷新后重试"));
      return;
    }
    const commandTargets = targets as Array<{
      transactionId: string;
      expectedRevisionId: string;
    }>;
    const operationKey = JSON.stringify(commandTargets);
    if (voidOperationRef.current?.key !== operationKey) {
      voidOperationRef.current = { key: operationKey, id: createOperationId() };
    }

    try {
      setPending(true);
      setError(null);
      const response = await fetch("/api/transactions/bulk-delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operationId: voidOperationRef.current.id,
          targets: commandTargets,
        }),
      });
      const payload = (await response.json()) as {
        data?: { status?: string };
        error?: { message?: string };
      };

      if (!response.ok) {
        if (response.status === 409 && payload.data?.status === "revision_conflict") {
          setError(t("Some transactions changed. None were voided; refresh and try again", "部分交易已更新，本次未作废任何交易；请刷新后重试"));
          router.refresh();
        } else {
          setError(payload.error?.message ?? t("Bulk void failed. Try again later", "批量作废失败，请稍后重试"));
        }
        return;
      }

      voidOperationRef.current = null;
      setSelected(new Set());
      router.refresh();
    } catch {
      setError(t("Network connection failed. Try again later", "网络连接失败，请稍后重试"));
    } finally {
      setPending(false);
    }
  }

  if (!items.length) {
    return (
      <div className="grid min-h-80 place-items-center rounded-[24px] border-2 border-dashed border-divider bg-surface p-8 text-center">
        <div>
          <Owl className="mx-auto w-16" />
          <h2 className="mt-4 font-black text-foreground">
            {filtered
              ? t("No matching transactions", "没有符合条件的交易")
              : t("No transactions yet", "还没有交易")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {filtered
              ? t(
                  "Try different filters or clear them to view all transactions.",
                  "换一组筛选条件，或清除筛选查看全部交易。",
                )
              : t(
                  "Add your first transaction manually, then try bulk import.",
                  "先手动记一笔，之后也可以批量导入。",
                )}
          </p>
          <Button asChild className="mt-5">
            <Link href={filtered ? "/transactions" : "/transactions/new"}>
              {filtered ? t("Clear filters", "清除筛选") : t("Add first transaction", "记第一笔")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-[20px] border-2 border-divider bg-surface px-4 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allSelected}
            onChange={() =>
              setSelected(allSelected ? new Set() : new Set(items.map((item) => item.id)))
            }
          />
          {selected.size
            ? t(`Selected ${selected.size} transactions`, `已选 ${selected.size} 笔`)
            : t(`Total ${totalCount} transactions`, `共 ${totalCount} 笔`)}
        </label>
        {selected.size ? (
          <Button type="button" variant="danger" size="sm" onClick={bulkVoid} disabled={pending}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {t("Void selected", "作废所选")}
          </Button>
        ) : null}
      </div>

      {error ? <div role="alert" className="rounded-2xl border-2 border-divider bg-tint-berry px-4 py-2.5 text-sm font-semibold text-danger">{error}</div> : null}

      <Card className="overflow-hidden">
        {dayGroups.map((group, groupIndex) => (
          <section key={group.key} className={groupIndex ? "mt-1" : ""}>
            <div className="flex items-center gap-3 px-4 pt-3.5 sm:px-5">
              <h3 className="shrink-0 text-xs font-black text-foreground">
                {group.label}
              </h3>
              <span
                aria-hidden="true"
                className="h-0 flex-1 border-t-2 border-divider"
              />
              <p className="flex shrink-0 items-center gap-2 text-[11px] font-bold tabular-nums">
                {group.expenseMinor > 0 ? (
                  <span className="text-expense">
                    {t("Out", "支出")} {formatMoney(group.expenseMinor)}
                  </span>
                ) : null}
                {group.incomeMinor > 0 ? (
                  <span className="text-income">
                    {t("In", "收入")} {formatMoney(group.incomeMinor)}
                  </span>
                ) : null}
                {group.hasForeignCurrency ? (
                  <span className="text-subtle">{t("Incl. other currencies", "含其他币种")}</span>
                ) : null}
              </p>
            </div>
            {group.items.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "group grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3.5 transition hover:bg-surface-muted sm:px-5",
                  index !== 0 && "border-t-2 border-divider",
                )}
              >
                <input
                  type="checkbox"
                  aria-label={t(
                    `Select ${transactionTitle(item) ?? "Transactions"}`,
                    `选择 ${transactionTitle(item) ?? "交易"}`,
                  )}
                  className="size-4 accent-primary"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <Link href={`/transactions/${item.id}`} className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "grid size-11 shrink-0 place-items-center rounded-2xl border-2 border-divider text-foreground",
                      badgeBackground(item.type),
                    )}
                  >
                    <CategoryGlyph name={item.categoryIcon} className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-black text-foreground sm:text-base">
                        {transactionTitle(item) ?? t("Untitled transaction", "未命名交易")}
                      </span>
                      <span className="hidden sm:inline-flex">
                        <TransactionTypeBadge type={item.type} />
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-xs font-medium text-muted sm:text-sm">
                      {item.categoryName ?? t("Uncategorized", "未分类")} · {formatTransactionDate(item.transactionTime, false, locale)}
                      {secondaryText(item) ? ` · ${secondaryText(item)}` : ""}
                    </span>
                  </span>
                </Link>
                <Link
                  href={`/transactions/${item.id}`}
                  className={cn(
                    "text-right text-sm font-black tabular-nums sm:text-base",
                    isIncoming(item.type)
                      ? "text-income"
                      : "text-expense",
                  )}
                >
                  {formatSignedMoney(
                    item.amountMinor,
                    isIncoming(item.type) ? "+" : "-",
                    item.currency,
                  )}
                </Link>
              </div>
            ))}
          </section>
        ))}
      </Card>
    </div>
  );
}

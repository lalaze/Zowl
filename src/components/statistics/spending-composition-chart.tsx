"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { CategoryGlyph } from "@/components/categories/category-glyph";
import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { formatMoney } from "@/lib/money";
import { transactionSourceLabel } from "@/lib/transaction-display";
import type { StatisticsOverview } from "@/services/statistics-service";

import {
  categoryDisplayName,
  collapseDonutData,
  DistributionDonut,
  type DonutDatum,
  validChartColor,
} from "./statistics-chart-shared";

const SOURCE_COLORS = {
  manual: "#6366f1",
  screenshot: "#8b5cf6",
  alipay: "#1677ff",
  wechat: "#07a957",
  cmb: "#c62828",
  taobao: "#ff5000",
  pinduoduo: "#e02e24",
  jd: "#b5121b",
  pupu: "#00a862",
  other: "#64748b",
} satisfies Record<
  StatisticsOverview["sourceDistribution"][number]["source"],
  string
>;

const RANK_BAR_BACKGROUNDS = [
  "bg-tint-leaf",
  "bg-tint-amber",
  "bg-tint-sky",
] as const;

function categoryTransactionsHref(month: string, categoryId: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const params = new URLSearchParams({
    categoryId,
    dateFrom: `${month}-01`,
    dateTo: `${month}-${String(lastDay).padStart(2, "0")}`,
    type: "expense",
  });
  return `/transactions?${params.toString()}`;
}

export function SpendingCompositionChart({
  categories,
  currency,
  month,
  sources,
}: {
  categories: StatisticsOverview["categoryDistribution"];
  currency: string;
  month: string;
  sources: StatisticsOverview["sourceDistribution"];
}) {
  const t = useT();
  const locale = useLocale();
  const [view, setView] = useState<"category" | "source">("category");
  const [expanded, setExpanded] = useState(false);
  const categoryData: DonutDatum[] = categories.map((item) => ({
    key: item.categoryId ?? item.name,
    name: categoryDisplayName(item, t),
    amountMinor: item.amountMinor,
    transactionCount: item.transactionCount,
    sharePercent: item.sharePercent,
    color: validChartColor(item.color),
    href: item.categoryId
      ? categoryTransactionsHref(month, item.categoryId)
      : undefined,
    icon: item.icon,
  }));
  const sourceData: DonutDatum[] = sources.map((item) => ({
    key: item.source,
    name: transactionSourceLabel(item.source, locale),
    amountMinor: item.amountMinor,
    transactionCount: item.transactionCount,
    sharePercent: item.sharePercent,
    color: SOURCE_COLORS[item.source],
  }));
  const activeData = view === "category" ? categoryData : sourceData;
  const donutData =
    view === "category" ? collapseDonutData(activeData, 7, t) : activeData;
  const visibleData =
    view === "category" && !expanded ? activeData.slice(0, 4) : activeData;
  const canExpand = view === "category" && activeData.length > 4;
  const dominant = activeData[0];

  function switchView(nextView: "category" | "source") {
    setView(nextView);
    setExpanded(false);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-divider-subtle pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          aria-label={t("Spending breakdown dimension", "消费构成查看维度")}
          className="grid grid-cols-2 rounded-full border-2 border-divider bg-surface p-1"
          role="group"
        >
          {([
            ["category", t("By category", "按分类")],
            ["source", t("By source", "按来源")],
          ] as const).map(([value, label]) => (
            <button
              aria-pressed={view === value}
              className={`min-h-9 rounded-full border-2 px-4 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                view === value
                  ? "border-divider bg-tint-amber text-foreground"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
              key={value}
              onClick={() => switchView(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {dominant ? (
          <p className="text-sm text-muted">
            {t("Largest share:", "最大占比：")}
            <span className="ml-1 font-bold text-foreground">
              {dominant.name} {dominant.sharePercent}%
            </span>
          </p>
        ) : null}
      </div>

      {activeData.length ? (
        <div className="grid gap-2 pt-3 md:grid-cols-[minmax(13rem,0.78fr)_minmax(0,1.22fr)] md:items-center md:gap-6">
          <DistributionDonut
            ariaLabel={
              view === "category"
                ? t("Spending by category donut chart", "消费支出分类占比环形图")
                : t("Spending by payment source donut chart", "支付来源消费占比环形图")
            }
            currency={currency}
            data={donutData}
            totalLabel={t("Gross spending", "消费支出")}
          />

          <div className="min-w-0">
            <div className="mb-1 flex min-h-10 items-center justify-between gap-3">
              <p className="text-xs font-bold tracking-wide text-muted">
                {view === "category" ? t("Category ranking", "分类排行") : t("Source ranking", "来源排行")}
              </p>
              {canExpand ? (
                <button
                  className="min-h-9 shrink-0 rounded-full px-2 text-sm font-bold text-accent-text transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  onClick={() => setExpanded((value) => !value)}
                  type="button"
                >
                  {expanded
                    ? t("Collapse", "收起")
                    : t(`All ${activeData.length} categories`, `全部 ${activeData.length} 类`)}
                </button>
              ) : null}
            </div>

            <ul
              aria-label={
                view === "category"
                  ? t("Spending category ranking", "消费支出分类排行")
                  : t("Payment source spending ranking", "支付来源支出排行")
              }
              className="divide-y divide-divider-subtle"
            >
              {visibleData.map((item, index) => {
                const content = (
                  <>
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-2xl border-2 border-divider"
                      style={{
                        backgroundColor: `${item.color}26`,
                        color: item.color,
                      }}
                    >
                      {view === "category" ? (
                        <CategoryGlyph
                          className="size-4"
                          name={item.icon ?? null}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-bold text-foreground">
                          {item.name}
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
                          {formatMoney(item.amountMinor, currency)}
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 flex-1 overflow-hidden rounded-full border-2 border-divider bg-surface"
                        >
                          <span
                            className={`block h-full min-w-1 rounded-r-full border-r-2 border-divider ${RANK_BAR_BACKGROUNDS[index % RANK_BAR_BACKGROUNDS.length]}`}
                            style={{ width: `${item.sharePercent}%` }}
                          />
                        </span>
                        <span className="w-20 shrink-0 text-right text-[11px] font-medium tabular-nums text-subtle">
                          {item.sharePercent}% ·{" "}
                          {t(`${item.transactionCount} transactions`, `${item.transactionCount} 笔`)}
                        </span>
                      </span>
                    </span>
                    {item.href ? (
                      <ChevronRight className="size-4 shrink-0 text-subtle" />
                    ) : null}
                  </>
                );

                return (
                  <li key={item.key}>
                    {item.href ? (
                      <Link
                        aria-label={t(
                          `View ${item.name} category transactions`,
                          `查看 ${item.name} 分类交易`,
                        )}
                        className="grid min-h-[4.25rem] grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl py-2.5 transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                        href={item.href}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className="grid min-h-[4.25rem] grid-cols-[2.25rem_minmax(0,1fr)] items-center gap-3 py-2.5">
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <div className="py-12 text-center text-sm text-muted">
          {view === "category"
            ? t("No spending category data to display this month.", "本月没有可展示的消费分类。")
            : t("No payment source data to display this month.", "本月没有可展示的支付来源。")}
        </div>
      )}
    </div>
  );
}

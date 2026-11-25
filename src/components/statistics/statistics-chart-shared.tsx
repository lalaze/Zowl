"use client";

import { useId } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import {
  localeTag,
  translator,
  type Locale,
  type Translate,
} from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";

export const axisStyle = { fill: "var(--chart-axis)", fontSize: 11 };

export type DonutDatum = {
  key: string;
  name: string;
  amountMinor: number;
  transactionCount: number;
  sharePercent: number;
  color: string;
  href?: string;
  icon?: string | null;
};

/** Recharts passes the tick index as a second argument, so wrap it: `(value) => moneyTick(value, locale)`. */
export function moneyTick(value: number, locale: Locale = "en") {
  const major = value / 100;
  const absolute = Math.abs(major);
  if (locale === "zh") {
    if (absolute >= 100_000_000) return `${Math.round(major / 100_000_000)}亿`;
    if (absolute >= 10_000) return `${Number((major / 10_000).toFixed(1))}万`;
    if (absolute >= 1_000) return `${Math.round(major / 1_000)}千`;
    return String(Math.round(major));
  }
  if (absolute >= 1_000_000) return `${Math.round(major / 1_000_000)}M`;
  if (absolute >= 1_000) return `${Math.round(major / 1_000)}K`;
  return String(Math.round(major));
}

export function tooltipMoney(value: unknown, currency: string) {
  return formatMoney(Number(value), currency);
}

function compactMoney(value: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** The statistics service names the no-category bucket "Uncategorized". */
export function categoryDisplayName(
  item: { categoryId: string | null; name: string },
  t: Translate,
) {
  return item.categoryId === null && item.name === "Uncategorized"
    ? t("Uncategorized", "未分类")
    : item.name;
}

export function validChartColor(value: string) {
  return /^#[0-9a-f]{6}$/iu.test(value) ? value : "#64748b";
}

export function collapseDonutData(
  data: DonutDatum[],
  limit = 7,
  t: Translate = translator("en"),
) {
  if (data.length <= limit) return data;

  const leading = data.slice(0, limit - 1);
  const remaining = data.slice(limit - 1);
  const amountMinor = remaining.reduce(
    (total, item) => total + item.amountMinor,
    0,
  );
  const transactionCount = remaining.reduce(
    (total, item) => total + item.transactionCount,
    0,
  );
  const sharePercent =
    Math.round(
      remaining.reduce((total, item) => total + item.sharePercent, 0) * 100,
    ) / 100;

  return [
    ...leading,
    {
      key: "other-categories",
      name: t(`Other ${remaining.length} categories`, `其他 ${remaining.length} 类`),
      amountMinor,
      transactionCount,
      sharePercent,
      color: "#94a3b8",
    },
  ];
}

export function DistributionDonut({
  ariaLabel,
  currency,
  data,
  totalLabel,
}: {
  ariaLabel: string;
  currency: string;
  data: DonutDatum[];
  totalLabel: string;
}) {
  const t = useT();
  const locale = useLocale();
  const total = data.reduce((sum, item) => sum + item.amountMinor, 0);
  const transactionCount = data.reduce((sum, item) => sum + item.transactionCount, 0);
  const descriptionId = useId();

  return (
    <div className="relative mx-auto h-56 w-full max-w-64">
      <div
        aria-describedby={descriptionId}
        aria-label={ariaLabel}
        className="h-full w-full"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              cornerRadius={3}
              data={data}
              dataKey="amountMinor"
              innerRadius="64%"
              isAnimationActive={false}
              nameKey="name"
              outerRadius="88%"
              paddingAngle={1.5}
              stroke="var(--app-surface)"
              strokeWidth={2}
            >
              {data.map((item) => (
                <Cell fill={item.color} key={item.key} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--chart-tooltip)",
                border: "1px solid var(--chart-tooltip-border)",
                borderRadius: 14,
                color: "var(--app-foreground)",
                boxShadow: "0 16px 32px -20px rgba(15, 23, 42, 0.35)",
                fontSize: 12,
              }}
              formatter={(value, name, item) => [
                `${tooltipMoney(value, currency)} · ${item.payload.sharePercent}%`,
                `${name}`,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only" id={descriptionId}>
        {data
          .map(
            (item) =>
              t(
                `${item.name}: ${formatMoney(item.amountMinor, currency)}, accounting for ${item.sharePercent}%, ${item.transactionCount} transactions`,
                `${item.name}：${formatMoney(item.amountMinor, currency)}，占 ${item.sharePercent}%，${item.transactionCount} 笔`,
              ),
          )
          .join(t("; ", "；"))}
      </p>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 grid place-content-center text-center"
      >
        <span className="text-xs font-medium text-muted">{totalLabel}</span>
        <span className="mt-1 max-w-28 truncate text-base font-bold tabular-nums text-foreground">
          {compactMoney(total, currency, locale)}
        </span>
        <span className="mt-0.5 text-[11px] font-medium text-subtle">
          {t(`${transactionCount} transactions`, `${transactionCount} 笔`)}
        </span>
      </div>
    </div>
  );
}

export function AccessibleFlowTable({
  caption,
  data,
  currency,
}: {
  caption: string;
  data: Array<{
    label: string;
    incomeMinor: number;
    netExpenseMinor: number;
  }>;
  currency: string;
}) {
  const t = useT();
  // Tables never shrink below their content; hide a block wrapper instead.
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th>{t("Time", "时间")}</th>
            <th>{t("Income", "收入")}</th>
            <th>{t("Net spending", "净支出")}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.label}>
              <th>{item.label}</th>
              <td>{formatMoney(item.incomeMinor, currency)}</td>
              <td>{formatMoney(item.netExpenseMinor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

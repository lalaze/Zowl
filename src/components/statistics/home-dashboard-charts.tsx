"use client";

import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { shortMonthLabel } from "@/components/statistics/month-label";
import {
  categoryDisplayName,
  validChartColor,
} from "@/components/statistics/statistics-chart-shared";
import type { Locale } from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";
import type { StatisticsOverview } from "@/services/statistics-service";

type MonthlyDatum = StatisticsOverview["monthlyTrend"][number];
type CategoryDatum = StatisticsOverview["categoryDistribution"][number];

function compactMoney(value: number, locale: Locale) {
  const yuan = value / 100;
  const absolute = Math.abs(yuan);
  if (absolute >= 10_000) {
    return locale === "zh"
      ? `¥${Math.round(yuan / 10_000)}万`
      : `¥${Math.round(yuan / 1_000)}K`;
  }
  if (absolute >= 1_000) return `¥${Math.round(yuan / 1_000)}k`;
  return `¥${Math.round(yuan)}`;
}

export function HomeMonthlyCashflowTrend({
  currency,
  data,
}: {
  currency: string;
  data: MonthlyDatum[];
}) {
  const t = useT();
  const locale = useLocale();
  if (!data.length) {
    return (
      <div className="grid h-full place-items-center text-sm font-semibold text-muted">
        {t("No trend data yet", "暂无趋势数据")}
      </div>
    );
  }
  const trend = data.map((item) => ({
    ...item,
    label: shortMonthLabel(item.month, locale),
  }));

  return (
    <div
      aria-label={t("Income and spending over the last six months", "近六个月收入与支出趋势")}
      className="h-full min-h-0 w-full"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <ComposedChart
          data={trend}
          margin={{ top: 14, right: 12, bottom: 0, left: 3 }}
        >
          <CartesianGrid
            stroke="var(--chart-grid)"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            axisLine={false}
            dataKey="label"
            tick={{
              fill: "var(--chart-axis)",
              fontSize: 11,
              fontWeight: 800,
            }}
            tickLine={false}
            tickMargin={10}
          />
          <YAxis
            axisLine={false}
            hide
            tickFormatter={(value) => compactMoney(Number(value), locale)}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--chart-tooltip)",
              border: "1px solid var(--app-border)",
              borderRadius: 14,
              boxShadow: "0 6px 18px rgb(31 34 48 / 10%)",
              color: "var(--app-foreground)",
              fontSize: 12,
              fontWeight: 700,
            }}
            cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "4 4" }}
            formatter={(value, name) => [
              formatMoney(Number(value), currency),
              name === "incomeMinor" ? t("Income", "收入") : t("Expense", "支出"),
            ]}
          />
          <Area
            dataKey="incomeMinor"
            fill="var(--tint-leaf)"
            fillOpacity={0.78}
            isAnimationActive={false}
            stroke="var(--income)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            type="monotone"
          />
          <Line
            dataKey="netExpenseMinor"
            dot={{
              fill: "var(--chart-dot)",
              r: 4,
              stroke: "var(--chart-expense)",
              strokeWidth: 3,
            }}
            isAnimationActive={false}
            stroke="var(--chart-expense)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={3}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function groupedCategories(data: CategoryDatum[]) {
  return data.slice(0, 4);
}

export function HomeExpenseDonut({
  currency,
  data,
  totalMinor,
}: {
  currency: string;
  data: CategoryDatum[];
  totalMinor: number;
}) {
  const t = useT();
  const grouped = groupedCategories(data);

  return (
    <div className="grid h-full min-h-0 grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
      <div className="relative h-[132px] w-[132px]">
        {grouped.length ? (
          <ResponsiveContainer height="100%" width="100%">
            <PieChart>
              <Pie
                cx="50%"
                cy="50%"
                data={grouped}
                dataKey="amountMinor"
                innerRadius={43}
                isAnimationActive={false}
                nameKey="name"
                outerRadius={64}
                paddingAngle={0}
                stroke="none"
              >
                {grouped.map((item) => (
                  <Cell
                    fill={validChartColor(item.color)}
                    key={item.categoryId ?? item.name}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "var(--chart-tooltip)",
                  border: "1px solid var(--app-border)",
                  borderRadius: 14,
                  boxShadow: "0 6px 18px rgb(31 34 48 / 10%)",
                  color: "var(--app-foreground)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
                formatter={(value) => formatMoney(Number(value), currency)}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="m-auto mt-1 size-[124px] rounded-full border-[20px] border-tint-amber" />
        )}
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <span className="text-[10px] font-extrabold text-muted">{t("Total spending", "总支出")}</span>
          <strong className="mt-0.5 text-[14px] font-black tracking-[-0.01em] text-foreground tabular-nums">
            {formatMoney(totalMinor, currency)}
          </strong>
        </div>
      </div>

      <div className="space-y-2.5">
        {grouped.length ? (
          grouped.map((item) => (
            <div
              className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-[11px]"
              key={item.categoryId ?? item.name}
            >
              <span
                className="size-2.5 rounded-[3px] border-2 border-divider"
                style={{ backgroundColor: validChartColor(item.color) }}
              />
              <span className="truncate font-black text-foreground">
                {categoryDisplayName(item, t)}
              </span>
              <span className="font-black text-foreground tabular-nums">
                {formatMoney(item.amountMinor, currency)}
              </span>
            </div>
          ))
        ) : (
          <p className="text-xs font-semibold leading-5 text-muted">
            {t("No spending recorded this month", "本月还没有支出记录")}
          </p>
        )}
      </div>
    </div>
  );
}

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
import { validChartColor } from "@/components/statistics/chart-labels";
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

export function HomeMonthlyCashflowTrendChart({
  currency,
  data,
}: {
  currency: string;
  data: MonthlyDatum[];
}) {
  const t = useT();
  const locale = useLocale();
  const trend = data.map((item) => ({
    ...item,
    label: shortMonthLabel(item.month, locale),
  }));

  return (
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
  );
}

export function HomeMonthlyCashflowTrend({
  currency,
  data,
}: {
  currency: string;
  data: MonthlyDatum[];
}) {
  const t = useT();
  if (!data.length) {
    return (
      <div className="grid h-full place-items-center text-sm font-semibold text-muted">
        {t("No trend data yet", "暂无趋势数据")}
      </div>
    );
  }

  return (
    <div
      aria-label={t("Income and spending over the last six months", "近六个月收入与支出趋势")}
      className="h-full min-h-0 w-full"
      role="img"
    >
      <HomeMonthlyCashflowTrendChart currency={currency} data={data} />
    </div>
  );
}

/** Only the pie itself; the total and legend around it are rendered by `DesktopHomeExpenseDonut`. */
export function HomeExpenseDonutPie({
  currency,
  data,
}: {
  currency: string;
  data: CategoryDatum[];
}) {
  return (
    <ResponsiveContainer height="100%" width="100%">
      <PieChart>
        <Pie
          cx="50%"
          cy="50%"
          data={data}
          dataKey="amountMinor"
          innerRadius={43}
          isAnimationActive={false}
          nameKey="name"
          outerRadius={64}
          paddingAngle={0}
          stroke="none"
        >
          {data.map((item) => (
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
  );
}

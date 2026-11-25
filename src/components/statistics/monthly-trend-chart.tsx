"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import type { StatisticsOverview } from "@/services/statistics-service";

import { monthLabel } from "./month-label";

import {
  AccessibleFlowTable,
  axisStyle,
  moneyTick,
  tooltipMoney,
} from "./statistics-chart-shared";

export function MonthlyTrendChart({
  data,
  currency,
}: {
  data: StatisticsOverview["monthlyTrend"];
  currency: string;
}) {
  const t = useT();
  const locale = useLocale();
  // The service labels months in English; relabel them for the UI language.
  const trend = useMemo(
    () => data.map((item) => ({ ...item, label: monthLabel(item.month, locale) })),
    [data, locale],
  );
  return (
    <>
      <div
        aria-label={t("Income and net spending bars for the last six months", "最近六个月收入与净支出柱状图")}
        className="h-56 w-full sm:h-64 xl:h-full xl:min-h-80"
        data-testid="statistics-monthly-trend-chart"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            data={trend}
            margin={{ top: 8, right: 4, bottom: 0, left: -18 }}
          >
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="month"
              tick={axisStyle}
              tickFormatter={(value: string) => value.slice(5)}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              tick={axisStyle}
              tickFormatter={(value: number) => moneyTick(value, locale)}
              tickLine={false}
              width={58}
            />
            <Tooltip
              contentStyle={{
                background: "var(--chart-tooltip)",
                border: "1px solid var(--chart-tooltip-border)",
                borderRadius: 14,
                color: "var(--app-foreground)",
                boxShadow: "0 16px 32px -20px rgba(15, 23, 42, 0.35)",
                fontSize: 12,
              }}
              cursor={{ fill: "var(--chart-cursor-fill)" }}
              formatter={(value, name) => [
                tooltipMoney(value, currency),
                name === "incomeMinor" ? t("Income", "收入") : t("Net spending", "净支出"),
              ]}
              labelFormatter={(_, payload) =>
                payload[0]?.payload.label ?? ""
              }
            />
            <Bar
              dataKey="netExpenseMinor"
              fill="var(--chart-neutral)"
              name="netExpenseMinor"
              radius={[5, 5, 0, 0]}
            />
            <Bar
              dataKey="incomeMinor"
              fill="var(--chart-accent)"
              name="incomeMinor"
              radius={[5, 5, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <AccessibleFlowTable
        caption={t("Income and net spending details for the last six months", "最近六个月收入与净支出明细")}
        currency={currency}
        data={trend}
      />
    </>
  );
}

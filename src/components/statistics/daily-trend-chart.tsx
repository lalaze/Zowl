"use client";

import { MousePointerClick } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import type { StatisticsOverview } from "@/services/statistics-service";

import {
  AccessibleFlowTable,
  axisStyle,
  moneyTick,
  tooltipMoney,
} from "./statistics-chart-shared";

export function DailyTrendChart({
  data,
  currency,
}: {
  data: StatisticsOverview["dailyTrend"];
  currency: string;
}) {
  const t = useT();
  const locale = useLocale();
  const tickInterval = Math.max(Math.ceil(data.length / 6) - 1, 0);
  const showDots = data.length <= 18;

  return (
    <>
      <div
        aria-label={t("Daily net spending bars and income line for this month", "本月每日净支出柱状图与收入折线图")}
        className="h-48 w-full sm:h-72"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 8, bottom: 0, left: -16 }}
          >
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="3 4"
              vertical={false}
            />
            <XAxis
              axisLine={{ stroke: "var(--chart-grid)" }}
              dataKey="label"
              interval={tickInterval}
              tick={axisStyle}
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
              cursor={{
                stroke: "var(--chart-cursor)",
                strokeDasharray: "3 3",
              }}
              formatter={(value, name) => [
                tooltipMoney(value, currency),
                name === "incomeMinor" ? t("Income", "收入") : t("Net spending", "净支出"),
              ]}
              labelFormatter={(label) => `${label}`}
            />
            <Bar
              dataKey="netExpenseMinor"
              fill="var(--chart-neutral)"
              fillOpacity={0.82}
              maxBarSize={18}
              name="netExpenseMinor"
              radius={[4, 4, 0, 0]}
            />
            <Line
              activeDot={{ r: 5, strokeWidth: 2 }}
              dataKey="incomeMinor"
              dot={
                showDots
                  ? {
                      fill: "var(--chart-dot)",
                      r: 2.5,
                      strokeWidth: 1.5,
                    }
                  : false
              }
              name="incomeMinor"
              stroke="var(--chart-accent)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.75}
              type="monotone"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex min-h-10 items-center gap-2 rounded-2xl border-2 border-divider bg-surface-muted px-3 text-xs font-medium text-muted sm:mt-2 sm:min-h-11">
        <MousePointerClick className="size-4 shrink-0 text-muted" />
        {t("Tap or hover over a point to view daily income and net spending", "轻触或悬停数据点，查看当日收入与净支出")}
      </p>
      <AccessibleFlowTable
        caption={t("Daily income and net spending details this month", "本月每日收入与净支出明细")}
        currency={currency}
        data={data}
      />
    </>
  );
}

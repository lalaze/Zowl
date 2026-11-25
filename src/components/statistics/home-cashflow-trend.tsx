"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useLocale, useT } from "@/components/i18n/i18n-provider";
import { localeTag, type Locale } from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";
import type { StatisticsOverview } from "@/services/statistics-service";

type TrendDatum = StatisticsOverview["dailyTrend"][number];

function compactMoney(value: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function buildCumulativeTrend(data: TrendDatum[]) {
  let incomeMinor = 0;
  let expenseMinor = 0;

  return data.map((item) => {
    incomeMinor += item.incomeMinor;
    expenseMinor -= item.netExpenseMinor;
    return {
      date: item.date,
      label: `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8))}`,
      incomeMinor,
      expenseMinor,
    };
  });
}

export function HomeCashflowTrend({
  currency,
  data,
}: {
  currency: string;
  data: TrendDatum[];
}) {
  const t = useT();
  const locale = useLocale();
  const [desktop, setDesktop] = useState(false);
  const trend = useMemo(() => buildCumulativeTrend(data), [data]);
  const ticks = useMemo(() => {
    if (!trend.length) return [];
    const preferredDays = new Set([1, 10, 20]);
    const values = trend
      .filter((item) => preferredDays.has(Number(item.date.slice(8))))
      .map((item) => item.label);
    const last = trend.at(-1)?.label;
    if (last && !values.includes(last)) values.push(last);
    return values;
  }, [trend]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!desktop) {
    return <div aria-hidden="true" className="home-cashflow-chart h-[280px] w-full" />;
  }

  if (!trend.length) {
    return (
      <div className="grid h-[280px] place-items-center text-sm font-semibold text-muted">
        {t("No trend data yet", "暂无趋势数据")}
      </div>
    );
  }

  return (
    <>
      <div
        aria-label={t("Cumulative income and net spending this month", "本月累计收入与净支出趋势")}
        className="home-cashflow-chart h-[280px] w-full"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <LineChart
            data={trend}
            margin={{ top: 12, right: 8, bottom: 2, left: -8 }}
          >
            <CartesianGrid
              stroke="var(--chart-grid)"
              strokeDasharray="5 5"
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="label"
              tick={{ fill: "var(--chart-axis)", fontSize: 11, fontWeight: 600 }}
              tickLine={false}
              ticks={ticks}
            />
            <YAxis
              axisLine={false}
              tick={{ fill: "var(--chart-axis)", fontSize: 11, fontWeight: 600 }}
              tickFormatter={(value) => compactMoney(Number(value), currency, locale)}
              tickLine={false}
              width={58}
            />
            <Tooltip
              contentStyle={{
                background: "var(--chart-tooltip)",
                border: "1px solid var(--chart-tooltip-border)",
                borderRadius: 16,
                boxShadow: "0 18px 40px -24px rgba(23, 24, 32, 0.45)",
                color: "var(--app-foreground)",
                fontSize: 12,
              }}
              cursor={{ stroke: "var(--chart-cursor)", strokeDasharray: "4 4" }}
              formatter={(value, name) => [
                formatMoney(Math.abs(Number(value)), currency),
                name === "incomeMinor"
                  ? t("Cumulative income", "累计收入")
                  : t("Cumulative net spending", "累计净支出"),
              ]}
              labelFormatter={(label) => `${label}`}
            />
            <Line
              activeDot={{ r: 5, strokeWidth: 0 }}
              dataKey="incomeMinor"
              dot={false}
              name="incomeMinor"
              stroke="var(--income)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              type="monotone"
            />
            <Line
              activeDot={{ r: 5, strokeWidth: 0 }}
              dataKey="expenseMinor"
              dot={false}
              name="expenseMinor"
              stroke="var(--chart-expense)"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              type="monotone"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div
        aria-label={t("Legend", "图例")}
        className="mt-3 flex items-center justify-center gap-7 text-sm font-bold text-muted"
      >
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full bg-income" />
          {t("Income", "收入")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full bg-[var(--chart-expense)]" />
          {t("Expense", "支出")}
        </span>
      </div>

      {/* Tables never shrink below their content; hide a wrapper instead. */}
      <div className="sr-only">
        <table>
          <caption>{t("Cumulative income and net spending this month", "本月累计收入与净支出趋势")}</caption>
          <thead>
            <tr>
              <th>{t("Date", "日期")}</th>
              <th>{t("Cumulative income", "累计收入")}</th>
              <th>{t("Cumulative net spending", "累计净支出")}</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((item) => (
              <tr key={item.date}>
                <th>{item.label}</th>
                <td>{formatMoney(item.incomeMinor, currency)}</td>
                <td>{formatMoney(Math.abs(item.expenseMinor), currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

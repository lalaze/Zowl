import { Clock3, TrendingUp, WalletCards } from "lucide-react";

import {
  DesktopHomeExpenseDonut,
  DesktopHomeMonthlyCashflowTrend,
} from "@/components/statistics/desktop-home-charts";
import { Card } from "@/components/ui/card";
import { translator, type Locale } from "@/lib/i18n/locale";
import { formatMoney } from "@/lib/money";
import type { StatisticsOverview } from "@/services/statistics-service";

import type { HomeModel } from "./home-model";

export function DesktopStatRow({
  locale,
  model,
  overview,
}: {
  locale: Locale;
  model: HomeModel;
  overview: StatisticsOverview;
}) {
  const t = translator(locale);
  const { summary } = overview;

  return (
    <section className="grid h-[248px] shrink-0 grid-cols-[1.04fr_1.12fr_.88fr] gap-4">
      <Card className="relative h-full overflow-hidden p-5">
        <p className="flex items-center gap-2 text-[12px] font-black text-muted">
          <WalletCards className="size-4" />
          {t("Net balance this month", "本月结余")}
        </p>
        <p className="mt-3 text-[34px] font-black leading-none tracking-[-0.01em] text-foreground tabular-nums">
          {formatMoney(summary.balanceMinor)}
        </p>
        <span
          className={`mt-3 inline-flex rounded-full px-3 py-1 text-[11px] font-black ${
            model.balanceImproved
              ? "bg-tint-leaf text-income"
              : "bg-tint-berry text-danger"
          }`}
        >
          {model.balanceChangeText}
        </span>

        <div className="absolute bottom-5 left-5 right-5 grid grid-cols-2 gap-3">
          <div className="rounded-[16px] bg-surface-muted px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <span className="size-2 rounded-full bg-income" />
              {t("Income this month", "本月收入")}
            </p>
            <p className="mt-1 text-[17px] font-black text-income tabular-nums">
              {formatMoney(summary.incomeMinor)}
            </p>
          </div>
          <div className="rounded-[16px] bg-surface-muted px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted">
              <span className="size-2 rounded-full bg-primary" />
              {t("Spending this month", "本月支出")}
            </p>
            <p className="mt-1 text-[17px] font-black text-expense tabular-nums">
              {formatMoney(summary.netExpenseMinor)}
            </p>
          </div>
        </div>
      </Card>

      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex h-[50px] shrink-0 items-center px-5 pt-1">
          <TrendingUp className="size-4" />
          <h2 className="ml-auto text-[13px] font-black text-foreground">
            {t("Cash flow · Last 6 months", "收支 · 近 6 个月")}
          </h2>
          <div className="ml-3 flex items-center gap-3 text-[10px] font-bold text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-income" />
              {t("Income", "收入")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-[var(--chart-expense)]" />
              {t("Expense", "支出")}
            </span>
          </div>
        </div>
        <div className="min-h-0 flex-1 px-3 pb-3">
          <DesktopHomeMonthlyCashflowTrend
            currency={overview.currency}
            data={overview.monthlyTrend}
          />
        </div>
      </Card>

      <Card className="flex h-full min-h-0 flex-col overflow-hidden p-5">
        <h2 className="flex items-center gap-2 text-[13px] font-black text-foreground">
          <Clock3 className="size-4" />
          {t("Spending breakdown · This month", "支出构成 · 本月")}
        </h2>
        <div className="min-h-0 flex-1">
          <DesktopHomeExpenseDonut
            currency={overview.currency}
            data={overview.categoryDistribution}
            totalMinor={summary.netExpenseMinor}
          />
        </div>
      </Card>
    </section>
  );
}

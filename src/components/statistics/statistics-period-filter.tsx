import { CalendarDays, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { translator } from "@/lib/i18n/locale";
import { getLocaleForRender } from "@/lib/i18n/server";

import { monthLabel } from "./month-label";

export async function StatisticsPeriodFilter({
  month,
  currency,
  currencies,
}: {
  month: string;
  currency: string;
  currencies: string[];
}) {
  const locale = await getLocaleForRender();
  const t = translator(locale);
  const currentMonth = monthLabel(month, locale);
  return (
    <details className="group relative shrink-0">
      <summary
        aria-label={t(
          `Filter statistics by month and currency. Current: ${currentMonth} ${currency}`,
          `筛选统计月份与币种，当前为 ${currentMonth} ${currency}`,
        )}
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-full border-2 border-divider bg-surface px-4 text-sm font-extrabold text-foreground transition hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-app group-open:bg-tint-amber [&::-webkit-details-marker]:hidden"
      >
        <CalendarDays className="size-4 text-muted" />
        <span className="whitespace-nowrap">
          {currentMonth}
          <span className="mx-1 text-subtle">·</span>
          {currency}
        </span>
        <ChevronDown className="size-4 text-subtle transition group-open:rotate-180" />
      </summary>

      <form
        action="/statistics"
        className="absolute right-0 z-30 mt-2 grid w-[min(20rem,calc(100vw-2rem))] gap-4 rounded-[20px] border-2 border-divider bg-surface p-4"
        method="get"
      >
        <label className="grid gap-1.5 text-sm font-semibold text-foreground">
          <span>{t("Month", "月份")}</span>
          <input
            className="h-11 rounded-2xl border-2 border-divider bg-surface px-3 text-base text-foreground outline-none transition focus:border-divider"
            defaultValue={month}
            name="month"
            type="month"
          />
        </label>
        <div className="grid gap-1.5">
          <Label htmlFor="statistics-currency">{t("Currency", "币种")}</Label>
          <Select
            key={currency}
            id="statistics-currency"
            defaultValue={currency}
            name="currency"
            options={currencies.map((item) => ({
              value: item,
              label: item,
            }))}
          />
        </div>
        <Button className="w-full" type="submit">
          {t("Apply filters", "应用筛选")}
        </Button>
      </form>
    </details>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import { useT } from "@/components/i18n/i18n-provider";
import {
  categoryDisplayName,
  validChartColor,
} from "@/components/statistics/chart-labels";
import { formatMoney } from "@/lib/money";
import type { StatisticsOverview } from "@/services/statistics-service";

type MonthlyDatum = StatisticsOverview["monthlyTrend"][number];
type CategoryDatum = StatisticsOverview["categoryDistribution"][number];

// Matches Tailwind's `lg:` breakpoint used to reveal `DesktopDashboard`.
const DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

const LazyHomeMonthlyCashflowTrendChart = dynamic(
  () =>
    import("./home-dashboard-charts").then(
      (module) => module.HomeMonthlyCashflowTrendChart,
    ),
  { ssr: false },
);

const LazyHomeExpenseDonutPie = dynamic(
  () =>
    import("./home-dashboard-charts").then(
      (module) => module.HomeExpenseDonutPie,
    ),
  { ssr: false },
);

function subscribeDesktop(onStoreChange: () => void) {
  const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_MEDIA_QUERY).matches;
}

function getDesktopServerSnapshot() {
  return false;
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    getDesktopSnapshot,
    getDesktopServerSnapshot,
  );
}

export function DesktopHomeMonthlyCashflowTrend({
  currency,
  data,
}: {
  currency: string;
  data: MonthlyDatum[];
}) {
  const t = useT();
  const desktop = useIsDesktop();

  if (!data.length) {
    return (
      <div className="grid h-full place-items-center text-sm font-semibold text-muted">
        {t("No trend data yet", "暂无趋势数据")}
      </div>
    );
  }

  return (
    <div
      aria-label={t(
        "Income and spending over the last six months",
        "近六个月收入与支出趋势",
      )}
      className="h-full min-h-0 w-full"
      role="img"
    >
      {desktop ? (
        <LazyHomeMonthlyCashflowTrendChart currency={currency} data={data} />
      ) : null}
    </div>
  );
}

export function DesktopHomeExpenseDonut({
  currency,
  data,
  totalMinor,
}: {
  currency: string;
  data: CategoryDatum[];
  totalMinor: number;
}) {
  const t = useT();
  const desktop = useIsDesktop();
  const grouped = data.slice(0, 4);

  // Server-rendered like before; only the pie waits for the desktop-only chart chunk.
  return (
    <div className="grid h-full min-h-0 grid-cols-[132px_minmax(0,1fr)] items-center gap-2">
      <div className="relative h-[132px] w-[132px]">
        {grouped.length ? (
          desktop ? (
            <LazyHomeExpenseDonutPie currency={currency} data={grouped} />
          ) : null
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

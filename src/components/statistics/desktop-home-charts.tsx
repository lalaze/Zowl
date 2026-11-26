"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";

import { useT } from "@/components/i18n/i18n-provider";
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

const LazyHomeExpenseDonut = dynamic(
  () =>
    import("./home-dashboard-charts").then((module) => module.HomeExpenseDonut),
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
  const desktop = useIsDesktop();

  if (!desktop) return null;

  return (
    <LazyHomeExpenseDonut
      currency={currency}
      data={data}
      totalMinor={totalMinor}
    />
  );
}

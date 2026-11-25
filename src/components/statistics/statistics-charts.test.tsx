// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import {
  DailyTrendChart,
  MonthlyTrendChart,
  SpendingCompositionChart,
} from "@/components/statistics/statistics-charts";
import {
  collapseDonutData,
  moneyTick,
  validChartColor,
} from "@/components/statistics/statistics-chart-shared";
import { translator } from "@/lib/i18n/locale";

vi.mock("recharts", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Empty = () => null;

  return {
    Bar: Empty,
    BarChart: Wrapper,
    CartesianGrid: Empty,
    Cell: Empty,
    ComposedChart: Wrapper,
    Line: Empty,
    Pie: Wrapper,
    PieChart: Wrapper,
    ResponsiveContainer: Wrapper,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

afterEach(cleanup);

describe("cashflow trend charts", () => {
  it("formats axis labels and collapses long donut legends", () => {
    expect(moneyTick(500)).toBe("5");
    expect(moneyTick(150_000)).toBe("2K");
    expect(moneyTick(150_000_000)).toBe("2M");
    expect(validChartColor("#abcdef")).toBe("#abcdef");
    expect(validChartColor("var(--unsafe)")).toBe("#64748b");

    const collapsed = collapseDonutData(
      Array.from({ length: 8 }, (_, index) => ({
        key: String(index),
        name: `Category ${index}`,
        amountMinor: 100,
        transactionCount: 1,
        sharePercent: 12.5,
        color: "#abcdef",
      })),
    );
    expect(collapsed).toHaveLength(7);
    expect(collapsed.at(-1)).toMatchObject({
      key: "other-categories",
      amountMinor: 200,
      transactionCount: 2,
      sharePercent: 25,
    });
    expect(collapseDonutData(collapsed)).toBe(collapsed);
  });

  it("renders daily values in an accessible table", () => {
    render(
      <DailyTrendChart
        currency="CNY"
        data={[
          {
            date: "2026-07-01",
            label: "07-01",
            incomeMinor: 12_000,
            grossExpenseMinor: 3_000,
            refundMinor: 500,
            netExpenseMinor: 2_500,
            transferMinor: 0,
            balanceMinor: 9_500,
            expenseCount: 1,
            refundCount: 1,
            incomeCount: 1,
            transferCount: 0,
            transactionCount: 3,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Daily net spending bars and income line for this month",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("table", {
        name: "Daily income and net spending details this month",
      }),
    ).toHaveTextContent("07-01");
  });

  it("renders monthly values in an accessible table", () => {
    render(
      <MonthlyTrendChart
        currency="CNY"
        data={[
          {
            month: "2026-07",
            label: "July 2026",
            incomeMinor: 20_000,
            grossExpenseMinor: 9_000,
            refundMinor: 1_000,
            netExpenseMinor: 8_000,
            transferMinor: 0,
            balanceMinor: 12_000,
            expenseCount: 2,
            refundCount: 1,
            incomeCount: 1,
            transferCount: 0,
            transactionCount: 4,
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: "Income and net spending bars for the last six months",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("table", {
        name: "Income and net spending details for the last six months",
      }),
    ).toHaveTextContent("July 2026");
  });
});

describe("SpendingCompositionChart", () => {
  const categories = [
    ["food", "Food", "Utensils", "#f97316", 5_000, 50],
    ["home", "Housing", "House", "#3b82f6", 2_000, 20],
    ["travel", "Transport", "Train", "#8b5cf6", 1_500, 15],
    ["shopping", "Shopping", "ShoppingBag", "#ec4899", 1_000, 10],
    ["fun", "Entertainment", "Gamepad2", "#14b8a6", 500, 5],
  ].map(([categoryId, name, icon, color, amountMinor, sharePercent]) => ({
    categoryId: String(categoryId),
    name: String(name),
    icon: String(icon),
    color: String(color),
    amountMinor: Number(amountMinor),
    sharePercent: Number(sharePercent),
    transactionCount: 2,
  }));

  const sources = [
    {
      source: "alipay" as const,
      amountMinor: 7_000,
      transactionCount: 7,
      sharePercent: 70,
    },
    {
      source: "wechat" as const,
      amountMinor: 3_000,
      transactionCount: 3,
      sharePercent: 30,
    },
  ];

  it("switches between category and source rankings while preserving drill-down", () => {
    render(
      <SpendingCompositionChart
        categories={categories}
        currency="CNY"
        month="2026-07"
        sources={sources}
      />,
    );

    expect(screen.getByRole("button", { name: "By category" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Category ranking")).toBeVisible();
    expect(screen.getByText("Food 50%")).toBeVisible();
    expect(screen.queryByText("Entertainment")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "View Food category transactions" }),
    ).toHaveAttribute(
      "href",
      "/transactions?categoryId=food&dateFrom=2026-07-01&dateTo=2026-07-31&type=expense",
    );

    fireEvent.click(screen.getByRole("button", { name: "All 5 categories" }));
    expect(screen.getByText("Entertainment")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "By source" }));

    expect(screen.getByRole("button", { name: "By source" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Source ranking")).toBeVisible();
    expect(screen.getByText("Alipay 70%")).toBeVisible();
    expect(screen.getAllByText("WeChat Pay").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /All/u })).not.toBeInTheDocument();
  });

  it("follows the Chinese locale for copy, source names and month labels", () => {
    render(
      <I18nProvider locale="zh" preference="zh">
        <SpendingCompositionChart
          categories={categories}
          currency="CNY"
          month="2026-07"
          sources={sources}
        />
        <MonthlyTrendChart
          currency="CNY"
          data={[
            {
              month: "2026-07",
              label: "July 2026",
              incomeMinor: 20_000,
              grossExpenseMinor: 9_000,
              refundMinor: 1_000,
              netExpenseMinor: 8_000,
              transferMinor: 0,
              balanceMinor: 12_000,
              expenseCount: 2,
              refundCount: 1,
              incomeCount: 1,
              transferCount: 0,
              transactionCount: 4,
            },
          ]}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "按分类" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("分类排行")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "查看 Food 分类交易" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "全部 5 类" }));
    expect(screen.getByText("Entertainment")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "按来源" }));
    expect(screen.getByText("支付宝 70%")).toBeVisible();
    expect(
      screen.getByRole("table", { name: "最近六个月收入与净支出明细" }),
    ).toHaveTextContent("2026年7月");
  });

  it("formats Chinese axis ticks and the collapsed slice name", () => {
    expect(moneyTick(150_000, "zh")).toBe("2千");
    expect(moneyTick(1_500_000, "zh")).toBe("1.5万");
    const collapsed = collapseDonutData(
      Array.from({ length: 8 }, (_, index) => ({
        key: String(index),
        name: `Category ${index}`,
        amountMinor: 100,
        transactionCount: 1,
        sharePercent: 12.5,
        color: "#abcdef",
      })),
      7,
      translator("zh"),
    );
    expect(collapsed.at(-1)?.name).toBe("其他 2 类");
  });
});

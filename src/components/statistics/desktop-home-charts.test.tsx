// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DesktopHomeExpenseDonut,
  DesktopHomeMonthlyCashflowTrend,
} from "./desktop-home-charts";

vi.mock("recharts", () => {
  const Empty = () => null;
  function ComposedChart({ children }: { children?: ReactNode }) {
    return <div data-testid="recharts-composed-chart">{children}</div>;
  }
  function Pie({ children }: { children?: ReactNode }) {
    return <div data-testid="recharts-pie">{children}</div>;
  }
  function PieChart({ children }: { children?: ReactNode }) {
    return <div data-testid="recharts-pie-chart">{children}</div>;
  }
  function ResponsiveContainer({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }

  return {
    Area: Empty,
    CartesianGrid: Empty,
    Cell: Empty,
    ComposedChart,
    Line: Empty,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  };
});

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

const sampleMonthly = [
  {
    month: "2026-07",
    label: "July 2026",
    incomeMinor: 100_000,
    grossExpenseMinor: 40_000,
    refundMinor: 0,
    netExpenseMinor: 40_000,
    transferMinor: 0,
    balanceMinor: 60_000,
    expenseCount: 2,
    refundCount: 0,
    incomeCount: 1,
    transferCount: 0,
    transactionCount: 3,
  },
];

const sampleCategories = [
  {
    categoryId: "cat-1",
    name: "Food",
    icon: "Utensils",
    color: "#f97316",
    amountMinor: 40_000,
    sharePercent: 100,
    transactionCount: 2,
  },
];

afterEach(cleanup);

describe("desktop home chart wrappers", () => {
  it("keeps the outer trend role=img container without mounting charts below desktop width", () => {
    mockMatchMedia(false);
    render(
      <>
        <DesktopHomeMonthlyCashflowTrend currency="CNY" data={sampleMonthly} />
        <DesktopHomeExpenseDonut
          currency="CNY"
          data={sampleCategories}
          totalMinor={40_000}
        />
      </>,
    );

    expect(
      screen.getByRole("img", {
        name: "Income and spending over the last six months",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("recharts-composed-chart"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("recharts-pie-chart")).not.toBeInTheDocument();
    expect(screen.queryByText("Total spending")).not.toBeInTheDocument();
  });

  it("mounts both dynamic charts at desktop width", async () => {
    mockMatchMedia(true);
    render(
      <>
        <DesktopHomeMonthlyCashflowTrend currency="CNY" data={sampleMonthly} />
        <DesktopHomeExpenseDonut
          currency="CNY"
          data={sampleCategories}
          totalMinor={40_000}
        />
      </>,
    );

    expect(
      await screen.findByTestId("recharts-composed-chart"),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("recharts-pie-chart")).toBeInTheDocument();
    expect(screen.getByText("Total spending")).toBeInTheDocument();
    expect(screen.getByText("Food")).toBeInTheDocument();
  });

  it("renders empty state copy when monthly trend has no data", () => {
    mockMatchMedia(false);
    render(<DesktopHomeMonthlyCashflowTrend currency="CNY" data={[]} />);
    expect(screen.getByText("No trend data yet")).toBeInTheDocument();
  });
});

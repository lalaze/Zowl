// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

const themeState = vi.hoisted(() => ({
  resolvedTheme: "dark" as "dark" | "light" | undefined,
  setTheme: vi.fn<(theme: string) => void>(),
  theme: "system" as string | undefined,
}));

vi.mock("next-themes", () => ({
  useTheme: () => themeState,
}));

beforeEach(() => {
  document.documentElement.dataset.accent = "amber";
  localStorage.clear();
  themeState.resolvedTheme = "dark";
  themeState.theme = "system";
  themeState.setTheme.mockReset();
});

afterEach(cleanup);

describe("ThemeSwitcher", () => {
  it("renders a stable disabled placeholder before mounting", () => {
    const html = renderToString(<ThemeSwitcher />);

    expect(html).toContain("Loading theme settings");
    expect(html).toContain("disabled");
  });

  it("shows the saved mode and selects a new theme accessibly", async () => {
    render(<ThemeSwitcher />);

    const trigger = await screen.findByRole("button", {
      name: "Theme: Follow system (currently dark)",
    });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    expect(
      await screen.findByRole("menuitemradio", { name: "Follow system" }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByRole("menuitemradio", { name: "Dark" }));
    expect(themeState.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches and persists the accent color", async () => {
    render(<ThemeSwitcher />);

    fireEvent.pointerDown(
      await screen.findByRole("button", {
        name: "Theme: Follow system (currently dark)",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitemradio", { name: "Night owl" }),
    );

    expect(document.documentElement).toHaveAttribute("data-accent", "night");
    expect(localStorage.getItem("zemoney-accent")).toBe("night");
  });

  it("labels the menu in Chinese", async () => {
    render(
      <I18nProvider locale="zh" preference="zh">
        <ThemeSwitcher />
      </I18nProvider>,
    );

    fireEvent.pointerDown(
      await screen.findByRole("button", {
        name: "主题：跟随系统（当前为深色）",
      }),
      { button: 0, ctrlKey: false },
    );

    expect(await screen.findByText("外观")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitemradio", { name: "跟随系统" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("group", { name: "主题色" })).toBeInTheDocument();
    expect(screen.getByRole("menuitemradio", { name: "夜枭" })).toBeInTheDocument();
  });
});

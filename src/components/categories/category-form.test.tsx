// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryFields } from "@/components/categories/category-form";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import type { CategoryFormValue } from "@/components/categories/category-manager-model";

afterEach(cleanup);

describe("CategoryFields", () => {
  it("searches and selects directly from the Lucide icon library", () => {
    const value: CategoryFormValue = {
      name: "Transport",
      kind: "expense",
      icon: "Tags",
      color: "#64748b",
    };
    const onChange = vi.fn();

    render(<CategoryFields value={value} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "icon, current: Tags" });
    expect(trigger).toHaveClass("grid", "size-11");
    expect(trigger).not.toHaveTextContent("Tags");
    expect(trigger.querySelector("svg")).toBeInTheDocument();
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();

    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });

    const picker = screen.getByRole("group", { name: "Icon options" });
    expect(picker).toHaveClass("grid", "grid-cols-6");
    expect(within(picker).getAllByRole("menuitemradio").length).toBeGreaterThan(
      36,
    );
    expect(
      within(picker).getByRole("menuitemradio", { name: "tags" }),
    ).toHaveAttribute("aria-checked", "true");

    fireEvent.change(screen.getByRole("textbox", { name: "Search icons" }), {
      target: { value: "alarm-clock" },
    });
    fireEvent.click(
      within(picker).getByRole("menuitemradio", {
        name: /^alarm-clock$/u,
      }),
    );

    expect(onChange).toHaveBeenCalledWith({ ...value, icon: "alarm-clock" });
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("opens and selects from the icon menu with the keyboard", async () => {
    const value: CategoryFormValue = {
      name: "Transport",
      kind: "expense",
      icon: "Tags",
      color: "#64748b",
    };
    const onChange = vi.fn();

    render(<CategoryFields value={value} onChange={onChange} />);

    const trigger = screen.getByRole("button", { name: "icon, current: Tags" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const search = screen.getByRole("textbox", { name: "Search icons" });
    const first = screen.getByRole("menuitemradio", {
      name: "No icon",
    });
    await waitFor(() => expect(search).toHaveFocus());

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith({ ...value, icon: "" });
    expect(screen.queryByRole("menuitemradio")).not.toBeInTheDocument();
  });

  it("labels the fields and icon picker in Chinese", () => {
    const value: CategoryFormValue = {
      name: "Transport",
      kind: "expense",
      icon: "Tags",
      color: "#64748b",
    };

    render(
      <I18nProvider locale="zh" preference="zh">
        <CategoryFields value={value} onChange={vi.fn()} nameDisabled />
      </I18nProvider>,
    );

    expect(screen.getByLabelText("名称")).toHaveValue("Transport");
    expect(screen.getByText("内置名称用于自动分类匹配，不能修改。")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "颜色十六进制值" })).toHaveValue("#64748b");
    const trigger = screen.getByRole("button", { name: "图标，当前：Tags" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    expect(screen.getByRole("group", { name: "图标选项" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "搜索图标" })).toBeVisible();
  });
});

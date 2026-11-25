// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CategoryManager, type ManagedCategory } from "@/components/categories/category-manager";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import type { Locale } from "@/lib/i18n/locale";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function category(id: string, name: string, isSystem = true): ManagedCategory {
  return {
    id,
    name,
    kind: "both",
    icon: "Shapes",
    color: "#94a3b8",
    isSystem,
    sortOrder: 0,
    transactionCount: 0,
    ruleCount: 0,
  };
}

function renderManager(
  locale: Locale,
  categories: ManagedCategory[],
  status: { renamable: number; conflicting: number },
) {
  return render(
    <I18nProvider locale={locale} preference={locale}>
      <CategoryManager
        initialCategories={categories}
        initialRules={[]}
        initialBuiltInNames={{ locale, ...status }}
      />
    </I18nProvider>,
  );
}

function respondWith(data: unknown, status = 200) {
  const fetch = vi.fn(async () =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("built-in category names notice", () => {
  it("renames English built-ins for a Chinese UI and reports skipped names", async () => {
    const fetch = respondWith({
      data: {
        renamed: 1,
        skipped: 1,
        categories: [category("u:category:other", "其他"), category("u:category:food", "Food"), category("custom", "餐饮", false)],
        rules: [],
      },
    });
    renderManager(
      "zh",
      [category("u:category:other", "Other"), category("u:category:food", "Food"), category("custom", "餐饮", false)],
      { renamable: 1, conflicting: 1 },
    );

    const notice = screen.getByRole("region", { name: "内置分类名称" });
    expect(within(notice).getByText("有 2 个内置分类还在使用英文名称。")).toBeVisible();
    fireEvent.click(within(notice).getByRole("button", { name: "改为中文名称" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "已将 1 个内置分类改为中文名称。有 1 个因名称已被其他分类使用而跳过。",
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/categories/built-in-names",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ locale: "zh" }) }),
    );
    expect(screen.getByRole("heading", { name: "其他" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "内置分类名称" })).not.toBeInTheDocument();
  });

  it("offers English names in the English UI", async () => {
    respondWith({ data: { renamed: 2, skipped: 0, categories: [category("u:category:other", "Other")], rules: [] } });
    renderManager("en", [category("u:category:other", "其他")], { renamable: 2, conflicting: 0 });

    expect(screen.getByText("2 built-in categories still have Chinese names.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Use English names" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Renamed 2 built-in categories to English.");
  });

  it("stays hidden when nothing can be renamed and shows API errors", async () => {
    const { unmount } = renderManager("en", [category("u:category:other", "Other")], { renamable: 0, conflicting: 1 });
    expect(screen.queryByRole("button", { name: "Use English names" })).not.toBeInTheDocument();
    unmount();

    respondWith({ error: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" } }, 500);
    renderManager("zh", [category("u:category:other", "Other")], { renamable: 1, conflicting: 0 });
    fireEvent.click(screen.getByRole("button", { name: "改为中文名称" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("服务暂时不可用，请稍后重试"),
    );
    expect(screen.getByRole("button", { name: "改为中文名称" })).toBeEnabled();
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { AccountAppearanceSettings } from "@/components/settings/account-appearance-settings";

const themeState = vi.hoisted(() => ({
  resolvedTheme: "dark" as "dark" | "light" | undefined,
  setTheme: vi.fn<(theme: string) => void>(),
  theme: "system" as string | undefined,
}));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next-themes", () => ({
  useTheme: () => themeState,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

beforeEach(() => {
  document.documentElement.dataset.accent = "amber";
  localStorage.clear();
  themeState.resolvedTheme = "dark";
  themeState.theme = "system";
  themeState.setTheme.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AccountAppearanceSettings", () => {
  it("saves a trimmed display name and refreshes server-rendered account UI", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { displayName: "New nickname", avatarPreset: "piggy" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AccountAppearanceSettings
        email="demo@zowl.local"
        initialAvatarPreset="piggy"
        initialDisplayName="Ze"
      />,
    );

    expect(screen.getByRole("button", { name: "Save nickname" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Nickname"), {
      target: { value: "  New nickname  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save nickname" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "New nickname" }),
    });
    expect(await screen.findByText("Nickname updated")).toBeVisible();
    expect(screen.getByLabelText("Nickname")).toHaveValue("New nickname");
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("changes display mode and persists the selected accent color", () => {
    render(
      <AccountAppearanceSettings
        email="demo@zowl.local"
        initialAvatarPreset="piggy"
        initialDisplayName="Ze"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Follow system" }),
    ).toHaveClass(
      "border-divider",
      "bg-tint-amber",
      "text-foreground",
    );
    expect(
      screen.getByRole("button", { name: "Follow system" }),
    ).not.toHaveClass("border-divider", "bg-surface");
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(themeState.setTheme).toHaveBeenCalledWith("dark");

    const forestButton = screen.getByRole("button", { name: "Theme color: Forest" });
    expect(forestButton).toHaveStyle({ backgroundColor: "#2f7a57" });
    fireEvent.click(forestButton);
    expect(document.documentElement).toHaveAttribute("data-accent", "forest");
    expect(localStorage.getItem("zemoney-accent")).toBe("forest");
    expect(forestButton).toHaveAttribute("aria-pressed", "true");
  });

  it("saves a selected avatar preset and refreshes account chrome", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: { displayName: "Ze", avatarPreset: "cat" },
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AccountAppearanceSettings
        email="demo@zowl.local"
        initialAvatarPreset="piggy"
        initialDisplayName="Ze"
      />,
    );

    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Change avatar, current: Piggy bank",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Cat" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/api/settings/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ avatarPreset: "cat" }),
    });
    expect(
      await screen.findByRole("button", { name: "Change avatar, current: Cat" }),
    ).toBeVisible();
    expect(screen.queryByText("Avatar updated")).not.toBeInTheDocument();
    expect(document.querySelector("#display-name-status")).toBeNull();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("shows profile and appearance settings in Chinese", () => {
    render(
      <I18nProvider locale="zh" preference="zh">
        <AccountAppearanceSettings
          email="demo@zowl.local"
          initialAvatarPreset="piggy"
          initialDisplayName="Ze"
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "保存昵称" })).toBeDisabled();
    expect(screen.getByLabelText("昵称")).toHaveValue("Ze");
    expect(
      screen.getByRole("button", { name: "更换头像，当前：小猪存钱罐" }),
    ).toBeVisible();
    expect(screen.getByText("外观")).toBeVisible();
    expect(screen.getByRole("button", { name: "跟随系统" })).toBeVisible();
    expect(screen.getByRole("button", { name: "主题色：森林" })).toBeVisible();
  });
});

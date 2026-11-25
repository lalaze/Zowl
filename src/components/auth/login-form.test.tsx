// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { I18nProvider } from "@/components/i18n/i18n-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

describe("LoginForm", () => {
  it("validates in English by default", async () => {
    render(<LoginForm defaultEmail="" defaultPassword="" />);

    fireEvent.click(screen.getByRole("button", { name: "Open Zowl" }));

    expect(
      await screen.findByText("Enter a valid email address"),
    ).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
  });

  it("shows labels and validation messages in Chinese", async () => {
    render(
      <I18nProvider locale="zh" preference="zh">
        <LoginForm defaultEmail="" defaultPassword="" />
      </I18nProvider>,
    );

    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByLabelText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "显示密码" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "进入 Zowl" }));

    expect(await screen.findByText("请输入有效的邮箱")).toBeInTheDocument();
    expect(screen.getByText("请输入密码")).toBeInTheDocument();
  });
});

// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "@/components/i18n/i18n-provider";
import { QuickTransactionEntry } from "@/components/transactions/quick-transaction-entry";

const routerState = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  refresh: vi.fn<() => void>(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerState,
}));

const categories = [
  {
    id: "expense-food",
    name: "Food",
    kind: "expense" as const,
    color: "#f97316",
  },
  {
    id: "income-salary",
    name: "Salary",
    kind: "income" as const,
    color: "#10b981",
  },
];

const recognitionProvider = {
  id: "mock",
  label: "Mock Local demo",
  sendsImagesToThirdParty: false,
  disclosure: "Screenshots are not sent to external services.",
  retentionPolicy: "Mock No third-party copies are created.",
};

function response(status: number, data: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data }),
  } as Response;
}

beforeEach(() => {
  window.localStorage.clear();
  routerState.push.mockReset();
  routerState.refresh.mockReset();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickTransactionEntry", () => {
  it("posts the compact fields with CNY and the current time, then stays on the page", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(201, { id: "transaction-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const earliestTime = Date.now() - 60_000;

    render(
      <QuickTransactionEntry
        categories={categories}
        recognitionProvider={recognitionProvider}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add transaction/u }));

    expect(screen.getByRole("dialog", { name: "Quick entry" })).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "Manual entry" }),
    ).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Manual entry" }));
    expect(screen.getByLabelText("Amount")).toHaveFocus();
    expect(screen.getByLabelText("Expense")).toBeChecked();
    expect(screen.queryByLabelText("Currency")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Merchant name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Transaction time")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Payment method")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Transaction description")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "18.60" },
    });
    fireEvent.click(screen.getByRole("combobox", { name: "Category" }));
    fireEvent.click(screen.getByRole("option", { name: "Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and post" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as Record<string, unknown>;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/transactions");
    expect(request?.method).toBe("POST");
    expect(body).toMatchObject({
      type: "expense",
      amount: "18.60",
      currency: "CNY",
      merchantName: null,
      description: null,
      categoryId: "expense-food",
      paymentMethod: null,
      confirmation: { version: 1 },
    });
    expect(new Date(String(body.transactionTime)).getTime()).toBeGreaterThanOrEqual(
      earliestTime,
    );
    expect(new Date(String(body.transactionTime)).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Transaction posted");
    });
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/transactions/transaction-1",
    );
    expect(routerState.refresh).toHaveBeenCalledTimes(1);
    expect(routerState.push).not.toHaveBeenCalled();
  });

  it("opens with N, closes with Escape, and ignores N inside an input", () => {
    render(
      <>
        <label>
          Other input
          <input />
        </label>
        <QuickTransactionEntry
          categories={categories}
          recognitionProvider={recognitionProvider}
        />
      </>,
    );

    fireEvent.keyDown(window, { key: "n" });
    const dialog = screen.getByRole("dialog", { name: "Quick entry" });
    expect(dialog).toBeVisible();

    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const otherInput = screen.getByLabelText("Other input");
    otherInput.focus();
    fireEvent.keyDown(otherInput, { key: "n" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps a possible duplicate open until the user explicitly overrides it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(409, {
          status: "needs_review",
          confirmationId: "confirmation-1",
          items: [
            {
              assessmentDigest: "assessment-1",
              assessment: { reasonCode: "similar_facts" },
              validationIssues: [],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(response(201, { id: "transaction-2" }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QuickTransactionEntry
        categories={categories}
        recognitionProvider={recognitionProvider}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Add transaction/u }));
    fireEvent.click(screen.getByRole("tab", { name: "Manual entry" }));
    fireEvent.change(screen.getByLabelText("Amount"), {
      target: { value: "9.90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and post" }));

    expect(
      await screen.findByText(/very similar amount, merchant, and time/u),
    ).toBeVisible();
    expect(screen.getByRole("dialog", { name: "Quick entry" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Post anyway" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const firstBody = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as {
      confirmation: { id: string; version: number };
    };
    const overrideBody = JSON.parse(
      String(fetchMock.mock.calls[1]?.[1]?.body),
    ) as {
      confirmation: { id: string; version: number };
      duplicateOverride: { assessmentDigest: string };
    };
    expect(overrideBody).toMatchObject({
      confirmation: { id: firstBody.confirmation.id, version: 2 },
      duplicateOverride: { assessmentDigest: "assessment-1" },
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
  it('preserves amount when expanding details or switching entry modes', () => {
    render(<QuickTransactionEntry categories={categories} recognitionProvider={recognitionProvider} />);
    fireEvent.click(screen.getByRole('button', { name: /Add transaction/u }));
    fireEvent.click(screen.getByRole('tab', { name: 'Manual entry' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '18.60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add more details' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('18.60');
    expect(screen.getByLabelText('Merchant name')).toBeVisible();
    expect(routerState.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Automatic screenshot entry' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Manual entry' }));
    expect(screen.getByLabelText('Amount')).toHaveValue('18.60');
  });

  it("protects a dirty draft and gives consecutive postings different identities", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(201, { id: "first-post" }))
      .mockResolvedValueOnce(response(201, { id: "second-post" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QuickTransactionEntry categories={categories} recognitionProvider={recognitionProvider} />);
    fireEvent.click(screen.getByRole("button", { name: /Add transaction/u }));
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "21.60" } });
    fireEvent.click(screen.getByRole("button", { name: "Close quick entry" }));
    expect(screen.getByRole("button", { name: "Discard draft" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Amount")).toHaveValue("21.60");
    fireEvent.click(screen.getByLabelText("Keep open to post another"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm and post" }));
    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(""));
    expect(screen.getByRole("dialog", { name: "Quick entry" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "31.60" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and post" }));
    await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveValue(""));
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)));
    expect(bodies.map((body) => body.amount)).toEqual(["21.60", "31.60"]);
    expect(bodies[0].confirmation.id).not.toBe(bodies[1].confirmation.id);
  });

  it("shows the dialog and validation in Chinese", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>());
    render(
      <I18nProvider locale="zh" preference="zh">
        <QuickTransactionEntry
          categories={categories}
          recognitionProvider={recognitionProvider}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /记一笔/u }));

    expect(screen.getByRole("dialog", { name: "快捷记账" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "手动记账" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("支出")).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "确认入账" }));

    expect(await screen.findByText("请输入金额")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("请先检查标出的字段再入账");
  });
});

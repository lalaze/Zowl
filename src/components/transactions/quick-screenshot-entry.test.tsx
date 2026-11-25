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

import { QuickScreenshotEntry } from "@/components/transactions/quick-screenshot-entry";

const localProvider = {
  id: "test-local",
  label: "Local screenshots AI",
  sendsImagesToThirdParty: false,
  disclosure: "Local processing",
  retentionPolicy: "Not sent to third parties",
};

function jsonResponse(data: unknown, status = 201) {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function screenshot(name = "payment.png") {
  return new File([new Uint8Array([137, 80, 78, 71])], name, {
    type: "image/png",
  });
}

beforeEach(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:quick-screenshot"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("QuickScreenshotEntry", () => {
  it("uploads one selected screenshot and requests automatic confirmation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: "completed",
        jobId: "job-1",
        createdCount: 1,
        skippedCount: 0,
        failedCount: 0,
        transactionIds: ["transaction-1"],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onCompleted = vi.fn();
    const onPendingChange = vi.fn();
    render(
      <QuickScreenshotEntry
        provider={localProvider}
        onCompleted={onCompleted}
        onPendingChange={onPendingChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Select a quick-entry screenshot"), {
      target: { files: [screenshot()] },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as FormData;
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/imports/screenshots");
    expect(request?.method).toBe("POST");
    expect(body.get("autoConfirm")).toBe("true");
    expect(body.get("images")).toBeInstanceOf(File);
    await waitFor(() =>
      expect(onCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "completed",
          transactionIds: ["transaction-1"],
        }),
      ),
    );
    expect(onPendingChange).toHaveBeenNthCalledWith(1, true);
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("accepts a pasted image and keeps uncertain recognition in review", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: "needs_review",
        jobId: "job-review",
        reason: "low_confidence",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QuickScreenshotEntry
        provider={localProvider}
        onCompleted={vi.fn()}
      />,
    );

    fireEvent.paste(window, {
      clipboardData: { files: [screenshot("clipboard.png")] },
    });

    expect(
      await screen.findByText("AI Low confidence in recognition results 90%"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Review" })).toHaveAttribute(
      "href",
      "/imports/screenshots/job-review/review",
    );
  });

  it("requires consent before sending a screenshot to a third party", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        status: "needs_review",
        jobId: "job-third-party",
        reason: "recognition_failed",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <QuickScreenshotEntry
        provider={{
          ...localProvider,
          id: "http",
          label: "Third-party screenshots AI",
          sendsImagesToThirdParty: true,
        }}
        onCompleted={vi.fn()}
      />,
    );

    const input = screen.getByLabelText("Select a quick-entry screenshot");
    fireEvent.change(input, { target: { files: [screenshot()] } });
    expect(
      await screen.findByText("Agree to send the screenshot to the current recognition service first"),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByLabelText("I agree to send this screenshot to Third-party screenshots AI Recognize"),
    );
    fireEvent.change(input, { target: { files: [screenshot()] } });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = fetchMock.mock.calls[0]?.[1]?.body as FormData;
    expect(body.get("consentToThirdParty")).toBe("true");
  });
});

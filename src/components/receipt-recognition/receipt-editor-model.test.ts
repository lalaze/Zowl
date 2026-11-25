import { describe, expect, it } from "vitest";

import {
  buildReceiptUpdate,
  confidenceLabel,
  createReceiptEditorState,
  receiptEditorReducer,
  warningMessage,
} from "./receipt-editor-model";
import type { ReceiptRecognitionItem } from "./types";

function receipt(
  overrides: Partial<ReceiptRecognitionItem> = {},
): ReceiptRecognitionItem {
  return {
    id: "item-1",
    fileId: "file-1",
    fileName: "receipt.png",
    previewUrl: "/api/files/file-1",
    status: "recognized",
    errorMessage: null,
    transactionTime: "2026-07-17T02:00:00.000Z",
    type: "expense",
    amountMinor: 1_280,
    currency: "CNY",
    merchantName: "Original merchant",
    categoryId: null,
    suggestedCategory: null,
    description: null,
    paymentMethod: null,
    platformTransactionId: null,
    transactionStatus: null,
    confidence: 0.9,
    warnings: [],
    duplicateKind: "unique",
    decision: "import",
    ...overrides,
  };
}

describe("receipt editor model", () => {
  it("keeps dirty edits during server sync and accepts sync after save", () => {
    let state = createReceiptEditorState(receipt());
    state = receiptEditorReducer(state, {
      type: "change",
      key: "merchantName",
      value: "Local edit",
    });
    state = receiptEditorReducer(state, {
      type: "sync_item",
      item: receipt({ merchantName: "Server refresh" }),
    });
    expect(state.values.merchantName).toBe("Local edit");
    expect(state.dirty).toBe(true);

    state = receiptEditorReducer(state, { type: "save_success" });
    state = receiptEditorReducer(state, {
      type: "sync_item",
      item: receipt({ merchantName: "Saved content" }),
    });
    expect(state.values.merchantName).toBe("Saved content");
    expect(state.dirty).toBe(false);
    expect(state.saved).toBe(true);
  });

  it("resets dirty values when skipping and updates AI-adopted values", () => {
    const item = receipt();
    let state = receiptEditorReducer(createReceiptEditorState(item), {
      type: "change",
      key: "categoryId",
      value: "local-category",
    });
    state = receiptEditorReducer(state, { type: "skip_success", item });
    expect(state.values.categoryId).toBe("");
    expect(state.dirty).toBe(false);

    state = receiptEditorReducer(state, {
      type: "adopt_success",
      item: receipt({ categoryId: "ai-category" }),
    });
    expect(state.values.categoryId).toBe("ai-category");
  });

  it("validates and converts an editor save payload", () => {
    const initial = createReceiptEditorState(receipt());
    expect(buildReceiptUpdate({ ...initial.values, amount: "0" }, "en")).toEqual({
      success: false,
      error: "Complete the transaction type, valid amount, time, and three-letter currency code",
    });

    expect(buildReceiptUpdate(initial.values, "en")).toMatchObject({
      success: true,
      update: {
        type: "expense",
        amountMinor: 1_280,
        currency: "CNY",
        merchantName: "Original merchant",
      },
    });
  });

  it("writes validation, confidence and warning copy in Chinese", () => {
    const initial = createReceiptEditorState(receipt());
    expect(buildReceiptUpdate({ ...initial.values, amount: "0" }, "zh")).toEqual({
      success: false,
      error: "请补全收支类型、有效金额、交易时间和三位币种代码",
    });
    expect(confidenceLabel(0.9, "en")).toBe("90% Confidence");
    expect(confidenceLabel(0.9, "zh")).toBe("置信度 90%");
    expect(warningMessage({ code: "" }, "zh")).toBe("识别结果需要检查");
    expect(warningMessage("Merchant unclear", "en")).toBe("Merchant unclear");
  });
});

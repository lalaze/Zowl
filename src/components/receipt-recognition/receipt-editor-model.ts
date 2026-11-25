import { translator, type Locale } from "@/lib/i18n/locale";
import { localizeServerMessage } from "@/lib/i18n/server-messages";
import { decimalToMinor, minorToDecimal } from "@/lib/money";

import {
  isDuplicateKind,
  type ReceiptDecision,
  type ReceiptRecognitionItem,
  type ReceiptType,
} from "./types";

export type EditorValues = {
  type: ReceiptType | "";
  amount: string;
  transactionTime: string;
  currency: string;
  merchantName: string;
  categoryId: string;
  description: string;
  paymentMethod: string;
  platformTransactionId: string;
  transactionStatus: string;
};

export type ReceiptEditorState = {
  values: EditorValues;
  syncedItem: ReceiptRecognitionItem;
  dirty: boolean;
  pending: boolean;
  decisionPending: boolean;
  error: string | null;
  saved: boolean;
};

export type ReceiptEditorAction =
  | { type: "sync_item"; item: ReceiptRecognitionItem }
  | { type: "change"; key: keyof EditorValues; value: EditorValues[keyof EditorValues] }
  | { type: "request_start"; request: "save" | "decision" }
  | { type: "request_end"; request: "save" | "decision" }
  | { type: "request_error"; message: string }
  | { type: "save_success" }
  | { type: "skip_success"; item: ReceiptRecognitionItem }
  | { type: "adopt_success"; item: ReceiptRecognitionItem };

export function minorAmountToInput(
  amountMinor: number | null,
  currency: string | null,
) {
  if (amountMinor === null || !currency) return "";
  try {
    return minorToDecimal(amountMinor, currency);
  } catch {
    return "";
  }
}

export function parseAmountToMinor(value: string, currency: string) {
  try {
    const amountMinor = decimalToMinor(value, currency);
    return amountMinor > 0 ? amountMinor : null;
  } catch {
    return null;
  }
}

export function toDatetimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19);
}

export function confidenceLabel(confidence: number | null, locale: Locale) {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  const percentage = confidence <= 1 ? confidence * 100 : confidence;
  const value = Math.max(0, Math.min(100, Math.round(percentage)));
  return translator(locale)(`${value}% Confidence`, `置信度 ${value}%`);
}

/** Recognition warnings come from the server in English. */
export function warningMessage(
  warning: ReceiptRecognitionItem["warnings"][number],
  locale: Locale,
) {
  if (typeof warning === "string") return localizeServerMessage(warning, locale);
  const message = warning.message?.trim();
  if (message) return localizeServerMessage(message, locale);
  return (
    warning.code?.trim() ||
    translator(locale)("Recognition results need review", "识别结果需要检查")
  );
}

export function hasRequiredFields(item: ReceiptRecognitionItem) {
  return Boolean(
    item.type &&
      item.amountMinor &&
      item.amountMinor > 0 &&
      item.transactionTime &&
      item.currency &&
      /^[A-Z]{3}$/u.test(item.currency),
  );
}

export function normalizedDecision(
  item: ReceiptRecognitionItem,
): ReceiptDecision {
  if (item.decision) return item.decision;
  return isDuplicateKind(item.duplicateKind) ? "pending" : "import";
}

export function valuesFromItem(item: ReceiptRecognitionItem): EditorValues {
  return {
    type: item.type ?? "",
    amount: minorAmountToInput(item.amountMinor, item.currency),
    transactionTime: toDatetimeLocal(item.transactionTime),
    currency: item.currency ?? "",
    merchantName: item.merchantName ?? "",
    categoryId: item.categoryId ?? "",
    description: item.description ?? "",
    paymentMethod: item.paymentMethod ?? "",
    platformTransactionId: item.platformTransactionId ?? "",
    transactionStatus: item.transactionStatus ?? "",
  };
}

export function createReceiptEditorState(
  item: ReceiptRecognitionItem,
): ReceiptEditorState {
  return {
    values: valuesFromItem(item),
    syncedItem: item,
    dirty: false,
    pending: false,
    decisionPending: false,
    error: null,
    saved: false,
  };
}

export function receiptEditorReducer(
  state: ReceiptEditorState,
  action: ReceiptEditorAction,
): ReceiptEditorState {
  switch (action.type) {
    case "sync_item":
      if (action.item === state.syncedItem) return state;
      return {
        ...state,
        syncedItem: action.item,
        values: state.dirty ? state.values : valuesFromItem(action.item),
      };
    case "change":
      return {
        ...state,
        values: { ...state.values, [action.key]: action.value },
        dirty: true,
        saved: false,
        error: null,
      };
    case "request_start":
      return {
        ...state,
        pending: action.request === "save" ? true : state.pending,
        decisionPending:
          action.request === "decision" ? true : state.decisionPending,
        error: null,
      };
    case "request_end":
      return {
        ...state,
        pending: action.request === "save" ? false : state.pending,
        decisionPending:
          action.request === "decision" ? false : state.decisionPending,
      };
    case "request_error":
      return { ...state, error: action.message };
    case "save_success":
      return { ...state, dirty: false, saved: true };
    case "skip_success":
      return {
        ...state,
        values: valuesFromItem(action.item),
        dirty: false,
        saved: false,
      };
    case "adopt_success":
      return { ...state, values: valuesFromItem(action.item) };
  }
}

export function missingEditorFields(values: EditorValues) {
  return {
    type: !values.type,
    amount: !parseAmountToMinor(values.amount, values.currency),
    transactionTime: !values.transactionTime,
    currency: !/^[A-Za-z]{3}$/u.test(values.currency.trim()),
  };
}

export function buildReceiptUpdate(values: EditorValues, locale: Locale) {
  const t = translator(locale);
  const amountMinor = parseAmountToMinor(values.amount, values.currency);
  if (
    !values.type ||
    !amountMinor ||
    !values.transactionTime ||
    !/^[A-Za-z]{3}$/u.test(values.currency.trim())
  ) {
    return {
      success: false as const,
      error: t(
        "Complete the transaction type, valid amount, time, and three-letter currency code",
        "请补全收支类型、有效金额、交易时间和三位币种代码",
      ),
    };
  }
  const transactionDate = new Date(values.transactionTime);
  if (Number.isNaN(transactionDate.getTime())) {
    return {
      success: false as const,
      error: t("Invalid transaction time. Select it again", "交易时间格式无效，请重新选择"),
    };
  }
  return {
    success: true as const,
    update: {
      type: values.type,
      amountMinor,
      transactionTime: transactionDate.toISOString(),
      currency: values.currency.trim().toUpperCase(),
      merchantName: values.merchantName.trim() || null,
      categoryId: values.categoryId || null,
      description: values.description.trim() || null,
      paymentMethod: values.paymentMethod.trim() || null,
      platformTransactionId: values.platformTransactionId.trim() || null,
      transactionStatus: values.transactionStatus.trim() || null,
    },
  };
}

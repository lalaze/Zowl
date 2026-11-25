import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { categories, transactionTypes } from "@/db/schema";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import { defaultCategoryForName } from "@/lib/default-categories";
import { createTransactionFingerprint } from "@/lib/fingerprint";
import { normalizeMerchantName } from "@/lib/merchant";
import { decimalToMinor, isSupportedCurrency } from "@/lib/money";
import { createCategorizationService } from "@/services/categorization-service";
import { getDefaultCategory } from "@/services/categorization-service/default-category";
import type { ReceiptRecognitionResult } from "@/services/receipt-recognition-service";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import {
  stagedReceiptDataSchema,
  type ConfirmableReceiptData,
  type StagedReceiptData,
} from "@/services/screenshot-recognition-service/schema";

export type ValidationIssue = {
  field: string;
  code: string;
  message: string;
};

export const emptyReceiptData: StagedReceiptData = {
  type: null,
  amountMinor: null,
  currency: null,
  merchantName: null,
  description: null,
  transactionTime: null,
  source: "screenshot",
  paymentMethod: null,
  platformTransactionId: null,
  transactionStatus: null,
  suggestedCategory: null,
  categoryId: null,
  confidence: null,
};

export function requiredFieldIssues(
  data: StagedReceiptData,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!data.type) {
    issues.push({ field: "type", code: "REQUIRED", message: "Confirm transaction type" });
  }
  if (!data.amountMinor) {
    issues.push({ field: "amountMinor", code: "REQUIRED", message: "Enter a valid amount" });
  }
  if (!data.transactionTime) {
    issues.push({
      field: "transactionTime",
      code: "REQUIRED",
      message: "Enter a transaction time",
    });
  }
  if (!data.currency) {
    issues.push({ field: "currency", code: "REQUIRED", message: "Confirm currency" });
  } else if (!isSupportedCurrency(data.currency)) {
    issues.push({
      field: "currency",
      code: "UNSUPPORTED_CURRENCY",
      message: "Only currencies with two decimal places are supported",
    });
  }
  return issues;
}

export function fromProviderResult(
  result: ReceiptRecognitionResult,
): StagedReceiptData {
  let amountMinor: number | null = null;
  if (result.amount !== null && result.currency !== null) {
    try {
      amountMinor = decimalToMinor(String(result.amount), result.currency);
    } catch {
      amountMinor = null;
    }
  }
  return stagedReceiptDataSchema.parse({
    type: result.type,
    amountMinor,
    currency: result.currency,
    merchantName: result.merchantName,
    description: result.description,
    transactionTime: result.transactionTime,
    source: "screenshot",
    paymentMethod: result.paymentMethod,
    platformTransactionId: result.platformTransactionId,
    transactionStatus: result.status,
    suggestedCategory: result.suggestedCategory,
    categoryId: null,
    confidence: result.confidence,
  });
}

export function providerPayloadHash(result: ReceiptRecognitionResult) {
  return createHash("sha256").update(JSON.stringify(result)).digest("hex");
}

export function assertOwnedCategory(
  database: Database,
  userId: string,
  categoryId: string | null,
  type: (typeof transactionTypes)[number],
) {
  if (!categoryId) return;
  const category = database
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .get();
  if (!category || !categoryKindSupportsTransaction(category.kind, type)) {
    throw new ScreenshotRecognitionServiceError(
      "CATEGORY_NOT_FOUND",
      "Selected category is missing or incompatible with this transaction type",
      422,
    );
  }
}

export function resolveSuggestedCategory(
  database: Database,
  userId: string,
  data: StagedReceiptData,
) {
  if (!data.type) return null;
  const ruleSuggestion = createCategorizationService(database).suggest({
    userId,
    type: data.type,
    merchantName: data.merchantName,
    description: data.description,
  });
  if (
    ruleSuggestion.ruleSource === "merchant_rule" ||
    ruleSuggestion.ruleSource === "keyword"
  ) {
    return ruleSuggestion.categoryId;
  }
  const suggested = findSuggestedCategory(database, userId, data.suggestedCategory);
  if (suggested && categoryKindSupportsTransaction(suggested.kind, data.type)) {
    return suggested.id;
  }
  return ruleSuggestion.categoryId;
}

/**
 * The category a recognition model named: one of the user's categories with
 * that name, else the built-in whose default name (in either language) it is,
 * so "餐饮" still finds a built-in that is currently called "Food".
 */
export function findSuggestedCategory(
  database: Database,
  userId: string,
  suggestedName: string | null,
) {
  if (!suggestedName) return null;
  const named = database
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.userId, userId), eq(categories.name, suggestedName)))
    .get();
  if (named) return named;
  const builtIn = defaultCategoryForName(suggestedName);
  return builtIn ? (getDefaultCategory(database, userId, builtIn.key) ?? null) : null;
}

export function deduplicationInput(data: ConfirmableReceiptData) {
  return {
    type: data.type,
    amountMinor: data.amountMinor,
    currency: data.currency,
    merchantName: data.merchantName,
    description: data.description,
    transactionTime: data.transactionTime,
    source: "screenshot" as const,
    platformTransactionId: data.platformTransactionId,
  };
}

export function compareStagedTransactions(
  first: ConfirmableReceiptData,
  second: ConfirmableReceiptData,
) {
  if (
    first.platformTransactionId &&
    first.platformTransactionId === second.platformTransactionId
  ) {
    return "duplicate" as const;
  }
  if (
    createTransactionFingerprint(deduplicationInput(first)) ===
    createTransactionFingerprint(deduplicationInput(second))
  ) {
    return "duplicate" as const;
  }
  const firstMerchant = normalizeMerchantName(first.merchantName);
  const secondMerchant = normalizeMerchantName(second.merchantName);
  if (
    first.type === second.type &&
    first.amountMinor === second.amountMinor &&
    first.currency === second.currency &&
    firstMerchant &&
    firstMerchant === secondMerchant &&
    Math.abs(
      new Date(first.transactionTime).getTime() -
        new Date(second.transactionTime).getTime(),
    ) <=
      5 * 60_000
  ) {
    return "possible_duplicate" as const;
  }
  return null;
}

export function safeStoredData(value: unknown) {
  const parsed = stagedReceiptDataSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...emptyReceiptData };
}

export function withoutCategorySuggestion(data: StagedReceiptData) {
  const result = { ...data };
  delete result.categorySuggestion;
  return result;
}

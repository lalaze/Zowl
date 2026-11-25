import { z } from "zod";

import { transactionTypes } from "@/db/schema";
import { isSupportedCurrency } from "@/lib/money";
import { normalizeTransactionTime } from "@/lib/transaction-time";
import { storedAiCategorySuggestionSchema } from "@/services/ai-categorization-service";

const nullableText = (maximumLength: number) =>
  z.string().max(maximumLength).nullable();

const transactionTimeSchema = z
  .iso.datetime({ offset: true })
  .max(64)
  .transform(normalizeTransactionTime);

export const stagedReceiptDataSchema = z
  .object({
    type: z.enum(transactionTypes).nullable(),
    amountMinor: z.number().int().positive().safe().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/u).nullable(),
    merchantName: nullableText(240),
    description: nullableText(1_000),
    transactionTime: transactionTimeSchema.nullable(),
    source: z.literal("screenshot"),
    paymentMethod: nullableText(120),
    platformTransactionId: nullableText(256),
    transactionStatus: nullableText(120),
    suggestedCategory: nullableText(120),
    categoryId: nullableText(160),
    confidence: z.number().min(0).max(1).nullable(),
    categorySuggestion: storedAiCategorySuggestionSchema.optional(),
  })
  .strict();

export const confirmableReceiptDataSchema = stagedReceiptDataSchema.extend({
  type: z.enum(transactionTypes),
  amountMinor: z.number().int().positive().safe(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .refine(isSupportedCurrency, "Only currencies with two decimal places are supported"),
  transactionTime: transactionTimeSchema,
});

function editableNullableText(maximumLength: number) {
  return z
    .union([z.string().max(maximumLength), z.null()])
    .transform((value) => {
      if (value === null) return null;
      const normalized = value.normalize("NFKC").trim();
      return normalized || null;
    });
}

export const receiptItemEditSchema = z
  .object({
    type: z.enum(transactionTypes),
    amountMinor: z.number().int().positive().safe(),
    currency: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{3}$/u)
          .refine(isSupportedCurrency, "Only currencies with two decimal places are supported"),
      ),
    merchantName: editableNullableText(240),
    description: editableNullableText(1_000),
    transactionTime: transactionTimeSchema,
    paymentMethod: editableNullableText(120),
    platformTransactionId: editableNullableText(256),
    transactionStatus: editableNullableText(120),
    categoryId: editableNullableText(160),
  })
  .strict();

export const receiptDecisionSchema = z.enum([
  "import",
  "skip",
  "import_anyway",
]);

export type ConfirmableReceiptData = z.infer<
  typeof confirmableReceiptDataSchema
>;
export type ReceiptDecision = z.infer<typeof receiptDecisionSchema>;
export type ReceiptItemEdit = z.infer<typeof receiptItemEditSchema>;
export type StagedReceiptData = z.infer<typeof stagedReceiptDataSchema>;

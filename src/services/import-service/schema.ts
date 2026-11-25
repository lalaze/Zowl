import { z } from "zod";

import { importSources, transactionTypes } from "@/db/schema";
import { isSupportedCurrency } from "@/lib/money";
import { normalizeTransactionTime } from "@/lib/transaction-time";
import { storedAiCategorySuggestionSchema } from "@/services/ai-categorization-service";
import { canonicalImportFields } from "@/services/import-service/types";

export const fieldMappingSchema = z.partialRecord(
  z.enum(canonicalImportFields),
  z.string().trim().min(1).max(160),
);

export const storedNormalizedSchema = z
  .object({
    type: z.enum(transactionTypes).nullable(),
    amount: z.string(),
    amountMinor: z.number().int().nonnegative().nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    merchantName: z.string().nullable(),
    description: z.string().nullable(),
    categoryId: z.string().nullable(),
    categoryName: z.string().nullable(),
    transactionTime: z.string().nullable(),
    source: z.enum(importSources),
    paymentMethod: z.string().nullable(),
    platformTransactionId: z.string().nullable(),
    status: z.string().nullable(),
    categorySuggestion: storedAiCategorySuggestionSchema.optional(),
  })
  .strict();

export const confirmableNormalizedSchema = storedNormalizedSchema.extend({
  type: z.enum(transactionTypes),
  amountMinor: z.number().int().positive(),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/u)
    .refine(isSupportedCurrency),
  transactionTime: z
    .iso.datetime({ offset: true })
    .transform(normalizeTransactionTime),
});

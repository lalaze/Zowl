import { z } from "zod";

import { transactionSources, transactionTypes } from "@/db/schema";
import { isSupportedCurrency } from "@/lib/money";
import { normalizeTransactionTime } from "@/lib/transaction-time";

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null(), z.undefined()])
    .transform((value) => (value ? value : null));

export const transactionInputSchema = z.object({
  type: z.enum(transactionTypes),
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount")
    .max(24, "Amount is too long"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Currency must be a three-letter code")
    .refine(isSupportedCurrency, "Only currencies with two decimal places are supported")
    .default("CNY"),
  merchantName: optionalText(120),
  description: optionalText(240),
  categoryId: optionalText(80),
  transactionTime: z
    .iso.datetime({ offset: true })
    .transform(normalizeTransactionTime),
  paymentMethod: optionalText(80),
});

export const transactionUpdateSchema = transactionInputSchema.extend({
  learnCategoryRule: z.boolean().default(false),
});

export const transactionAmendmentInputSchema = transactionUpdateSchema.extend({
  expectedRevisionId: z.string().trim().min(1).max(160),
  operationId: z.string().trim().min(1).max(160),
  duplicateOverride: z
    .object({ assessmentDigest: z.string().trim().min(1).max(128) })
    .optional(),
});

export const transactionVoidInputSchema = z.object({
  expectedRevisionId: z.string().trim().min(1).max(160),
  operationId: z.string().trim().min(1).max(160),
});

export const bulkVoidSchema = z.object({
  operationId: z.string().trim().min(1).max(160),
  targets: z
    .array(
      z.object({
        transactionId: z.string().trim().min(1).max(160),
        expectedRevisionId: z.string().trim().min(1).max(160),
      }),
    )
    .min(1)
    .max(100),
});

const optionalQueryValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    schema.optional(),
  );

const paginationValue = (defaultValue: number, maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce.number().int().min(1).max(maximum).default(defaultValue),
  );

export const transactionListQuerySchema = z
  .object({
    dateFrom: optionalQueryValue(z.iso.date()),
    dateTo: optionalQueryValue(z.iso.date()),
    categoryId: optionalQueryValue(z.string().trim().min(1).max(80)),
    uncategorized: optionalQueryValue(
      z.enum(["true", "false"]).transform((value) => value === "true"),
    ),
    currency: optionalQueryValue(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z]{3}$/, "Currency must be a three-letter code"),
    ),
    source: optionalQueryValue(z.enum(transactionSources)),
    type: optionalQueryValue(z.enum(transactionTypes)),
    keyword: optionalQueryValue(z.string().trim().min(1).max(100)),
    page: paginationValue(1, 100_000),
    limit: paginationValue(20, 100),
  })
  .superRefine((value, context) => {
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "End date must not precede start date",
      });
    }
    if (value.uncategorized && value.categoryId) {
      context.addIssue({
        code: "custom",
        path: ["categoryId"],
        message: "Cannot combine uncategorized with a specific category",
      });
    }
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type TransactionUpdateInput = z.infer<
  typeof transactionUpdateSchema
>;
export type TransactionAmendmentInput = z.infer<
  typeof transactionAmendmentInputSchema
>;
export type TransactionListQuery = z.infer<
  typeof transactionListQuerySchema
>;

import { z } from "zod";

import {
  importSources,
  notificationCapturePlatforms,
  transactionTypes,
} from "@/db/schema";
import { isSupportedCurrency } from "@/lib/money";
import { normalizeTransactionTime } from "@/lib/transaction-time";

const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null(), z.undefined()])
    .transform((value) => (value ? value : null));

export const ledgerFactsSchema = z.object({
  type: z.enum(transactionTypes),
  amountMinor: z.number().int().nonnegative(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/u)
    .refine(isSupportedCurrency, "Only currencies with two decimal places are supported"),
  merchantName: nullableText(120),
  description: nullableText(240),
  categoryId: nullableText(80),
  transactionTime: z
    .iso.datetime({ offset: true })
    .transform(normalizeTransactionTime),
  paymentMethod: nullableText(80),
});

export const sourceProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }),
  z.object({
    kind: z.literal("file_import"),
    importItemId: z.string().trim().min(1).max(160),
    batchId: z.string().trim().min(1).max(160),
    fileId: z.string().trim().min(1).max(160),
    platform: z.enum(importSources),
    platformTransactionId: nullableText(160),
    platformStatus: nullableText(160),
  }),
  z.object({
    kind: z.literal("screenshot_recognition"),
    recognitionItemId: z.string().trim().min(1).max(160),
    jobId: z.string().trim().min(1).max(160),
    fileId: z.string().trim().min(1).max(160),
    providerId: z.string().trim().min(1).max(160),
    platformTransactionId: nullableText(160),
    platformStatus: nullableText(160),
    confidenceBasisPoints: z.number().int().min(0).max(10_000).nullable(),
  }),
  z.object({
    kind: z.literal("notification_capture"),
    captureId: z.string().trim().min(1).max(160),
    platform: z.enum(notificationCapturePlatforms),
    sourcePackage: z.string().trim().min(1).max(160),
    parserId: z.string().trim().min(1).max(80),
    parserVersion: z.number().int().positive(),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    platformTransactionId: z.null(),
    platformStatus: z.literal("success"),
    confidenceBasisPoints: z.number().int().min(0).max(10_000),
  }),
  z.object({
    kind: z.literal("payment_page_capture"),
    captureId: z.string().trim().min(1).max(160),
    platform: z.enum(notificationCapturePlatforms),
    sourcePackage: z.string().trim().min(1).max(160),
    parserId: z.string().trim().min(1).max(80),
    parserVersion: z.number().int().positive(),
    evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    platformTransactionId: z.null(),
    platformStatus: z.literal("success"),
    confidenceBasisPoints: z.number().int().min(0).max(10_000),
  }),
]);

export const possibleDuplicateOverrideSchema = z.object({
  assessmentDigest: z.string().trim().min(1).max(128),
});

export const postingConfirmationCommandSchema = z.object({
  identity: z.object({
    id: z.string().trim().min(1).max(160),
    version: z.number().int().positive(),
  }),
  items: z
    .array(
      z.object({
        sourceItemRef: z.string().trim().min(1).max(160),
        decision: z.enum(["post", "skip"]),
        candidate: z.object({
          facts: ledgerFactsSchema,
          provenance: sourceProvenanceSchema,
        }),
        duplicateOverride: possibleDuplicateOverrideSchema.optional(),
      }),
    )
    .max(500),
});

export const transactionAmendmentCommandSchema = z.object({
  transactionId: z.string().trim().min(1).max(160),
  expectedRevisionId: z.string().trim().min(1).max(160),
  operationId: z.string().trim().min(1).max(160),
  facts: ledgerFactsSchema,
  duplicateOverride: possibleDuplicateOverrideSchema.optional(),
  learnCategoryRule: z.boolean().default(false),
});

export const transactionVoidCommandSchema = z
  .object({
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
  })
  .superRefine((command, context) => {
    const seen = new Set<string>();
    command.targets.forEach((target, index) => {
      if (seen.has(target.transactionId)) {
        context.addIssue({
          code: "custom",
          message: "A void command cannot contain the same transaction twice",
          path: ["targets", index, "transactionId"],
        });
      }
      seen.add(target.transactionId);
    });
  });

export type LedgerFacts = z.infer<typeof ledgerFactsSchema>;
export type SourceProvenance = z.infer<typeof sourceProvenanceSchema>;
export type PostingConfirmationCommand = z.infer<
  typeof postingConfirmationCommandSchema
>;
export type TransactionAmendmentCommand = z.infer<
  typeof transactionAmendmentCommandSchema
>;
export type TransactionVoidCommand = z.infer<
  typeof transactionVoidCommandSchema
>;

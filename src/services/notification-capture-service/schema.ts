import { z } from "zod";

import { notificationCapturePlatforms } from "@/db/schema";
import { normalizeTransactionTime } from "@/lib/transaction-time";
import { orderContextSchema } from "@/services/ai-categorization-service/order-details-schema";

const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null(), z.undefined()])
    .transform((value) => (value ? value : null));

export const notificationCaptureEventSchema = z.object({
  idempotencyKey: z.string().regex(/^[a-f0-9]{64}$/u),
  platform: z.enum(notificationCapturePlatforms),
  sourcePackage: z.string().trim().min(1).max(160),
  postedAt: z
    .iso.datetime({ offset: true })
    .transform(normalizeTransactionTime),
  parserId: z.string().trim().min(1).max(80),
  parserVersion: z.number().int().positive().max(10_000),
  evidenceDigest: z.string().regex(/^[a-f0-9]{64}$/u),
  confidenceBasisPoints: z.number().int().min(0).max(10_000),
  facts: z.object({
    amountMinor: z.number().int().positive(),
    merchantName: nullableText(120),
  }),
  // Text of the order pages shown before a shopping-app payment (ADR-0014).
  // Anything malformed here is dropped, never a reason to reject the event:
  // a rejected event is deleted from the phone and the payment is lost.
  orderContext: orderContextSchema.optional().catch(undefined),
});

export const notificationCaptureBatchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(20),
});

export const notificationCaptureEditSchema = z.object({
  amountMinor: z.number().int().positive(),
  merchantName: nullableText(120),
  description: nullableText(240),
  categoryId: nullableText(80),
  transactionTime: z
    .iso.datetime({ offset: true })
    .transform(normalizeTransactionTime),
  paymentMethod: nullableText(80),
});

export const notificationCaptureConfirmSchema = z.object({
  decision: z.enum(["post", "skip"]),
  assessmentDigest: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .optional(),
});

export const notificationCaptureQuickConfirmSchema = z.object({
  merchantName: z.string().trim().min(1).max(120).optional(),
});

export const notificationCaptureListQuerySchema = z.object({
  status: z.enum(["reviewing", "completed", "all"]).default("reviewing"),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const notificationCaptureSettingsInputSchema = z
  .object({
    autoPostAlipay: z.boolean().optional(),
    autoPostWechat: z.boolean().optional(),
    autoPostCmb: z.boolean().optional(),
    autoPostPaymentPages: z.boolean().optional(),
    autoPostMaxAmountMinor: z.number().int().min(0).max(100_000_000).optional(),
    autoPostTrustedMaxAmountMinor: z
      .number()
      .int()
      .min(0)
      .max(100_000_000)
      .optional(),
  })
  .strict()
  .refine(
    (input) =>
      input.autoPostAlipay !== undefined ||
      input.autoPostWechat !== undefined ||
      input.autoPostCmb !== undefined ||
      input.autoPostPaymentPages !== undefined ||
      input.autoPostMaxAmountMinor !== undefined ||
      input.autoPostTrustedMaxAmountMinor !== undefined,
    { message: "Change at least one setting" },
  );

export type NotificationCaptureEvent = z.infer<
  typeof notificationCaptureEventSchema
>;
export type NotificationCaptureEdit = z.infer<
  typeof notificationCaptureEditSchema
>;
export type NotificationCaptureConfirm = z.infer<
  typeof notificationCaptureConfirmSchema
>;
export type NotificationCaptureQuickConfirm = z.infer<
  typeof notificationCaptureQuickConfirmSchema
>;
export type NotificationCaptureSettingsInput = z.infer<
  typeof notificationCaptureSettingsInputSchema
>;

export const notificationCaptureBulkConfirmSchema = z.object({
  items: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive() })).min(1).max(20),
}).refine((input) => new Set(input.items.map((item) => item.id)).size === input.items.length, "Select each candidate once");

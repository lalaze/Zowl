import { z } from "zod";

const nullableText = (maximumLength: number) =>
  z.string().min(1).max(maximumLength).regex(/\S/u).nullable();

/**
 * The only receipt-recognition payload accepted by the application.
 *
 * Provider responses are untrusted input. Keep this object strict so a model
 * cannot smuggle provider-specific or unexpectedly large data into storage.
 */
export const receiptRecognitionResultSchema = z
  .object({
    type: z.enum(["expense", "income", "transfer", "refund"]).nullable(),
    amount: z.number().positive().multipleOf(0.01).nullable(),
    currency: z.string().regex(/^[A-Z]{3}$/u).nullable(),
    merchantName: nullableText(240),
    description: nullableText(1_000),
    transactionTime: z.iso.datetime({ offset: true }).max(64).nullable(),
    paymentMethod: nullableText(120),
    platformTransactionId: nullableText(256),
    status: nullableText(120),
    source: z.literal("screenshot"),
    suggestedCategory: nullableText(120),
    confidence: z.number().min(0).max(1).nullable(),
    warnings: z.array(z.string().min(1).max(500).regex(/\S/u)).max(20),
  })
  .strict();

export type ReceiptRecognitionResult = z.infer<
  typeof receiptRecognitionResultSchema
>;

/** JSON Schema sent to providers that support structured model output. */
export const receiptRecognitionJsonSchema = z.toJSONSchema(
  receiptRecognitionResultSchema,
  { io: "output" },
);

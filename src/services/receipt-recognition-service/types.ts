import type { Locale } from "@/lib/i18n/locale";
import type { ReceiptRecognitionResult } from "@/services/receipt-recognition-service/schema";

export const receiptImageMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type ReceiptImageMimeType = (typeof receiptImageMimeTypes)[number];

export interface ReceiptRecognitionInput {
  /** Raw image bytes. They are encoded only inside a concrete provider. */
  bytes: Uint8Array;
  mimeType: ReceiptImageMimeType;
  originalName?: string | null;
  /** Language the model writes `warnings` in: the uploader's UI language. */
  locale: Locale;
}

export interface ReceiptRecognitionProvider {
  readonly name: string;
  readonly sendsImagesToThirdParty: boolean;
  recognize(input: ReceiptRecognitionInput): Promise<ReceiptRecognitionResult>;
}

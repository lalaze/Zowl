import { z } from "zod";

import { ReceiptRecognitionError } from "@/services/receipt-recognition-service/error";
import {
  receiptImageMimeTypes,
  type ReceiptRecognitionInput,
} from "@/services/receipt-recognition-service/types";

export const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;

const metadataSchema = z.object({
  mimeType: z.enum(receiptImageMimeTypes),
  originalName: z.string().trim().min(1).max(180).nullable().optional(),
});

export function assertReceiptRecognitionInput(
  input: ReceiptRecognitionInput,
) {
  const metadata = metadataSchema.safeParse(input);
  if (!metadata.success) {
    throw new ReceiptRecognitionError(
      "INVALID_IMAGE_INPUT",
      "Invalid recognition image type or filename",
    );
  }
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) {
    throw new ReceiptRecognitionError(
      "INVALID_IMAGE_INPUT",
      "Recognition image is empty",
    );
  }
  if (input.bytes.byteLength > MAX_RECEIPT_IMAGE_BYTES) {
    throw new ReceiptRecognitionError(
      "IMAGE_TOO_LARGE",
      "Recognition image must be smaller than 8 MiB",
    );
  }
}

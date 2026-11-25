import {
  receiptRecognitionResultSchema,
  type ReceiptRecognitionResult,
} from "@/services/receipt-recognition-service/schema";
import { assertReceiptRecognitionInput } from "@/services/receipt-recognition-service/input";
import type {
  ReceiptRecognitionInput,
  ReceiptRecognitionProvider,
} from "@/services/receipt-recognition-service/types";

const defaultResult: ReceiptRecognitionResult = {
  type: null,
  amount: null,
  currency: null,
  merchantName: null,
  description: null,
  transactionTime: null,
  paymentMethod: null,
  platformTransactionId: null,
  status: null,
  source: "screenshot",
  suggestedCategory: null,
  confidence: null,
  warnings: ["Currently in Mock recognition mode does not read image content. Enter and confirm fields manually."],
};

export class MockReceiptRecognitionProvider
  implements ReceiptRecognitionProvider
{
  readonly name = "mock";
  readonly sendsImagesToThirdParty = false;
  private readonly fixedResult: ReceiptRecognitionResult;

  constructor(fixedResult: ReceiptRecognitionResult = defaultResult) {
    this.fixedResult = receiptRecognitionResultSchema.parse(fixedResult);
  }

  async recognize(
    input: ReceiptRecognitionInput,
  ): Promise<ReceiptRecognitionResult> {
    assertReceiptRecognitionInput(input);
    // Parsing again returns a fresh object so callers cannot mutate later calls.
    return receiptRecognitionResultSchema.parse(this.fixedResult);
  }
}

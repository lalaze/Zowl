import type { StoredAiCategorySuggestion } from "@/services/ai-categorization-service";

export type ReceiptType = "expense" | "income" | "transfer" | "refund";

export type ReceiptDecision =
  | "import"
  | "skip"
  | "import_anyway"
  | "pending";

export type ReceiptRecognitionItem = {
  id: string;
  fileId: string;
  fileName: string;
  previewUrl: string;
  fileDeleted?: boolean;
  status: string;
  errorMessage: string | null;
  transactionTime: string | null;
  type: ReceiptType | null;
  amountMinor: number | null;
  currency: string | null;
  merchantName: string | null;
  categoryId: string | null;
  suggestedCategory: string | null;
  description: string | null;
  paymentMethod: string | null;
  platformTransactionId: string | null;
  transactionStatus: string | null;
  confidence: number | null;
  categorySuggestion?: StoredAiCategorySuggestion;
  warnings: Array<string | { code?: string; message?: string }>;
  duplicateKind: string | null;
  decision: ReceiptDecision | null;
};

export type ReceiptRecognitionJob = {
  id: string;
  status: string;
  providerId: string;
  createdAt: string;
};

export type ReceiptRecognitionReview = {
  job: ReceiptRecognitionJob;
  items: ReceiptRecognitionItem[];
};

export type ReceiptCategory = {
  id: string;
  name: string;
  kind: "expense" | "income" | "both";
};

export type ReceiptConfirmResult = {
  jobId: string;
  createdCount: number;
  skippedCount: number;
  failedCount: number;
};

export {
  getApiError,
  readApiPayload,
  unwrapApiData,
} from "@/lib/client-api";

export function isDuplicateKind(kind: string | null) {
  if (!kind) return false;
  return !["none", "unique", "not_duplicate"].includes(kind.toLowerCase());
}

export function isPossibleDuplicate(kind: string | null) {
  if (!kind) return false;
  return kind.toLowerCase().includes("possible");
}

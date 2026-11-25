import type {
  duplicateStatuses,
  transactionSources,
  transactionTypes,
} from "@/db/schema";
import type { OrderDetailsView } from "@/lib/order-details";

export type TransactionView = {
  id: string;
  type: (typeof transactionTypes)[number];
  amountMinor: number;
  amount: string;
  currency: string;
  merchantName: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  transactionTime: string;
  createdAt: string;
  updatedAt: string;
  source: (typeof transactionSources)[number];
  paymentMethod: string | null;
  platformTransactionId: string | null;
  status: string | null;
  originalFileId: string | null;
  importBatchId: string | null;
  duplicateStatus: (typeof duplicateStatuses)[number];
  needsReview: boolean;
  currentRevisionId: string | null;
  revisionNumber: number;
  voidedAt: string | null;
  /** The goods a shopping-app payment bought, when a capture recorded them. */
  orderDetails?: OrderDetailsView | null;
};

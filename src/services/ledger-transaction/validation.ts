import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { categories } from "@/db/schema";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import { LedgerTransactionError } from "@/services/ledger-transaction/error";
import type { SourceProvenance } from "@/services/ledger-transaction/schema";

export function assertLedgerCategory(
  database: Database,
  userId: string,
  categoryId: string | null,
  type: "expense" | "income" | "transfer" | "refund",
) {
  if (!categoryId) return;
  const category = database
    .select({ kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .get();
  if (!category || !categoryKindSupportsTransaction(category.kind, type)) {
    throw new LedgerTransactionError(
      "INVALID_CATEGORY",
      "Selected category is missing or incompatible with this transaction type",
      422,
    );
  }
}

export function transactionSource(provenance: SourceProvenance) {
  return provenance.kind === "file_import"
    ? provenance.platform
    : provenance.kind === "screenshot_recognition"
      ? ("screenshot" as const)
      : (provenance.kind === "notification_capture" || provenance.kind === "payment_page_capture")
        ? provenance.platform
      : ("manual" as const);
}

export function platformTransactionId(provenance: SourceProvenance) {
  return provenance.kind === "manual"
    ? null
    : provenance.platformTransactionId;
}

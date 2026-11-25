import type { CaptureOrderDetails, CaptureOrderItem } from "@/db/schema";

/** The goods of a shopping-app payment as clients see them (ADR-0014). */
export type OrderDetailsView = {
  shopName: string | null;
  items: CaptureOrderItem[];
};

/** How the details were extracted stays internal; an empty list is no details. */
export function publicOrderDetails(
  details: CaptureOrderDetails | null | undefined,
): OrderDetailsView | null {
  if (!details?.items.length) return null;
  return { shopName: details.shopName, items: details.items };
}

/**
 * What a transaction is called in a list. A payment whose goods are known is
 * named after them (its description); any other after its merchant.
 */
export function transactionTitle(item: {
  merchantName: string | null;
  description: string | null;
  orderDetails?: OrderDetailsView | null;
}) {
  return item.orderDetails?.items.length
    ? item.description || item.merchantName
    : item.merchantName || item.description;
}

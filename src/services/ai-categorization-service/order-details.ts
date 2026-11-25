import { eq } from "drizzle-orm";

import { type Database, db } from "@/db/client";
import { categories, type CaptureOrderItem } from "@/db/schema";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import type { Locale } from "@/lib/i18n/locale";
import { AiCategorizationError } from "@/services/ai-categorization-service/error";
import { createSafeAiCategorizationRuntime } from "@/services/ai-categorization-service/factory";
import {
  ORDER_DETAILS_MAX_ITEMS,
  sanitizeOrderDetailsInput,
} from "@/services/ai-categorization-service/order-details-schema";
import type {
  AiCategorizationRuntime,
  OrderContextPage,
  OrderDetailsInput,
  OrderDetailsResult,
} from "@/services/ai-categorization-service/types";

const ITEM_TEXT_MAX_LENGTH = 120;

function comparable(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

/**
 * Whether the page text supports a name the model reported. A model may
 * shorten a long product title, so the test is how many of the name's
 * adjacent character pairs occur in the text, not an exact match; a name it
 * made up shares few of them.
 */
function grounded(value: string, context: string) {
  const text = comparable(value);
  if (!text) return false;
  const characters = [...text];
  if (characters.length < 2) return context.includes(text);
  let found = 0;
  for (let index = 0; index < characters.length - 1; index += 1) {
    if (context.includes(characters[index]! + characters[index + 1]!)) {
      found += 1;
    }
  }
  return found / (characters.length - 1) >= 0.6;
}

function priceShown(price: number, context: string) {
  const fixed = price.toFixed(2);
  const forms = new Set([fixed, fixed.replace(/0$/u, ""), fixed.replace(/\.00$/u, "")]);
  return [...forms].some((form) => context.includes(form));
}

export type OrderDetailsExtraction = {
  shopName: string | null;
  /** Never empty. */
  items: CaptureOrderItem[];
  /** Only a category the model chose with enough confidence, else null. */
  categoryId: string | null;
  model: string;
  configurationFingerprint: string;
};

export type OrderDetailsOutcome = {
  /** Whether the provider was called, successfully or not. */
  attempted: boolean;
  details: OrderDetailsExtraction | null;
  errorCode: string | null;
};

const notAttempted: OrderDetailsOutcome = {
  attempted: false,
  details: null,
  errorCode: null,
};

export function createOrderDetailsService(
  database: Database = db,
  runtime: AiCategorizationRuntime = createSafeAiCategorizationRuntime(),
) {
  /**
   * Reads what an expense bought from the order pages around it. Never
   * throws: a payment is recorded with or without its items. Keeps only what
   * the page text supports, so a made-up product, shop, variant or price is
   * dropped rather than stored.
   */
  async function extract(
    userId: string,
    request: {
      platform: string;
      amountMinor: number;
      currency: string;
      pages: OrderContextPage[];
    },
    locale: Locale,
  ): Promise<OrderDetailsOutcome> {
    const provider = runtime.provider;
    if (!provider.enabled || !provider.extractOrderDetails) return notAttempted;

    let input: OrderDetailsInput;
    try {
      const ownedCategories = database
        .select({
          id: categories.id,
          name: categories.name,
          kind: categories.kind,
        })
        .from(categories)
        .where(eq(categories.userId, userId))
        .all()
        .filter((category) =>
          categoryKindSupportsTransaction(category.kind, "expense"),
        )
        .slice(0, 100);
      input = sanitizeOrderDetailsInput({
        ...request,
        categories: ownedCategories,
        locale,
      });
    } catch {
      return notAttempted;
    }
    if (!input.pages.length) return notAttempted;

    let result: OrderDetailsResult;
    try {
      result = await provider.extractOrderDetails(input);
    } catch (error) {
      return {
        attempted: true,
        details: null,
        errorCode:
          error instanceof AiCategorizationError
            ? error.code
            : "PROVIDER_REQUEST_FAILED",
      };
    }

    const context = comparable(
      input.pages.flatMap((page) => page.lines).join("\n"),
    );
    const items: CaptureOrderItem[] = [];
    for (const item of result.items) {
      if (items.length >= ORDER_DETAILS_MAX_ITEMS) break;
      if (!grounded(item.name, context)) continue;
      items.push({
        name: item.name.slice(0, ITEM_TEXT_MAX_LENGTH),
        spec:
          item.spec && grounded(item.spec, context)
            ? item.spec.slice(0, ITEM_TEXT_MAX_LENGTH)
            : null,
        quantity: item.quantity,
        priceMinor:
          item.price !== null && priceShown(item.price, context)
            ? Math.round(item.price * 100)
            : null,
      });
    }
    if (!items.length) {
      return { attempted: true, details: null, errorCode: null };
    }

    const confident =
      result.categoryId !== null &&
      !result.ambiguous &&
      result.confidence >= runtime.autoThreshold;
    return {
      attempted: true,
      details: {
        shopName:
          result.shopName && grounded(result.shopName, context)
            ? result.shopName.slice(0, ITEM_TEXT_MAX_LENGTH)
            : null,
        items,
        categoryId: confident ? result.categoryId : null,
        model: provider.model ?? "unknown",
        configurationFingerprint: runtime.configurationFingerprint,
      },
      errorCode: null,
    };
  }

  return { extract };
}

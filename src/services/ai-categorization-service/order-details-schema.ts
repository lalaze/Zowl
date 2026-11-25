import { z } from "zod";

import { locales } from "@/lib/i18n/locale";
import {
  aiCategoryOptionSchema,
  sanitizeAiCategoryText,
} from "@/services/ai-categorization-service/schema";
import type {
  OrderContextPage,
  OrderDetailsInput,
  OrderDetailsResult,
} from "@/services/ai-categorization-service/types";

export const ORDER_CONTEXT_MAX_PAGES = 4;
export const ORDER_CONTEXT_MAX_LINES = 80;
export const ORDER_CONTEXT_MAX_LINE_LENGTH = 240;
export const ORDER_DETAILS_MAX_ITEMS = 20;
const MAX_PRICE = 10_000_000;

const orderContextPageSchema = z
  .object({
    source: z.enum(["node", "ocr"]),
    lines: z
      .array(z.string().max(ORDER_CONTEXT_MAX_LINE_LENGTH))
      .min(1)
      .max(ORDER_CONTEXT_MAX_LINES),
  })
  .strict();

/** The order pages a device uploads with a shopping-app payment candidate. */
export const orderContextSchema = z
  .object({
    pages: z.array(orderContextPageSchema).min(1).max(ORDER_CONTEXT_MAX_PAGES),
  })
  .strict();

const orderDetailsInputSchema = z
  .object({
    platform: z.string().trim().min(1).max(40),
    amountMinor: z.number().int().positive(),
    currency: z.string().trim().min(1).max(8),
    categories: z.array(aiCategoryOptionSchema).max(100),
    pages: orderContextSchema.shape.pages,
    locale: z.enum(locales),
  })
  .strict();

/**
 * Removes links, e-mail addresses and long digit runs (order numbers, phone
 * numbers) from every line, on top of what the device already dropped, and
 * leaves out lines with nothing left.
 */
export function sanitizeOrderDetailsInput(
  rawInput: OrderDetailsInput,
): OrderDetailsInput {
  const input = orderDetailsInputSchema.parse(rawInput);
  const pages: OrderContextPage[] = [];
  for (const page of input.pages) {
    const lines = page.lines.flatMap((line) => {
      const text = sanitizeAiCategoryText(line, ORDER_CONTEXT_MAX_LINE_LENGTH);
      return text ? [text] : [];
    });
    if (lines.length) pages.push({ source: page.source, lines });
  }
  return { ...input, pages };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function modelText(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 400) || null : null;
}

function modelNumber(value: unknown, minimum: number, maximum: number) {
  const parsed =
    typeof value === "string"
      ? Number(value.replace(/[¥￥,\s]/gu, "") || Number.NaN)
      : value;
  return typeof parsed === "number" &&
    Number.isFinite(parsed) &&
    parsed >= minimum &&
    parsed <= maximum
    ? parsed
    : null;
}

/**
 * Reads a model's answer forgivingly. Many OpenAI-compatible services do not
 * enforce a response schema, and models then misplace or omit fields (the
 * shop on each item instead of the order, a price as text). Only an answer
 * without an items list is unusable; any other field that is missing or
 * malformed is read as unknown, and an item without a name is left out. What
 * survives is still checked against the page text by the caller.
 */
export function parseOrderDetailsResult(
  payload: unknown,
  input: OrderDetailsInput,
): OrderDetailsResult {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.items)) throw new z.ZodError([]);

  let itemShopName: string | null = null;
  const items: OrderDetailsResult["items"] = [];
  for (const entry of root.items.slice(0, 50)) {
    const item = asRecord(entry);
    const name = modelText(item?.name);
    if (!item || !name) continue;
    itemShopName ??= modelText(item.shopName);
    const quantity = modelNumber(item.quantity, 1, 9_999);
    items.push({
      name,
      spec: modelText(item.spec),
      quantity: quantity !== null && Number.isInteger(quantity) ? quantity : null,
      price: modelNumber(item.price, 0, MAX_PRICE),
    });
  }

  const offered = modelText(root.categoryId);
  const categoryId =
    offered && input.categories.some((category) => category.id === offered)
      ? offered
      : null;
  return {
    shopName: modelText(root.shopName) ?? itemShopName,
    items,
    categoryId,
    confidence: modelNumber(root.confidence, 0, 1) ?? 0,
    // Anything but an explicit "not ambiguous" is treated as unsure.
    ambiguous: root.ambiguous !== false || categoryId === null,
    reason: modelText(root.reason)?.slice(0, 240) ?? "",
  };
}

export function orderDetailsJsonSchema(input: OrderDetailsInput) {
  const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      shopName: nullableString,
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            spec: nullableString,
            quantity: { anyOf: [{ type: "integer" }, { type: "null" }] },
            price: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
          required: ["name", "spec", "quantity", "price"],
        },
      },
      categoryId: input.categories.length
        ? {
            anyOf: [
              {
                type: "string",
                enum: input.categories.map((category) => category.id),
              },
              { type: "null" },
            ],
          }
        : { type: "null" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      ambiguous: { type: "boolean" },
      reason: { type: "string" },
    },
    required: [
      "shopName",
      "items",
      "categoryId",
      "confidence",
      "ambiguous",
      "reason",
    ],
  } as const;
}

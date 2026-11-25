import { createHash } from "node:crypto";

import { z } from "zod";

import {
  categoryKinds,
  transactionSources,
  transactionTypes,
} from "@/db/schema";
import { locales } from "@/lib/i18n/locale";
import type {
  AiCategoryBatchInput,
  AiCategoryResult,
} from "@/services/ai-categorization-service/types";

const itemRefSchema = z.string().trim().min(1).max(160);

export const aiCategoryOptionSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(categoryKinds),
  })
  .strict();

export const aiCategoryInputSchema = z
  .object({
    itemRef: itemRefSchema,
    type: z.enum(transactionTypes),
    source: z.enum(transactionSources),
    merchantName: z.string().max(240).nullable(),
    description: z.string().max(500).nullable(),
  })
  .strict();

export const aiCategoryBatchInputSchema = z
  .object({
    categories: z.array(aiCategoryOptionSchema).min(1).max(100),
    items: z.array(aiCategoryInputSchema).min(1).max(50),
    locale: z.enum(locales),
  })
  .strict();

const aiCategoryResultSchema = z
  .object({
    itemRef: itemRefSchema,
    categoryId: z.string().trim().min(1).max(160).nullable(),
    confidence: z.number().min(0).max(1),
    ambiguous: z.boolean(),
    reason: z.string().trim().min(1).max(240),
  })
  .strict();

const aiCategoryResultsEnvelopeSchema = z
  .object({ results: z.array(aiCategoryResultSchema).max(50) })
  .strict();

export const storedAiCategorySuggestionSchema = aiCategoryResultSchema
  .extend({
    categoryName: z.string().trim().min(1).max(80).nullable(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/u),
    model: z.string().trim().min(1).max(160),
    configurationFingerprint: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
    status: z.enum([
      "auto_applied",
      "needs_review",
      "adopted",
      "overridden",
    ]),
  })
  .strict();

export function sanitizeAiCategoryText(
  value: string | null | undefined,
  maximumLength: number,
) {
  if (!value) return null;
  const sanitized = value
    .normalize("NFKC")
    .replace(/https?:\/\/\S+/giu, "[Link]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[Email]")
    .replace(/\d{7,}/gu, "[ID]")
    .replace(/\s+/gu, " ")
    .trim();
  return sanitized ? sanitized.slice(0, maximumLength) : null;
}

export function sanitizeAiCategoryBatchInput(
  input: AiCategoryBatchInput,
): AiCategoryBatchInput {
  const parsed = aiCategoryBatchInputSchema.parse(input);
  return {
    categories: parsed.categories,
    locale: parsed.locale,
    items: parsed.items.map((item) => ({
      ...item,
      merchantName: sanitizeAiCategoryText(item.merchantName, 240),
      description: sanitizeAiCategoryText(item.description, 500),
    })),
  };
}

export function aiCategoryInputDigest(input: AiCategoryBatchInput["items"][number]) {
  const sanitized = {
    itemRef: input.itemRef,
    type: input.type,
    source: input.source,
    merchantName: sanitizeAiCategoryText(input.merchantName, 240),
    description: sanitizeAiCategoryText(input.description, 500),
  };
  return createHash("sha256").update(JSON.stringify(sanitized)).digest("hex");
}

export function parseAiCategoryResults(
  payload: unknown,
  input: AiCategoryBatchInput,
): AiCategoryResult[] {
  const parsed = aiCategoryResultsEnvelopeSchema.parse(payload).results;
  const expectedRefs = new Set(input.items.map((item) => item.itemRef));
  const categoryIds = new Set(input.categories.map((category) => category.id));
  const seen = new Set<string>();

  for (const result of parsed) {
    if (!expectedRefs.has(result.itemRef) || seen.has(result.itemRef)) {
      throw new z.ZodError([]);
    }
    if (result.categoryId && !categoryIds.has(result.categoryId)) {
      throw new z.ZodError([]);
    }
    seen.add(result.itemRef);
  }
  if (seen.size !== expectedRefs.size) throw new z.ZodError([]);
  return parsed;
}

export function aiCategoryResultsJsonSchema(input: AiCategoryBatchInput) {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "array",
        minItems: input.items.length,
        maxItems: input.items.length,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            itemRef: {
              type: "string",
              enum: input.items.map((item) => item.itemRef),
            },
            categoryId: {
              anyOf: [
                {
                  type: "string",
                  enum: input.categories.map((category) => category.id),
                },
                { type: "null" },
              ],
            },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            ambiguous: { type: "boolean" },
            reason: { type: "string", minLength: 1, maxLength: 240 },
          },
          required: [
            "itemRef",
            "categoryId",
            "confidence",
            "ambiguous",
            "reason",
          ],
        },
      },
    },
    required: ["results"],
  } as const;
}

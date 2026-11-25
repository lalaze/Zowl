import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { type Database, db } from "@/db/client";
import { categories } from "@/db/schema";
import { categoryKindSupportsTransaction } from "@/lib/category-kind";
import type { Locale } from "@/lib/i18n/locale";
import { normalizeMerchantName } from "@/lib/merchant";
import { AiCategorizationError } from "@/services/ai-categorization-service/error";
import { createSafeAiCategorizationRuntime } from "@/services/ai-categorization-service/factory";
import {
  aiCategoryInputDigest,
  sanitizeAiCategoryText,
} from "@/services/ai-categorization-service/schema";
import type {
  AiCategorizationRuntime,
  AiCategoryInput,
  StoredAiCategorySuggestion,
} from "@/services/ai-categorization-service/types";

export type AiEnrichmentCandidate = Omit<AiCategoryInput, "itemRef"> & {
  itemRef: string;
};

export type AiEnrichmentResult = {
  enabled: boolean;
  suggestions: Map<string, StoredAiCategorySuggestion>;
  processedGroupCount: number;
  failed: boolean;
  errorCode: string | null;
};

function groupingKey(item: AiEnrichmentCandidate) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        type: item.type,
        merchantName: normalizeMerchantName(item.merchantName),
        description: sanitizeAiCategoryText(item.description, 500),
      }),
    )
    .digest("hex");
}

export function createAiCategoryEnrichmentService(
  database: Database = db,
  runtime: AiCategorizationRuntime = createSafeAiCategorizationRuntime(),
) {
  /**
   * `locale` is the language the model writes reasons in: the UI language of
   * the request that started the classification.
   */
  async function classify(
    userId: string,
    candidates: AiEnrichmentCandidate[],
    locale: Locale,
  ): Promise<AiEnrichmentResult> {
    if (!runtime.provider.enabled || !candidates.length) {
      return {
        enabled: runtime.provider.enabled,
        suggestions: new Map(),
        processedGroupCount: 0,
        failed: false,
        errorCode: null,
      };
    }

    const ownedCategories = database
      .select({
        id: categories.id,
        name: categories.name,
        kind: categories.kind,
      })
      .from(categories)
      .where(eq(categories.userId, userId))
      .all();
    if (!ownedCategories.length) {
      return {
        enabled: true,
        suggestions: new Map(),
        processedGroupCount: 0,
        failed: false,
        errorCode: null,
      };
    }

    const groups = new Map<string, AiEnrichmentCandidate[]>();
    for (const candidate of candidates) {
      if (!candidate.merchantName && !candidate.description) continue;
      const key = groupingKey(candidate);
      const current = groups.get(key) ?? [];
      current.push(candidate);
      groups.set(key, current);
    }
    const selectedGroups = [...groups.values()].slice(0, runtime.batchSize);
    const providerItems = selectedGroups.map((group, index) => ({
      ...group[0]!,
      itemRef: `item-${index + 1}`,
    }));
    if (!providerItems.length) {
      return {
        enabled: true,
        suggestions: new Map(),
        processedGroupCount: 0,
        failed: false,
        errorCode: null,
      };
    }

    try {
      const results = await runtime.provider.classifyBatch({
        categories: ownedCategories,
        items: providerItems,
        locale,
      });
      const resultByRef = new Map(results.map((result) => [result.itemRef, result]));
      const categoryById = new Map(
        ownedCategories.map((category) => [category.id, category]),
      );
      const suggestions = new Map<string, StoredAiCategorySuggestion>();

      selectedGroups.forEach((group, index) => {
        const providerResult = resultByRef.get(`item-${index + 1}`);
        if (!providerResult) return;
        const category = providerResult.categoryId
          ? categoryById.get(providerResult.categoryId)
          : undefined;

        for (const candidate of group) {
          const validCategory =
            category &&
            categoryKindSupportsTransaction(category.kind, candidate.type)
              ? category
              : null;
          const categoryId = validCategory?.id ?? null;
          const ambiguous = providerResult.ambiguous || !validCategory;
          const status =
            categoryId &&
            !ambiguous &&
            providerResult.confidence >= runtime.autoThreshold
              ? "auto_applied"
              : "needs_review";
          suggestions.set(candidate.itemRef, {
            itemRef: candidate.itemRef,
            categoryId,
            categoryName: validCategory?.name ?? null,
            confidence: providerResult.confidence,
            ambiguous,
            reason: providerResult.reason,
            inputDigest: aiCategoryInputDigest(candidate),
            model: runtime.provider.model ?? "unknown",
            configurationFingerprint: runtime.configurationFingerprint,
            status,
          });
        }
      });

      return {
        enabled: true,
        suggestions,
        processedGroupCount: selectedGroups.length,
        failed: false,
        errorCode: null,
      };
    } catch (error) {
      return {
        enabled: true,
        suggestions: new Map(),
        processedGroupCount: selectedGroups.length,
        failed: true,
        errorCode:
          error instanceof AiCategorizationError
            ? error.code
            : "PROVIDER_REQUEST_FAILED",
      };
    }
  }

  return { classify, runtime };
}

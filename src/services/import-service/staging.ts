import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { importBatches, importItems } from "@/db/schema";
import { createCategorizationService } from "@/services/categorization-service";
import { createDeduplicationService } from "@/services/deduplication-service";
import { createAlipayBillEnrichmentMatcher } from "@/services/import-service/alipay-enrichment";
import {
  duplicateAssessmentDigest,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import type { FileStorage } from "@/services/file-storage-service";
import { cleanParsedTransaction } from "@/services/import-service/cleaner";
import { ImportServiceError } from "@/services/import-service/error";
import { GenericCsvBillParser } from "@/services/import-service/parsers/generic-csv-bill-parser";
import { resolveBillParser } from "@/services/import-service/parsers";
import {
  getImportBatchRow,
  refreshImportBatchCounts,
} from "@/services/import-service/state";
import {
  parseTabularFile,
  TabularFileError,
} from "@/services/import-service/tabular-file";
import type {
  FieldMapping,
  BillEnrichmentData,
  ImportDecision,
  ParsedTransaction,
} from "@/services/import-service/types";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function createImportStagingWorkflow(
  database: Database,
  storage: FileStorage,
) {
  const categorization = createCategorizationService(database);
  const deduplication = createDeduplicationService(database);
  const enrichmentMatcher = createAlipayBillEnrichmentMatcher(database);

  function stageItems(
    userId: string,
    batchId: string,
    parsedItems: ParsedTransaction[],
  ) {
    const now = new Date().toISOString();
    const seenPlatformIds = new Set<string>();
    const seenFingerprints = new Set<string>();

    const values = parsedItems.map((parsed) => {
      const cleaned = cleanParsedTransaction(parsed);
      const data = cleaned.data;
      let duplicateStatus: "unique" | "possible_duplicate" | "duplicate" =
        "unique";
      let duplicateTransactionId: string | null = null;
      let duplicateReason: string | null = null;
      let assessmentDigest: string | null = null;
      let enrichmentData: BillEnrichmentData | null = null;

      if (
        cleaned.errors.length === 0 &&
        data.type &&
        data.amountMinor &&
        data.transactionTime
      ) {
        const suggestion = categorization.suggest({
          userId,
          type: data.type,
          merchantName: data.merchantName,
          description: data.description,
        });
        data.categoryId = suggestion.categoryId;
        data.categoryName = suggestion.categoryName;

        enrichmentData = cleaned.shouldSkip
          ? null
          : enrichmentMatcher.match(userId, data);
        if (enrichmentData?.status === "ambiguous") {
          duplicateStatus = "possible_duplicate";
          duplicateReason = "Multiple notification targets share the amount and time window; automatic enrichment is unavailable";
        } else if (!enrichmentData) {
          const result = deduplication.check(userId, {
            type: data.type,
            amountMinor: data.amountMinor,
            currency: data.currency,
            merchantName: data.merchantName,
            description: data.description,
            transactionTime: data.transactionTime,
            source: data.source,
            platformTransactionId: data.platformTransactionId,
          });
          duplicateStatus = result.status;
          duplicateTransactionId = result.transactionId;
          duplicateReason = result.reason;
          assessmentDigest =
            result.status === "possible_duplicate"
              ? duplicateAssessmentDigest(toDuplicateAssessment(result))
              : null;

          if (!cleaned.shouldSkip) {
            const platformKey = data.platformTransactionId
              ? `${data.source}|${data.platformTransactionId}`
              : null;
            if (
              duplicateStatus === "unique" &&
              ((platformKey && seenPlatformIds.has(platformKey)) ||
                seenFingerprints.has(result.fingerprint))
            ) {
              duplicateStatus = "duplicate";
              duplicateReason = "Identical to an earlier record in this batch";
            }
            if (platformKey) seenPlatformIds.add(platformKey);
            seenFingerprints.add(result.fingerprint);
          }
        }
      }

      const warnings = [...cleaned.warnings];
      if (duplicateReason) {
        warnings.push({ code: "DUPLICATE_MATCH", message: duplicateReason });
      }

      const decision: ImportDecision = cleaned.errors.length
        ? "pending"
        : cleaned.shouldSkip
          ? "skip"
          : enrichmentData?.status === "conflict" ||
              enrichmentData?.status === "ambiguous"
            ? "pending"
            : enrichmentData?.status === "ready"
              ? "import"
          : duplicateStatus === "duplicate"
            ? "skip"
            : duplicateStatus === "possible_duplicate"
              ? "pending"
              : "import";

      return {
        id: randomUUID(),
        userId,
        batchId,
        rowNumber: parsed.rowNumber,
        rawData: parsed.rawData,
        normalizedData: data as unknown as Record<string, unknown>,
        enrichmentData,
        validationErrors: cleaned.errors,
        warnings,
        duplicateStatus,
        duplicateTransactionId,
        duplicateAssessmentDigest: assessmentDigest,
        decision,
        resultTransactionId: null,
        resultCode: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const enrichmentClaims = new Map<string, typeof values>();
    for (const item of values) {
      const enrichment = item.enrichmentData;
      if (
        enrichment?.targetId &&
        (enrichment.status === "ready" || enrichment.status === "conflict")
      ) {
        const claimed = enrichmentClaims.get(enrichment.targetId) ?? [];
        claimed.push(item);
        enrichmentClaims.set(enrichment.targetId, claimed);
      }
    }
    for (const claimed of enrichmentClaims.values()) {
      if (claimed.length < 2) continue;
      for (const item of claimed) {
        const enrichment = item.enrichmentData!;
        item.enrichmentData = {
          status: "ambiguous",
          targetKind: null,
          targetId: null,
          captureId: null,
          targetVersion: null,
          current: null,
          proposed: enrichment.proposed,
          conflicts: [],
          resolutions: {},
          candidateTargetIds: [enrichment.targetId!],
        };
        item.duplicateStatus = "possible_duplicate";
        item.duplicateTransactionId = null;
        item.duplicateAssessmentDigest = null;
        item.decision = "pending";
        item.warnings = [
          ...item.warnings.filter(
            (warning) => warning.code !== "DUPLICATE_MATCH",
          ),
          {
            code: "DUPLICATE_MATCH",
            message: "Multiple statement rows match the same notification target; automatic enrichment is unavailable",
          },
        ];
      }
    }

    database
      .delete(importItems)
      .where(
        and(eq(importItems.userId, userId), eq(importItems.batchId, batchId)),
      )
      .run();
    for (const group of chunks(values, 100)) {
      if (group.length) database.insert(importItems).values(group).run();
    }
    return refreshImportBatchCounts(database, userId, batchId);
  }

  async function upload(userId: string, file: File) {
    const saved = await storage.saveBillFile(userId, file);
    let batchId: string | null = null;

    try {
      const parsedFile = parseTabularFile({
        originalName: saved.record.originalName,
        mimeType: saved.record.mimeType,
        extension: saved.extension,
        bytes: saved.bytes,
      });
      const parser = resolveBillParser(parsedFile);
      const metadata = parser.metadata(parsedFile);
      const parsedItems = await parser.parse(parsedFile);

      if (!parsedItems.length) {
        throw new ImportServiceError("NO_DATA_ROWS", "No importable data rows found", 422);
      }
      if (parsedItems.length > 10_000) {
        throw new ImportServiceError("TOO_MANY_ROWS", "Maximum rows per import: 10,000 rows", 422);
      }

      batchId = randomUUID();
      const now = new Date().toISOString();
      database
        .insert(importBatches)
        .values({
          id: batchId,
          userId,
          fileId: saved.record.id,
          source: parser.source,
          status: "parsing",
          detectedHeaders: metadata.headers,
          fieldMapping: metadata.mapping,
          headerRowNumber: metadata.headerRowNumber,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      const counts = stageItems(userId, batchId, parsedItems);
      database
        .update(importBatches)
        .set({ status: "reviewing", updatedAt: new Date().toISOString() })
        .where(eq(importBatches.id, batchId))
        .run();

      return {
        batchId,
        source: parser.source,
        fileName: saved.record.originalName,
        ...counts,
      };
    } catch (error) {
      if (batchId) {
        database.delete(importBatches).where(eq(importBatches.id, batchId)).run();
      }
      await storage.delete(userId, saved.record.id);

      if (error instanceof ImportServiceError) throw error;
      if (error instanceof TabularFileError) {
        throw new ImportServiceError(error.code, error.message, 422);
      }
      if (error instanceof Error && error.message === "NO_SUPPORTED_HEADER") {
        throw new ImportServiceError(
          "NO_SUPPORTED_HEADER",
          "Cannot detect headers. Check that the file contains transaction details",
          422,
        );
      }
      throw error;
    }
  }

  async function updateMapping(
    userId: string,
    batchId: string,
    mapping: FieldMapping,
  ) {
    const batch = getImportBatchRow(database, userId, batchId);
    if (!batch) {
      throw new ImportServiceError("BATCH_NOT_FOUND", "Import batch not found", 404);
    }
    if (batch.status !== "reviewing" || batch.source !== "other") {
      throw new ImportServiceError("BATCH_NOT_EDITABLE", "Field mapping cannot be changed for this batch", 409);
    }
    const headers = new Set(batch.detectedHeaders ?? []);
    if (Object.values(mapping).some((header) => !headers.has(header))) {
      throw new ImportServiceError("INVALID_MAPPING", "Field mapping contains unknown headers", 422);
    }

    const stored = await storage.read(userId, batch.fileId);
    const extension = stored.record.extension;
    if (extension !== "csv" && extension !== "xlsx") {
      throw new ImportServiceError("UNSUPPORTED_FILE_TYPE", "Unsupported file format", 422);
    }
    const parsedFile = parseTabularFile({
      originalName: stored.record.originalName,
      mimeType: stored.record.mimeType,
      extension,
      bytes: stored.bytes,
    });
    const parser = new GenericCsvBillParser(mapping);
    const metadata = parser.metadata(parsedFile);
    const parsedItems = await parser.parse(parsedFile);
    const acquired = database
      .update(importBatches)
      .set({ status: "parsing", updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(importBatches.id, batchId),
          eq(importBatches.userId, userId),
          eq(importBatches.status, "reviewing"),
        ),
      )
      .returning({ id: importBatches.id })
      .all();
    if (!acquired.length) {
      throw new ImportServiceError(
        "BATCH_CHANGED",
        "Import batch status changed. Refresh and try again",
        409,
      );
    }

    try {
      database
        .update(importBatches)
        .set({
          fieldMapping: metadata.mapping,
          detectedHeaders: metadata.headers,
          headerRowNumber: metadata.headerRowNumber,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(importBatches.id, batchId),
            eq(importBatches.userId, userId),
            eq(importBatches.status, "parsing"),
          ),
        )
        .run();
      const counts = stageItems(userId, batchId, parsedItems);
      database
        .update(importBatches)
        .set({ status: "reviewing", updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(importBatches.id, batchId),
            eq(importBatches.userId, userId),
            eq(importBatches.status, "parsing"),
          ),
        )
        .run();
      return { batchId, ...counts };
    } catch (error) {
      database
        .update(importBatches)
        .set({ status: "reviewing", updatedAt: new Date().toISOString() })
        .where(
          and(
            eq(importBatches.id, batchId),
            eq(importBatches.userId, userId),
            eq(importBatches.status, "parsing"),
          ),
        )
        .run();
      throw error;
    }
  }

  return { upload, updateMapping };
}

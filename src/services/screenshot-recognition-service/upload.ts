import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";

import type { Database } from "@/db/client";
import { recognitionItems, recognitionJobs } from "@/db/schema";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import { createDeduplicationService } from "@/services/deduplication-service";
import {
  type FileStorage,
  validateScreenshotFile,
} from "@/services/file-storage-service";
import {
  duplicateAssessmentDigest,
  toDuplicateAssessment,
} from "@/services/ledger-transaction/review-decision";
import {
  createReceiptRecognitionProvider,
  ReceiptRecognitionError,
  type ReceiptImageMimeType,
  type ReceiptRecognitionProvider,
  type ReceiptRecognitionResult,
} from "@/services/receipt-recognition-service";
import {
  deduplicationInput,
  emptyReceiptData,
  fromProviderResult,
  providerPayloadHash,
  requiredFieldIssues,
  resolveSuggestedCategory,
  type ValidationIssue,
} from "@/services/screenshot-recognition-service/data";
import { ScreenshotRecognitionServiceError } from "@/services/screenshot-recognition-service/error";
import type { createScreenshotReviewQueries } from "@/services/screenshot-recognition-service/review-query";
import {
  confirmableReceiptDataSchema,
  type StagedReceiptData,
} from "@/services/screenshot-recognition-service/schema";

export const MAX_SCREENSHOTS_PER_JOB = 10;
export const MAX_SCREENSHOT_JOB_BYTES = 40 * 1024 * 1024;

export function createConfiguredProviderSafely(): ReceiptRecognitionProvider {
  try {
    return createReceiptRecognitionProvider();
  } catch {
    return {
      name: "unavailable",
      sendsImagesToThirdParty: false,
      async recognize() {
        throw new ReceiptRecognitionError(
          "PROVIDER_CONFIGURATION_ERROR",
          "Screenshot recognition configuration unavailable",
          503,
        );
      },
    };
  }
}

type RecognitionOutcome = {
  status: "recognized" | "recognition_failed";
  providerPayloadHash: string | null;
  data: StagedReceiptData;
  validationErrors: ValidationIssue[];
  warnings: string[];
  duplicateStatus: "unique" | "possible_duplicate" | "duplicate";
  duplicateTransactionId: string | null;
  duplicateAssessmentDigest: string | null;
  decision: "pending" | "import" | "skip";
};

type GetReview = ReturnType<typeof createScreenshotReviewQueries>["getReview"];

export function createScreenshotUploadWorkflow(
  database: Database,
  storage: FileStorage,
  provider: ReceiptRecognitionProvider,
  getReview: GetReview,
) {
  function providerInfo() {
    return {
      id: provider.name,
      label:
        provider.name === "mock"
          ? "Mock Local demo"
          : provider.name === "unavailable"
            ? "Recognition service is currently unavailable"
            : "Configured third-party recognition service",
      sendsImagesToThirdParty: provider.sendsImagesToThirdParty,
      disclosure: provider.sendsImagesToThirdParty
        ? "Original screenshots are sent to the configured recognition service solely to extract transaction fields."
        : provider.name === "unavailable"
          ? "No images are sent externally. Use retained originals to fill in fields after upload."
          : "Screenshots are not sent externally. Complete missing fields using the original image.",
      retentionPolicy: provider.sendsImagesToThirdParty
        ? "Third-party retention depends on the agreement between the deployer and provider."
        : provider.name === "unavailable"
          ? "No third-party service is called and no third-party copy is created."
          : "Mock No third-party copies are created.",
    };
  }

  function outcomeFromResult(
    userId: string,
    result: ReceiptRecognitionResult,
    seenPlatformIds: Set<string>,
    seenFingerprints: Set<string>,
  ): RecognitionOutcome {
    const data = fromProviderResult(result);
    data.categoryId = resolveSuggestedCategory(database, userId, data);
    const validationErrors = requiredFieldIssues(data);
    let duplicateStatus: RecognitionOutcome["duplicateStatus"] = "unique";
    let duplicateTransactionId: string | null = null;
    let assessmentDigest: string | null = null;
    let duplicateWarning: string | null = null;

    const complete = confirmableReceiptDataSchema.safeParse(data);
    if (complete.success) {
      const duplicate = createDeduplicationService(database).check(
        userId,
        deduplicationInput(complete.data),
      );
      duplicateStatus = duplicate.status;
      duplicateTransactionId = duplicate.transactionId;
      assessmentDigest =
        duplicate.status === "possible_duplicate"
          ? duplicateAssessmentDigest(toDuplicateAssessment(duplicate))
          : null;
      duplicateWarning = duplicate.reason;
      const platformKey = data.platformTransactionId
        ? `screenshot|${data.platformTransactionId}`
        : null;
      if (
        duplicateStatus === "unique" &&
        ((platformKey && seenPlatformIds.has(platformKey)) ||
          seenFingerprints.has(duplicate.fingerprint))
      ) {
        duplicateStatus = "duplicate";
        duplicateWarning = "Identical transaction to an earlier screenshot in this batch";
      }
      if (platformKey) seenPlatformIds.add(platformKey);
      seenFingerprints.add(duplicate.fingerprint);
    }

    return {
      status: "recognized",
      providerPayloadHash: providerPayloadHash(result),
      data,
      validationErrors,
      warnings: duplicateWarning
        ? [...result.warnings, duplicateWarning]
        : result.warnings,
      duplicateStatus,
      duplicateTransactionId,
      duplicateAssessmentDigest: assessmentDigest,
      decision: validationErrors.length
        ? "pending"
        : duplicateStatus === "duplicate"
          ? "skip"
          : duplicateStatus === "possible_duplicate"
            ? "pending"
            : "import",
    };
  }

  async function upload(
    userId: string,
    files: File[],
    options: {
      consentToThirdParty?: boolean;
      submissionId?: string;
      /** The uploader's UI language; recognition warnings are written in it. */
      locale?: Locale;
    } = {},
  ) {
    if (!files.length) {
      throw new ScreenshotRecognitionServiceError(
        "MISSING_IMAGES",
        "Select at least one screenshot",
        400,
      );
    }
    if (files.length > MAX_SCREENSHOTS_PER_JOB) {
      throw new ScreenshotRecognitionServiceError(
        "TOO_MANY_IMAGES",
        "Upload up to 10 screenshots",
        422,
      );
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_SCREENSHOT_JOB_BYTES) {
      throw new ScreenshotRecognitionServiceError(
        "IMAGE_JOB_TOO_LARGE",
        "Total screenshot size must not exceed 40 MiB",
        413,
      );
    }
    if (provider.sendsImagesToThirdParty && !options.consentToThirdParty) {
      throw new ScreenshotRecognitionServiceError(
        "THIRD_PARTY_CONSENT_REQUIRED",
        "Agree to send screenshots to the configured recognition service first",
        422,
      );
    }

    for (const file of files) await validateScreenshotFile(file);

    if (options.submissionId && !/^[a-zA-Z0-9_-]{16,128}$/u.test(options.submissionId)) {
      throw new ScreenshotRecognitionServiceError("INVALID_SUBMISSION_ID", "Invalid submission identity", 422);
    }
    const digest = createHash("sha256");
    for (const file of files) {
      digest.update(`${file.type}:${file.size}:`);
      digest.update(Buffer.from(await file.arrayBuffer()));
    }
    const submissionDigest = digest.digest("hex");
    const existingSubmission = () => {
      if (!options.submissionId) return null;
      const existing = database.select().from(recognitionJobs).where(and(
        eq(recognitionJobs.userId, userId), eq(recognitionJobs.submissionId, options.submissionId),
      )).get();
      if (!existing) return null;
      if (existing.submissionDigest !== submissionDigest) {
        throw new ScreenshotRecognitionServiceError("SUBMISSION_CONFLICT", "This submission belongs to different screenshots", 409);
      }
      return { jobId: existing.id, ...getReview(userId, existing.id) };
    };
    const existing = existingSubmission();
    if (existing) return existing;

    const saved: Array<Awaited<ReturnType<FileStorage["saveScreenshot"]>>> = [];
    try {
      for (const file of files) {
        saved.push(await storage.saveScreenshot(userId, file));
      }
    } catch (error) {
      for (const item of [...saved].reverse()) {
        await storage.delete(userId, item.record.id).catch(() => undefined);
      }
      throw error;
    }

    const jobId = randomUUID();
    const now = new Date().toISOString();
    try {
      database.transaction((tx) => {
        tx.insert(recognitionJobs)
          .values({
            id: jobId,
            userId,
            status: "processing",
            providerId: provider.name,
            submissionId: options.submissionId ?? null,
            submissionDigest: options.submissionId ? submissionDigest : null,
            totalCount: saved.length,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        tx.insert(recognitionItems)
          .values(
            saved.map((item, index) => ({
              id: randomUUID(),
              userId,
              jobId,
              fileId: item.record.id,
              position: index + 1,
              status: "processing" as const,
              normalizedData: { ...emptyReceiptData },
              validationErrors: [],
              warnings: [],
              duplicateStatus: "unique" as const,
              decision: "pending" as const,
              createdAt: now,
              updatedAt: now,
            })),
          )
          .run();
      });
    } catch (error) {
      for (const item of [...saved].reverse()) {
        await storage.delete(userId, item.record.id).catch(() => undefined);
      }
      const raced = existingSubmission();
      if (raced) return raced;
      throw error;
    }

    try {
      const itemRows = database
        .select()
        .from(recognitionItems)
        .where(
          and(
            eq(recognitionItems.userId, userId),
            eq(recognitionItems.jobId, jobId),
          ),
        )
        .orderBy(asc(recognitionItems.position))
        .all();
      const seenPlatformIds = new Set<string>();
      const seenFingerprints = new Set<string>();
      const imageOutcomes = new Map<string, RecognitionOutcome>();
      let succeededCount = 0;
      let failedCount = 0;

      for (let index = 0; index < saved.length; index += 1) {
        const savedImage = saved[index]!;
        const item = itemRows[index]!;
        let outcome = imageOutcomes.get(savedImage.record.sha256);
        if (outcome) {
          outcome = {
            ...outcome,
            data: { ...outcome.data },
            validationErrors: [...outcome.validationErrors],
            warnings: [...outcome.warnings, "Identical to an earlier original screenshot in this batch"],
            duplicateStatus: "duplicate",
            duplicateTransactionId: null,
            duplicateAssessmentDigest: null,
            decision: "skip",
          };
        } else {
          try {
            const result = await provider.recognize({
              bytes: savedImage.bytes,
              mimeType: savedImage.record.mimeType as ReceiptImageMimeType,
              locale: options.locale ?? defaultLocale,
            });
            outcome = outcomeFromResult(
              userId,
              result,
              seenPlatformIds,
              seenFingerprints,
            );
          } catch (error) {
            const code =
              error instanceof ReceiptRecognitionError
                ? error.code
                : "RECOGNITION_UNAVAILABLE";
            outcome = {
              status: "recognition_failed",
              providerPayloadHash: null,
              data: { ...emptyReceiptData },
              validationErrors: [
                {
                  field: "image",
                  code: "RECOGNITION_FAILED",
                  message: "Recognition unavailable. Complete fields using the original image",
                },
                ...requiredFieldIssues(emptyReceiptData),
              ],
              warnings: [
                `Recognition incomplete (${code === "PROVIDER_CONFIGURATION_ERROR" ? "Service configuration error" : "Service temporarily unavailable"}). The original image has been retained.`,
              ],
              duplicateStatus: "unique",
              duplicateTransactionId: null,
              duplicateAssessmentDigest: null,
              decision: "pending",
            };
          }
          imageOutcomes.set(savedImage.record.sha256, outcome);
        }

        if (outcome.status === "recognized") succeededCount += 1;
        else failedCount += 1;
        database
          .update(recognitionItems)
          .set({
            status: outcome.status,
            providerPayloadHash: outcome.providerPayloadHash,
            normalizedData: outcome.data,
            validationErrors: outcome.validationErrors,
            warnings: outcome.warnings,
            duplicateStatus: outcome.duplicateStatus,
            duplicateTransactionId: outcome.duplicateTransactionId,
            duplicateAssessmentDigest: outcome.duplicateAssessmentDigest,
            decision: outcome.decision,
            updatedAt: new Date().toISOString(),
          })
          .where(
            and(
              eq(recognitionItems.id, item.id),
              eq(recognitionItems.jobId, jobId),
              eq(recognitionItems.userId, userId),
              eq(recognitionItems.status, "processing"),
            ),
          )
          .run();
      }

      const promoted = database
        .update(recognitionJobs)
        .set({
          status: "reviewing",
          succeededCount,
          failedCount,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(recognitionJobs.id, jobId),
            eq(recognitionJobs.userId, userId),
            eq(recognitionJobs.status, "processing"),
          ),
        )
        .returning({ id: recognitionJobs.id })
        .all();
      if (!promoted.length) {
        throw new ScreenshotRecognitionServiceError(
          "RECOGNITION_JOB_BUSY",
          "Recognition task status changed",
          409,
        );
      }
      return { jobId, ...getReview(userId, jobId) };
    } catch (error) {
      database
        .update(recognitionJobs)
        .set({
          status: "failed",
          failureCode: "JOB_PROCESSING_FAILED",
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(recognitionJobs.id, jobId),
            eq(recognitionJobs.userId, userId),
            eq(recognitionJobs.status, "processing"),
          ),
        )
        .run();
      if (error instanceof ScreenshotRecognitionServiceError) throw error;
      throw new ScreenshotRecognitionServiceError(
        "JOB_PROCESSING_FAILED",
        "Recognition task failed. Try again later",
        500,
      );
    }
  }

  return { providerInfo, upload };
}

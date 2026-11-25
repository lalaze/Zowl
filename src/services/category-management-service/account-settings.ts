import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";

import { db, type Database } from "@/db/client";
import {
  importBatches,
  recognitionItems,
  storedFiles,
  transactions,
  users,
} from "@/db/schema";
import { avatarPresetValues } from "@/lib/avatar-presets";
import {
  fileStorageService,
  type FileStorage,
} from "@/services/file-storage-service";
import { createReceiptRecognitionProvider } from "@/services/receipt-recognition-service";
import type { ReceiptRecognitionEnvironment } from "@/services/receipt-recognition-service/factory";
import {
  createSafeAiCategorizationRuntime,
  type AiCategorizationEnvironment,
} from "@/services/ai-categorization-service";

export const storedFileIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/u, "File ID has an invalid format");

export const storedFilesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const profileSettingsInputSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, "Enter a nickname")
      .max(40, "Nickname supports up to 40 characters")
      .optional(),
    avatarPreset: z.enum(avatarPresetValues).optional(),
  })
  .strict()
  .refine(
    (input) => input.displayName !== undefined || input.avatarPreset !== undefined,
    { message: "Change at least one profile field" },
  );

export type StoredFilesQuery = z.infer<typeof storedFilesQuerySchema>;
export type ProfileSettingsInput = z.infer<typeof profileSettingsInputSchema>;

export class AccountSettingsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AccountSettingsError";
  }
}

export function getRecognitionProviderMetadata(
  env: ReceiptRecognitionEnvironment = process.env,
) {
  try {
    const provider = createReceiptRecognitionProvider({ env });
    if (provider.sendsImagesToThirdParty) {
      return {
        mode: "third-party" as const,
        providerLabel: "Configured external HTTP JSON Recognition service",
        configured: true,
        sendsImagesToThirdParty: true,
        disclosure:
          "Original screenshots are sent to the third-party service configured by the deployer, solely to extract transaction fields.",
        retentionPolicy:
          "Third-party retention depends on the provider agreement. Check before uploading.",
      };
    }
    return {
      mode: "mock" as const,
      providerLabel: "Mock Local demo",
      configured: true,
      sendsImagesToThirdParty: false,
      disclosure:
        "Screenshots are not sent externally;Mock leaves transaction facts blank for manual confirmation against the original image.",
      retentionPolicy: "Mock No third-party copies are created.",
    };
  } catch {
    return {
      mode: "unavailable" as const,
      providerLabel: "Screenshot recognition configuration unavailable",
      configured: false,
      sendsImagesToThirdParty: false,
      disclosure:
        "The current configuration does not trigger external recognition. Uploaded originals remain available for manual entry.",
      retentionPolicy: "No third-party service is called and no third-party copy is created.",
    };
  }
}

export function getAiCategorizationProviderMetadata(
  env: AiCategorizationEnvironment = process.env,
) {
  return createSafeAiCategorizationRuntime({ env }).metadata;
}

export function createAccountSettingsService(
  database: Database = db,
  storage: Pick<FileStorage, "delete"> = fileStorageService,
) {
  function updateProfile(userId: string, input: ProfileSettingsInput) {
    const updated = database
      .update(users)
      .set({
        ...(input.displayName === undefined
          ? {}
          : { displayName: input.displayName }),
        ...(input.avatarPreset === undefined
          ? {}
          : { avatarPreset: input.avatarPreset }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .returning({
        displayName: users.displayName,
        avatarPreset: users.avatarPreset,
      })
      .get();

    if (!updated) {
      throw new AccountSettingsError("USER_NOT_FOUND", "Account not found", 404);
    }

    return updated;
  }

  function referenceCounts(userId: string, fileId: string) {
    const transactionCount =
      database
        .select({ value: count() })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.originalFileId, fileId),
          ),
        )
        .get()?.value ?? 0;
    const importBatchCount =
      database
        .select({ value: count() })
        .from(importBatches)
        .where(
          and(
            eq(importBatches.userId, userId),
            eq(importBatches.fileId, fileId),
          ),
        )
        .get()?.value ?? 0;
    const recognitionItemCount =
      database
        .select({ value: count() })
        .from(recognitionItems)
        .where(
          and(
            eq(recognitionItems.userId, userId),
            eq(recognitionItems.fileId, fileId),
          ),
        )
        .get()?.value ?? 0;
    return { transactionCount, importBatchCount, recognitionItemCount };
  }

  function listFiles(
    userId: string,
    query: StoredFilesQuery = { page: 1, limit: 20 },
  ) {
    const total =
      database
        .select({ value: count() })
        .from(storedFiles)
        .where(
          and(eq(storedFiles.userId, userId), isNull(storedFiles.deletedAt)),
        )
        .get()?.value ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const page = Math.min(query.page, totalPages);
    const files = database
      .select({
        id: storedFiles.id,
        kind: storedFiles.kind,
        originalName: storedFiles.originalName,
        mimeType: storedFiles.mimeType,
        extension: storedFiles.extension,
        size: storedFiles.size,
        createdAt: storedFiles.createdAt,
      })
      .from(storedFiles)
      .where(
        and(eq(storedFiles.userId, userId), isNull(storedFiles.deletedAt)),
      )
      .orderBy(desc(storedFiles.createdAt), desc(storedFiles.id))
      .limit(query.limit)
      .offset((page - 1) * query.limit)
      .all();
    const pagination = { page, limit: query.limit, total, totalPages };
    if (!files.length) return { items: [], pagination };
    const fileIds = files.map((file) => file.id);

    const transactionCounts = new Map<string, number>();
    database
      .select({ fileId: transactions.originalFileId, value: count() })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNotNull(transactions.originalFileId),
          inArray(transactions.originalFileId, fileIds),
        ),
      )
      .groupBy(transactions.originalFileId)
      .all()
      .forEach((row) => {
        if (row.fileId) transactionCounts.set(row.fileId, row.value);
      });

    const importBatchCounts = new Map<string, number>();
    database
      .select({ fileId: importBatches.fileId, value: count() })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.userId, userId),
          inArray(importBatches.fileId, fileIds),
        ),
      )
      .groupBy(importBatches.fileId)
      .all()
      .forEach((row) => importBatchCounts.set(row.fileId, row.value));

    const recognitionItemCounts = new Map<string, number>();
    database
      .select({ fileId: recognitionItems.fileId, value: count() })
      .from(recognitionItems)
      .where(
        and(
          eq(recognitionItems.userId, userId),
          inArray(recognitionItems.fileId, fileIds),
        ),
      )
      .groupBy(recognitionItems.fileId)
      .all()
      .forEach((row) => recognitionItemCounts.set(row.fileId, row.value));

    return {
      items: files.map((file) => ({
        ...file,
        transactionCount: transactionCounts.get(file.id) ?? 0,
        importBatchCount: importBatchCounts.get(file.id) ?? 0,
        recognitionItemCount: recognitionItemCounts.get(file.id) ?? 0,
      })),
      pagination,
    };
  }

  async function removeFile(userId: string, fileId: string) {
    const owned = database
      .select({ id: storedFiles.id })
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.id, fileId),
          eq(storedFiles.userId, userId),
          isNull(storedFiles.deletedAt),
        ),
      )
      .get();
    if (!owned) {
      throw new AccountSettingsError("FILE_NOT_FOUND", "File not found", 404);
    }
    const references = referenceCounts(userId, fileId);
    const removed = await storage.delete(userId, fileId);
    if (!removed) {
      throw new AccountSettingsError("FILE_NOT_FOUND", "File not found", 404);
    }
    return {
      id: fileId,
      ...references,
      referencePolicy:
        "Original file content deleted. Existing transactions and import records remain; source links show that the original is unavailable.",
    };
  }

  return { listFiles, removeFile, updateProfile };
}

export const accountSettingsService = createAccountSettingsService();

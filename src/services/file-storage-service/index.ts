import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { db, type Database } from "@/db/client";
import { storedFiles } from "@/db/schema";
import { FileStorageError } from "@/services/file-storage-service/error";
import {
  MAX_BILL_FILE_BYTES,
  MAX_SCREENSHOT_BYTES,
  validateBillContent,
  validateBillMetadata,
  validateScreenshotFile,
  type ScreenshotExtension,
} from "@/services/file-storage-service/validation";

export { FileStorageError } from "@/services/file-storage-service/error";
export { validateScreenshotFile } from "@/services/file-storage-service/validation";

export interface FileStorage {
  saveBillFile(userId: string, file: File): Promise<{
    record: typeof storedFiles.$inferSelect;
    bytes: Buffer;
    extension: "csv" | "xlsx";
  }>;
  saveScreenshot(userId: string, file: File): Promise<{
    record: typeof storedFiles.$inferSelect;
    bytes: Buffer;
    extension: ScreenshotExtension;
  }>;
  read(userId: string, fileId: string): Promise<{
    record: typeof storedFiles.$inferSelect;
    bytes: Buffer;
  }>;
  delete(userId: string, fileId: string): Promise<boolean>;
}

export function createLocalFileStorage(database: Database = db): FileStorage {
  const root = resolve(
    /* turbopackIgnore: true */ process.env.FILE_STORAGE_ROOT ?? "storage",
  );

  function absolutePath(storageKey: string) {
    const candidate = resolve(/* turbopackIgnore: true */ root, storageKey);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
      throw new FileStorageError("INVALID_STORAGE_KEY", "Unsafe file path", 500);
    }
    return candidate;
  }

  async function saveBillFile(userId: string, file: File) {
    if (!(file instanceof File)) {
      throw new FileStorageError("MISSING_FILE", "Choose a statement file", 400);
    }

    const validated = validateBillMetadata(file);
    const bytes = Buffer.from(await file.arrayBuffer());
    validateBillContent(validated.extension, bytes);
    const id = randomUUID();
    const userDirectory = createHash("sha256").update(userId).digest("hex").slice(0, 20);
    const storageKey = `${userDirectory}/bill/${id}.${validated.extension}`;
    const path = absolutePath(storageKey);
    const now = new Date().toISOString();
    const record = {
      id,
      userId,
      kind: "bill" as const,
      originalName: validated.originalName,
      storageKey,
      mimeType: validated.mimeType,
      extension: validated.extension,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      deletedAt: null,
      createdAt: now,
    };

    const directory = dirname(path);
    await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
    const handle = await open(/* turbopackIgnore: true */ path, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }

    try {
      database.insert(storedFiles).values(record).run();
    } catch (error) {
      await unlink(/* turbopackIgnore: true */ path).catch(() => undefined);
      throw error;
    }

    return { record, bytes, extension: validated.extension };
  }

  async function saveScreenshot(userId: string, file: File) {
    const validated = await validateScreenshotFile(file);
    const { bytes } = validated;
    const id = randomUUID();
    const userDirectory = createHash("sha256")
      .update(userId)
      .digest("hex")
      .slice(0, 20);
    const storageKey = `${userDirectory}/screenshot/${id}.${validated.extension}`;
    const path = absolutePath(storageKey);
    const now = new Date().toISOString();
    const record = {
      id,
      userId,
      kind: "screenshot" as const,
      originalName: validated.originalName,
      storageKey,
      mimeType: validated.mimeType,
      extension: validated.extension,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      deletedAt: null,
      createdAt: now,
    };

    const directory = dirname(path);
    await mkdir(/* turbopackIgnore: true */ directory, { recursive: true });
    const handle = await open(/* turbopackIgnore: true */ path, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }

    try {
      database.insert(storedFiles).values(record).run();
    } catch (error) {
      await unlink(/* turbopackIgnore: true */ path).catch(() => undefined);
      throw error;
    }

    return { record, bytes, extension: validated.extension };
  }

  async function read(userId: string, fileId: string) {
    const record = database
      .select()
      .from(storedFiles)
      .where(
        and(
          eq(storedFiles.id, fileId),
          eq(storedFiles.userId, userId),
          isNull(storedFiles.deletedAt),
        ),
      )
      .get();

    if (!record) {
      throw new FileStorageError("FILE_NOT_FOUND", "File not found", 404);
    }

    try {
      const path = absolutePath(record.storageKey);
      return {
        record,
        bytes: await readFile(/* turbopackIgnore: true */ path),
      };
    } catch {
      throw new FileStorageError("FILE_CONTENT_MISSING", "File content has been deleted", 404);
    }
  }

  async function remove(userId: string, fileId: string) {
    const record = database
      .select()
      .from(storedFiles)
      .where(
        and(eq(storedFiles.id, fileId), eq(storedFiles.userId, userId)),
      )
      .get();
    if (!record || record.deletedAt) return false;

    try {
      const path = absolutePath(record.storageKey);
      await unlink(/* turbopackIgnore: true */ path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new FileStorageError(
          "FILE_DELETE_FAILED",
          "Failed to delete file. Try again later",
          500,
        );
      }
    }
    database
      .update(storedFiles)
      .set({ deletedAt: new Date().toISOString() })
      .where(and(eq(storedFiles.id, fileId), eq(storedFiles.userId, userId)))
      .run();
    return true;
  }

  return { saveBillFile, saveScreenshot, read, delete: remove };
}

export const fileStorageService = createLocalFileStorage();

export const fileLimits = {
  bill: MAX_BILL_FILE_BYTES,
  screenshot: MAX_SCREENSHOT_BYTES,
};

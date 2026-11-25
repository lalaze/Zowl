import { mkdir, mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import { storedFiles, users } from "@/db/schema";
import {
  createLocalFileStorage,
  fileLimits,
  FileStorageError,
} from "@/services/file-storage-service";

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const onePixelJpeg = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EB//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EB//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EB//2Q==",
  "base64",
);
const onePixelWebp = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AA/v89WAAAAA==",
  "base64",
).subarray(0, 42);

describe("local file storage service", () => {
  let database: ReturnType<typeof createDatabase>;
  let service: ReturnType<typeof createLocalFileStorage>;
  let storageRoot: string;
  let previousStorageRoot: string | undefined;

  beforeEach(async () => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    database.db
      .insert(users)
      .values([
        {
          id: "user-a",
          email: "file-a@example.com",
          passwordHash: "test",
          displayName: "File A",
          timezone: "Asia/Shanghai",
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
        {
          id: "user-b",
          email: "file-b@example.com",
          passwordHash: "test",
          displayName: "File B",
          timezone: "Asia/Shanghai",
          createdAt: "2026-07-15T00:00:00.000Z",
          updatedAt: "2026-07-15T00:00:00.000Z",
        },
      ])
      .run();

    previousStorageRoot = process.env.FILE_STORAGE_ROOT;
    storageRoot = await mkdtemp(path.join(os.tmpdir(), "zemoney-files-"));
    process.env.FILE_STORAGE_ROOT = storageRoot;
    service = createLocalFileStorage(database.db);
  });

  afterEach(async () => {
    database.sqlite.close();
    await rm(storageRoot, { recursive: true, force: true });
    if (previousStorageRoot === undefined) {
      delete process.env.FILE_STORAGE_ROOT;
    } else {
      process.env.FILE_STORAGE_ROOT = previousStorageRoot;
    }
  });

  it("keeps reads and deletes isolated to the owning user", async () => {
    const saved = await service.saveBillFile(
      "user-a",
      new File(["date,amount\n2026-07-15,12.34"], "bill.csv", {
        type: "text/csv",
      }),
    );

    await expect(service.read("user-b", saved.record.id)).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
      status: 404,
    });
    await expect(service.delete("user-b", saved.record.id)).resolves.toBe(false);
    await expect(service.read("user-a", saved.record.id)).resolves.toMatchObject({
      record: { id: saved.record.id, userId: "user-a" },
      bytes: saved.bytes,
    });
  });

  it("reads saved bytes and soft-deletes both the record and disk content", async () => {
    const content = Buffer.from("Transaction time,Amount\n2026-07-15,35.80", "utf8");
    const saved = await service.saveBillFile(
      "user-a",
      new File([content], "Alipay statement.csv", { type: "text/csv" }),
    );
    const storedPath = path.join(storageRoot, saved.record.storageKey);

    await expect(readFile(storedPath)).resolves.toEqual(content);
    await expect(service.read("user-a", saved.record.id)).resolves.toMatchObject({
      record: {
        id: saved.record.id,
        originalName: "Alipay statement.csv",
        extension: "csv",
      },
      bytes: content,
    });

    await expect(service.delete("user-a", saved.record.id)).resolves.toBe(true);
    await expect(service.delete("user-a", saved.record.id)).resolves.toBe(false);
    await expect(readFile(storedPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(service.read("user-a", saved.record.id)).rejects.toMatchObject({
      code: "FILE_NOT_FOUND",
      status: 404,
    });

    const record = database.db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.id, saved.record.id))
      .get();
    expect(record?.deletedAt).not.toBeNull();
  });

  it.each([
    {
      name: "receipt.png",
      type: "image/png",
      bytes: onePixelPng,
      extension: "png",
    },
    {
      name: "receipt.jpeg",
      type: "image/jpeg",
      bytes: onePixelJpeg,
      extension: "jpg",
    },
    {
      name: "receipt.webp",
      type: "image/webp",
      bytes: onePixelWebp,
      extension: "webp",
    },
  ])(
    "saves an authenticated $extension screenshot with a server-derived MIME type",
    async ({ name, type, bytes, extension }) => {
      const saved = await service.saveScreenshot(
        "user-a",
        new File([bytes], name, { type }),
      );

      expect(saved.record).toMatchObject({
        userId: "user-a",
        kind: "screenshot",
        extension,
        mimeType: type,
      });
      await expect(service.read("user-b", saved.record.id)).rejects.toMatchObject({
        code: "FILE_NOT_FOUND",
      });
      await expect(service.read("user-a", saved.record.id)).resolves.toMatchObject({
        bytes,
      });
    },
  );

  it("keeps deletion retryable when physical removal fails", async () => {
    const saved = await service.saveBillFile(
      "user-a",
      new File(["date,amount\n2026-07-15,12.34"], "bill.csv", {
        type: "text/csv",
      }),
    );
    const storedPath = path.join(storageRoot, saved.record.storageKey);
    await unlink(storedPath);
    await mkdir(storedPath);

    await expect(service.delete("user-a", saved.record.id)).rejects.toMatchObject({
      code: "FILE_DELETE_FAILED",
      status: 500,
    });
    const record = database.db
      .select()
      .from(storedFiles)
      .where(eq(storedFiles.id, saved.record.id))
      .get();
    expect(record?.deletedAt).toBeNull();
  });

  it.each([
    {
      scenario: "unsupported extension",
      file: () => new File(["hello"], "bill.txt", { type: "text/plain" }),
      code: "UNSUPPORTED_FILE_TYPE",
    },
    {
      scenario: "invalid XLSX magic bytes",
      file: () =>
        new File(["not-a-zip"], "bill.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      code: "INVALID_XLSX_SIGNATURE",
    },
    {
      scenario: "oversized bill",
      file: () =>
        new File([new Uint8Array(fileLimits.bill + 1)], "bill.csv", {
          type: "text/csv",
        }),
      code: "FILE_TOO_LARGE",
    },
    {
      scenario: "binary CSV content",
      file: () =>
        new File([new Uint8Array([0x61, 0x2c, 0x62, 0x00, 0xff])], "bill.csv", {
          type: "text/csv",
        }),
      code: "INVALID_CSV_CONTENT",
    },
  ])("rejects $scenario without persisting a record", async ({ file, code }) => {
    await expect(service.saveBillFile("user-a", file())).rejects.toMatchObject({
      name: FileStorageError.name,
      code,
      status: 422,
    });

    expect(database.db.select().from(storedFiles).all()).toHaveLength(0);
  });

  it.each([
    {
      scenario: "unsupported screenshot extension",
      file: () =>
        new File(["not an image"], "receipt.svg", { type: "image/svg+xml" }),
      code: "UNSUPPORTED_IMAGE_TYPE",
    },
    {
      scenario: "mismatched screenshot MIME type",
      file: () =>
        new File(
          [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
          "receipt.png",
          { type: "image/jpeg" },
        ),
      code: "MIME_TYPE_MISMATCH",
    },
    {
      scenario: "missing screenshot MIME type",
      file: () => new File([onePixelPng], "receipt.png"),
      code: "MIME_TYPE_MISMATCH",
    },
    {
      scenario: "generic binary screenshot MIME type",
      file: () =>
        new File([onePixelPng], "receipt.png", {
          type: "application/octet-stream",
        }),
      code: "MIME_TYPE_MISMATCH",
    },
    {
      scenario: "spoofed screenshot magic bytes",
      file: () =>
        new File(["<script>alert(1)</script>"], "receipt.png", {
          type: "image/png",
        }),
      code: "INVALID_IMAGE_SIGNATURE",
    },
    {
      scenario: "truncated screenshot structure",
      file: () =>
        new File([onePixelPng.subarray(0, 24)], "receipt.png", {
          type: "image/png",
        }),
      code: "INVALID_IMAGE_SIGNATURE",
    },
    {
      scenario: "oversized screenshot",
      file: () =>
        new File([new Uint8Array(fileLimits.screenshot + 1)], "receipt.jpg", {
          type: "image/jpeg",
        }),
      code: "FILE_TOO_LARGE",
    },
  ])("rejects $scenario without persisting a record", async ({ file, code }) => {
    await expect(service.saveScreenshot("user-a", file())).rejects.toMatchObject({
      name: FileStorageError.name,
      code,
      status: 422,
    });

    expect(database.db.select().from(storedFiles).all()).toHaveLength(0);
  });
});

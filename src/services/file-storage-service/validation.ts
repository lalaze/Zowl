import { basename, extname } from "node:path";

import { FileStorageError } from "@/services/file-storage-service/error";

export const MAX_BILL_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;

export type ScreenshotExtension = "jpg" | "png" | "webp";

function safeOriginalName(value: string) {
  return (
    basename(value)
      .normalize("NFKC")
      .replace(/[\u0000-\u001f\u007f]/gu, "")
      .slice(0, 180) || "Untitled file"
  );
}

function isZip(bytes: Buffer) {
  return (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    [0x03, 0x05, 0x07].includes(bytes[2]) &&
    [0x04, 0x06, 0x08].includes(bytes[3])
  );
}

export function validateBillMetadata(file: File) {
  const originalName = safeOriginalName(file.name);
  const extension = extname(originalName).slice(1).toLowerCase();

  if (!(["csv", "xlsx"] as string[]).includes(extension)) {
    throw new FileStorageError(
      "UNSUPPORTED_FILE_TYPE",
      "Only supports CSV and XLSX File",
    );
  }
  if (!file.size || file.size > MAX_BILL_FILE_BYTES) {
    throw new FileStorageError(
      "FILE_TOO_LARGE",
      "Statement file must be smaller than 10 MiB",
    );
  }
  const allowedMimeTypes =
    extension === "csv"
      ? new Set([
          "",
          "text/csv",
          "application/csv",
          "text/plain",
          "application/vnd.ms-excel",
          "application/octet-stream",
        ])
      : new Set([
          "",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
        ]);
  if (!allowedMimeTypes.has(file.type.toLowerCase())) {
    throw new FileStorageError(
      "MIME_TYPE_MISMATCH",
      "Declared file type does not match the extension",
    );
  }
  return {
    originalName,
    extension: extension as "csv" | "xlsx",
    mimeType:
      file.type ||
      (extension === "csv"
        ? "text/csv"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
  };
}

export function validateBillContent(extension: "csv" | "xlsx", bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_BILL_FILE_BYTES) {
    throw new FileStorageError(
      "FILE_TOO_LARGE",
      "Statement file must be smaller than 10 MiB",
    );
  }
  if (extension === "xlsx" && !isZip(bytes)) {
    throw new FileStorageError(
      "INVALID_XLSX_SIGNATURE",
      "File content is not valid XLSX",
    );
  }
  if (extension === "csv" && bytes.includes(0)) {
    throw new FileStorageError(
      "INVALID_CSV_CONTENT",
      "CSV contains unsupported binary content",
    );
  }
}

function validateScreenshotMetadata(file: File) {
  const originalName = safeOriginalName(file.name);
  const sourceExtension = extname(originalName).slice(1).toLowerCase();
  const extension = sourceExtension === "jpeg" ? "jpg" : sourceExtension;

  if (!["jpg", "png", "webp"].includes(extension)) {
    throw new FileStorageError(
      "UNSUPPORTED_IMAGE_TYPE",
      "Only JPG, PNG, and WebP images are supported",
    );
  }
  if (!file.size || file.size > MAX_SCREENSHOT_BYTES) {
    throw new FileStorageError(
      "FILE_TOO_LARGE",
      "Each image must be smaller than 8 MiB",
    );
  }

  const expectedMimeType =
    extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  const declaredMimeType = file.type.toLowerCase();
  if (declaredMimeType !== expectedMimeType) {
    throw new FileStorageError(
      "MIME_TYPE_MISMATCH",
      "Declared image type does not match the extension",
    );
  }

  return {
    originalName,
    extension: extension as ScreenshotExtension,
    mimeType: expectedMimeType,
  };
}

function hasSafeImageDimensions(width: number, height: number) {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 20_000 &&
    height <= 20_000 &&
    width * height <= 100_000_000
  );
}

function isStructurallyValidPng(bytes: Buffer) {
  if (bytes.length < 45) return false;
  let offset = 8;
  let firstChunk = true;
  let hasImageData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) return false;
    if (firstChunk) {
      if (type !== "IHDR" || length !== 13) return false;
      if (
        !hasSafeImageDimensions(
          bytes.readUInt32BE(offset + 8),
          bytes.readUInt32BE(offset + 12),
        )
      ) {
        return false;
      }
      firstChunk = false;
    }
    if (type === "IDAT" && length > 0) hasImageData = true;
    if (type === "IEND") {
      return length === 0 && hasImageData && chunkEnd === bytes.length;
    }
    offset = chunkEnd;
  }
  return false;
}

function isStartOfFrameMarker(marker: number) {
  return (
    marker >= 0xc0 &&
    marker <= 0xcf &&
    ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

function isStructurallyValidJpeg(bytes: Buffer) {
  if (
    bytes.length < 12 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  ) {
    return false;
  }

  let offset = 2;
  let hasFrame = false;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) return false;
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined) return false;
    if (marker === 0xd9) return hasFrame;
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return false;
      const scanHeaderLength = bytes.readUInt16BE(offset);
      return (
        hasFrame &&
        scanHeaderLength >= 2 &&
        offset + scanHeaderLength < bytes.length - 2
      );
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false;
    if (isStartOfFrameMarker(marker)) {
      if (segmentLength < 8) return false;
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      if (!hasSafeImageDimensions(width, height)) return false;
      hasFrame = true;
    }
    offset += segmentLength;
  }
  return false;
}

function isStructurallyValidWebp(bytes: Buffer) {
  if (bytes.length < 30 || bytes.readUInt32LE(4) + 8 !== bytes.length) {
    return false;
  }
  let offset = 12;
  let hasImageChunk = false;
  let hasExtendedHeader = false;
  while (offset + 8 <= bytes.length) {
    const chunkType = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkLength = bytes.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    const chunkEnd = payloadOffset + chunkLength;
    const paddedEnd = chunkEnd + (chunkLength % 2);
    if (paddedEnd > bytes.length) return false;

    if (chunkType === "VP8X") {
      if (offset !== 12 || chunkLength < 10) return false;
      hasExtendedHeader = hasSafeImageDimensions(
        1 + bytes.readUIntLE(payloadOffset + 4, 3),
        1 + bytes.readUIntLE(payloadOffset + 7, 3),
      );
      if (!hasExtendedHeader) return false;
    } else if (
      chunkType === "VP8L" &&
      chunkLength >= 5 &&
      bytes[payloadOffset] === 0x2f
    ) {
      const bits = bytes.readUInt32LE(payloadOffset + 1);
      hasImageChunk = hasSafeImageDimensions(
        (bits & 0x3fff) + 1,
        ((bits >>> 14) & 0x3fff) + 1,
      );
    } else if (
      chunkType === "VP8 " &&
      chunkLength >= 10 &&
      bytes[payloadOffset + 3] === 0x9d &&
      bytes[payloadOffset + 4] === 0x01 &&
      bytes[payloadOffset + 5] === 0x2a
    ) {
      hasImageChunk = hasSafeImageDimensions(
        bytes.readUInt16LE(payloadOffset + 6) & 0x3fff,
        bytes.readUInt16LE(payloadOffset + 8) & 0x3fff,
      );
    }
    offset = paddedEnd;
  }
  return offset === bytes.length && hasImageChunk;
}

function detectScreenshotExtension(bytes: Buffer): ScreenshotExtension | null {
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    isStructurallyValidPng(bytes)
  ) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff &&
    isStructurallyValidJpeg(bytes)
  ) {
    return "jpg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP" &&
    isStructurallyValidWebp(bytes)
  ) {
    return "webp";
  }
  return null;
}

function validateScreenshotContent(
  extension: ScreenshotExtension,
  bytes: Buffer,
) {
  if (!bytes.length || bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new FileStorageError(
      "FILE_TOO_LARGE",
      "Each image must be smaller than 8 MiB",
    );
  }
  if (detectScreenshotExtension(bytes) !== extension) {
    throw new FileStorageError(
      "INVALID_IMAGE_SIGNATURE",
      "Image content does not match its file type",
    );
  }
}

export async function validateScreenshotFile(file: File) {
  if (!(file instanceof File)) {
    throw new FileStorageError("MISSING_FILE", "Choose screenshots", 400);
  }
  const metadata = validateScreenshotMetadata(file);
  const bytes = Buffer.from(await file.arrayBuffer());
  validateScreenshotContent(metadata.extension, bytes);
  return { ...metadata, bytes };
}

import Papa from "papaparse";
import { read, utils } from "xlsx";

import type { ParsedFile } from "@/services/import-service/types";

export const MAX_IMPORT_ROWS = 10_000;
const MAX_XLSX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;
const MAX_XLSX_COLUMNS = 200;

export class TabularFileError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TabularFileError";
  }
}

function decodeCsv(bytes: Buffer) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
  }

  const content =
    bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    try {
      return new TextDecoder("gb18030", { fatal: true }).decode(content);
    } catch {
      throw new TabularFileError(
        "UNSUPPORTED_ENCODING",
        "Cannot recognize CSV encoding. Use UTF-8 or GB18030",
      );
    }
  }
}

function parseCsvRows(bytes: Buffer) {
  const result = Papa.parse<string[]>(decodeCsv(bytes), {
    header: false,
    skipEmptyLines: false,
  });
  const fatalErrors = result.errors.filter(
    (error) => error.code !== "UndetectableDelimiter",
  );

  if (fatalErrors.length) {
    const firstError = fatalErrors[0]!;
    throw new TabularFileError(
      "INVALID_CSV",
      `CSV Page ${(firstError.row ?? 0) + 1} row format is invalid`,
    );
  }

  return result.data.map((row) => row.map((value) => String(value ?? "")));
}

function parseXlsxRows(bytes: Buffer) {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = bytes.lastIndexOf(endSignature);
  if (endOffset < 0 || endOffset + 22 > bytes.length) {
    throw new TabularFileError("INVALID_XLSX", "XLSX Incomplete ZIP directory");
  }
  const entryCount = bytes.readUInt16LE(endOffset + 10);
  const centralDirectoryOffset = bytes.readUInt32LE(endOffset + 16);
  if (entryCount === 0xffff || centralDirectoryOffset === 0xffffffff) {
    throw new TabularFileError("XLSX_TOO_COMPLEX", "Currently unsupported: ZIP64 workbook");
  }
  if (entryCount > 5_000) {
    throw new TabularFileError("XLSX_EXPANSION_LIMIT", "XLSX Too many file entries");
  }

  let offset = centralDirectoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (
      offset + 46 > bytes.length ||
      bytes.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new TabularFileError("INVALID_XLSX", "XLSX Incomplete ZIP directory");
    }
    const uncompressedBytes = bytes.readUInt32LE(offset + 24);
    if (uncompressedBytes === 0xffffffff) {
      throw new TabularFileError("XLSX_TOO_COMPLEX", "Currently unsupported: ZIP64 workbook");
    }
    totalUncompressedBytes += uncompressedBytes;
    if (
      uncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES ||
      totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES
    ) {
      throw new TabularFileError(
        "XLSX_EXPANSION_LIMIT",
        "XLSX Uncompressed content exceeds the safety limit",
      );
    }
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  let workbook;
  try {
    workbook = read(bytes, {
      type: "buffer",
      cellDates: true,
      dense: true,
      sheets: 0,
      bookVBA: false,
      WTF: false,
    });
  } catch {
    throw new TabularFileError("INVALID_XLSX", "XLSX File is corrupted or its format is unsupported");
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new TabularFileError("EMPTY_WORKBOOK", "No readable worksheets in the workbook");
  }

  if (sheet["!ref"]) {
    const range = utils.decode_range(sheet["!ref"]);
    const rowCount = range.e.r - range.s.r + 1;
    const columnCount = range.e.c - range.s.c + 1;
    if (
      rowCount > MAX_IMPORT_ROWS + 50 ||
      columnCount > MAX_XLSX_COLUMNS ||
      rowCount * columnCount > 2_000_000
    ) {
      throw new TabularFileError(
        "XLSX_SHEET_LIMIT",
        "Worksheet dimensions exceed the safety limit",
      );
    }
  }

  return utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    dateNF: "yyyy-mm-dd hh:mm:ss",
    defval: "",
    blankrows: true,
  }).map((row) => row.map((value) => String(value ?? "")));
}

export function parseTabularFile(input: {
  originalName: string;
  mimeType: string;
  extension: "csv" | "xlsx";
  bytes: Buffer;
}): ParsedFile {
  const rows =
    input.extension === "csv"
      ? parseCsvRows(input.bytes)
      : parseXlsxRows(input.bytes);

  if (rows.length > MAX_IMPORT_ROWS + 50) {
    throw new TabularFileError(
      "TOO_MANY_ROWS",
      `Maximum rows per import: ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows`,
    );
  }

  return { ...input, rows };
}

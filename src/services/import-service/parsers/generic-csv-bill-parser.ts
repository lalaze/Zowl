import type {
  BillParser,
  FieldMapping,
  ParsedFile,
  ParsedTransaction,
} from "@/services/import-service/types";
import {
  buildRecord,
  detectMapping,
  fieldAliases,
  findHeaderRow,
  headerMatches,
  isDataRow,
  parserMetadata,
  valueFrom,
} from "@/services/import-service/parsers/helpers";

function genericHeaderScore(headers: string[]) {
  return Object.values(fieldAliases).reduce(
    (score, aliases) =>
      score + (headers.some((header) => headerMatches(header, aliases)) ? 1 : 0),
    0,
  );
}

export class GenericCsvBillParser implements BillParser {
  readonly source = "other" as const;

  constructor(private readonly userMapping: FieldMapping = {}) {}

  private headerIndex(file: ParsedFile) {
    const mappedHeaders = new Set(Object.values(this.userMapping));
    const detected = findHeaderRow(
      file.rows,
      (headers) =>
        genericHeaderScore(headers) +
        headers.filter((header) => mappedHeaders.has(header)).length * 2,
    );
    if (detected >= 0) return detected;

    let bestIndex = -1;
    let bestColumnCount = 1;
    file.rows.slice(0, 40).forEach((row, index) => {
      const columnCount = row.filter((value) => value.trim()).length;
      if (columnCount > bestColumnCount) {
        bestIndex = index;
        bestColumnCount = columnCount;
      }
    });
    return bestIndex;
  }

  canParse(file: ParsedFile) {
    return ["csv", "xlsx"].includes(file.extension) && this.headerIndex(file) >= 0;
  }

  metadata(file: ParsedFile) {
    const index = this.headerIndex(file);
    const headers = file.rows[index] ?? [];
    return parserMetadata(file, index, {
      ...detectMapping(headers),
      ...this.userMapping,
    });
  }

  async parse(file: ParsedFile): Promise<ParsedTransaction[]> {
    const metadata = this.metadata(file);
    const headers = metadata.headers;

    return file.rows
      .slice(metadata.headerRowNumber)
      .map((row, index) => ({ row, rowNumber: metadata.headerRowNumber + index + 1 }))
      .filter(({ row }) => isDataRow(row))
      .map(({ row, rowNumber }) => {
        const rawData = buildRecord(headers, row);
        return {
          rowNumber,
          rawData,
          source: this.source,
          type: valueFrom(rawData, metadata.mapping, "type"),
          amount: valueFrom(rawData, metadata.mapping, "amount"),
          currency: valueFrom(rawData, metadata.mapping, "currency"),
          merchantName: valueFrom(rawData, metadata.mapping, "merchantName"),
          description: valueFrom(rawData, metadata.mapping, "description"),
          transactionTime: valueFrom(
            rawData,
            metadata.mapping,
            "transactionTime",
          ),
          paymentMethod: valueFrom(rawData, metadata.mapping, "paymentMethod"),
          platformTransactionId: valueFrom(
            rawData,
            metadata.mapping,
            "platformTransactionId",
          ),
          status: valueFrom(rawData, metadata.mapping, "status"),
        };
      });
  }
}

import type {
  importDecisions,
  importSources,
  transactionTypes,
} from "@/db/schema";
import type { StoredAiCategorySuggestion } from "@/services/ai-categorization-service";

export const canonicalImportFields = [
  "type",
  "amount",
  "transactionTime",
  "merchantName",
  "description",
  "paymentMethod",
  "platformTransactionId",
  "status",
  "currency",
] as const;

export type CanonicalImportField = (typeof canonicalImportFields)[number];
export type FieldMapping = Partial<Record<CanonicalImportField, string>>;
export type ImportSource = (typeof importSources)[number];
export type ImportDecision = (typeof importDecisions)[number];

export type ParsedFile = {
  originalName: string;
  mimeType: string;
  extension: "csv" | "xlsx";
  bytes: Buffer;
  rows: string[][];
};

export type ParsedTransaction = {
  rowNumber: number;
  rawData: Record<string, string>;
  source: ImportSource;
  type?: string;
  amount?: string;
  currency?: string;
  merchantName?: string;
  description?: string;
  transactionTime?: string;
  paymentMethod?: string;
  platformTransactionId?: string;
  status?: string;
};

export type ParserMetadata = {
  headerRowNumber: number;
  headers: string[];
  mapping: FieldMapping;
};

export interface BillParser {
  readonly source: ImportSource;
  canParse(file: ParsedFile): boolean;
  parse(file: ParsedFile): Promise<ParsedTransaction[]>;
  metadata(file: ParsedFile): ParserMetadata;
}

export type NormalizedImportTransaction = {
  type: (typeof transactionTypes)[number] | null;
  amount: string;
  amountMinor: number | null;
  currency: string;
  merchantName: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  transactionTime: string | null;
  source: ImportSource;
  paymentMethod: string | null;
  platformTransactionId: string | null;
  status: string | null;
  categorySuggestion?: StoredAiCategorySuggestion;
};

export type ImportValidationError = {
  field: string;
  code: string;
  message: string;
};

export type ImportWarning = {
  code: string;
  message: string;
  matchedItemId?: string;
  matchedRowNumber?: number;
};

export const billEnrichmentFields = [
  "merchantName",
  "description",
  "paymentMethod",
  "categoryId",
] as const;

export type BillEnrichmentField = (typeof billEnrichmentFields)[number];
export type BillEnrichmentValues = Record<
  BillEnrichmentField,
  string | null
>;
export type BillEnrichmentResolution = "keep_current" | "use_bill";

export type BillEnrichmentData =
  | {
      status: "ready" | "conflict";
      targetKind: "notification_capture" | "transaction";
      targetId: string;
      captureId: string;
      targetVersion: string;
      immutable: {
        amountMinor: number;
        currency: string;
        transactionTime: string;
      };
      current: BillEnrichmentValues;
      proposed: BillEnrichmentValues;
      conflicts: BillEnrichmentField[];
      resolutions: Partial<
        Record<BillEnrichmentField, BillEnrichmentResolution>
      >;
    }
  | {
      status: "ambiguous";
      targetKind: null;
      targetId: null;
      captureId: null;
      targetVersion: null;
      current: null;
      proposed: BillEnrichmentValues;
      conflicts: [];
      resolutions: Partial<
        Record<BillEnrichmentField, BillEnrichmentResolution>
      >;
      candidateTargetIds: string[];
    };

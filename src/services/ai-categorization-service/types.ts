import type {
  categoryKinds,
  transactionSources,
  transactionTypes,
} from "@/db/schema";
import type { Locale } from "@/lib/i18n/locale";

export type AiCategoryOption = {
  id: string;
  name: string;
  kind: (typeof categoryKinds)[number];
};

export type AiCategoryInput = {
  itemRef: string;
  type: (typeof transactionTypes)[number];
  source: (typeof transactionSources)[number];
  merchantName: string | null;
  description: string | null;
};

export type AiCategoryBatchInput = {
  categories: AiCategoryOption[];
  items: AiCategoryInput[];
  /** Language the model writes `reason` in: the requester's UI language. */
  locale: Locale;
};

export type AiCategoryResult = {
  itemRef: string;
  categoryId: string | null;
  confidence: number;
  ambiguous: boolean;
  reason: string;
};

export type StoredAiCategorySuggestion = AiCategoryResult & {
  categoryName: string | null;
  inputDigest: string;
  model: string;
  configurationFingerprint?: string;
  status: "auto_applied" | "needs_review" | "adopted" | "overridden";
};

/** One screen of a shopping app, as text lines, read shortly before a payment. */
export type OrderContextPage = {
  source: "node" | "ocr";
  lines: string[];
};

export type OrderDetailsInput = {
  /** The shopping app the payment was made in, e.g. "taobao". */
  platform: string;
  amountMinor: number;
  currency: string;
  categories: AiCategoryOption[];
  /** Oldest first; the last page is the one closest to the payment. */
  pages: OrderContextPage[];
  /** Language the model writes `reason` in. */
  locale: Locale;
};

export type OrderDetailsResult = {
  shopName: string | null;
  items: Array<{
    name: string;
    spec: string | null;
    quantity: number | null;
    /** Listed price in major units (yuan), as shown on the page. */
    price: number | null;
  }>;
  categoryId: string | null;
  confidence: number;
  ambiguous: boolean;
  reason: string;
};

export interface AiCategorizationProvider {
  readonly name: "off" | "openai-compatible";
  readonly model: string | null;
  readonly enabled: boolean;
  readonly sendsDataToThirdParty: boolean;
  classifyBatch(input: AiCategoryBatchInput): Promise<AiCategoryResult[]>;
  /** Absent on providers that cannot read order pages; callers then skip it. */
  extractOrderDetails?(input: OrderDetailsInput): Promise<OrderDetailsResult>;
}

export type AiCategorizationProviderMetadata = {
  mode: "off" | "local" | "third-party" | "unavailable";
  providerLabel: string;
  configured: boolean;
  enabled: boolean;
  sendsDataToThirdParty: boolean;
  model: string | null;
  disclosure: string;
  retentionPolicy: string;
};

export type AiCategorizationRuntime = {
  provider: AiCategorizationProvider;
  autoThreshold: number;
  batchSize: number;
  configurationFingerprint: string;
  metadata: AiCategorizationProviderMetadata;
};

export type AiCategorizationRuntimeResolver = (
  userId: string,
) => AiCategorizationRuntime;

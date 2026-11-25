import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import {
  avatarPresetValues,
  defaultAvatarPreset,
} from "@/lib/avatar-presets";

export const transactionTypes = [
  "expense",
  "income",
  "transfer",
  "refund",
] as const;

export const transactionSources = [
  "manual",
  "screenshot",
  "alipay",
  "wechat",
  "cmb",
  "taobao",
  "pinduoduo",
  "jd",
  "pupu",
  "other",
] as const;

export const duplicateStatuses = [
  "unique",
  "possible_duplicate",
  "duplicate",
] as const;

export const categoryKinds = ["expense", "income", "both"] as const;

export const aiCategorizationProviders = ["openai-compatible"] as const;

export const aiCategorizationResponseModes = [
  "json_schema",
  "json_object",
] as const;

export const storedFileKinds = ["bill", "screenshot"] as const;

export const importSources = ["alipay", "wechat", "other"] as const;

export const importBatchStatuses = [
  "parsing",
  "reviewing",
  "committing",
  "completed",
  "failed",
] as const;

export const importDecisions = [
  "pending",
  "import",
  "skip",
  "import_anyway",
] as const;

export const recognitionJobStatuses = [
  "processing",
  "reviewing",
  "committing",
  "completed",
  "failed",
] as const;

export const recognitionItemStatuses = [
  "processing",
  "recognized",
  "recognition_failed",
] as const;

export const postingConfirmationStatuses = [
  "committing",
  "completed",
] as const;

export const postingConfirmationOutcomes = [
  "posted",
  "duplicate",
  "skipped",
] as const;

export const ledgerSourceKinds = [
  "manual",
  "file_import",
  "screenshot_recognition",
  "notification_capture",
  "payment_page_capture",
] as const;

export const ledgerDecisions = ["post", "skip"] as const;

export const notificationCapturePlatforms = [
  "alipay",
  "wechat",
  "cmb",
  "taobao",
  "pinduoduo",
  "jd",
  "pupu",
] as const;

export const notificationCaptureStatuses = [
  "reviewing",
  "completed",
] as const;

export const notificationCaptureFieldOrigins = [
  "parser",
  "quick_input",
  "manual_edit",
  "bill_enrichment",
  "legacy_unknown",
  "system_default",
  "categorization_rule",
  "ai_suggestion",
  "user",
] as const;

export const transactionRevisionKinds = [
  "posting",
  "amendment",
  "voiding",
  "legacy_snapshot",
] as const;

export const userRoles = ["admin", "member"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role", { enum: userRoles }).notNull().default("member"),
  disabledAt: text("disabled_at"),
  avatarPreset: text("avatar_preset", { enum: avatarPresetValues })
    .notNull()
    .default(defaultAvatarPreset),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const aiCategorizationSettings = sqliteTable(
  "ai_categorization_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    provider: text("provider", { enum: aiCategorizationProviders })
      .notNull()
      .default("openai-compatible"),
    baseUrl: text("base_url"),
    model: text("model"),
    encryptedApiKey: text("encrypted_api_key"),
    responseMode: text("response_mode", {
      enum: aiCategorizationResponseModes,
    })
      .notNull()
      .default("json_schema"),
    autoThresholdBasisPoints: integer("auto_threshold_basis_points")
      .notNull()
      .default(8_500),
    batchSize: integer("batch_size").notNull().default(20),
    timeoutMs: integer("timeout_ms").notNull().default(30_000),
    allowInsecureHttp: integer("allow_insecure_http", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "ai_settings_threshold_range",
      sql`${table.autoThresholdBasisPoints} >= 0 and ${table.autoThresholdBasisPoints} <= 10000`,
    ),
    check(
      "ai_settings_batch_size_range",
      sql`${table.batchSize} >= 1 and ${table.batchSize} <= 50`,
    ),
    check(
      "ai_settings_timeout_range",
      sql`${table.timeoutMs} >= 100 and ${table.timeoutMs} <= 120000`,
    ),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: categoryKinds }).notNull(),
    icon: text("icon"),
    color: text("color"),
    isSystem: integer("is_system", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("categories_user_name_unique").on(table.userId, table.name),
    index("categories_user_sort_idx").on(table.userId, table.sortOrder),
  ],
);

export const merchantCategoryRules = sqliteTable(
  "merchant_category_rules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    normalizedMerchantName: text("normalized_merchant_name").notNull(),
    matchType: text("match_type", { enum: ["exact", "contains"] })
      .notNull()
      .default("exact"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("merchant_rules_user_merchant_type_unique").on(
      table.userId,
      table.normalizedMerchantName,
      table.matchType,
    ),
    index("merchant_rules_user_idx").on(table.userId),
  ],
);

export const storedFiles = sqliteTable(
  "stored_files",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: storedFileKinds }).notNull(),
    originalName: text("original_name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    mimeType: text("mime_type").notNull(),
    extension: text("extension").notNull(),
    size: integer("size").notNull(),
    sha256: text("sha256").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("stored_files_size_non_negative", sql`${table.size} >= 0`),
    index("stored_files_user_created_idx").on(table.userId, table.createdAt),
    index("stored_files_user_hash_idx").on(table.userId, table.sha256),
  ],
);

export const importBatches = sqliteTable(
  "import_batches",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => storedFiles.id, { onDelete: "restrict" }),
    source: text("source", { enum: importSources }).notNull(),
    status: text("status", { enum: importBatchStatuses }).notNull(),
    detectedHeaders: text("detected_headers", { mode: "json" }).$type<
      string[]
    >(),
    fieldMapping: text("field_mapping", { mode: "json" }).$type<
      Record<string, string>
    >(),
    headerRowNumber: integer("header_row_number"),
    totalCount: integer("total_count").notNull().default(0),
    validCount: integer("valid_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    createdCount: integer("created_count").notNull().default(0),
    enrichedCount: integer("enriched_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    confirmationVersion: integer("confirmation_version").notNull().default(1),
    failureCode: text("failure_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("import_batches_user_created_idx").on(table.userId, table.createdAt),
    index("import_batches_user_status_idx").on(table.userId, table.status),
    index("import_batches_user_file_idx").on(table.userId, table.fileId),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type", { enum: transactionTypes }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("CNY"),
    merchantName: text("merchant_name"),
    description: text("description"),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    transactionTime: text("transaction_time").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    source: text("source", { enum: transactionSources }).notNull(),
    paymentMethod: text("payment_method"),
    platformTransactionId: text("platform_transaction_id"),
    status: text("status"),
    originalFileId: text("original_file_id").references(() => storedFiles.id, {
      onDelete: "set null",
    }),
    originalRowData: text("original_row_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    importBatchId: text("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    fingerprint: text("fingerprint").notNull(),
    duplicateStatus: text("duplicate_status", { enum: duplicateStatuses })
      .notNull()
      .default("unique"),
    recognitionConfidence: integer("recognition_confidence"),
    needsReview: integer("needs_review", { mode: "boolean" })
      .notNull()
      .default(false),
    currentRevisionId: text("current_revision_id"),
    revisionNumber: integer("revision_number").notNull().default(0),
    voidedAt: text("voided_at"),
  },
  (table) => [
    check("transactions_amount_non_negative", sql`${table.amountMinor} >= 0`),
    check(
      "transactions_confidence_range",
      sql`${table.recognitionConfidence} is null or (${table.recognitionConfidence} >= 0 and ${table.recognitionConfidence} <= 10000)`,
    ),
    index("transactions_user_time_idx").on(
      table.userId,
      table.transactionTime,
    ),
    index("transactions_user_category_time_idx").on(
      table.userId,
      table.categoryId,
      table.transactionTime,
    ),
    index("transactions_user_source_time_id_idx").on(
      table.userId,
      table.source,
      table.transactionTime,
      table.id,
    ),
    index("transactions_user_type_time_id_idx").on(
      table.userId,
      table.type,
      table.transactionTime,
      table.id,
    ),
    index("transactions_user_original_file_idx").on(
      table.userId,
      table.originalFileId,
    ),
    index("transactions_user_fingerprint_idx").on(
      table.userId,
      table.fingerprint,
    ),
    uniqueIndex("transactions_user_source_platform_id_unique")
      .on(table.userId, table.source, table.platformTransactionId)
      .where(sql`${table.platformTransactionId} is not null`),
  ],
);

export const postingConfirmations = sqliteTable(
  "posting_confirmations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    confirmationId: text("confirmation_id").notNull(),
    version: integer("version").notNull(),
    commandDigest: text("command_digest").notNull(),
    status: text("status", { enum: postingConfirmationStatuses }).notNull(),
    postedCount: integer("posted_count").notNull().default(0),
    duplicateCount: integer("duplicate_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    check("posting_confirmations_version_positive", sql`${table.version} > 0`),
    check(
      "posting_confirmations_counts_non_negative",
      sql`${table.postedCount} >= 0 and ${table.duplicateCount} >= 0 and ${table.skippedCount} >= 0`,
    ),
    uniqueIndex("posting_confirmations_user_identity_unique").on(
      table.userId,
      table.confirmationId,
    ),
    index("posting_confirmations_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const transactionRevisions = sqliteTable(
  "transaction_revisions",
  {
    id: text("id").primaryKey(),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    kind: text("kind", { enum: transactionRevisionKinds }).notNull(),
    factsSnapshot: text("facts_snapshot", { mode: "json" })
      .$type<{
        type: (typeof transactionTypes)[number];
        amountMinor: number;
        currency: string;
        merchantName: string | null;
        description: string | null;
        categoryId: string | null;
        transactionTime: string;
        paymentMethod: string | null;
      }>()
      .notNull(),
    provenanceSnapshot: text("provenance_snapshot", { mode: "json" })
      .$type<
        | { kind: "manual" }
        | {
            kind: "file_import";
            importItemId: string;
            batchId: string;
            fileId: string;
            platform: (typeof importSources)[number];
            platformTransactionId: string | null;
            platformStatus: string | null;
          }
        | {
            kind: "screenshot_recognition";
            recognitionItemId: string;
            jobId: string;
            fileId: string;
            providerId: string;
            platformTransactionId: string | null;
            platformStatus: string | null;
            confidenceBasisPoints: number | null;
          }
        | {
            kind: "notification_capture" | "payment_page_capture";
            captureId: string;
            platform: (typeof notificationCapturePlatforms)[number];
            sourcePackage: string;
            parserId: string;
            parserVersion: number;
            evidenceDigest: string;
            platformTransactionId: null;
            platformStatus: "success";
            confidenceBasisPoints: number;
          }
        | {
            kind: "legacy";
            source: (typeof transactionSources)[number];
            originalFileId: string | null;
            importBatchId: string | null;
          }
      >()
      .notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    confirmationRowId: text("confirmation_row_id").references(
      () => postingConfirmations.id,
      { onDelete: "set null" },
    ),
    operationId: text("operation_id"),
    commandDigest: text("command_digest").notNull(),
    duplicateAssessment: text("duplicate_assessment", { mode: "json" }).$type<{
      status: (typeof duplicateStatuses)[number];
      fingerprint: string;
      reasonCode: string | null;
      matchedTransactionId: string | null;
      matchedCandidateRef: string | null;
      algorithmVersion: number;
    }>(),
    duplicateOverride: text("duplicate_override", { mode: "json" }).$type<{
      assessmentDigest: string;
    }>(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "transaction_revisions_number_positive",
      sql`${table.revisionNumber} > 0`,
    ),
    uniqueIndex("transaction_revisions_transaction_number_unique").on(
      table.transactionId,
      table.revisionNumber,
    ),
    uniqueIndex("transaction_revisions_user_operation_unique")
      .on(table.userId, table.operationId)
      .where(sql`${table.operationId} is not null`),
    index("transaction_revisions_user_transaction_idx").on(
      table.userId,
      table.transactionId,
    ),
  ],
);

export const postingConfirmationItems = sqliteTable(
  "posting_confirmation_items",
  {
    id: text("id").primaryKey(),
    confirmationRowId: text("confirmation_row_id")
      .notNull()
      .references(() => postingConfirmations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ordinal: integer("ordinal").notNull(),
    sourceKind: text("source_kind", { enum: ledgerSourceKinds }).notNull(),
    sourceItemRef: text("source_item_ref").notNull(),
    candidateDigest: text("candidate_digest").notNull(),
    decision: text("decision", { enum: ledgerDecisions }).notNull(),
    assessmentStatus: text("assessment_status", {
      enum: duplicateStatuses,
    }).notNull(),
    reasonCode: text("reason_code"),
    matchedTransactionId: text("matched_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    matchedCandidateRef: text("matched_candidate_ref"),
    fingerprint: text("fingerprint").notNull(),
    algorithmVersion: integer("algorithm_version").notNull(),
    overrideDigest: text("override_digest"),
    outcome: text("outcome", { enum: postingConfirmationOutcomes }).notNull(),
    resultTransactionId: text("result_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    resultRevisionId: text("result_revision_id").references(
      () => transactionRevisions.id,
      { onDelete: "set null" },
    ),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check("posting_confirmation_items_ordinal_positive", sql`${table.ordinal} > 0`),
    check(
      "posting_confirmation_items_algorithm_positive",
      sql`${table.algorithmVersion} > 0`,
    ),
    uniqueIndex("posting_confirmation_items_confirmation_ordinal_unique").on(
      table.confirmationRowId,
      table.ordinal,
    ),
    uniqueIndex("posting_confirmation_items_confirmation_source_unique").on(
      table.confirmationRowId,
      table.sourceItemRef,
    ),
    uniqueIndex("posting_confirmation_items_user_source_unique").on(
      table.userId,
      table.sourceKind,
      table.sourceItemRef,
    ),
  ],
);

export const importItems = sqliteTable(
  "import_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    batchId: text("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    rawData: text("raw_data", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    normalizedData: text("normalized_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    enrichmentData: text("enrichment_data", { mode: "json" }).$type<
      import("@/services/import-service/types").BillEnrichmentData
    >(),
    validationErrors: text("validation_errors", { mode: "json" })
      .$type<Array<{ field: string; code: string; message: string }>>()
      .notNull(),
    warnings: text("warnings", { mode: "json" })
      .$type<
        Array<{
          code: string;
          message: string;
          matchedItemId?: string;
          matchedRowNumber?: number;
        }>
      >()
      .notNull(),
    duplicateStatus: text("duplicate_status", { enum: duplicateStatuses })
      .notNull()
      .default("unique"),
    duplicateTransactionId: text("duplicate_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    duplicateAssessmentDigest: text("duplicate_assessment_digest"),
    decision: text("decision", { enum: importDecisions })
      .notNull()
      .default("pending"),
    resultTransactionId: text("result_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    resultCode: text("result_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("import_items_batch_row_idx").on(table.batchId, table.rowNumber),
    index("import_items_user_batch_idx").on(table.userId, table.batchId),
  ],
);

export const recognitionJobs = sqliteTable(
  "recognition_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: recognitionJobStatuses }).notNull(),
    providerId: text("provider_id").notNull(),
    submissionId: text("submission_id"),
    submissionDigest: text("submission_digest"),
    totalCount: integer("total_count").notNull().default(0),
    succeededCount: integer("succeeded_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    confirmationVersion: integer("confirmation_version").notNull().default(1),
    failureCode: text("failure_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    uniqueIndex("recognition_jobs_user_submission_unique").on(table.userId, table.submissionId),
    check(
      "recognition_jobs_counts_non_negative",
      sql`${table.totalCount} >= 0 and ${table.succeededCount} >= 0 and ${table.failedCount} >= 0 and ${table.importedCount} >= 0 and ${table.skippedCount} >= 0`,
    ),
    index("recognition_jobs_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    index("recognition_jobs_user_status_idx").on(table.userId, table.status),
  ],
);

export const recognitionItems = sqliteTable(
  "recognition_items",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    jobId: text("job_id")
      .notNull()
      .references(() => recognitionJobs.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => storedFiles.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    status: text("status", { enum: recognitionItemStatuses }).notNull(),
    providerPayloadHash: text("provider_payload_hash"),
    normalizedData: text("normalized_data", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    validationErrors: text("validation_errors", { mode: "json" })
      .$type<Array<{ field: string; code: string; message: string }>>()
      .notNull(),
    warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(),
    duplicateStatus: text("duplicate_status", { enum: duplicateStatuses })
      .notNull()
      .default("unique"),
    duplicateTransactionId: text("duplicate_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    duplicateAssessmentDigest: text("duplicate_assessment_digest"),
    decision: text("decision", { enum: importDecisions })
      .notNull()
      .default("pending"),
    resultTransactionId: text("result_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    resultCode: text("result_code"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("recognition_items_position_positive", sql`${table.position} > 0`),
    uniqueIndex("recognition_items_job_position_unique").on(
      table.jobId,
      table.position,
    ),
    uniqueIndex("recognition_items_job_file_unique").on(
      table.jobId,
      table.fileId,
    ),
    index("recognition_items_user_job_idx").on(table.userId, table.jobId),
    index("recognition_items_file_idx").on(table.fileId),
    index("recognition_items_user_file_idx").on(table.userId, table.fileId),
  ],
);

/**
 * What a shopping-app payment bought, as a model read it from the order pages
 * the device uploaded with the candidate (ADR-0014). The uploaded text itself
 * is never stored. `priceMinor` is the price listed on the page, not what was
 * paid: items need not add up to the transaction amount.
 */
export type CaptureOrderItem = {
  name: string;
  spec: string | null;
  quantity: number | null;
  priceMinor: number | null;
};

export type CaptureOrderDetails = {
  shopName: string | null;
  items: CaptureOrderItem[];
  extractedAt: string;
  model: string;
  configurationFingerprint: string;
};

export const notificationCaptures = sqliteTable(
  "notification_captures",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    platform: text("platform", { enum: notificationCapturePlatforms }).notNull(),
    sourcePackage: text("source_package").notNull(),
    notificationPostedAt: text("notification_posted_at").notNull(),
    parserId: text("parser_id").notNull(),
    parserVersion: integer("parser_version").notNull(),
    evidenceDigest: text("evidence_digest").notNull(),
    confidenceBasisPoints: integer("confidence_basis_points").notNull(),
    normalizedData: text("normalized_data", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    fieldOrigins: text("field_origins", { mode: "json" }).$type<
      Partial<
        Record<
          "merchantName" | "description" | "paymentMethod" | "categoryId",
          (typeof notificationCaptureFieldOrigins)[number]
        >
      >
    >(),
    validationErrors: text("validation_errors", { mode: "json" })
      .$type<Array<{ field: string; code: string; message: string }>>()
      .notNull(),
    warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(),
    duplicateStatus: text("duplicate_status", { enum: duplicateStatuses })
      .notNull()
      .default("unique"),
    duplicateTransactionId: text("duplicate_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    duplicateAssessmentDigest: text("duplicate_assessment_digest"),
    decision: text("decision", { enum: importDecisions })
      .notNull()
      .default("pending"),
    status: text("status", { enum: notificationCaptureStatuses })
      .notNull()
      .default("reviewing"),
    confirmationVersion: integer("confirmation_version").notNull().default(1),
    resultTransactionId: text("result_transaction_id").references(
      () => transactions.id,
      { onDelete: "set null" },
    ),
    resultCode: text("result_code"),
    orderDetails: text("order_details", { mode: "json" }).$type<CaptureOrderDetails>(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    check(
      "notification_captures_confidence_range",
      sql`${table.confidenceBasisPoints} >= 0 and ${table.confidenceBasisPoints} <= 10000`,
    ),
    check(
      "notification_captures_parser_version_positive",
      sql`${table.parserVersion} > 0`,
    ),
    check(
      "notification_captures_confirmation_version_positive",
      sql`${table.confirmationVersion} > 0`,
    ),
    uniqueIndex("notification_captures_user_idempotency_unique").on(
      table.userId,
      table.idempotencyKey,
    ),
    index("notification_captures_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
  ],
);

export const transactionSupplementalEvidence = sqliteTable(
  "transaction_supplemental_evidence",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    importItemId: text("import_item_id")
      .notNull()
      .references(() => importItems.id, { onDelete: "cascade" }),
    fileId: text("file_id")
      .notNull()
      .references(() => storedFiles.id, { onDelete: "restrict" }),
    source: text("source", { enum: importSources }).notNull(),
    platformTransactionId: text("platform_transaction_id"),
    platformStatus: text("platform_status"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("transaction_supplemental_evidence_user_item_unique").on(
      table.userId,
      table.importItemId,
    ),
    uniqueIndex("transaction_supplemental_evidence_user_platform_unique")
      .on(table.userId, table.source, table.platformTransactionId)
      .where(sql`${table.platformTransactionId} is not null`),
    index("transaction_supplemental_evidence_user_transaction_idx").on(
      table.userId,
      table.transactionId,
    ),
  ],
);

export const notificationCaptureSettings = sqliteTable(
  "notification_capture_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    autoPostAlipay: integer("auto_post_alipay", { mode: "boolean" })
      .notNull()
      .default(false),
    autoPostWechat: integer("auto_post_wechat", { mode: "boolean" })
      .notNull()
      .default(false),
    autoPostPaymentPages: integer("auto_post_payment_pages", { mode: "boolean" })
      .notNull()
      .default(false),
    autoPostCmb: integer("auto_post_cmb", { mode: "boolean" })
      .notNull()
      .default(false),
    autoPostMaxAmountMinor: integer("auto_post_max_amount_minor")
      .notNull()
      .default(50_000),
    autoPostTrustedMaxAmountMinor: integer(
      "auto_post_trusted_max_amount_minor",
    )
      .notNull()
      .default(500_000),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check(
      "notification_capture_settings_max_amount_range",
      sql`${table.autoPostMaxAmountMinor} >= 0 and ${table.autoPostMaxAmountMinor} <= 100000000`,
    ),
    check(
      "notification_capture_settings_trusted_max_amount_range",
      sql`${table.autoPostTrustedMaxAmountMinor} >= 0 and ${table.autoPostTrustedMaxAmountMinor} <= 100000000`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type AiCategorizationSetting =
  typeof aiCategorizationSettings.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type PostingConfirmation = typeof postingConfirmations.$inferSelect;
export type PostingConfirmationItem =
  typeof postingConfirmationItems.$inferSelect;
export type TransactionRevision = typeof transactionRevisions.$inferSelect;
export type StoredFile = typeof storedFiles.$inferSelect;
export type ImportBatch = typeof importBatches.$inferSelect;
export type ImportItem = typeof importItems.$inferSelect;
export type RecognitionJob = typeof recognitionJobs.$inferSelect;
export type RecognitionItem = typeof recognitionItems.$inferSelect;
export type NotificationCapture = typeof notificationCaptures.$inferSelect;
export type NotificationCaptureSetting =
  typeof notificationCaptureSettings.$inferSelect;
export type TransactionSupplementalEvidence =
  typeof transactionSupplementalEvidence.$inferSelect;

import { randomUUID } from "node:crypto";

import { and, count, desc, eq } from "drizzle-orm";

import { db, type Database } from "@/db/client";
import {
  notificationCaptures,
  notificationCaptureStatuses,
} from "@/db/schema";
import { isPaymentPageParser } from "@/lib/capture-source";
import { defaultLocale, type Locale } from "@/lib/i18n/locale";
import {
  createAiCategorizationSettingsService,
  type AiCategorizationRuntime,
  type AiCategorizationRuntimeResolver,
} from "@/services/ai-categorization-service";
import { createCategorizationService } from "@/services/categorization-service";
import { createDeduplicationService } from "@/services/deduplication-service";
import {
  ledgerFactsSchema,
  type LedgerFacts,
} from "@/services/ledger-transaction/schema";
import { assertLedgerCategory } from "@/services/ledger-transaction/validation";
import { createNotificationCaptureAutomation } from "@/services/notification-capture-service/automation";
import { createNotificationCaptureConfirmation } from "@/services/notification-capture-service/confirmation";
import { createNotificationCaptureEnrichment } from "@/services/notification-capture-service/enrichment";
import { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";
import {
  captureDescription,
  knownParserIdentities,
  labelForPlatform,
  packageForPlatform,
  type CapturePlatform,
} from "@/services/notification-capture-service/platforms";
import {
  duplicateColumns,
  getCaptureRow,
  notFound,
  parseFacts,
  project,
  type FieldOrigins,
  type StagedCapture,
} from "@/services/notification-capture-service/projection";
import {
  notificationCaptureBatchSchema,
  notificationCaptureEditSchema,
  notificationCaptureEventSchema,
  notificationCaptureListQuerySchema,
  type NotificationCaptureEvent,
} from "@/services/notification-capture-service/schema";
import { createNotificationCaptureSettings } from "@/services/notification-capture-service/settings";

type IngestStage =
  | {
      outcome: "staged";
      staged: StagedCapture;
    }
  | {
      outcome: "terminal";
      result:
        | {
            idempotencyKey: string | null;
            status: "rejected";
            code: string;
          }
        | {
            idempotencyKey: string;
            status: "already_accepted";
            captureId: string;
            reviewStatus: (typeof notificationCaptureStatuses)[number];
          };
    };

export function createNotificationCaptureService(
  database: Database = db,
  aiRuntimeSource?: AiCategorizationRuntime | AiCategorizationRuntimeResolver,
) {
  const categorization = createCategorizationService(database);
  const deduplication = createDeduplicationService(database);
  const runtimeSource =
    aiRuntimeSource ??
    createAiCategorizationSettingsService(database).resolveRuntime;
  const aiRuntimeFor = (userId: string) =>
    typeof runtimeSource === "function"
      ? runtimeSource(userId)
      : runtimeSource;

  function deduplicate(
    userId: string,
    platform: CapturePlatform,
    facts: LedgerFacts,
    source: Database = database,
  ) {
    const checker =
      source === database ? deduplication : createDeduplicationService(source);
    return checker.check(userId, {
      type: facts.type,
      amountMinor: facts.amountMinor,
      currency: facts.currency,
      merchantName: facts.merchantName,
      description: facts.description,
      transactionTime: facts.transactionTime,
      source: platform,
      platformTransactionId: null,
    });
  }

  const settings = createNotificationCaptureSettings(database);
  const confirmation = createNotificationCaptureConfirmation(
    database,
    deduplicate,
  );
  const enrichment = createNotificationCaptureEnrichment(
    database,
    categorization,
    aiRuntimeFor,
    deduplicate,
  );
  const automation = createNotificationCaptureAutomation(
    database,
    confirmation.confirmParsedOn,
  );

  function getRow(userId: string, captureId: string) {
    return getCaptureRow(database, userId, captureId);
  }

  function get(userId: string, captureId: string) {
    const row = getRow(userId, captureId);
    if (!row) notFound();
    return project(row);
  }

  function suggestedFacts(
    userId: string,
    event: NotificationCaptureEvent,
    locale: Locale,
  ) {
    const description = captureDescription(event, locale);
    const category = categorization.suggest({
      userId,
      type: "expense",
      merchantName: event.facts.merchantName,
      description,
    });
    const facts = ledgerFactsSchema.parse({
      type: "expense",
      amountMinor: event.facts.amountMinor,
      currency: "CNY",
      merchantName: event.facts.merchantName,
      description,
      categoryId: category.categoryId,
      transactionTime: event.postedAt,
      paymentMethod: labelForPlatform[locale][event.platform],
    });
    return { facts, categoryRuleSource: category.ruleSource };
  }

  function ingestOne(
    userId: string,
    rawEvent: unknown,
    locale: Locale,
  ): IngestStage {
    const parsed = notificationCaptureEventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey:
            typeof (rawEvent as { idempotencyKey?: unknown })?.idempotencyKey ===
            "string"
              ? (rawEvent as { idempotencyKey: string }).idempotencyKey
              : null,
          status: "rejected" as const,
          code: "INVALID_EVENT",
        },
      };
    }
    const event = parsed.data;
    if (packageForPlatform[event.platform] !== event.sourcePackage) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey: event.idempotencyKey,
          status: "rejected" as const,
          code: "SOURCE_PACKAGE_MISMATCH",
        },
      };
    }
    if (
      !knownParserIdentities[event.platform].has(
        `${event.parserId}:${event.parserVersion}`,
      )
    ) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey: event.idempotencyKey,
          status: "rejected" as const,
          code: "UNSUPPORTED_PARSER",
        },
      };
    }

    const existing = database
      .select()
      .from(notificationCaptures)
      .where(
        and(
          eq(notificationCaptures.userId, userId),
          eq(notificationCaptures.idempotencyKey, event.idempotencyKey),
        ),
      )
      .get();
    if (existing) {
      return {
        outcome: "terminal",
        result: {
          idempotencyKey: event.idempotencyKey,
          status: "already_accepted" as const,
          captureId: existing.id,
          reviewStatus: existing.status,
        },
      };
    }

    const { facts, categoryRuleSource } = suggestedFacts(userId, event, locale);
    const duplicate = deduplicate(userId, event.platform, facts);
    const now = new Date().toISOString();
    const id = randomUUID();
    database
      .insert(notificationCaptures)
      .values({
        id,
        userId,
        idempotencyKey: event.idempotencyKey,
        platform: event.platform,
        sourcePackage: event.sourcePackage,
        notificationPostedAt: event.postedAt,
        parserId: event.parserId,
        parserVersion: event.parserVersion,
        evidenceDigest: event.evidenceDigest,
        confidenceBasisPoints: event.confidenceBasisPoints,
        normalizedData: facts,
        fieldOrigins: {
          merchantName: "parser",
          description: "system_default",
          paymentMethod: "system_default",
          categoryId: "categorization_rule",
        },
        validationErrors: [],
        ...duplicateColumns(duplicate),
        decision: "pending",
        status: "reviewing",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return {
      outcome: "staged",
      staged: {
        idempotencyKey: event.idempotencyKey,
        captureId: id,
        platform: event.platform,
        facts,
        categoryRuleSource,
        duplicateStatus: duplicate.status,
        orderContext: isPaymentPageParser(event.parserId)
          ? (event.orderContext?.pages ?? null)
          : null,
        orderDetailsAttempted: false,
      },
    };
  }

  /**
   * `locale` is the language of the uploading device (its Accept-Language):
   * generated descriptions, payment methods and AI reasons are written in it.
   */
  async function ingest(
    userId: string,
    rawInput: unknown,
    locale: Locale = defaultLocale,
  ) {
    const batch = notificationCaptureBatchSchema.parse(rawInput);
    const staged = batch.events.map((event) => ingestOne(userId, event, locale));
    const accepted = staged.flatMap((entry) =>
      entry.outcome === "staged" ? [entry.staged] : [],
    );
    // The candidates are already stored. Categorization and automatic posting are best effort:
    // a failure here must leave them reviewable and still acknowledge the upload, because a
    // retried upload is answered "already accepted" and would never be automated again.
    try {
      await enrichment.enrichWithOrderDetails(userId, accepted, locale);
    } catch (error) {
      console.error(
        "Notification capture order details failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
    try {
      await enrichment.enrichWithAiCategories(userId, accepted, locale);
    } catch (error) {
      console.error(
        "Notification capture AI categorization failed",
        error instanceof Error ? error.name : "unknown",
      );
    }
    if (accepted.length) {
      const captureSettings = settings.getSettings(userId);
      for (const item of accepted) {
        try {
          automation.finalizeAutomation(userId, item, captureSettings);
        } catch (error) {
          console.error(
            "Notification capture automation failed",
            error instanceof Error ? error.name : "unknown",
          );
        }
      }
    }
    return {
      items: staged.map((entry) => {
        if (entry.outcome !== "staged") return entry.result;
        const row = getRow(userId, entry.staged.captureId)!;
        return {
          idempotencyKey: entry.staged.idempotencyKey,
          status: "accepted" as const,
          captureId: entry.staged.captureId,
          reviewStatus: row.status,
          // Lets the device say whether a completed capture was posted or linked to an existing transaction.
          resultCode: row.resultCode ?? null,
        };
      }),
    };
  }

  function list(userId: string, rawQuery: unknown) {
    const query = notificationCaptureListQuerySchema.parse(rawQuery);
    const statusCondition =
      query.status === "all"
        ? undefined
        : eq(notificationCaptures.status, query.status);
    const where = and(eq(notificationCaptures.userId, userId), statusCondition);
    const rows = database
      .select()
      .from(notificationCaptures)
      .where(where)
      .orderBy(desc(notificationCaptures.createdAt), desc(notificationCaptures.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .all();
    const total = Number(
      database
        .select({ value: count() })
        .from(notificationCaptures)
        .where(where)
        .get()?.value ?? 0,
    );
    const pendingCount = Number(
      database
        .select({ value: count() })
        .from(notificationCaptures)
        .where(
          and(
            eq(notificationCaptures.userId, userId),
            eq(notificationCaptures.status, "reviewing"),
          ),
        )
        .get()?.value ?? 0,
    );
    return {
      items: rows.map((row) => {
        if (row.status === "completed") return project(row);
        const duplicate = deduplicate(
          userId,
          row.platform,
          parseFacts(row.normalizedData),
        );
        return { ...project(row), ...duplicateColumns(duplicate) };
      }),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      },
      pendingCount,
    };
  }

  function edit(userId: string, captureId: string, rawInput: unknown) {
    const input = notificationCaptureEditSchema.parse(rawInput);
    const current = getRow(userId, captureId);
    if (!current) notFound();
    if (current.status !== "reviewing") {
      throw new NotificationCaptureServiceError(
        "NOTIFICATION_CAPTURE_NOT_EDITABLE",
        "Completed notification candidates cannot be edited",
        409,
      );
    }
    assertLedgerCategory(database, userId, input.categoryId, "expense");
    const category =
      input.categoryId === null
        ? categorization.suggest({
            userId,
            type: "expense",
            merchantName: input.merchantName,
            description: input.description,
          }).categoryId
        : input.categoryId;
    const facts = ledgerFactsSchema.parse({
      type: "expense",
      amountMinor: input.amountMinor,
      currency: "CNY",
      merchantName: input.merchantName,
      description: input.description,
      categoryId: category,
      transactionTime: input.transactionTime,
      paymentMethod: input.paymentMethod,
    });
    const fieldOrigins: FieldOrigins = {
      merchantName: "manual_edit",
      description: "manual_edit",
      paymentMethod: "manual_edit",
      categoryId:
        input.categoryId === null ? "categorization_rule" : "manual_edit",
    };
    const duplicate = deduplicate(userId, current.platform, facts);
    database
      .update(notificationCaptures)
      .set({
        normalizedData: facts,
        fieldOrigins,
        validationErrors: [],
        ...duplicateColumns(duplicate),
        decision: "pending",
        confirmationVersion: current.confirmationVersion + 1,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(notificationCaptures.id, captureId),
          eq(notificationCaptures.userId, userId),
        ),
      )
      .run();
    return get(userId, captureId);
  }

  return {
    ingest,
    list,
    get,
    getSettings: settings.getSettings,
    updateSettings: settings.updateSettings,
    edit,
    confirm: confirmation.confirm,
    quickConfirm: confirmation.quickConfirm,
    confirmMany: confirmation.confirmMany,
    confirmBillEnrichment: confirmation.confirmBillEnrichment,
  };
}

export const notificationCaptureService = createNotificationCaptureService();
export type { NotificationCaptureSettings } from "@/services/notification-capture-service/settings";
export { NotificationCaptureServiceError } from "@/services/notification-capture-service/error";
export {
  notificationCaptureBatchSchema,
  notificationCaptureBulkConfirmSchema,
  notificationCaptureConfirmSchema,
  notificationCaptureEditSchema,
  notificationCaptureListQuerySchema,
  notificationCaptureQuickConfirmSchema,
  notificationCaptureSettingsInputSchema,
} from "@/services/notification-capture-service/schema";

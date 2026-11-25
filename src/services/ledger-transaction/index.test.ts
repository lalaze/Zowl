import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabase } from "@/db/client";
import {
  categories,
  importBatches,
  importItems,
  merchantCategoryRules,
  postingConfirmationItems,
  postingConfirmations,
  recognitionItems,
  recognitionJobs,
  storedFiles,
  transactionRevisions,
  users,
} from "@/db/schema";
import {
  createLedgerTransactionService,
  type PostingConfirmationCommand,
} from "@/services/ledger-transaction";
import { createDeduplicationService } from "@/services/deduplication-service";
import { duplicateAssessmentDigest } from "@/services/ledger-transaction/review-decision";
import { createTransactionService } from "@/services/transaction-service";

describe("Ledger Transaction", () => {
  let database: ReturnType<typeof createDatabase>;

  const manualConfirmation = (
    confirmationId = "manual-confirmation-1",
    sourceItemRef = "manual-item-1",
  ): PostingConfirmationCommand => ({
    identity: { id: confirmationId, version: 1 },
    items: [
      {
        sourceItemRef,
        decision: "post" as const,
        candidate: {
          facts: {
            type: "expense" as const,
            amountMinor: 3580,
            currency: "CNY",
            merchantName: "Mountain Cafe",
            description: "Latte",
            categoryId: "food-a",
            transactionTime: "2026-07-16T04:30:00.000Z",
            paymentMethod: "Alipay balance",
          },
          provenance: { kind: "manual" as const },
        },
      },
    ],
  });

  beforeEach(() => {
    database = createDatabase(":memory:");
    migrate(database.db, {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    const now = "2026-07-16T00:00:00.000Z";
    database.db
      .insert(users)
      .values({
        id: "user-a",
        email: "a@example.com",
        passwordHash: "test",
        displayName: "A",
        timezone: "Asia/Shanghai",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(categories)
      .values({
        id: "food-a",
        userId: "user-a",
        name: "Food",
        kind: "expense",
        isSystem: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });

  afterEach(() => database.sqlite.close());

  it("confirms one manual candidate as a Posted Transaction", () => {
    const ledger = createLedgerTransactionService(database.db);
    const result = ledger.confirmPosting("user-a", manualConfirmation());
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("expected completed confirmation");

    expect(result).toMatchObject({
      status: "completed",
      confirmationId: "manual-confirmation-1",
      items: [
        {
          sourceItemRef: "manual-item-1",
          outcome: "posted",
        },
      ],
    });
    expect(result.items[0]?.revisionId).toBeTruthy();

    const transactionId = result.items[0]?.transactionId;
    expect(transactionId).toBeTruthy();
    expect(
      createTransactionService(database.db).get("user-a", transactionId!),
    ).toMatchObject({
      id: transactionId,
      type: "expense",
      amountMinor: 3580,
      currency: "CNY",
      merchantName: "Mountain Cafe",
      categoryId: "food-a",
      source: "manual",
    });
  });

  it("returns the original result when the same Confirmation Identity is retried", () => {
    const ledger = createLedgerTransactionService(database.db);

    const first = ledger.confirmPosting("user-a", manualConfirmation());
    const retried = ledger.confirmPosting("user-a", manualConfirmation());

    expect(retried).toEqual(first);
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(
      1,
    );
  });

  it("links an exact Duplicate instead of creating a second Posted Transaction", () => {
    const ledger = createLedgerTransactionService(database.db);
    const first = ledger.confirmPosting("user-a", manualConfirmation());
    expect(first.status).toBe("completed");
    if (first.status !== "completed") throw new Error("expected completed confirmation");

    const duplicate = ledger.confirmPosting(
      "user-a",
      manualConfirmation("manual-confirmation-2", "manual-item-2"),
    );

    expect(duplicate).toMatchObject({
      status: "completed",
      items: [
        {
          sourceItemRef: "manual-item-2",
          outcome: "duplicate",
          transactionId: first.items[0]?.transactionId,
          revisionId: null,
        },
      ],
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(
      1,
    );
  });

  it("returns needs_review and rolls back the confirmation for a new Possible Duplicate", () => {
    const ledger = createLedgerTransactionService(database.db);
    const first = ledger.confirmPosting("user-a", manualConfirmation());
    expect(first.status).toBe("completed");
    if (first.status !== "completed") throw new Error("expected completed confirmation");
    const possibleDuplicate = manualConfirmation(
      "manual-confirmation-2",
      "manual-item-2",
    );
    possibleDuplicate.items[0]!.candidate.facts.transactionTime =
      "2026-07-16T04:33:00.000Z";

    const result = ledger.confirmPosting("user-a", possibleDuplicate);

    expect(result).toMatchObject({
      status: "needs_review",
      confirmationId: "manual-confirmation-2",
      items: [
        {
          sourceItemRef: "manual-item-2",
          assessment: {
            status: "possible_duplicate",
            matchedTransactionId: first.items[0]?.transactionId,
            algorithmVersion: 3,
          },
        },
      ],
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(
      1,
    );
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      1,
    );
    expect(database.db.select().from(postingConfirmations).all()).toHaveLength(
      1,
    );
  });

  it("posts a Possible Duplicate only with an override for the current assessment", () => {
    const ledger = createLedgerTransactionService(database.db);
    ledger.confirmPosting("user-a", manualConfirmation());
    const command = manualConfirmation(
      "manual-confirmation-2",
      "manual-item-2",
    );
    command.items[0]!.candidate.facts.transactionTime =
      "2026-07-16T04:33:00.000Z";
    const review = ledger.confirmPosting("user-a", command);
    expect(review.status).toBe("needs_review");
    if (review.status !== "needs_review") throw new Error("expected review");
    const assessment = review.items[0]?.assessment;
    if (!assessment) throw new Error("expected duplicate assessment");

    command.identity.version = 2;
    command.items[0]!.duplicateOverride = {
      assessmentDigest: duplicateAssessmentDigest(assessment),
    };
    const confirmed = ledger.confirmPosting("user-a", command);

    expect(confirmed).toMatchObject({
      status: "completed",
      confirmationId: "manual-confirmation-2",
      items: [{ sourceItemRef: "manual-item-2", outcome: "posted" }],
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(
      2,
    );
  });

  it("completes a skipped confirmation without creating a Transaction revision", () => {
    const ledger = createLedgerTransactionService(database.db);
    const command = manualConfirmation();
    command.items[0]!.decision = "skip";

    const result = ledger.confirmPosting("user-a", command);

    expect(result).toMatchObject({
      status: "completed",
      items: [
        {
          sourceItemRef: "manual-item-1",
          outcome: "skipped",
          transactionId: null,
          revisionId: null,
        },
      ],
    });
    expect(createTransactionService(database.db).list("user-a")).toEqual([]);
    expect(database.db.select().from(transactionRevisions).all()).toEqual([]);
    expect(database.db.select().from(postingConfirmations).all()).toHaveLength(
      1,
    );
    expect(ledger.confirmPosting("user-a", command)).toEqual(result);
  });

  it("rolls back the whole confirmation when any candidate fails final validation", () => {
    const ledger = createLedgerTransactionService(database.db);
    const command = manualConfirmation();
    const invalid = manualConfirmation(
      "unused-confirmation",
      "manual-item-2",
    ).items[0]!;
    invalid.candidate.facts.amountMinor = 9900;
    invalid.candidate.facts.categoryId = "missing-category";
    command.items.push(invalid);

    const result = ledger.confirmPosting("user-a", command);

    expect(result).toMatchObject({
      status: "needs_review",
      confirmationId: "manual-confirmation-1",
      items: [
        {
          sourceItemRef: "manual-item-2",
          validationIssues: [
            {
              code: "invalid_category",
            },
          ],
        },
      ],
    });
    expect(createTransactionService(database.db).list("user-a")).toEqual([]);
    expect(database.db.select().from(transactionRevisions).all()).toEqual([]);
    expect(database.db.select().from(postingConfirmations).all()).toEqual([]);
  });

  it("records a later exact cohort match against the first posted candidate", () => {
    const ledger = createLedgerTransactionService(database.db);
    const command = manualConfirmation();
    command.items.push({
      ...command.items[0]!,
      sourceItemRef: "manual-item-2",
    });

    const result = ledger.confirmPosting("user-a", command);
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw new Error("expected completed");

    expect(result.items.map((item) => item.outcome)).toEqual([
      "posted",
      "duplicate",
    ]);
    expect(result.items[1]?.transactionId).toBe(
      result.items[0]?.transactionId,
    );
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(
      1,
    );
    const auditItems = database.db
      .select()
      .from(postingConfirmationItems)
      .all();
    expect(auditItems[1]).toMatchObject({
      sourceItemRef: "manual-item-2",
      outcome: "duplicate",
      matchedCandidateRef: "manual-item-1",
    });
  });

  it("returns a stable candidate reference for a possible cohort match", () => {
    const ledger = createLedgerTransactionService(database.db);
    const command = manualConfirmation();
    const possibleDuplicate = manualConfirmation(
      "unused-confirmation",
      "manual-item-2",
    ).items[0]!;
    possibleDuplicate.candidate.facts.description = "Bagel";
    possibleDuplicate.candidate.facts.transactionTime =
      "2026-07-16T04:33:00.000Z";
    command.items.push(possibleDuplicate);

    const review = ledger.confirmPosting("user-a", command);
    expect(review.status).toBe("needs_review");
    if (review.status !== "needs_review") throw new Error("expected review");
    expect(review.items[0]).toMatchObject({
      sourceItemRef: "manual-item-2",
      assessment: {
        status: "possible_duplicate",
        matchedTransactionId: null,
        matchedCandidateRef: "manual-item-1",
      },
    });
    expect(database.db.select().from(postingConfirmations).all()).toEqual([]);

    const retried = ledger.confirmPosting("user-a", command);
    expect(retried.status).toBe("needs_review");
    if (retried.status !== "needs_review") throw new Error("expected review");
    expect(retried.items[0]?.assessmentDigest).toBe(
      review.items[0]?.assessmentDigest,
    );

    command.identity.version = 2;
    possibleDuplicate.duplicateOverride = {
      assessmentDigest: review.items[0]!.assessmentDigest!,
    };
    const confirmed = ledger.confirmPosting("user-a", command);
    expect(confirmed.status).toBe("completed");
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(
      2,
    );
  });

  it("rejects a file candidate that no longer matches its persisted Review item", () => {
    const now = "2026-07-16T00:00:00.000Z";
    database.db
      .insert(storedFiles)
      .values({
        id: "file-a",
        userId: "user-a",
        kind: "bill",
        originalName: "bill.csv",
        storageKey: "user-a/bill.csv",
        mimeType: "text/csv",
        extension: "csv",
        size: 100,
        sha256: "file-hash",
        createdAt: now,
      })
      .run();
    database.db
      .insert(importBatches)
      .values({
        id: "batch-a",
        userId: "user-a",
        fileId: "file-a",
        source: "alipay",
        status: "reviewing",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(importItems)
      .values({
        id: "import-item-a",
        userId: "user-a",
        batchId: "batch-a",
        rowNumber: 1,
        rawData: { amount: "35.80" },
        normalizedData: {
          type: "expense",
          amountMinor: 3580,
          currency: "CNY",
          merchantName: "Mountain Cafe",
          description: "Latte",
          categoryId: "food-a",
          transactionTime: "2026-07-16T04:30:00.000Z",
          source: "alipay",
          paymentMethod: "Alipay balance",
          platformTransactionId: "ALI-1",
          status: "Transaction successful",
        },
        validationErrors: [],
        warnings: [],
        decision: "import",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const ledger = createLedgerTransactionService(database.db);
    expect(() =>
      ledger.confirmPosting("user-a", {
        identity: { id: "file-confirmation-a", version: 1 },
        items: [
          {
            sourceItemRef: "import-item-a",
            decision: "post",
            candidate: {
              facts: {
                type: "expense",
                amountMinor: 9999,
                currency: "CNY",
                merchantName: "Mountain Cafe",
                description: "Latte",
                categoryId: "food-a",
                transactionTime: "2026-07-16T04:30:00.000Z",
                paymentMethod: "Alipay balance",
              },
              provenance: {
                kind: "file_import",
                importItemId: "import-item-a",
                batchId: "batch-a",
                fileId: "file-a",
                platform: "alipay",
                platformTransactionId: "ALI-1",
                platformStatus: "Transaction successful",
              },
            },
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_SOURCE_REFERENCE" }),
    );
    expect(createTransactionService(database.db).list("user-a")).toEqual([]);
    expect(database.db.select().from(postingConfirmations).all()).toEqual([]);
  });

  it("rejects a screenshot candidate that no longer matches its Recognition item", () => {
    const now = "2026-07-16T00:00:00.000Z";
    database.db
      .insert(storedFiles)
      .values({
        id: "screenshot-a",
        userId: "user-a",
        kind: "screenshot",
        originalName: "receipt.png",
        storageKey: "user-a/receipt.png",
        mimeType: "image/png",
        extension: "png",
        size: 100,
        sha256: "image-hash",
        createdAt: now,
      })
      .run();
    database.db
      .insert(recognitionJobs)
      .values({
        id: "job-a",
        userId: "user-a",
        status: "reviewing",
        providerId: "openai",
        totalCount: 1,
        succeededCount: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    database.db
      .insert(recognitionItems)
      .values({
        id: "recognition-item-a",
        userId: "user-a",
        jobId: "job-a",
        fileId: "screenshot-a",
        position: 1,
        status: "recognized",
        normalizedData: {
          type: "expense",
          amountMinor: 3580,
          currency: "CNY",
          merchantName: "Mountain Cafe",
          description: "Latte",
          categoryId: "food-a",
          transactionTime: "2026-07-16T04:30:00.000Z",
          source: "screenshot",
          paymentMethod: "Alipay balance",
          platformTransactionId: "SHOT-1",
          transactionStatus: "Transaction successful",
          confidence: 0.92,
        },
        validationErrors: [],
        warnings: [],
        decision: "import",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const ledger = createLedgerTransactionService(database.db);
    expect(() =>
      ledger.confirmPosting("user-a", {
        identity: { id: "screenshot-confirmation-a", version: 1 },
        items: [
          {
            sourceItemRef: "recognition-item-a",
            decision: "post",
            candidate: {
              facts: {
                type: "expense",
                amountMinor: 9999,
                currency: "CNY",
                merchantName: "Mountain Cafe",
                description: "Latte",
                categoryId: "food-a",
                transactionTime: "2026-07-16T04:30:00.000Z",
                paymentMethod: "Alipay balance",
              },
              provenance: {
                kind: "screenshot_recognition",
                recognitionItemId: "recognition-item-a",
                jobId: "job-a",
                fileId: "screenshot-a",
                providerId: "openai",
                platformTransactionId: "SHOT-1",
                platformStatus: "Transaction successful",
                confidenceBasisPoints: 9200,
              },
            },
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "INVALID_SOURCE_REFERENCE" }),
    );
    expect(createTransactionService(database.db).list("user-a")).toEqual([]);
  });

  it("appends an Amendment revision while preserving the original provenance", () => {
    const ledger = createLedgerTransactionService(database.db);
    const posted = ledger.confirmPosting("user-a", manualConfirmation());
    expect(posted.status).toBe("completed");
    if (posted.status !== "completed") throw new Error("expected completed");
    const transactionId = posted.items[0]!.transactionId!;
    const initialRevisionId = posted.items[0]!.revisionId!;

    const amended = ledger.amendTransaction("user-a", {
      transactionId,
      expectedRevisionId: initialRevisionId,
      operationId: "amend-operation-1",
      facts: {
        type: "expense",
        amountMinor: 4200,
        currency: "CNY",
        merchantName: "Mountain Cafe",
        description: "Latte and dessert",
        categoryId: "food-a",
        transactionTime: "2026-07-16T04:30:00.000Z",
        paymentMethod: "Alipay balance",
      },
      learnCategoryRule: false,
    });

    expect(amended).toMatchObject({
      status: "completed",
      transactionId,
      revisionNumber: 2,
    });
    expect(
      createTransactionService(database.db).get("user-a", transactionId),
    ).toMatchObject({
      amountMinor: 4200,
      description: "Latte and dessert",
      source: "manual",
    });
    const revisions = database.db
      .select()
      .from(transactionRevisions)
      .all();
    expect(revisions).toHaveLength(2);
    expect(revisions[1]).toMatchObject({
      kind: "amendment",
      revisionNumber: 2,
      provenanceSnapshot: { kind: "manual" },
    });
  });

  it("learns an explicit merchant category rule in the same Amendment transaction", () => {
    const ledger = createLedgerTransactionService(database.db);
    const posted = ledger.confirmPosting("user-a", manualConfirmation());
    if (posted.status !== "completed") throw new Error("expected completed");
    const transactionId = posted.items[0]!.transactionId!;

    ledger.amendTransaction("user-a", {
      transactionId,
      expectedRevisionId: posted.items[0]!.revisionId!,
      operationId: "amend-learn-category-1",
      facts: {
        type: "expense",
        amountMinor: 3580,
        currency: "CNY",
        merchantName: " Mountain Cafe ",
        description: "Latte",
        categoryId: "food-a",
        transactionTime: "2026-07-16T04:30:00.000Z",
        paymentMethod: "Alipay balance",
      },
      learnCategoryRule: true,
    });

    expect(database.db.select().from(merchantCategoryRules).all()).toEqual([
      expect.objectContaining({
        userId: "user-a",
        categoryId: "food-a",
        normalizedMerchantName: "mountain cafe",
        matchType: "exact",
      }),
    ]);
  });

  it("requires a current duplicate override before amending into a Possible Duplicate", () => {
    const ledger = createLedgerTransactionService(database.db);
    const first = ledger.confirmPosting("user-a", manualConfirmation());
    if (first.status !== "completed") throw new Error("expected completed");
    const otherCommand = manualConfirmation(
      "manual-confirmation-other",
      "manual-item-other",
    );
    otherCommand.items[0]!.candidate.facts.amountMinor = 1200;
    otherCommand.items[0]!.candidate.facts.merchantName = "Green Mountain Books";
    otherCommand.items[0]!.candidate.facts.transactionTime =
      "2026-07-16T05:30:00.000Z";
    const other = ledger.confirmPosting("user-a", otherCommand);
    if (other.status !== "completed") throw new Error("expected completed");
    const otherTransactionId = other.items[0]!.transactionId!;
    const facts = {
      type: "expense" as const,
      amountMinor: 3580,
      currency: "CNY",
      merchantName: "Mountain Cafe",
      description: "Another coffee",
      categoryId: "food-a",
      transactionTime: "2026-07-16T04:33:00.000Z",
      paymentMethod: "Cash",
    };

    const review = ledger.amendTransaction("user-a", {
      transactionId: otherTransactionId,
      expectedRevisionId: other.items[0]!.revisionId!,
      operationId: "amend-possible-1",
      facts,
      learnCategoryRule: false,
    });

    expect(review).toMatchObject({
      status: "needs_review",
      transactionId: otherTransactionId,
      assessment: {
        status: "possible_duplicate",
        matchedTransactionId: first.items[0]!.transactionId,
      },
    });
    if (review.status !== "needs_review") throw new Error("expected review");
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      2,
    );

    const amended = ledger.amendTransaction("user-a", {
      transactionId: otherTransactionId,
      expectedRevisionId: other.items[0]!.revisionId!,
      operationId: "amend-possible-2",
      facts,
      duplicateOverride: { assessmentDigest: review.assessmentDigest },
      learnCategoryRule: false,
    });
    expect(amended).toMatchObject({
      status: "completed",
      transactionId: otherTransactionId,
      revisionNumber: 2,
    });
  });

  it("replays an Amendment operation and rejects a stale expected revision", () => {
    const ledger = createLedgerTransactionService(database.db);
    const posted = ledger.confirmPosting("user-a", manualConfirmation());
    if (posted.status !== "completed") throw new Error("expected completed");
    const transactionId = posted.items[0]!.transactionId!;
    const initialRevisionId = posted.items[0]!.revisionId!;
    const command = {
      transactionId,
      expectedRevisionId: initialRevisionId,
      operationId: "amend-idempotent-1",
      facts: {
        ...manualConfirmation().items[0]!.candidate.facts,
        amountMinor: 4100,
      },
      learnCategoryRule: false,
    };

    const amended = ledger.amendTransaction("user-a", command);
    expect(ledger.amendTransaction("user-a", command)).toEqual(amended);
    expect(
      ledger.amendTransaction("user-a", {
        ...command,
        operationId: "amend-stale-2",
        facts: { ...command.facts, amountMinor: 4300 },
      }),
    ).toEqual({
      status: "revision_conflict",
      transactionId,
      currentRevisionId:
        amended.status === "completed" ? amended.revisionId : null,
    });
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(
      2,
    );
  });

  it("appends a terminal Voiding revision and removes the Transaction from active reads", () => {
    const ledger = createLedgerTransactionService(database.db);
    const posted = ledger.confirmPosting("user-a", manualConfirmation());
    if (posted.status !== "completed") throw new Error("expected completed");
    const transactionId = posted.items[0]!.transactionId!;

    const command = {
      operationId: "void-operation-1",
      targets: [
        {
          transactionId,
          expectedRevisionId: posted.items[0]!.revisionId!,
        },
      ],
    };
    const voided = ledger.voidTransaction("user-a", command);

    expect(voided).toMatchObject({
      status: "completed",
      targets: [{ transactionId, revisionNumber: 2 }],
    });
    expect(
      createTransactionService(database.db).get("user-a", transactionId),
    ).toBeNull();
    expect(createTransactionService(database.db).list("user-a")).toEqual([]);
    expect(database.db.select().from(transactionRevisions).all()[1]).toMatchObject({
      transactionId,
      kind: "voiding",
      revisionNumber: 2,
    });
    expect(ledger.voidTransaction("user-a", command)).toEqual(voided);
    expect(database.db.select().from(transactionRevisions).all()).toHaveLength(2);
    expect(
      createDeduplicationService(database.db).check("user-a", {
        type: "expense",
        amountMinor: 3580,
        currency: "CNY",
        merchantName: "Mountain Cafe",
        description: "Latte",
        transactionTime: "2026-07-16T04:30:00.000Z",
        source: "manual",
        platformTransactionId: null,
      }).status,
    ).toBe("unique");
  });

  it("voids a batch atomically when every expected revision still matches", () => {
    const ledger = createLedgerTransactionService(database.db);
    const first = ledger.confirmPosting(
      "user-a",
      manualConfirmation("void-batch-first", "void-batch-item-first"),
    );
    const secondCommand = manualConfirmation(
      "void-batch-second",
      "void-batch-item-second",
    );
    secondCommand.items[0]!.candidate.facts = {
      ...secondCommand.items[0]!.candidate.facts,
      amountMinor: 7200,
      merchantName: "Distant Mountain Books",
      description: "Printed book",
    };
    const second = ledger.confirmPosting("user-a", secondCommand);
    if (first.status !== "completed" || second.status !== "completed") {
      throw new Error("expected completed");
    }
    const firstTarget = {
      transactionId: first.items[0]!.transactionId!,
      expectedRevisionId: first.items[0]!.revisionId!,
    };
    const secondTarget = {
      transactionId: second.items[0]!.transactionId!,
      expectedRevisionId: second.items[0]!.revisionId!,
    };
    const amended = ledger.amendTransaction("user-a", {
      transactionId: secondTarget.transactionId,
      expectedRevisionId: secondTarget.expectedRevisionId,
      operationId: "void-batch-amend-second",
      facts: {
        ...secondCommand.items[0]!.candidate.facts,
        description: "Amended printed book",
      },
      learnCategoryRule: false,
    });
    if (amended.status !== "completed") throw new Error("expected amendment");

    const outcome = ledger.voidTransaction("user-a", {
      operationId: "void-batch-stale",
      targets: [firstTarget, secondTarget],
    });

    expect(outcome).toEqual({
      status: "revision_conflict",
      transactionId: secondTarget.transactionId,
      currentRevisionId: amended.revisionId,
    });
    expect(createTransactionService(database.db).list("user-a")).toHaveLength(2);
    expect(
      database.db
        .select()
        .from(transactionRevisions)
        .all()
        .filter((revision) => revision.kind === "voiding"),
    ).toEqual([]);
  });
});

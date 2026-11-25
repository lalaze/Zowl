# zeMoney Product and Architecture

> Status: Milestone 1 baseline
>
> Date: 2026-07-15
>
> Implementation must prioritize data correctness, maintainability, and user confirmation. Explain deviations in the relevant commit.

## 1. Product requirements

zeMoney is a mobile-first personal finance app. It converts payment screenshots, Alipay and WeChat Pay statements, and manual entries into unified transactions. Users confirm recognition results before import, then search, amend, categorize, and analyze posted data.

### 1.1 Users and core value

- For people who want long-term visibility into finances without entering every transaction manually.
- Daily: upload one or more payment screenshots and confirm them quickly.
- Periodic: import weekly or monthly CSV/XLSX exports from Alipay or WeChat.
- Review: inspect monthly spending, category shares, and trends, or search historical purchases.
- Correction: fix recognized amounts, times, merchants, descriptions, or categories, and apply merchant rules to future suggestions.

### 1.2 MVP scope

1. Local account login with all queries and file access isolated by user.
2. Transaction lists, details, creation, editing, individual voiding, and bulk voiding.
3. Date, category, source/platform, and keyword filters.
4. Alipay, WeChat, and generic CSV/XLSX upload, parsing, cleaning, preview, editing, deduplication, and confirmed import.
5. Single/multiple screenshot upload, structured recognition, human confirmation, failure fallback, and original retention.
6. Android Alipay, WeChat, and CMB expense notification capture, offline staging, manual confirmation, and idempotent posting.
7. Built-in categorization rules and user-specific merchant rule learning.
8. Monthly income/spending, month-over-month changes, daily/monthly trends, category/platform shares, and recent transactions.
9. SQLite development storage, local files, and replaceable PostgreSQL/S3 boundaries.

### 1.3 Explicitly outside the MVP

- Direct bank connections, payment-platform OAuth synchronization, or automatic scraping.
- Shared household ledgers, budgets, asset account balances, and double-entry bookkeeping.
- Currency conversion; amounts retain their original currency, with statistics defaulting to CNY only.
- Automatically deleting possible duplicates.
- Requiring a real AI service for the core flow.
- Self-registration, password recovery, and social login; the sole administrator creates regular accounts.

## 2. Core user flows

### 2.1 Manual entry

1. Select Add transaction from Home or Transactions.
2. Enter type, amount, time, merchant/description, category, and payment method.
3. Validate on the client, then revalidate and convert major to minor currency units on the server.
4. Generate a fingerprint and check duplicates. Possible duplicates require an explicit choice to continue or edit.
5. Save and open transaction details; an authorized merchant-category amendment also updates the learning rule.

### 2.2 File import

1. Select CSV/XLSX. Validate extension, MIME, magic bytes, size, and safe filename.
2. Save in a user-isolated directory and create an import batch.
3. Read the workbook/text and detect encoding, delimiter, metadata rows, and headers.
4. Try `AlipayBillParser`, `WechatBillParser`, and `GenericCsvBillParser` in order.
5. Parsers produce staged items; the cleaner normalizes amount, time, merchant, type, status, and source.
6. Categorization suggests a category; deduplication marks `unique`, `possible_duplicate`, or `duplicate`.
7. Preview separates importable items, possible duplicates, exact duplicates, and errors. Users edit or skip.
8. Confirmation revalidates and deduplicates inside a database transaction, writing only valid, explicitly selected items.
9. Results show added, duplicate-skipped, user-skipped, and failed counts with per-row reasons.

### 2.3 Screenshot recognition

1. Add one screenshot to quick entry, or one or more JPG/PNG/WebP images to screenshot import.
2. File storage validates and saves originals; recognition calls the current provider for each image.
3. Providers return structured objects only. Failed Zod/JSON Schema validation creates items for manual completion.
4. Missing fields must be `null`. Low-confidence fields and warnings are highlighted for confirmation.
5. Categorization and deduplication add suggestions and duplicate status.
6. A quick-entry screenshot with complete fields, at least 90% confidence, no warnings, and no unresolved duplicate decision is confirmed under the submission authorization; exact duplicates are skipped.
7. Other results enter review for corrections and post/skip decisions. Posted transactions are created only after confirmation.
8. If the provider is unavailable, users can complete fields from the original and confirm manually.

### 2.4 Queries and amendments

1. Transactions default to descending transaction time with a monthly overview.
2. Combine date, category, source, and keyword filters, reflected in the URL.
3. Details show canonical fields, source, import batch, duplicate status, and original-file access.
4. Category edits can enable Remember this merchant's category, selected by default in this baseline design.
5. Voiding transactions and deleting original files are separate actions to avoid accidentally removing audit evidence.

### 2.5 Android payment notification capture (retired)

Retired on Android by ADR-0011: current builds read payment success pages only (see the payment page capture section below). The flow is kept here because existing candidates and transactions carry this provenance and the server still accepts these parser identities from older builds.

1. Grant notification access in Android settings and enable Alipay, WeChat, or CMB individually. Alipay defaults on.
2. The native listener accepts only three fixed package names. Chats, group summaries, failures, refunds, income, missing amounts, and multiple amounts are discarded in memory.
3. Alipay v2 additionally reads summaryText, infoText, and tickerText, extracting merchants per field with prioritized patterns. All fields must contain one distinct valid CNY amount; generic or conflicting merchant names remain null. WeChat and CMB rules are unchanged.
4. Strict parsers produce only structured CNY expense facts and a SHA-256 digest covering participating fields. Original notification text is never saved or uploaded.
5. Candidates enter an Android Keystore AES-GCM queue, limited to 100 items/7 days, and WorkManager uploads batches when online.
6. The server receives idempotently per user, accepts registered parser identities, and revalidates, categorizes, and deduplicates. Candidates with only a fallback local category request AI categorization once on receipt; high-confidence, unambiguous suggestions are adopted with `ai_suggestion` provenance. Users may authorize automatic posting per platform and set per-transaction and trusted-merchant limits. Unique candidates within the applicable limit post on receipt (`AUTO_POSTED`); exact duplicates link to existing transactions (`AUTO_SKIPPED_DUPLICATE`). A normalized merchant becomes trusted after five automatically posted transactions without amendments or voids and uses the trusted-merchant limit. Possible duplicates, over-limit candidates, and unauthorized platforms enter review.
7. Users edit, confirm through notification actions or the app, or skip. Overrides bind the current assessment digest; only Ledger writes final transactions. Automatically posted transactions can be amended or voided like manually confirmed transactions. Field origins distinguish parser, system default, categorization rule, AI suggestion, quick input, full edit, bill enrichment, and unknown legacy data.
8. Settings show only local aggregate counts by source/parser version/acceptance or rejection reason. No text, amounts, merchants, summaries, or evidence hashes are retained, uploaded, or exported.
9. Disconnection requests rebinding and a check after 30 seconds. Boot checks run only when capture is enabled. Revoked access or persistent disconnection triggers fixed health alerts without financial data, at most once per issue per 12 hours, cleared on recovery.

## 3. Information architecture

### 3.1 Primary navigation

- Home: monthly summary, trends, category shares, recent transactions, and quick imports.
- Transactions: list, filters, details, manual entry/editing, and bulk voiding.
- Import: screenshots, statement files, pending tasks, and historical batches.
- Statistics: daily/monthly trends, category/platform shares, and month selection.
- Profile: categories, recognition disclosure, original files, account, and settings; administrators also manage login accounts.

Mobile uses Home / Transactions / Import / Statistics / Profile bottom navigation, with an equivalent desktop sidebar. New-entry and import actions appear on Home and relevant primary pages rather than inside nested menus.

### 3.2 Pages and routes

| Page | Route | Responsibility |
| --- | --- | --- |
| Initial setup | `/setup` | Create the sole administrator using a one-time deployment secret |
| Login | `/login` | Account login, errors, and privacy information |
| Home dashboard | `/` | Monthly summary, charts, recent transactions, and quick actions |
| Transactions | `/transactions` | Search, combined filters, pagination, and bulk voiding |
| Transaction details | `/transactions/[id]` | Complete fields, source, original file, editing/voiding |
| Manual entry | `/transactions/new` | Create transactions and confirm duplicates |
| Edit transaction | `/transactions/[id]/edit` | Amend transactions and merchant category rules |
| Screenshot upload | `/imports/screenshots` | Multiple images, upload progress, and service disclosure |
| Screenshot review | `/imports/screenshots/[jobId]/review` | Per-image review, manual completion, and duplicate alerts |
| File import | `/imports/files` | File selection, limits, and source detection |
| Import preview | `/imports/files/[batchId]/review` | Grouped preview, editing, skipping, and confirmation |
| Import results | `/imports/files/[batchId]/result` | Success/failure/duplicate counts and item reasons |
| Categories | `/categories` | Default/custom categories and merchant rules |
| Statistics | `/statistics` | Month selection, trends, and distribution charts |
| Settings | `/settings` | Account, time zone, per-user AI provider, privacy, and file cleanup |
| Accounts | `/settings/admin` | Administrator creation, reset, disabling, and reactivation of regular accounts |

## 4. System architecture

### 4.1 Layers

```text
Next.js pages / Route Handlers
          │
          ▼
Input schemas + identity/authorization boundaries
          │
          ▼
Application services (transactions, imports, recognition, statistics)
          │
          ├── Parsers / Recognition Provider / Categorization / Deduplication (domain logic)
          ▼
Drizzle persistence
          │
          └── SQLite (the sole current implementation)

File storage adapter
          │
          └── LocalFileStorage (development) / S3FileStorage (production replacement)
```

- Pages never access the database directly; Server Components also query application services.
- Route handlers own HTTP semantics, identity, and I/O, not parsing or statistics rules.
- Application services receive an explicit `userId`; every persistent query must be scoped to it.
- Parsers and recognition providers never write to the database, simplifying tests and replacement.
- Batch confirmation uses database transactions to prevent unexplained partial imports.
- `Ledger Transaction` owns the final write transaction. Do not introduce a generic Repository or Unit of Work before a second real storage implementation exists; see [ADR-0005](adr/0005-no-hypothetical-ledger-repository.md).

### 4.2 Module responsibilities

| Module | Owns | Does not own |
| --- | --- | --- |
| `transaction-service` | Transaction reads and existing API compatibility adapters | Direct posted-transaction writes bypassing Ledger |
| `ledger-transaction` | Posting confirmation, amendment/voiding, audit, atomic writes | File parsing, OCR, lists, statistics |
| `import-service` | Parsing/review/confirmation orchestration and batch state | Final ledger writes, platform field details |
| `screenshot-recognition-service` | Provider calls, validation, recognition tasks | Final ledger writes, specific model SDK binding |
| `notification-capture-service` | Structured candidates, staging, categorization, deduplication, review | Notification bodies, posting outside Ledger |
| `deduplication-service` | Fingerprints, exact/possible duplicates and reasons | Automatic deletion |
| `categorization-service` | Merchant rules, built-in keywords, suggestion sources | Model training |
| `statistics-service` | User/currency/period aggregation and comparisons | Persisted derived statistics |
| `file-storage-service` | Safe naming, user isolation, save/read/delete | Parsing business content |

`ledger-transaction` is implemented as the sole posted-transaction write boundary. See [Ledger Transaction Architecture](reviews/2026-07-16-ledger-transaction-architecture.md) for migration and verification history.

### 4.3 Adapter interfaces

```ts
interface BillParser {
  canParse(file: ParsedFile): boolean
  parse(file: ParsedFile): Promise<ParsedTransaction[]>
}

interface ReceiptRecognitionProvider {
  recognize(image: ImageInput): Promise<RecognitionResult>
}

interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFileDescriptor>
  read(userId: string, fileId: string): Promise<ReadableStream>
  delete(userId: string, fileId: string): Promise<void>
}
```

`AlipayBillParser`, `WechatBillParser`, and `GenericCsvBillParser` implement `BillParser`. Detection runs from specific to generic; uncertain generic mappings must request user mapping instead of guessing.

`MockReceiptRecognitionProvider` keeps development and tests offline. Real providers use separate adapters selected by environment variables, mapping third-party responses to internal structures and disclosing whether images leave the app.

## 5. Unified data model and database

### 5.1 Amount and time conventions

- Store only `amountMinor INTEGER`, always nonnegative minor units; `type` determines direction.
- HTTP forms accept decimal strings such as `"35.80"`, converted to `3580` with decimal-string algorithms, never JavaScript floating-point multiplication.
- API output includes `amountMinor` and formatted values; services exchange only `amountMinor`.
- Store UTC ISO timestamps and retain the user time zone (default `Asia/Shanghai`). Filters and statistics use local calendar days/months.
- Server-generated `createdAt` and `updatedAt` cannot be overridden by imports.

### 5.2 Tables

#### `users`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID |
| `email` | text unique not null | Normalized to lowercase |
| `passwordHash` | text not null | scrypt hash |
| `displayName` | text not null | Display name |
| `role` | text not null | Sole administrator `admin` or regular account `member` |
| `disabledAt` | text nullable | Disabling timestamp; immediately invalidates all sessions |
| `timezone` | text not null | Default `Asia/Shanghai` |
| `createdAt`, `updatedAt` | text not null | UTC ISO |

#### `sessions`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | Random session ID |
| `userId` | text FK index | Owning user |
| `tokenHash` | text unique not null | SHA-256 of the raw cookie token; never plaintext |
| `expiresAt`, `createdAt` | text not null | Expiration and audit |

#### `ai_categorization_settings`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `userId` | text PK/FK | At most one personal override per account |
| `enabled`, `provider` | integer/text not null | Explicit enable/disable and OpenAI-compatible provider |
| `baseUrl`, `model` | text nullable | Personal provider URL/model; environment URL is never returned by the API |
| `encryptedApiKey` | text nullable | Versioned AES-256-GCM ciphertext envelope; no plaintext |
| Response mode, threshold, batch size, timeout, HTTP flag | not null + check | Provider behavior parameters |
| `createdAt`, `updatedAt` | text not null | UTC ISO |

#### `categories`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID |
| `userId` | text FK index | Each user has an editable category copy |
| `name` | text not null | Unique per user |
| `kind` | text not null | `expense` / `income` / `both` |
| `icon`, `color` | text | UI metadata |
| `isSystem`, `sortOrder` | integer not null | Initial categories and ordering |
| `createdAt`, `updatedAt` | text not null | UTC ISO |

#### `merchant_category_rules`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID |
| `userId`, `categoryId` | text FK index | User rule and target category |
| `normalizedMerchantName` | text not null | Merchant name stripped of whitespace, punctuation, and common suffixes |
| `matchType` | text not null | MVP uses `exact`; reserves `contains` |
| `createdAt`, `updatedAt` | text not null | UTC ISO |

`(normalizedMerchantName, matchType)` is unique per user. A later explicit rule correction replaces the earlier one.

#### `transactions`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID |
| `userId` | text FK index not null | Owning user |
| `type` | text not null | `expense` / `income` / `transfer` / `refund` |
| `amountMinor` | integer check >= 0 | Minor currency units |
| `currency` | text not null | ISO 4217, default CNY |
| `merchantName`, `description` | text nullable | Cleaned values |
| `categoryId` | text FK nullable | User category |
| `transactionTime` | text index not null | UTC ISO |
| `createdAt`, `updatedAt` | text not null | UTC ISO |
| `source` | text not null | `manual` / `screenshot` / `alipay` / `wechat` / `other` |
| `paymentMethod` | text nullable | Balance, bank card, etc. |
| `platformTransactionId` | text nullable | Platform transaction ID |
| `status` | text nullable | Normalized display value of the source status |
| `originalFileId` | text FK nullable | Original image or statement |
| `originalRowData` | text JSON nullable | Original row; omitted from API output by default |
| `importBatchId` | text FK nullable | Import batch |
| `fingerprint` | text index not null | SHA-256 |
| `duplicateStatus` | text not null | `unique` / `possible_duplicate` / `duplicate` |
| `recognitionConfidence` | integer nullable | 0–10000, avoiding floating point |
| `needsReview` | integer boolean not null | Whether further review is required |

Indexes cover `(userId, transactionTime)`, `(userId, categoryId, transactionTime)`, `(userId, source, platformTransactionId)`, and `(userId, fingerprint)`. Service checks and a unique database index prevent concurrent duplicates when platform IDs are present.

#### `stored_files`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID; original filenames never become paths |
| `userId` | text FK index | Owning user |
| `kind` | text not null | `bill` / `screenshot` |
| `originalName` | text not null | Display only; path characters removed |
| `storageKey` | text unique not null | Random user-isolated path |
| `mimeType`, `extension` | text not null | Validated type |
| `size`, `sha256` | integer/text not null | Limits, audit, and optional duplicate-file warnings |
| `deletedAt`, `createdAt` | text nullable/not null | Soft-deleted metadata; physical content removed immediately |

#### `import_batches`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID |
| `userId`, `fileId` | text FK index | Owner and original file |
| `source` | text not null | `alipay` / `wechat` / `other` |
| `status` | text not null | `parsing` / `reviewing` / `committing` / `completed` / `failed` |
| `totalCount`, `validCount`, `importedCount`, `duplicateCount`, `skippedCount`, `failedCount` | integer | Explainable results |
| `failureCode` | text nullable | Redacted error code; no complete statement logs |
| `createdAt`, `updatedAt`, `completedAt` | text | Lifecycle |

#### `import_items`

| Field | Type/constraint | Description |
| --- | --- | --- |
| `id` | text PK | UUID |
| `userId`, `batchId` | text FK index | Explicit user ownership at both levels to reduce unauthorized access |
| `rowNumber` | integer not null | Original file row number |
| `rawData` | text JSON not null | Original row, returned only in authorized previews |
| `normalizedData` | text JSON nullable | Staged values matching the transaction input schema |
| `validationErrors`, `warnings` | text JSON | Field-level issues |
| `duplicateStatus`, `duplicateTransactionId` | text | Duplicate assessment and match |
| `decision` | text not null | `pending` / `import` / `skip` / `import_anyway` |
| `resultTransactionId`, `resultCode` | text nullable | Confirmation outcome |
| `createdAt`, `updatedAt` | text not null | UTC ISO |

#### `recognition_jobs` and `recognition_items`

`recognition_jobs` stores `id/userId/status/provider/totalCount/succeededCount/failedCount/createdAt/updatedAt/completedAt`. `recognition_items` stores `jobId/userId/fileId/status/providerPayloadHash/normalizedData/validationErrors/warnings/duplicateStatus/duplicateTransactionId/decision/resultTransactionId/createdAt/updatedAt`. Raw third-party responses are not persisted by default; only hashes and normalized results are retained to limit sensitive data exposure.

### 5.3 Transaction domain types

The requested `amount: number` becomes `amountMinor: number` in storage and services; boundary display objects may derive `amount: string`. Confidence likewise uses integers from 0–10000. Source, type, and duplicate status use strict enum schemas; unknown sources become `other`, while unknown text remains in raw data rather than expanding enums.

## 6. Duplicate detection

### 6.1 Normalization

- Merchant: Unicode NFKC, lowercase, trim/collapse whitespace, remove common punctuation. Preserve Chinese content and store numbers.
- Description: NFKC and whitespace folding; used for explanation, not uniqueness.
- Time: parse the source time zone and convert to UTC at second precision. Date-only values are errors; never invent a time.
- Amount: strict decimal parsing into minor units; interpret the sign through transaction type and store the absolute value.

### 6.2 Assessment order

1. Same user, nonempty platform transaction ID, and same platform source: `duplicate`.
2. Identical `SHA-256(source | type | amountMinor | currency | normalizedMerchant | transactionTime)`: `duplicate`.
3. Same type, amount, currency, and normalized merchant, within five minutes: `possible_duplicate`.
4. Rule 3 also applies across sources, such as screenshots and Alipay files, whose fingerprints intentionally differ.
5. Otherwise: `unique`.

Exact duplicates default to skip in preview with reasons visible. Possible duplicates require skip or import-anyway decisions. Detection runs again inside confirmation to avoid races after preview. No check silently deletes existing records.

## 7. Categorization

Precedence, highest first:

1. The user's exact merchant rule.
2. Reliable source semantics and built-in merchant/description keywords, such as refunds → Refund and metro/DiDi → Transport.
3. A screenshot provider's category suggestion compatible with the transaction type.
4. Optional OpenAI-compatible AI categorization for import candidates still uncategorized or Other.
5. Local type-based fallback: Salary, Refund, or Other.

Initial categories are Food, Delivery, Transport, Shopping, Entertainment, Housing, Healthcare, Education, Electronics, Transfer, Red packets, Salary, Refund, and Other. AI updates staged categories only when confidence meets the configured threshold (default `0.85`) without ambiguity; otherwise it shows the suggestion, confidence, and reason. User edits create learning rules only with a nonempty merchant and explicit opt-in. Automatic AI adoption never learns rules. Suggestions carry their source and input digest and become invalid when input facts change.

## 8. API design

All `/api` routes use one envelope: `{ data, meta? }` for success and `{ error: { code, message, fieldErrors?, requestId } }` for failure. Writes require a valid session and Zod validation. Cookie writes check same origin; native clients use `Authorization: Bearer` without relying on CORS. ID queries must include the current `userId`; missing and unauthorized resources both return 404.

### 8.1 Authentication

| Method and path | Input | Output/description |
| --- | --- | --- |
| `POST /api/auth/login` | `{ email, password }` | Create an opaque HttpOnly session cookie |
| `POST /api/auth/token` | `{ email, password }` | Create a native opaque Bearer session; return the plaintext token once with its expiry |
| `POST /api/auth/logout` | None | Revoke the server session and clear the cookie |
| `GET /api/auth/session` | Cookie or Bearer | Safe current-user fields; an invalid Authorization header never falls back to cookies |

### 8.2 Setup and account management

| Method and path | Input | Output/description |
| --- | --- | --- |
| `POST /api/setup/admin` | `{ setupToken, email, displayName?, password }` | Create the sole administrator in an empty database and establish a web session |
| `GET /api/admin/accounts` | `page/limit` | Administrator pagination of safe account fields |
| `POST /api/admin/accounts` | `{ email, displayName?, password }` | Create a regular account with default categories |
| `PATCH /api/admin/accounts/[id]/password` | `{ adminPassword, newPassword }` | Reauthenticate the administrator and revoke all target sessions |
| `PATCH /api/admin/accounts/[id]/status` | `{ disabled }` | Disable/reactivate regular accounts; the administrator cannot be disabled |

### 8.3 Transactions

| Method and path | Input | Output/description |
| --- | --- | --- |
| `GET /api/transactions` | `dateFrom/dateTo/categoryId/source/type/keyword/page/limit` | Filtered, paginated user transactions |
| `POST /api/transactions` | Transaction input + confirmation identity/version | Confirm one manual candidate |
| `GET /api/transactions/[id]` | ID | Details; raw rows require an explicit permission field |
| `PATCH /api/transactions/[id]` | Editable fields + expected revision + operation ID + optional override/`learnCategoryRule` | Amend and append a revision |
| `DELETE /api/transactions/[id]` | `{ expectedRevisionId, operationId }` | Void without deleting shared original files |
| `POST /api/transactions/bulk-delete` | `{ operationId, targets: [{ transactionId, expectedRevisionId }] }`, at most 100 | Atomically void user transactions and return per-item revisions |

### 8.4 Categories

| Method and path | Input | Output/description |
| --- | --- | --- |
| `GET /api/categories` | None | User categories and reference counts |
| `POST /api/categories` | Name, kind, icon, color | Create category |
| `PATCH /api/categories/[id]` | Editable fields | Update category |
| `DELETE /api/categories/[id]` | ID | Reject if transactions reference it; cascade learning-rule deletion |
| `PATCH /api/categories/reorder` | Complete ordered category IDs | Atomically reorder user categories |
| `GET /api/categories/rules` | None | User merchant category rules |
| `DELETE /api/categories/rules/[id]` | ID | Delete learning rule |
| `POST /api/categories/ai-reclassification/preview` | `cursor/limit` | Paginated Other transaction scan and grouped suggestions; no writes |
| `POST /api/categories/ai-reclassification/apply` | Operation ID + transaction ID/expected revision/target category | Validate individually, append amendments, skip conflicts |

### 8.5 File import

| Method and path | Input | Output/description |
| --- | --- | --- |
| `POST /api/imports/files` | Single multipart file | Save, parse, return batch and summary |
| `GET /api/imports/files/[batchId]` | Group/pagination parameters | Staged preview with error/duplicate reasons |
| `PATCH /api/imports/files/[batchId]/items/[itemId]` | Canonical fields or decision | Edit/skip, revalidate, and deduplicate |
| `POST /api/imports/files/[batchId]/ai-classify` | None | Batch categorization of staged items unmatched by rules |
| `POST /api/imports/files/[batchId]/confirm` | Optional version | Idempotent transactional confirmation |
| `GET /api/imports/files/[batchId]/result` | None | Complete counts and item results |

### 8.6 Screenshot recognition

| Method and path | Input | Output/description |
| --- | --- | --- |
| `POST /api/imports/screenshots` | Multiple multipart images, at most 10 | Create a task and complete synchronous MVP recognition |
| `GET /api/imports/screenshots/provider` | None | Provider name, third-party transfer flag, and pre-upload disclosure |
| `GET /api/imports/screenshots/[jobId]` | None | Task and review items |
| `PATCH /api/imports/screenshots/[jobId]/items/[itemId]` | Canonical fields or decision | Manual correction and revalidation |
| `POST /api/imports/screenshots/[jobId]/ai-classify` | None | Batch categorization of staged items without valid suggestions |
| `POST /api/imports/screenshots/[jobId]/confirm` | None | Idempotently save selected items |

### 8.7 Statistics and files

| Method and path | Input | Output/description |
| --- | --- | --- |
| `GET /api/statistics/overview` | `month=YYYY-MM&currency=CNY` | Income/spending, comparison, trends, category/source shares, recent transactions |
| `GET /api/files/[id]` | ID | Authenticated streaming with safe response headers |
| `GET /api/settings/files` | `page/limit` | Paginated user-manageable original files |
| `DELETE /api/settings/files/[id]` | ID | Block new reads and remove content; retain referenced metadata |
| `GET /api/settings/ai-categorization` | None | Configuration source, privacy metadata, redacted personal settings |
| `PUT /api/settings/ai-categorization` | Provider configuration + key action | Save user settings for subsequent categorization |
| `DELETE /api/settings/ai-categorization` | None | Delete personal settings and restore environment defaults |
| `POST /api/settings/ai-categorization/test` | Current settings or unsaved candidate | Test compatible output with synthetic transactions only; no settings writes |

### 8.8 Android notification candidates

| Method and path | Input | Output/description |
| --- | --- | --- |
| `POST /api/captures/notifications` | Bearer authentication; at most 20 structured events | Per-item accepted, already_accepted, or rejected |
| `GET /api/captures/settings` | None | Per-platform auto-post authorization and amount and trusted-merchant limits, including defaults |
| `PUT /api/captures/settings` | Per-platform switches and per-transaction amount and trusted-merchant limits | Save authorization for subsequent candidates |
| `GET /api/captures/notifications` | `status/page/limit` | User candidates, pagination, pending count |
| `GET /api/captures/notifications/[id]` | ID | One user-owned candidate |
| `PATCH /api/captures/notifications/[id]` | Complete canonical fields | Edit, reclassify, and deduplicate |
| `POST /api/captures/notifications/[id]/confirm` | post/skip; assessment digest for possible duplicates | Final review, then Ledger posting or skip |
| `POST /api/captures/notifications/[id]/quick-confirm` | Optional merchant; Bearer authentication | Reclassify, deduplicate, confirm; possible duplicates return 409 for app review |

## 9. Project structure

```text
zeMoney/
├── docs/
│   └── product-and-architecture.md
├── drizzle/
│   ├── migrations/
│   └── seed.ts
├── e2e/
├── public/
├── scripts/
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/
│   │   │   ├── page.tsx
│   │   │   ├── transactions/
│   │   │   ├── imports/
│   │   │   ├── categories/
│   │   │   ├── statistics/
│   │   │   └── settings/
│   │   └── api/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── transactions/
│   │   ├── imports/
│   │   └── charts/
│   ├── db/
│   │   ├── schema/
│   │   ├── client.ts
│   │   └── repositories/
│   ├── lib/
│   │   ├── auth/
│   │   ├── validation/
│   │   ├── money/
│   │   ├── dates/
│   │   └── security/
│   ├── services/
│   │   ├── transaction-service/
│   │   ├── import-service/
│   │   │   └── parsers/
│   │   ├── screenshot-recognition-service/
│   │   │   └── providers/
│   │   ├── deduplication-service/
│   │   ├── categorization-service/
│   │   ├── statistics-service/
│   │   └── file-storage-service/
│   ├── test/
│   └── types/
├── storage/                 # gitignored local development files
├── .env.example
├── drizzle.config.ts
├── playwright.config.ts
├── vitest.config.ts
└── package.json
```

Domain directories may export public interfaces, but services must not reach into another module's private implementation. Prefer colocated tests; cross-module integration tests belong in `src/test`.

## 10. Technology choices

| Area | Choice | Rationale |
| --- | --- | --- |
| Web | Next.js App Router + TypeScript | Mobile web UI, Server Components, and Route Handlers in a simple single-repository MVP |
| Native mobile | Flutter + Dart, Riverpod, Dio, go_router | Shared iOS/Android client code reusing the API and ledger through Bearer sessions |
| Styling/UI | Tailwind CSS + shadcn/ui structure | Accessible, customizable lightweight components without traditional finance-software complexity |
| Forms | React Hook Form + Zod | Shared client/server schemas |
| Database | SQLite + Drizzle ORM | No external local service; clear SQL and integer-money semantics; supports future PostgreSQL migration |
| Charts | Recharts | Composable React trend and distribution charts |
| Files | Papa Parse + SheetJS | Mature CSV and XLSX support with explicit row/size limits |
| Authentication | scrypt + opaque server session cookies | No external MVP dependency, revocable; replaceable with a full identity provider |
| File storage | Local adapter with an S3 interface boundary | Runnable locally with a clear production boundary |
| Testing | Vitest + Testing Library + Playwright | Fast service tests plus critical end-to-end flows |

Drizzle is preferred over Prisma for extensive parser/deduplication tests, explicit SQLite/PostgreSQL index semantics, close-to-SQL behavior, and smaller builds. Authentication is not tied to a SaaS provider; before a full production launch, integrate a mature identity system with registration, MFA, risk controls, and password recovery.

## 11. Security and privacy

- Default limits: 10 MiB statement files, 8 MiB per image, 10 images per upload, and 10,000 rows per batch.
- Extension, declared MIME, and magic bytes must agree. XLSX reads cell results without executing formulas, macros, or embedded objects. XLSM is unsupported.
- Original filenames are escaped display text only. UUID disk paths include an unguessable user-ID hash.
- Session cookies use `HttpOnly`, `SameSite=Lax`, and production `Secure`; writes validate Origin.
- APIs, persistent service queries, and storage independently validate ownership rather than relying on frontend routes.
- Logs contain only request ID, user hash, batch ID, counts, durations, and error codes; never amounts, merchants, descriptions, raw rows, or images.
- Users may delete originals. Binary content is removed immediately, with `deletedAt` metadata retained to explain historical provenance.
- Mock never leaves the device. Before real AI use, upload/settings pages disclose provider, transmitted data, and retention, requiring an affirmative user action.
- AI categorization sends only type, source, merchant, cleaned description, and available categories. Order/platform IDs, user identifiers, original files, and long digit strings are excluded. Public services require keys; private keys are optional. Every HTTP URL requires explicit consent and a persistent plaintext warning. Redirects are not followed.
- Per-account AI keys use the deployment master key and AES-256-GCM bound to `userId`; APIs reveal only whether a key exists. Corrupt personal settings disable that user's AI rather than silently reverting to environment providers.
- Production requires TLS, encrypted disks/object storage and backups, key rotation, rate limiting, and dependency vulnerability scanning.

## 12. Testing and acceptance

### 12.1 Unit tests

- Decimal/minor-unit conversion in both directions, including zero, grouping separators, signs, invalid precision, and oversized values.
- Date/time-zone parsing, merchant normalization, and fingerprint stability.
- Alipay, WeChat, and generic CSV/XLSX detection, aliases, empty values, and invalid rows.
- Exact platform-ID and same-source fingerprint duplicates, cross-source possible duplicates, concurrent confirmation.
- User-rule precedence, built-in categories, and fallbacks.
- AI configuration, timeout, response-size limits, strict parsing, category ownership, batch deduplication, and failure fallback.
- Recognition provider schema: valid, missing/extra fields, natural language, and confidence bounds.

### 12.2 Integration tests

- Login, session revocation, and cross-user 404 responses.
- Posting confirmation, amendment/voiding, and explicit learning rules.
- Upload to preview, staged edits, confirmation, and idempotent retries.
- High-confidence AI adoption, manual low-confidence adoption, invalidation after edits, and historical Other preview/revision conflicts.
- Deleted files cannot be read while transactions remain visible.
- Statistics respect user time zone and CNY filtering.

### 12.3 End-to-end tests

1. Login → manual entry → category edit → filter → void.
2. Upload Alipay sample → preview errors/duplicates → edit → confirm → results.
3. Upload WeChat XLSX sample → confirm → reimport and see duplicate alerts.
4. Upload screenshot → Mock structured result → manual confirmation → transaction details.
5. Home and Statistics monthly totals and category charts match seeded data.

## 13. Milestones and commit boundaries

### Milestone 1: Product and architecture

- Deliver this document and the README entry point.
- Verify completeness of requirements, model, API, pages, and risks.
- Commit independently without runtime code.

### Milestone 2: Project shell

- Create Next.js, Tailwind, Drizzle/SQLite, and Vitest infrastructure.
- Implement login, responsive navigation/layout, seeds, transaction CRUD, and basic categories.
- Deliver runnable transaction list, detail, creation, and editing pages.
- Run lint, type checks, and unit/integration tests before an independent commit.

### Milestone 3: File import

- Implement storage, CSV/XLSX decoding, three parsers, cleaning, categorization, and deduplication.
- Implement upload, preview/edit, confirmation, and result pages/APIs.
- Verify with anonymized Alipay/WeChat fixtures, then commit independently.

### Milestone 4: Screenshot recognition

- Implement multiple uploads, tasks, provider interface, Mock, real-adapter extension points, and structural validation.
- Implement failure fallback, confirmation editing, saving, and authenticated originals.
- Run provider/schema/core-flow tests, then commit independently.

### Milestone 5: Statistics and polish

- Finish Home, Statistics, filters, category management, and settings.
- Complete index/query checks, Playwright core paths, README, deployment/migration/import instructions.
- Run the complete acceptance matrix, then commit independently.

## 14. Risks and open questions

| Risk/open question | MVP decision | Future extension |
| --- | --- | --- |
| Export formats change | Field aliases + content detection + anonymized fixtures | Collect failing samples and version parsers |
| CSV may use GB18030 or metadata preambles | BOM/encoding detection and bounded header scan | Manual encoding and mapping |
| Uncontrolled screenshot layouts | Mock core flow; strict real-provider schemas and confirmation | Multiple providers, field-level confidence |
| AI vendor unspecified | Adapter extension point; no external image transfer by default | Enable after provider, region, and retention decisions |
| False-positive approximate matches | Mark possible and require confirmation | Explainable similarity and feedback thresholds |
| Unclear multicurrency statistics | Aggregate CNY; retain and flag other currencies separately | Exchange-rate tables and original/converted values |
| Production identity requirements unspecified | Local seed account and revocable sessions | Mature identity provider and MFA |
| Original-file retention unspecified | Manual deletion; no automatic expiration | Configurable 30/90-day/permanent policies |
| Deployment platform unspecified | Single Node.js instance and persistent volumes | PostgreSQL, S3, multi-instance job queues |

## 15. Definition of done

The MVP is complete only when it starts locally from an empty database; manual CRUD works; Alipay and WeChat CSV/XLSX have success/failure fixtures; previews are editable; duplicates never post silently; screenshot Mock returns validated structures with manual failure recovery; monthly spending/category totals are correct; ownership and file permissions are tested; core tests pass; and README covers installation, configuration, migration, seeding, startup, tests, sample imports, and production replacements.

## Android payment page capture beta

ADR-0008 adds accessibility capture of immediate Alipay/WeChat success pages; since ADR-0011 it is the only automatic capture on Android. It preserves page provenance, uses a persisted checkout session to prevent repeated capture, and has separate automatic-post authorization (off by default). It uses the existing encrypted queue and Ledger workflow. Deduplication v2 flags uncertain same-amount observations within 30 seconds rather than silently posting or merging them. See [ADR-0008](adr/0008-payment-page-capture-beta.md) and the [mobile validation instructions](../mobile/README.md).

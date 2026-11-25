# Payment success pages are an opt-in Android capture mode

Status: accepted for beta validation. Date: 2026-11-05. The two device modes are superseded by ADR-0011 (2026-11-16): payment pages are now the only Android capture.

## Context

Notification-only capture misses page-only payments. A regression also demonstrated that two merchantless notifications with different delivery times could automatically post twice. The user requested an accessibility implementation to validate the alternative.

This revises ADR-0006's prohibition on accessibility services. Its remaining boundaries—no persisted/uploaded original text, encrypted account-bound candidate queues, and Ledger-only posting—remain in force.

## Decision

- Offer mutually exclusive device modes: notifications (the existing default) and payment pages (Beta). Page mode ignores all new notification captures, including CMB; already queued candidates remain available. Alipay and WeChat source switches apply to page mode. No overlay, screenshots, gestures, or automatic navigation is requested.
- Read only visible, non-password nodes from the currently active matching package, with node/depth/text budgets and a settled-page debounce. Extract on-device. Accept only explicit payment-success headings plus a completion control; reject historical bill details, refunds, transfers, red packets, and ambiguous amounts. An explicit paid-amount label takes precedence over discount/balance amounts. Unsupported layouts are counted locally, not guessed.
- A persisted opaque checkout session produces one idempotency key. Success-page refreshes, leaving/returning, and service restarts cannot create a fresh session. A subsequent observed checkout arms the next payment, even if its amount is identical. Account switches isolate sessions. Only opaque session IDs, owner IDs and state flags are stored outside the existing encrypted candidate queue.
- Initial service use may capture the first matching success page. After that, a new recognized checkout must be observed. Payments with an unobservable checkout can be missed; this is an explicit beta limitation to measure on physical devices, not a claim of full WeChat/Alipay coverage.
- `postedAt` on the backwards-compatible capture transport represents the observation time for page candidates, not a parsed historical transaction timestamp. Only immediate success pages are supported. `payment_page_capture` provenance identifies this limitation; extending to historical bills requires a separate design with explicit transaction/observation times.
- The existing capture table and transport are reused. Explicit registered parser IDs (`alipay_payment_page_v1`, `wechat_payment_page_v1`, version 1) determine `payment_page_capture` provenance server-side. Notification provenance is unchanged; Ledger revalidates the stored candidate and parser-derived provenance.
- Page automatic posting has a separate server authorization, `autoPostPaymentPages`, default false. It never inherits notification platform authorization. When enabled it uses existing amount limits, AI categorization, duplicate checks, and Ledger confirmations. Uncertain results remain reviewable.
- Deduplication algorithm v3 retains existing exact-match and same-merchant rules. Same-amount observations within 30 seconds with missing merchant data, or differing supported payment channels, are possible duplicates rather than new automatic postings. They are never silently merged or deleted. Ledger rechecks each posting, including multiple candidates in the same ingest batch. Existing transactions are not retroactively altered.

## Verification and rollout

Use JVM fixtures for parser/session boundaries, service tests for duplicate posting and independent page authorization/provenance, Flutter tests for permission/mode flows, and Android instrumentation against a debug-only synthetic payment activity. The synthetic activity is not packaged in release builds and cannot demonstrate compatibility with actual payment-app layouts.

Install the backend migration and server changes before a page-enabled client. Validate each actual phone/payment-app combination with at least five payments per source, page refresh/back navigation, consecutive equal amounts, revoked accessibility access, offline retry, logout and restart. Compare against actual bills. Keep page auto-post off until amounts and coverage are verified. No real payment is initiated by the agent or the accessibility service.

## Production rollout — 2026-11-05

The backend was deployed ahead of the client. It keeps screenshot submission idempotency, bulk candidate confirmation, and five-minute bank/payment duplicate protection. Its forward migration is `0019_payment-page-capture`, adding both trusted-merchant and payment-page authorization columns after the installed `0018_screenshot_submissions` history. A divergent development migration journal (backdated `0016` / alternate `0018`) was never deployed over it.

Checks over HTTPS passed login, independent page authorization, manual and authorized automatic page posting, same-session replay idempotency, and bank/payment duplicate blocking, with a temporary account whose synthetic records were removed. Actual payment-app layouts still require device validation.

## Android node-reading correction — 2026-11-06

A physical-device report for WeChat payment-code presentation showed 33 `empty_content` rejections and zero accepted candidates. An instrumentation fixture reproduced that exact symptom with a visible success page inside `IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS`. Enabling `flagIncludeNotImportantViews` fixes that class of omission. Because the expanded tree retains layout wrappers, the bounded traversal now permits depth 32, 320 nodes and 6,000 characters; incomplete reads are rejected explicitly instead of parsed as partial evidence. Window-unavailable, foreground-changed and read-error conditions also produce content-free counters. No screenshot/gesture capability or `isAccessibilityTool` claim is added.

Recognized payment-code presentation can arm the next checkout session; the code page itself never creates a payment candidate. Local observation counters distinguish readable page text and observed checkout/code screens from rejected/accepted payments. Server payment-fact grammar and parser identity remain v1; this client update is compatible with the deployed backend. The correction passes real Android callbacks against synthetic fixtures, but does not yet establish coverage on the reporting physical device.

## Branch reconciliation — 2026-11-13

The client and production branches were merged. The client's backdated `0016_trusted-autopost` and alternate `0018_payment-page-autopost` migrations were dropped, so `0019_payment-page-capture` remains the only migration carrying both settings columns.

## Order context — 2026-11-20

ADR-0014 adds an opt-in exception to "page text is never uploaded": with item recognition on, scrubbed text of the order pages around a Taobao or Pinduoduo payment travels with its candidate so the server can list what was bought. Off by default; nothing else here changes.

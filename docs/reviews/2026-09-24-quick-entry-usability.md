# Quick entry: correctness and convenience review

Scope: current checkout, covering web quick entry, Flutter manual and screenshot entry, and Android notification capture. This is a source review with focused automated verification, not a production or physical-device audit. The findings below describe the pre-fix behavior; the implementation status at the end records the subsequent repairs.

## Current strengths

- Web quick entry supports the N shortcut, image paste/drop, amount focus, and posting without leaving the current page.
- Single screenshots can post automatically when required fields are complete, confidence is at least 90%, and warnings and unresolved duplicates are absent.
- Android supports encrypted offline capture, notification actions, and explicit per-platform automatic posting authorization with an amount cap.
- Ledger posting preserves source provenance, confirmation identity, duplicate review, and transaction revisions.

## Findings

### 1. High: automatic posting can count a payment twice across notification sources

Verified in an isolated in-memory service test. Enable Alipay and CMB automatic posting, then ingest these two valid events for one user:

| Field | First event | Second event |
| --- | --- | --- |
| Platform | Alipay | CMB |
| Amount | 1880 minor units | 1880 minor units |
| Time | 2026-07-27T04:30:00.000Z | 2026-07-27T04:30:10.000Z |
| Merchant | null | null |
| Idempotency key | distinct valid key | distinct valid key |

Actual result: both candidates complete automatically and the ledger contains two transactions. These events can represent the payment-app notice and bank debit notice for the same purchase; the current facts do not prove that they are separate purchases.

The exact fingerprint includes source and time. The nearby-transaction check runs only for a nonempty merchant, and requires an equal normalized merchant. Automatic posting trusts a `unique` assessment, including when the merchant is absent. Different merchant labels can also evade the existing nearby match; that variant was source-reviewed, not separately executed.

Recommendation: introduce a conservative cross-source possible-duplicate check for payment and bank notices with matching amount/currency and nearby times when merchant evidence is missing or inconsistent. Keep uncertain candidates for review; do not silently merge solely by amount and time. Check both arrival orders and distinct legitimate purchases in regression tests.

Evidence: [deduplication](../../src/services/deduplication-service/index.ts), [fingerprint](../../src/lib/fingerprint.ts), [automatic authorization](../../src/services/notification-capture-service/index.ts).

### 2. Medium: expanding web quick entry discards the draft

Enter an amount/category in manual quick entry and choose **Add more details**. The action navigates to `/transactions/new` without transferring any form state. The destination creates a fresh form. Switching between manual and screenshot tabs also unmounts the manual form and loses its values.

Recommendation: expand the existing form in place, retain both modes' draft state, and protect a dirty draft when dismissing the dialog. Keep draft financial data out of URL parameters.

Evidence: [navigation action](../../src/components/transactions/transaction-form.tsx), [destination](../../src/app/(app)/transactions/new/page.tsx), [conditional form mounting](../../src/components/transactions/quick-transaction-entry.tsx).

### 3. Medium: pending work is fragmented and older notification candidates are hard to reach

The home pending-review count only queries screenshot recognition jobs. Payment notification candidates are counted separately on Import. The candidate provider requests page 1 with a limit of 20; its screen exposes no pagination or load-more action. Older candidates become visible as the first page is processed, but cannot be browsed directly while newer candidates remain pending.

Recommendation: a home-level inbox containing screenshots and notification candidates, with accurate total counts, pagination, and a reviewed batch-confirm action for eligible items. Unresolved duplicate decisions must continue to block posting.

Evidence: [home count](../../mobile/lib/features/home/home_screen.dart), [provider](../../mobile/lib/core/providers.dart), [repository paging defaults](../../mobile/lib/core/repository.dart), [candidate screen](../../mobile/lib/features/imports/notification_capture_screen.dart).

### 4. Medium: duplicate review asks for a decision without showing the matching transaction

The Flutter notification confirmation dialog only gives a generic duplicate explanation and offers **Post anyway**. It does not display or link the matched transaction. The web manual review similarly only renders a message and override action. Flutter manual entry already fetches and displays the matching amount, merchant, and time, providing a reusable interaction pattern.

Recommendation: show the candidate beside the existing transaction, explain the match, and offer an existing-transaction link. Clearly distinguish an exact duplicate being linked from a new transaction being posted.

Evidence: [notification review](../../mobile/lib/features/imports/notification_capture_screen.dart), [web review](../../src/components/transactions/transaction-form-actions.tsx), [mobile manual comparison](../../mobile/lib/features/transactions/transaction_form_logic.dart).

### 5. Medium: screenshot network errors claim more certainty than the client has

The web screenshot catch handler says the screenshot was not submitted. A lost response can happen after upload, recognition, or automatic posting has completed. Retrying creates a new upload job; the request carries no stable upload identity. Ledger duplicate checks provide another defense, but recognition output can vary and the user cannot infer the first result from the error.

Recommendation: report an unknown result, provide a task-history recovery action, and use a stable submission identity to recover or retry the original job before creating another one. This failure scenario was source-reviewed, not network-fault injected.

Evidence: [client upload/error](../../src/components/transactions/quick-screenshot-entry.tsx), [API orchestration](../../src/app/api/imports/screenshots/route.ts), [new job creation](../../src/services/screenshot-recognition-service/upload.ts).

### 6. Convenience: mobile screenshot entry does not use the available fast path

Home opens Import; the user then selects screenshots, consents when required, and enters the review screen. The mobile upload method does not send `autoConfirm`, so even a single reliable screenshot follows manual review. No image share-target, home-screen widget, or app-shortcut integration was found in the inspected Android/iOS configuration and dependencies.

Recommendation: start with a screenshot share-target and direct single-image entry that reuses the server's existing guarded automatic-posting path. Show uncertainty inline and request only the missing fields. Keep bulk screenshot review as a separate supported flow.

Evidence: [home actions](../../mobile/lib/features/home/home_screen.dart), [import flow](../../mobile/lib/features/imports/import_screen.dart), [upload method](../../mobile/lib/core/repository.dart), [automatic-posting gate](../../src/services/screenshot-recognition-service/automatic-posting.ts).

### 7. Convenience: manual entry has avoidable repeated choices

Web quick entry resets to screenshot mode every time, including when the provider is a mock or unavailable. Both clients use fixed 10/20/50/100 amount chips with a hardcoded yuan label, even where currency can change. Mobile posting navigates to transaction details; there is no post-and-continue action. Merchant/category learning is available through amendment rather than a direct initial-entry choice.

Recommendation: remember the preferred entry mode, fall back to manual when recognition is unavailable, and prioritize recent categories/merchants or explicit templates over arbitrary preset amounts. Show amount plus a few frequent categories first, with optional details expandable. Add post-and-continue for backfilling multiple transactions. Any new merchant-learning action should remain explicitly authorized.

Evidence: [web entry mode](../../src/components/transactions/quick-transaction-entry.tsx), [web fields](../../src/components/transactions/transaction-form-fields.tsx), [mobile fields](../../mobile/lib/features/transactions/transaction_form_view.dart), [mobile submit](../../mobile/lib/features/transactions/transaction_form_logic.dart).

### 8. Convenience: automatic posting needs clearer completion feedback

The Android upload worker publishes review notifications only for candidates still reviewing. Automatically completed candidates have no equivalent success action in that path. The home screen is backed by cached statistics, and capture confirmation refreshes the candidate provider without invalidating those statistics. Automatic posting can therefore be difficult to verify immediately from an already-open home screen.

Recommendation: a quiet activity summary showing posted amount, category, and source, with **Edit** and **Void** actions. Refresh affected totals and pending counts after mutations and on relevant app resume events. Avoid adding a mandatory tap to every successfully posted payment.

Evidence: [worker](../../mobile/android/app/src/main/kotlin/com/zowl/mobile/capture/NotificationCaptureWorker.kt), [home](../../mobile/lib/features/home/home_screen.dart), [capture confirmation](../../mobile/lib/features/imports/notification_capture_screen.dart), [providers](../../mobile/lib/core/providers.dart).

## Suggested implementation order

1. Correctness and continuity: cross-source duplicate protection, draft preservation, honest retry/recovery state.
2. Everyday flow: unified pending inbox, matched-transaction comparison, reliable completion feedback and refresh.
3. Fewer taps: mobile screenshot share entry, preferred manual mode, recent categories/templates, post-and-continue.

Acceptance targets: an ordinary manual entry requires only amount, optional category selection, and posting; a clear screenshot needs no follow-up decision after the user's submission authorization; automatic payments need attention only for exceptions, while remaining easy to inspect and correct. These are proposed targets, not measured current performance.

## Verification

Executed the existing quick-transaction component, quick-screenshot component, automatic screenshot-posting service, and notification capture service tests: **4 files, 28 tests passed**.

A temporary service regression probe expected the second cross-source candidate to remain reviewing and the ledger to contain one transaction. Both assertions failed: actual state was completed and two transactions. The probe used the existing test fixture and an isolated in-memory database, and was removed after verification. Other findings are based on inspected control flow; browser interaction, device notification delivery, and production parser coverage were not tested.

## Implementation status

All eight findings have corresponding fixes in this checkout:

1. Deduplication v2 conservatively flags bank/payment notices across both arrival orders, absent merchants, and differing labels. Separate amounts and distant times remain eligible for authorized auto-posting.
2. Web quick-entry draft state survives detail expansion and mode switches; the quick-entry dialog and mobile manual form protect edited drafts when leaving. Preferred web mode falls back to manual when recognition is unavailable or mocked.
3. Both clients expose a screenshot/notification review inbox. Pending screenshots use a dedicated untruncated query; notifications have pagination, batch review, and atomic version-checked confirmation.
4. Manual and notification duplicate review links the matching ledger entry; mobile notification review also shows its amount, merchant and time. Exact duplicate results say that an existing entry was linked.
5. Screenshot upload retries carry stable submission IDs bound to their contents and user. Concurrent/repeated requests recover one job. Completed automatic-posting retries return the prior result. Unknown network outcomes direct users to retry the same submission or inspect history.
6. Mobile has direct single-image quick entry with guarded automatic posting and an Android image share target. Shared images are held in memory until explicit submission. The existing multi-image review flow remains available.
7. Arbitrary amount chips are replaced by category shortcuts; recent merchant templates and post-and-continue reduce repeated input. Category learning remains opt-in. A browser smoke test additionally found and fixed UUID generation on local HTTP origins for create, screenshot, amend and void operations.
8. Processed notification activity links to transaction detail/amend/void. Totals and pending state refresh after mutations and on mobile resume.

Scope boundaries: no production deployment was performed. Android share delivery and OEM notification behavior still require physical-device acceptance; iOS share extensions and home-screen widgets were future ideas, not part of this repair. Draft protection is within the running form, not persistence across process termination. Conservative bank/payment matching can intentionally send two separate same-amount purchases to review.

## Repair verification

- Web/backend: 49 Vitest files, 320 tests passed; ESLint, TypeScript and the production build passed.
- Flutter: 141 tests passed, including screen baselines and 2.0x text accessibility checks. Line coverage is 90.43% overall and 92.98% in core; analyzer passed.
- Android: 32 native unit tests passed; final debug APK compiled successfully.
- Playwright: all 14 browser/API flows passed against the production build behind a temporary local HTTPS proxy, with production HTTPS/origin checks intact. The development server showed intermittent cold-route timeouts; its assertion budget now allows initial compilation.
- Browser smoke test on the local HTTP/Tailscale address: retained amount through expansion and mode switches, dirty-draft protection, successful post-and-continue, desktop merchant templates/inbox, and the 390px inbox layout. Temporary browser processes were cleaned up.
- Recognition tests cover repeated and concurrent submission recovery, user/content isolation, and completed-post replay. Notification tests cover both bank/payment arrival orders, mismatched or missing merchants, eligible distinct purchases, and atomic batch rollback/replay.

Deployment must apply `0018_screenshot_submissions.sql` before serving the updated screenshot API. No production data or deployment was changed during verification.

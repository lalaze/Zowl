# Zowl

Zowl (originally zeMoney) turns user-provided financial facts into posted transactions in a personal ledger, keeping human confirmation wherever facts are uncertain.

## Language

**Posting**:
The final act of turning a valid candidate into a posted transaction. Saving staged data, recognition results, or review choices is not posting.
_Avoid_: save, import (when referring to the final ledger write)

**Posted Transaction**:
A personal income or expense fact already posted to the ledger, whether entered manually, imported from a statement, or recognized from a payment screenshot.
_Avoid_: staged item, recognition item, import row

**Transaction Amendment**:
A user's correction to an existing posted transaction. It preserves the transaction identity and source provenance, and revalidates the corrected facts against ledger rules.
_Avoid_: reposting, replacement transaction

**Transaction Revision**:
An immutable ledger snapshot created by initial posting, a successful amendment, or voiding. It explains how transaction facts originated and changed. Invalid, unconfirmed, or failed attempts do not create revisions.
_Avoid_: update timestamp, operation log

**Legacy Snapshot**:
The first revision representing an existing transaction's current state when the audit model is introduced. It explicitly acknowledges that previous confirmation identities, actors, and amendments are unknown; none are inferred or fabricated from old data.
_Avoid_: initial posting record, reconstructed confirmation history

**Transaction Voiding**:
A terminal action removing a posted transaction from the active ledger, statistics, and duplicate detection. Identity, provenance, and revisions remain; only account deletion or explicit permanent data erasure physically removes them.
_Avoid_: delete, soft delete

**Source Provenance**:
Immutable information explaining whether a posted transaction originated from manual entry, a statement file, a payment screenshot, or a notification candidate. Amendments do not rewrite it.
_Avoid_: current edited values, review status

**Bill Supplemental Evidence**:
Append-only evidence from an Alipay statement supplementing an existing payment notification. It links the transaction, import item, original file, and Alipay transaction ID. It can enrich merchant, description, payment method, and category without replacing the original notification provenance. Each Alipay transaction ID yields at most one evidence record per user.
_Avoid_: replacement source, second posted transaction, in-place overwrite

**Notification Capture Candidate**:
A structured ledger candidate extracted from Alipay, WeChat Pay, or China Merchants Bank expense notifications by Android builds up to 1.0.4. Current builds no longer read notifications (ADR-0011), so no new ones are produced by them; existing candidates, their `notification_capture` provenance, and the server's registered notification parser identities remain. It contains only provable amount, time, nullable merchant, fixed source, and evidence digest. Original notification text is excluded and must never be persisted or uploaded. Posting requires server-side parser identity validation, categorization, duplicate checks, and user confirmation through Ledger. Users may authorize unique candidates within the amount limit to post on receipt and exact duplicates to link to existing transactions. Exact duplicates from unauthorized platforms still require confirmation before linking.
_Avoid_: raw notification, automatic transaction, posted transaction

**Payment Page Capture Candidate**:
A structured expense candidate extracted locally from a supported Android immediate payment-success page: Alipay and WeChat, plus the experimental shopping-app sources Taobao, Pinduoduo, JD.com, Pupu, and Xianyu (ADR-0012), whose candidates carry the app as platform and transaction source and never a merchant (except Pupu, which is one seller). JD.com is read from accessibility text of its success page only (untested on a device); a Pinduoduo candidate is the amount on the order panel's submit button (accessibility text), recorded once the order goes through, including pay-later orders that are charged only on receipt; a Pupu candidate is the amount by its checkout's pay button (accessibility text, layout untested on a device), recorded once its completion page is shown and only when Alipay or WeChat has not captured the same order; a Taobao candidate is the amount shown on its embedded Alipay cashier (read from accessibility text), confirmed as paid by the cashier itself or by on-device OCR of the result page that follows; a Xianyu candidate is the amount shown on its embedded Alipay cashier (or the Alipay app's cashier if risk control hands off to it), confirmed by the cashier itself, its text-free overlay closing, or the text of Xianyu's own result page (result-page layout untested on a device, never screenshotted). It uses the capture queue and review workflow with distinct `payment_page_capture` provenance. Time is the page observation time, not a parsed historical bill timestamp. An opaque checkout session prevents repeated page callbacks from generating new candidates. It is the only automatic capture on Android (ADR-0011); automatic posting requires separate page authorization. Original page text is never stored or uploaded, with one opt-in exception: the order context of a Taobao or Pinduoduo payment (see Order Context). When a supported app exposes no readable accessibility text on API 34+, page capture reads that app's own window by on-device OCR instead and registers the candidate under a distinct `*_payment_page_ocr_v1` parser identity with the same provenance and authorization; screenshots and recognised text stay in memory only. See ADR-0008 for beta scope and device validation requirements, ADR-0010 for the OCR fallback, and ADR-0011 for the retirement of notification capture.
_Avoid_: notification provenance, historical bill import, guaranteed payment coverage

**Order Context**:
Scrubbed text lines of the few shopping-app screens around a Taobao or Pinduoduo payment (the page before checkout, the checkout page, what followed), uploaded with its payment page capture candidate only while the user has item recognition switched on. The device drops phone numbers, address lines and long digit runs before keeping any line, holds the lines in memory, and stores them only inside the encrypted capture queue until upload. The server reads them once, in the receiving request, and never stores or logs them. A malformed order context is ignored; it never rejects the candidate. See ADR-0014.
_Avoid_: screenshot, raw page text, evidence, order page capture

**Order Details**:
The goods a shopping-app payment bought, as a model read them from the order context before posting: items (name, variant, quantity, listed price) and the shop. Kept on the capture candidate and shown with its posted transaction; read-only. Only what the uploaded text supports is kept. Listed prices are what the page showed, not what was paid, and need not add up to the transaction amount. The shop name and the goods summary become the candidate's merchant and description with `ai_suggestion` origin, so the first posted revision already carries them. The amount is never taken from a model.
_Avoid_: line items of a split transaction, receipt, itemised amounts, parser facts

**Bill Enrichment**:
Field suggestions from an Alipay expense statement for a unique notification candidate or its posted transaction belonging to the same user, with the same amount and currency and a time difference of at most five minutes. Enrichment cannot alter amount, currency, or time. User-content conflicts require individual field decisions. Pending candidates retain notification provenance when posted; existing transactions receive an amendment revision. The batch and supplemental evidence commit atomically.
_Avoid_: silent overwrite, automatic selection of ambiguous targets, duplicate statement posting

**Posting Confirmation**:
One user authorization to post one or more reviewed candidates. Any unresolved decision blocks the entire confirmation. Approved candidates become posted transactions together or not at all.

**Notification Auto-post Authorization**:
Users authorize Alipay, WeChat Pay, and CMB individually and set per-transaction and trusted-merchant amount limits. The per-platform switches apply only to notification candidates, which current Android builds no longer produce; payment page candidates use the separate page authorization and share the amount limits. Unique candidates within the applicable limit are confirmed through Ledger on receipt (`AUTO_POSTED`); exact duplicates link to existing transactions (`AUTO_SKIPPED_DUPLICATE`). Candidates with only a fallback local category request AI categorization once on receipt. High-confidence, unambiguous suggestions are adopted with `ai_suggestion` provenance without creating learning rules. A normalized merchant becomes trusted after five automatically posted transactions that have not been amended or voided; amendments and voids remove that transaction from the count. Trusted merchants use the higher trusted-merchant limit. Authorization neither alters candidate facts nor bypasses Ledger. Possible duplicates, over-limit candidates, and unauthorized platforms require manual review. Authorization can be disabled per platform; posted transactions can be amended or voided.
_Avoid_: unconfirmed posting, silent posting, permanent automatic rule

**Confirmation Identity**:
A stable identity for one successful posting confirmation. It represents one candidate set and its decisions, and always maps to the same posting result.
_Avoid_: request ID, batch ID (unless they represent one confirmation)

**Confirmation Outcome**:
The final result for each ledger candidate after confirmation: posted, linked to an existing transaction as an exact duplicate, or explicitly skipped. Confirmation still completes with no new transactions when every candidate is resolved.
_Avoid_: review status, write count

**Ledger Candidate**:
Normalized financial facts ready for final validation and duplicate review. Manual entry, file import, and screenshot recognition share canonical ledger fields with explicit provenance variants. Raw file rows and recognition responses are not ledger candidates.
_Avoid_: import row, recognition result, arbitrary metadata

**Review**:
The process of checking and correcting candidates and resolving possible duplicates before posting confirmation. Finishing review does not mean a transaction is posted.
_Avoid_: preview (when the user can already make posting decisions)

**Review Decision**:
A pending, post, skip, or duplicate conclusion derived from candidate validity, duplicate assessment, and user choice. It neither writes to the ledger nor changes duplicate facts.
_Avoid_: duplicate assessment, confirmation outcome

**Duplicate**:
A candidate representing the same financial fact as an existing posted transaction. It never creates a second transaction and may reference the existing one without changing its provenance.

**Possible Duplicate**:
A candidate that may represent an existing financial fact. It can become a posted transaction only after the user explicitly chooses to post anyway.

**Duplicate Assessment**:
A factual assessment of a candidate against existing transactions and candidates in the same confirmation: unique, possible duplicate, or duplicate, with a reason and match. It excludes the user's skip or override decision.
_Avoid_: review decision, posting authorization

**Possible Duplicate Override**:
Explicit authorization to post despite a specific possible-duplicate assessment. It binds the candidate's deduplication identity, matched transaction, reason, and algorithm version, and becomes invalid immediately if those facts change.
_Avoid_: permanently ignore duplicates, generic confirmation flag

**Category Rule Learning**:
Explicit authorization during an amendment to associate a nonempty merchant with a selected category for future suggestions. Learning commits atomically with the amendment. Initial posting, file import, and screenshot recognition never create learning rules automatically.
_Avoid_: category suggestion, automatic categorization

**AI Category Suggestion**:
A staged suggestion from an optional AI provider using cleaned merchant and description text after merchant rules, local keywords, and screenshot suggestions have not resolved the category. It includes a target category, confidence, ambiguity flag, reason, input digest, and nonsensitive configuration fingerprint. It is neither a posted fact nor a learning rule. High-confidence, unambiguous suggestions may be adopted automatically in review; others require explicit adoption. Changing provider URL, model, response mode, or threshold invalidates older suggestions not yet manually adopted.
_Avoid_: category learning, posted transaction category, raw model response

**Historical Reclassification Preview**:
AI suggestions for active income and expense transactions categorized as Other, grouped by merchant and description. Preview does not write to the ledger. Confirmation revalidates the previewed revisions and appends immutable amendment revisions. Changed or voided transactions are skipped as individual conflicts without blocking the rest.
_Avoid_: automatic migration, in-place bulk update, reposting

### Screenshot submission identity

A client-generated operation ID bound to one user's ordered screenshot contents. The server stores a content digest and unique user/submission pair. Repeated or concurrent upload attempts recover the same recognition job; reusing an ID for different images is rejected. A completed automatic-posting retry returns the existing outcome. Older clients may omit this identity, while current web and mobile quick entry retain it across retries.

### Quick-entry and review continuity

Quick entry preserves drafts when switching modes or expanding details, asks before discarding edited fields, and supports an explicit post-and-continue option. Recent merchant templates fill descriptive fields without reusing the amount or transaction time. Android accepts one shared PNG/JPEG/WebP in memory, asks before recognition/posting, and reuses the guarded single-screenshot automatic path. App resume and successful mutations refresh ledger totals, pending work, and processed notification activity.

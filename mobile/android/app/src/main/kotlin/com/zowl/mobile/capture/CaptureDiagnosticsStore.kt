package com.zowl.mobile.capture

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class CaptureDiagnosticCounter(
    val platform: String,
    val parserId: String,
    val parserVersion: Int,
    val outcome: String,
    val reason: String?,
    val count: Long,
) {
    fun toStatusMap(): Map<String, Any?> =
        mapOf(
            "platform" to platform,
            "parserId" to parserId,
            "parserVersion" to parserVersion,
            "outcome" to outcome,
            "reason" to reason,
            "count" to count,
        )
}

class CaptureDiagnosticsStore(context: Context) {
    private val preferences =
        context.applicationContext.getSharedPreferences(
            PREFERENCES_NAME,
            Context.MODE_PRIVATE,
        )

    /** Structural counters only; never retain a node, page text, amount or QR code. */
    fun recordPageObservation(platform: String, reason: String) = synchronized(lock) {
        require(reason == REASON_PAGE_READABLE || reason == REASON_CHECKOUT || reason == REASON_PAYMENT_CODE_REMINDER)
        val counters = read().associateBy(::key).toMutableMap()
        increment(counters, CaptureDiagnosticCounter(platform, "${platform}_payment_page_v1", 1,
            OUTCOME_OBSERVED, reason, 0))
        write(counters.values.filter(::isRetained))
    }

    /**
     * Which unreadable windows were considered for automatic OCR, by simple Activity class name.
     * A code identifier only; at most [MAX_OCR_WINDOWS] distinct names are kept.
     */
    fun recordOcrWindow(platform: String, label: String, allowed: Boolean) = synchronized(lock) {
        val prefix = if (allowed) REASON_OCR_WINDOW_ALLOWED else REASON_OCR_WINDOW_SKIPPED
        val window = CaptureDiagnosticCounter(platform, PaymentPageOcrFacts.parserId(platform),
            PaymentPageOcrFacts.PARSER_VERSION, OUTCOME_OBSERVED, "$prefix$label", 0)
        write(withOcrWindow(read(), window).filter(::isRetained))
    }

    /** The embedded cashier's amount was read; the amount itself is not kept. */
    fun recordCashierAmount(platform: String, parserId: String = PaymentPageOcrFacts.parserId(platform)) = synchronized(lock) {
        CaptureTrace.d { "cashier amount read $platform parser=$parserId" }
        val counters = read().associateBy(::key).toMutableMap()
        increment(counters, CaptureDiagnosticCounter(platform, parserId,
            PaymentPageOcrFacts.PARSER_VERSION, OUTCOME_OBSERVED, REASON_CASHIER_AMOUNT, 0))
        write(counters.values.filter(::isRetained))
    }

    fun record(evaluation: PaymentNotificationEvaluation) =
        synchronized(lock) {
            CaptureTrace.d {
                when (evaluation) {
                    is PaymentNotificationEvaluation.Captured ->
                        "captured ${evaluation.platform} parser=${evaluation.parserId} merchant=${evaluation.payment.merchantName != null}"
                    is PaymentNotificationEvaluation.Rejected ->
                        "rejected ${evaluation.platform} parser=${evaluation.parserId} reason=${evaluation.reason.code}"
                }
            }
            val counters = read().associateBy(::key).toMutableMap()
            when (evaluation) {
                is PaymentNotificationEvaluation.Captured -> {
                    increment(
                        counters,
                        counterFor(
                            evaluation,
                            outcome = OUTCOME_ACCEPTED,
                            reason = null,
                        ),
                    )
                    if (evaluation.payment.merchantName == null) {
                        increment(
                            counters,
                            counterFor(
                                evaluation,
                                outcome = OUTCOME_ACCEPTED,
                                reason = REASON_MISSING_MERCHANT,
                            ),
                        )
                    }
                }
                is PaymentNotificationEvaluation.Rejected ->
                    increment(
                        counters,
                        counterFor(
                            evaluation,
                            outcome = OUTCOME_REJECTED,
                            reason = evaluation.reason.code,
                        ),
                    )
            }
            write(counters.values.filter(::isRetained))
        }

    fun snapshot(): List<CaptureDiagnosticCounter> =
        synchronized(lock) {
            val retained = read().filter(::isRetained)
            write(retained)
            retained.sortedWith(
                compareBy<CaptureDiagnosticCounter>(
                    { it.platform },
                    { -it.parserVersion },
                    { it.parserId },
                    { it.outcome },
                    { it.reason.orEmpty() },
                ),
            )
        }

    fun reset() =
        synchronized(lock) {
            preferences.edit().remove(COUNTERS).apply()
        }

    private fun counterFor(
        evaluation: PaymentNotificationEvaluation,
        outcome: String,
        reason: String?,
    ) = CaptureDiagnosticCounter(
        platform = evaluation.platform,
        parserId = evaluation.parserId,
        parserVersion = evaluation.parserVersion,
        outcome = outcome,
        reason = reason,
        count = 0,
    )

    private fun increment(
        counters: MutableMap<String, CaptureDiagnosticCounter>,
        counter: CaptureDiagnosticCounter,
    ) {
        val key = key(counter)
        val current = counters[key]
        counters[key] = counter.copy(count = (current?.count ?: 0L) + 1)
    }

    private fun read(): List<CaptureDiagnosticCounter> {
        val raw = preferences.getString(COUNTERS, null) ?: return emptyList()
        return runCatching {
            val values = JSONArray(raw)
            List(values.length()) { index ->
                val item = values.getJSONObject(index)
                CaptureDiagnosticCounter(
                    platform = item.getString("platform"),
                    parserId = item.getString("parserId"),
                    parserVersion = item.getInt("parserVersion"),
                    outcome = item.getString("outcome"),
                    reason =
                        item
                            .optString("reason")
                            .takeIf { it.isNotBlank() && it != "null" },
                    count = item.getLong("count"),
                )
            }.filter { it.count > 0 }
        }.getOrElse {
            preferences.edit().remove(COUNTERS).apply()
            emptyList()
        }
    }

    private fun write(counters: Collection<CaptureDiagnosticCounter>) {
        if (counters.isEmpty()) {
            preferences.edit().remove(COUNTERS).apply()
            return
        }
        val values = JSONArray()
        counters.forEach { counter ->
            values.put(
                JSONObject()
                    .put("platform", counter.platform)
                    .put("parserId", counter.parserId)
                    .put("parserVersion", counter.parserVersion)
                    .put("outcome", counter.outcome)
                    .put("reason", counter.reason ?: JSONObject.NULL)
                    .put("count", counter.count),
            )
        }
        preferences.edit().putString(COUNTERS, values.toString()).apply()
    }

    /** Counters of parsers this build no longer has (the retired notification parsers) are dropped. */
    private fun isRetained(counter: CaptureDiagnosticCounter): Boolean =
        counter.parserVersion == 1 &&
            (counter.parserId.endsWith("_payment_page_v1") || counter.parserId.endsWith("_payment_page_ocr_v1"))

    companion object {
        /**
         * [counters] with [window] counted once more and moved last. When more than
         * [MAX_OCR_WINDOWS] window names are kept, the ones seen longest ago go first: dropping
         * the least frequent instead discarded every newly seen window once the list was full.
         */
        internal fun withOcrWindow(
            counters: List<CaptureDiagnosticCounter>,
            window: CaptureDiagnosticCounter,
        ): List<CaptureDiagnosticCounter> {
            val byKey = LinkedHashMap<String, CaptureDiagnosticCounter>()
            counters.forEach { byKey[key(it)] = it }
            val previous = byKey.remove(key(window))
            byKey[key(window)] = window.copy(count = (previous?.count ?: 0L) + 1)
            byKey.values.filter { it.reason?.startsWith(REASON_OCR_WINDOW_PREFIX) == true }
                .dropLast(MAX_OCR_WINDOWS).forEach { byKey.remove(key(it)) }
            return byKey.values.toList()
        }

        private fun key(counter: CaptureDiagnosticCounter): String =
            listOf(
                counter.platform,
                counter.parserId,
                counter.parserVersion.toString(),
                counter.outcome,
                counter.reason.orEmpty(),
            ).joinToString("|")

        private val lock = Any()
        private const val PREFERENCES_NAME = "zemoney_payment_capture_diagnostics"
        private const val COUNTERS = "counters_v1"
        const val OUTCOME_ACCEPTED = "accepted"
        const val OUTCOME_REJECTED = "rejected"
        const val REASON_MISSING_MERCHANT = "missing_merchant"
        const val OUTCOME_OBSERVED = "observed"
        const val REASON_PAGE_READABLE = "page_text_readable"
        const val REASON_CHECKOUT = "checkout_observed"
        const val REASON_CASHIER_AMOUNT = "cashier_amount_read"
        const val REASON_PAYMENT_CODE_REMINDER = "payment_code_reminder"
        const val REASON_OCR_WINDOW_PREFIX = "ocr_window_"
        const val REASON_OCR_WINDOW_ALLOWED = "ocr_window_allowed:"
        const val REASON_OCR_WINDOW_SKIPPED = "ocr_window_skipped:"
        private const val MAX_OCR_WINDOWS = 16
    }
}

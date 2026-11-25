package com.zowl.mobile.capture

import java.math.BigDecimal
import java.math.RoundingMode

data class CapturedPayment(
    val idempotencyKey: String,
    val platform: String,
    val sourcePackage: String,
    val postedAt: String,
    val parserId: String,
    val parserVersion: Int,
    val evidenceDigest: String,
    val confidenceBasisPoints: Int,
    val amountMinor: Long,
    val merchantName: String?,
    /** The order pages around a shopping-app payment; only with item recognition on (ADR-0014). */
    val orderContext: OrderContext? = null,
)

enum class PaymentNotificationRejectionReason(
    val code: String,
) {
    EMPTY_CONTENT("empty_content"),
    EXCLUDED_SEMANTICS("excluded_semantics"),
    MISSING_AMOUNT("missing_amount"),
    INVALID_AMOUNT("invalid_amount"),
    MULTIPLE_AMOUNTS("multiple_amounts"),
    UNSUPPORTED_PAYMENT_PAGE("unsupported_payment_page"),
    REPEATED_PAYMENT_PAGE("repeated_payment_page"),
    PAGE_ROOT_UNAVAILABLE("page_root_unavailable"),
    PAGE_WINDOW_CHANGED("page_window_changed"),
    PAGE_READ_LIMIT("page_read_limit"),
    PAGE_READ_ERROR("page_read_error"),
    PAGE_SCREENSHOT_PROTECTED("page_screenshot_protected"),
    PAGE_SCREENSHOT_FAILED("page_screenshot_failed"),
}

sealed interface PaymentNotificationEvaluation {
    val platform: String
    val parserId: String
    val parserVersion: Int

    data class Captured(
        val payment: CapturedPayment,
    ) : PaymentNotificationEvaluation {
        override val platform: String = payment.platform
        override val parserId: String = payment.parserId
        override val parserVersion: Int = payment.parserVersion
    }

    data class Rejected(
        override val platform: String,
        override val parserId: String,
        override val parserVersion: Int,
        val reason: PaymentNotificationRejectionReason,
    ) : PaymentNotificationEvaluation
}

internal sealed interface AmountEvaluation {
    data class Valid(
        val amountMinor: Long,
    ) : AmountEvaluation

    data object Missing : AmountEvaluation

    data object Invalid : AmountEvaluation

    data object Multiple : AmountEvaluation
}

internal object PaymentParserSupport {
    const val MAX_AMOUNT_MINOR = 9_999_999_999L
    const val BROAD_AMOUNT = """\d[\d,.]*"""

    val whitespace = Regex("""\s+""")
    val amountPattern =
        Regex(
            """(?:人民币\s*|[¥￥]\s*)($BROAD_AMOUNT)(?![\d.])|""" +
                """(?<![\d.,])($BROAD_AMOUNT)(?![\d.])\s*元""",
        )

    fun amountTokens(material: String): List<String> =
        amountPattern.findAll(material).mapNotNull { match ->
            match.groupValues
                .drop(1)
                .firstOrNull(String::isNotBlank)
                ?.let(::trimTrailingPunctuation)
        }.toList()

    fun evaluateAmounts(tokens: List<String>): AmountEvaluation {
        if (tokens.isEmpty()) return AmountEvaluation.Missing
        val parsed = tokens.map(::toAmountMinor)
        if (parsed.any { it == null || it !in 1..MAX_AMOUNT_MINOR }) {
            return AmountEvaluation.Invalid
        }
        val distinct = parsed.filterNotNull().distinct()
        return when (distinct.size) {
            1 -> AmountEvaluation.Valid(distinct.single())
            else -> AmountEvaluation.Multiple
        }
    }

    fun rejectionFor(amount: AmountEvaluation): PaymentNotificationRejectionReason? =
        when (amount) {
            AmountEvaluation.Missing -> PaymentNotificationRejectionReason.MISSING_AMOUNT
            AmountEvaluation.Invalid -> PaymentNotificationRejectionReason.INVALID_AMOUNT
            AmountEvaluation.Multiple -> PaymentNotificationRejectionReason.MULTIPLE_AMOUNTS
            is AmountEvaluation.Valid -> null
        }

    fun cleanMerchant(value: String): String? {
        val cleaned =
            value
                .replace(Regex("""(?:支付|付款|交易)?成功.*$"""), "")
                .trim(' ', ':', '：', '-', '—')
                .take(120)
        return cleaned.ifBlank { null }
    }

    fun normalizeEvidenceField(value: String): String =
        whitespace.replace(value.replace(' ', ' '), " ").trim()

    private fun trimTrailingPunctuation(value: String): String {
        if (
            value.length >= 2 &&
            value.last() in charArrayOf(',', '.') &&
            value[value.lastIndex - 1].isDigit()
        ) {
            return value.dropLast(1)
        }
        return value
    }

    private val strictAmount =
        Regex("""^(?:\d{1,9}|\d{1,3}(?:,\d{3}){1,2})(?:\.\d{1,2})?$""")

    private fun toAmountMinor(value: String): Long? {
        if (!strictAmount.matches(value)) return null
        return runCatching {
            BigDecimal(value.replace(",", ""))
                .setScale(2, RoundingMode.UNNECESSARY)
                .movePointRight(2)
                .longValueExact()
        }.getOrNull()
    }
}

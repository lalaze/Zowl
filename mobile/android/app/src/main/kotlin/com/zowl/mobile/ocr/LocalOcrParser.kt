package com.zowl.mobile.ocr

import java.math.BigDecimal

/** Conservative hints for a manual form, never a payment-page/notification candidate. */
object LocalOcrParser {
    /** detail/lines/amounts are content-free hints for local diagnostics only. */
    data class Fields(val amount: String?, val merchant: String?, val warning: String?,
        val detail: String? = null, val lines: Int = 0, val amounts: Int = 0)
    private val successMarkers = listOf("支付成功", "付款成功", "交易成功")
    private val cjk = Regex("[\\u4e00-\\u9fff]")
    private val excluded = Regex("退款|转账|红包|账单详情|交易详情|交易单号|商户单号|支付时间|当前状态|交易关闭|支付失败|待支付|切换到按住说话|美元|港币|USD|HKD|[$€£]")
    // A line holding nothing but a two-decimal amount; OCR may drop the yen sign or read it as "Y".
    private val standalone = Regex("^[¥￥Yy]?\\s*([0-9]+\\.[0-9]{2})$")

    // The heading must stand alone on its line. OCR commonly turns the brand icon beside it
    // into one or two stray symbols or Latin letters, so those are tolerated; CJK text is not.
    private fun isSuccessLine(line: String): Boolean {
        val compact = line.filterNot(Char::isWhitespace)
        return successMarkers.any { marker ->
            val at = compact.indexOf(marker)
            if (at < 0) return@any false
            val before = compact.substring(0, at)
            val after = compact.substring(at + marker.length)
            before.length <= 2 && after.length <= 2 && !cjk.containsMatchIn(before + after)
        }
    }
    private val decimal = Regex("[0-9]+\\.[0-9]{2}(?![0-9])")
    private val money = Regex("(?:[¥￥]\\s*([0-9]+(?:\\.[0-9]{1,2})?)(?![0-9.,])|(?<![0-9.,])([0-9]+(?:\\.[0-9]{1,2})?)\\s*元)")
    private val labelled = Regex("(?:实付金额|支付金额|付款金额|实付款|实付)[：:\\s]*([0-9]+(?:\\.[0-9]{1,2})?)(?![0-9.,])")
    private val merchant = Regex("^(?:商户名称|收款商户|收款方)[：:]\\s*(.{1,120})$")
    // WeChat's result page for a transfer awaiting receipt names only the payee.
    private val pendingPayee = Regex("^待\\s*(.{1,60}?)\\s*确认收款$")

    private fun amountValues(text: String, lines: List<String>): Set<String> =
        (money.findAll(text).map { it.groupValues[1].ifEmpty { it.groupValues[2] } } +
            labelled.findAll(text).map { it.groupValues[1] } +
            lines.mapNotNull { standalone.matchEntire(it)?.groupValues?.get(1) })
            .mapNotNull { it.toBigDecimalOrNull()?.setScale(2)?.toPlainString() }.toSet()

    private fun lines(text: String) = text.lines().map(String::trim).filter(String::isNotEmpty)

    /** A success heading standing alone on its line, whatever else the page shows. */
    fun hasSuccessHeading(text: String): Boolean = text.length <= 12_000 && lines(text).any(::isSuccessLine)

    /** Content-free outline of recognised text, for developer tracing only. */
    fun shape(text: String): String {
        val lines = lines(text)
        return "chars=${text.length} lines=${lines.size} amounts=${amountValues(text, lines).size} " +
            "numbers=${decimal.findAll(text).count()} success=${lines.any(::isSuccessLine)} " +
            "excluded=${excluded.containsMatchIn(text)}"
    }

    // A cashier's offer: "有立减0.50元可选" under the amount. Not what is charged.
    private val offer = Regex("减|优惠|红包|抵扣|返现|券|可选")

    /** A cashier's text without its offer lines; the amount it charges stands on a line of its own. */
    fun withoutOffers(text: String): String = text.lines().filterNot(offer::containsMatchIn).joinToString("\n")

    /** How many offer lines [withoutOffers] drops, for developer tracing only. */
    fun offerLines(text: String): Int = text.lines().count(offer::containsMatchIn)

    /** How many distinct amounts a page shows. */
    fun amountCount(text: String): Int = amountValues(text, lines(text)).size

    /** The one amount a page shows, in yuan with two decimals; null when it shows none or several. */
    fun singleAmount(text: String): String? {
        if (text.length > 12_000) return null
        return amountValues(text, lines(text)).singleOrNull()
            ?.takeIf { it.toBigDecimal() > BigDecimal.ZERO && it.toBigDecimal() <= BigDecimal("99999999.99") }
    }

    fun parse(text: String): Fields {
        if (text.isBlank()) return Fields(null, null, "empty_text")
        if (text.length > 12_000) return Fields(null, null, "too_much_text")
        val lines = lines(text)
        if (lines.none(::isSuccessLine)) return Fields(null, null, "unsupported_page", "no_success_marker", lines.size)
        if (excluded.containsMatchIn(text)) return Fields(null, null, "unsupported_page", "excluded_content", lines.size)
        val values = amountValues(text, lines)
        // Discounts/balances are deliberately not ranked: multiple amounts require manual entry.
        val amount = values.singleOrNull()?.takeIf { it.toBigDecimal() > BigDecimal.ZERO && it.toBigDecimal() <= BigDecimal("99999999.99") }
        val merchants = lines.mapNotNull {
            (merchant.matchEntire(it) ?: pendingPayee.matchEntire(it))?.groupValues?.get(1)?.trim()?.ifBlank { null }
        }.toSet()
        return Fields(amount, merchants.singleOrNull(), when {
            values.size > 1 -> "multiple_amounts"
            amount == null -> "missing_amount"
            else -> null
        }, null, lines.size, values.size)
    }
}

package com.zowl.mobile.capture

import java.security.MessageDigest
import java.time.Instant

/** Narrow success-page adapter. No OCR, navigation, or historical bill parsing. */
object PaymentPageParser {
    const val ALIPAY_PACKAGE = "com.eg.android.AlipayGphone"
    const val WECHAT_PACKAGE = "com.tencent.mm"
    const val TAOBAO_PACKAGE = "com.taobao.taobao"
    const val PINDUODUO_PACKAGE = "com.xunmeng.pinduoduo"
    const val JD_PACKAGE = "com.jingdong.app.mall"
    const val PUPU_PACKAGE = "com.pupumall.customer"

    /** Every capture source, in the order the settings list them. */
    val platforms = listOf("alipay", "wechat", "taobao", "pinduoduo", "jd", "pupu")
    private val shopping = setOf("jd")
    // Captured from their checkout and a later confirmation, not from one success page.
    private val checkoutFlow = setOf("taobao", "pinduoduo", "pupu")

    private val success = setOf("支付成功", "付款成功")
    private val terminal = setOf("完成", "完成支付", "返回商家", "返回商户")
    private val excluded = listOf(
        "账单详情", "交易详情", "订单详情", "退款", "转账", "红包", "收款成功", "支付失败", "待支付",
        "按住说话", "聊天信息", "发送消息", "美元", "港币", "欧元", "日元", "USD", "HKD", "EUR", "JPY", "$", "€",
    )
    private val amountLabels = listOf("实付金额", "付款金额", "支付金额", "实付款")
    private val merchantLabels = listOf("商户全称", "商户名称", "收款方", "收款商户")

    fun platform(packageName: String): String? = when (packageName) {
        ALIPAY_PACKAGE -> "alipay"
        WECHAT_PACKAGE -> "wechat"
        TAOBAO_PACKAGE -> "taobao"
        PINDUODUO_PACKAGE -> "pinduoduo"
        JD_PACKAGE -> "jd"
        PUPU_PACKAGE -> "pupu"
        else -> null
    }

    /**
     * A shopping app follows its result with a feed of other goods, which can exceed the read
     * budget. Its pages are judged on the result block alone, so a cut-off feed is not an error.
     * Pupu's completion page is followed by such a feed too; its heading comes first.
     */
    fun readsPartialPages(platform: String): Boolean = platform in shopping || platform == "pupu"

    /**
     * Taobao is captured from its embedded cashier and the result page that follows, not from a
     * success page (see [ShoppingCashierFlow]); its other readable pages are ignored.
     */
    fun readsPageText(platform: String): Boolean = platform != "taobao"

    /** The order panel's amount, confirmed by the paid notice (see [pinduoduoPage], [pupuPage]). */
    fun usesOrderPanel(platform: String): Boolean = platform == "pinduoduo" || platform == "pupu"

    /** How long an order panel's amount waits for its paid notice. Pupu may send the user to Alipay or WeChat first. */
    fun confirmWindow(platform: String): Long =
        if (platform == "pupu") PUPU_CONFIRM_WINDOW else ShoppingCashierFlow.CONFIRM_WINDOW

    private const val PUPU_CONFIRM_WINDOW = 180_000L

    /** Pupu is one seller, so its orders name it; its own completion page shows no merchant. */
    private const val PUPU_MERCHANT = "朴朴"

    /**
     * The merchant of a payment, given whether a Pupu order of exactly this amount waits to be paid.
     * Alipay and WeChat mask the seller's name ("某***公司"), which no category rule can recognise.
     * Another amount is another payment: an order left unpaid does not name it.
     */
    fun merchantName(platform: String, shown: String?, pupuOrderWaits: Boolean): String? = when (platform) {
        "pupu" -> PUPU_MERCHANT
        "alipay", "wechat" -> if (pupuOrderWaits) PUPU_MERCHANT else shown
        else -> shown
    }

    /** Nodes, characters and depth one read may take. Pupu (React Native) draws its pay bar last and deep. */
    data class ReadBudget(val nodes: Int, val characters: Int, val depth: Int)

    fun readBudget(platform: String): ReadBudget =
        if (platform == "pupu") ReadBudget(1_200, 12_000, 80) else ReadBudget(320, 6_000, 32)

    /** What a page of a platform that [usesOrderPanel] contributes. */
    fun orderPage(platform: String, texts: List<String>): PinduoduoPage =
        if (platform == "pupu") pupuPage(texts) else pinduoduoPage(texts)

    /** Content-free outline of what [orderPage] looked at, for developer tracing only. */
    fun orderPageShape(platform: String, texts: List<String>): String =
        if (platform == "pupu") pupuShape(texts) else pinduoduoShape(texts)

    fun isCheckout(texts: List<String>, platform: String? = null): Boolean {
        val lines = normalized(texts)
        if (platform in shopping) {
            return lines.none(::isShoppingSuccess) &&
                lines.any { line -> shoppingCheckout.any(line::startsWith) }
        }
        val paymentCode = lines.contains("向商家付款") ||
            (lines.any { it == "付款码" || it == "收付款" } &&
                lines.any { it == "请向商家出示付款码" || it == "优先使用此支付方式付款" })
        return lines.none { it in success || excluded.any(it::contains) } &&
            (paymentCode || lines.any { it in setOf("确认付款", "立即付款", "确认支付", "收银台", "支付方式") })
    }

    fun evaluate(
        packageName: String,
        texts: List<String>,
        capturedAt: Long,
        sessionId: String,
        installationId: String,
        partial: Boolean = false,
    ): PaymentNotificationEvaluation? {
        val platform = platform(packageName)?.takeIf { it !in checkoutFlow } ?: return null
        val parserId = "${platform}_payment_page_v1"
        fun reject(reason: PaymentNotificationRejectionReason) =
            PaymentNotificationEvaluation.Rejected(platform, parserId, 1, reason)
        val lines = normalized(texts)
        if (lines.isEmpty()) return reject(PaymentNotificationRejectionReason.EMPTY_CONTENT)
        if (platform in shopping) {
            // Position matters here, so repeated lines are kept where they are.
            val ordered = texts.map(PaymentParserSupport::normalizeEvidenceField).filter(String::isNotBlank)
            val block = when (val read = shoppingResult(ordered, partial)) {
                is ShoppingResult.Rejected -> return reject(read.reason)
                is ShoppingResult.Block -> read
            }
            return PaymentNotificationEvaluation.Captured(
                CapturedPayment(
                    idempotencyKey = digest("$installationId|$packageName|payment-page|$sessionId"),
                    platform = platform,
                    sourcePackage = packageName,
                    postedAt = Instant.ofEpochMilli(capturedAt).toString(),
                    parserId = parserId,
                    parserVersion = 1,
                    // The feed below the result changes on every visit; only the result is evidence.
                    evidenceDigest = digest(block.evidence.joinToString("\n")),
                    confidenceBasisPoints = 9_000,
                    amountMinor = block.amountMinor,
                    // The page names the shop inconsistently or not at all; nothing is guessed.
                    merchantName = null,
                ),
            )
        }
        // A cut-off tree can hide a second amount or a failure/refund marker.
        if (partial) return reject(PaymentNotificationRejectionReason.PAGE_READ_LIMIT)
        if (lines.any { line -> excluded.any(line::contains) }) {
            return reject(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS)
        }
        if (lines.none { it in success } || lines.none { it in terminal }) {
            return reject(PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE)
        }
        val labelled = valuesForLabels(lines, amountLabels)
        val tokens = if (labelled.isEmpty()) {
            lines.flatMapIndexed { index, line ->
                if (line in setOf("¥", "￥", "人民币")) {
                    PaymentParserSupport.amountTokens(line + lines.getOrNull(index + 1).orEmpty())
                } else PaymentParserSupport.amountTokens(line)
            }
        } else {
            labelled.flatMap { value ->
                PaymentParserSupport.amountTokens(value).ifEmpty {
                    listOf(value.trim().removePrefix("¥").removePrefix("￥").trim())
                }
            }
        }
        val amount = PaymentParserSupport.evaluateAmounts(tokens)
        PaymentParserSupport.rejectionFor(amount)?.let { return reject(it) }
        amount as AmountEvaluation.Valid
        val merchants = valuesForLabels(lines, merchantLabels)
            .mapNotNull(PaymentParserSupport::cleanMerchant)
            .filterNot { it in success || it in terminal || PaymentParserSupport.amountTokens(it).isNotEmpty() }
            .distinct()
        val merchant = merchants.singleOrNull()
        return PaymentNotificationEvaluation.Captured(
            CapturedPayment(
                idempotencyKey = digest("$installationId|$packageName|payment-page|$sessionId"),
                platform = platform,
                sourcePackage = packageName,
                postedAt = Instant.ofEpochMilli(capturedAt).toString(),
                parserId = parserId,
                parserVersion = 1,
                evidenceDigest = digest(lines.joinToString("\n")),
                confidenceBasisPoints = if (merchant == null) 9_000 else 9_500,
                amountMinor = amount.amountMinor,
                merchantName = merchant,
            ),
        )
    }

    /** What an order page contributes: Pinduoduo's, from device samples, and Pupu's (ADR-0012). */
    sealed interface PinduoduoPage {
        /** The order panel; the amount is the first one above zero on its submit button. */
        data class OrderPanel(val amountMinor: Long) : PinduoduoPage
        /** The same panel while it reports the order as done, before the notice replaces it. */
        data class PaidPanel(val amountMinor: Long) : PinduoduoPage
        /** The notice shown once the order has gone through. It carries no usable amount. */
        data object Paid : PinduoduoPage
        /** A pay button with several amounts by it: what it charges is not known. Pupu only. */
        data object Ambiguous : PinduoduoPage
        data object Other : PinduoduoPage
    }

    private const val PINDUODUO_METHOD_LINE = "更换支付方式"
    // "已支付"/"支付成功" for an order charged now, "下单成功" for a pay-later order. By the owner's
    // choice a pay-later order is recorded when it is placed, though it is charged on receipt.
    private val pinduoduoDone = setOf("已支付", "支付成功", "下单成功")
    private fun isPinduoduoDone(line: String) = line in pinduoduoDone || line.startsWith("下单成功，")
    private const val PINDUODUO_BUTTON_LINES = 3

    /**
     * The panel lists a price per option, discounts and a struck-through price, so the amount is
     * taken only from the submit button: the text right after the payment-method line, where the
     * amount to pay comes first ("仅 ¥45.67 ¥52.9") or after a zero ("0元下单，确认收货后付款 ¥16.5").
     */
    fun pinduoduoPage(texts: List<String>): PinduoduoPage {
        val lines = texts.map(PaymentParserSupport::normalizeEvidenceField).filter(String::isNotBlank)
        val method = lines.indexOfLast { it.contains(PINDUODUO_METHOD_LINE) }
        if (method < 0) return if (lines.any(::isPinduoduoDone)) PinduoduoPage.Paid else PinduoduoPage.Other
        // Put split prices back together before cutting, so a cut can never halve an amount.
        val button = joinSplitAmounts(lines.subList(method + 1, lines.size)).take(PINDUODUO_BUTTON_LINES)
        val amount = button.flatMap(PaymentParserSupport::amountTokens)
            .firstNotNullOfOrNull { PaymentParserSupport.evaluateAmounts(listOf(it)) as? AmountEvaluation.Valid }
            ?: return PinduoduoPage.Other
        return if (lines.any(::isPinduoduoDone)) PinduoduoPage.PaidPanel(amount.amountMinor)
        else PinduoduoPage.OrderPanel(amount.amountMinor)
    }

    /** Content-free outline of what [pinduoduoPage] looked at, for developer tracing only. */
    fun pinduoduoShape(texts: List<String>): String {
        val lines = texts.map(PaymentParserSupport::normalizeEvidenceField).filter(String::isNotBlank)
        val method = lines.indexOfLast { it.contains(PINDUODUO_METHOD_LINE) }
        fun outline(line: String) = "len=${line.length},amounts=${PaymentParserSupport.amountTokens(line).size}," +
            "done=${isPinduoduoDone(line)}"
        val tail = if (method < 0) emptyList() else joinSplitAmounts(lines.subList(method + 1, lines.size)).take(PINDUODUO_BUTTON_LINES + 2)
        return "lines=${lines.size} doneLine=${lines.any(::isPinduoduoDone)} doneWord=${lines.count { l -> pinduoduoDone.any(l::contains) }} " +
            "method=${if (method < 0) "none" else outline(lines[method])} after=${tail.map(::outline)}"
    }

    // Pupu's wording is from its own bundle (6.7.5): the checkout's pay button, and the heading or
    // title of the page it opens once the order is paid. That page shows prices of other goods, so
    // the amount is the checkout's. Not yet checked on a device: see ADR-0012.
    private val pupuPayButton = setOf("去支付", "免密支付", "立即支付")
    private val pupuDone = setOf("支付完成", "支付成功")
    private val pupuNotDone = setOf("支付失败", "待支付", "重新支付", "继续支付")
    private val pupuDiscount = Regex("优惠|减|省|红包|券|返|抵扣|[-−–]\\s*[¥￥]")
    private const val PUPU_BAR_LINES = 4

    /** The joined lines right before the pay button, discounts left out; null without one such button. */
    private fun pupuBar(lines: List<String>): List<String>? {
        val button = lines.indexOfLast { it in pupuPayButton }
        if (button < 0) return null
        return joinSplitAmounts(lines.subList(0, button)).filterNot(pupuDiscount::containsMatchIn).takeLast(PUPU_BAR_LINES)
    }

    /** The checkout's one amount by its pay button, or whether its completion page is shown. */
    fun pupuPage(texts: List<String>): PinduoduoPage {
        val lines = texts.map(PaymentParserSupport::normalizeEvidenceField).filter(String::isNotBlank)
        val bar = pupuBar(lines)
        if (bar == null) {
            return if (lines.any { it in pupuDone } && lines.none { it in pupuNotDone }) PinduoduoPage.Paid
            else PinduoduoPage.Other
        }
        // Unpaid orders in a list each have their own button.
        if (lines.count { it in pupuPayButton } > 1) return PinduoduoPage.Ambiguous
        return when (val amount = PaymentParserSupport.evaluateAmounts(bar.flatMap(PaymentParserSupport::amountTokens))) {
            is AmountEvaluation.Valid -> PinduoduoPage.OrderPanel(amount.amountMinor)
            AmountEvaluation.Multiple -> PinduoduoPage.Ambiguous
            else -> PinduoduoPage.Other
        }
    }

    /** Content-free outline of what [pupuPage] looked at, for developer tracing only. */
    fun pupuShape(texts: List<String>): String {
        val lines = texts.map(PaymentParserSupport::normalizeEvidenceField).filter(String::isNotBlank)
        fun outline(line: String) = "len=${line.length},amounts=${PaymentParserSupport.amountTokens(line).size}," +
            "discount=${pupuDiscount.containsMatchIn(line)}"
        val button = lines.indexOfLast { it in pupuPayButton }
        val before = if (button < 0) emptyList() else joinSplitAmounts(lines.subList(0, button)).takeLast(PUPU_BAR_LINES + 2)
        val after = if (button < 0) emptyList() else joinSplitAmounts(lines.subList(button + 1, lines.size)).take(3)
        return "lines=${lines.size} buttons=${lines.count { it in pupuPayButton }} " +
            "buttonWord=${lines.count { l -> pupuPayButton.any(l::contains) }} paying=${lines.any { it.startsWith("免密支付中") }} " +
            "doneLine=${lines.any { it in pupuDone }} doneWord=${lines.count { l -> pupuDone.any(l::contains) }} " +
            "notDone=${lines.any { it in pupuNotDone }} order=${lines.any { it == "订单详情" || it == "查看订单" }} " +
            "before=${before.map(::outline)} after=${after.map(::outline)}"
    }

    // JD is still read as one success page. Written from the page's usual wording, not yet
    // checked on a device: see ADR-0012.
    private val shoppingSuccess = setOf("支付成功", "付款成功", "订单支付成功")
    private val shoppingTerminal = setOf(
        "完成", "查看订单", "查看订单详情", "订单详情", "返回首页", "回到首页", "继续逛逛", "继续购物",
    )
    private val shoppingFailure = setOf("支付失败", "付款失败", "支付未完成", "支付已取消")
    private val shoppingForeign = listOf("美元", "港币", "欧元", "日元", "USD", "HKD", "EUR", "JPY", "$", "€")
    // Longest first, so "实付款" is not read as "实付" followed by "款".
    private val shoppingAmountLabels = listOf("实付金额", "支付金额", "付款金额", "订单金额", "实付款", "实付")
    private val shoppingCheckout = listOf(
        "提交订单", "确认订单", "立即支付", "立即付款", "确认支付", "确认付款", "去支付", "继续支付", "继续付款", "收银台",
    )
    private val fraction = Regex("""^\.\d{1,2}$""")
    private val currencySign = setOf("¥", "￥", "人民币")
    private const val TITLE_BAR_BLOCK_LINES = 4

    private sealed interface ShoppingResult {
        data class Block(val amountMinor: Long, val evidence: List<String>) : ShoppingResult
        data class Rejected(val reason: PaymentNotificationRejectionReason) : ShoppingResult
    }

    private fun isShoppingSuccess(line: String) = line.trimEnd('!', '！', '。') in shoppingSuccess

    /**
     * The result block is what follows the success heading, up to the first "view order" or
     * "back to home" control after it. Prices of other goods further down are never read as the
     * paid amount: the block must itself hold exactly one amount, or one explicitly labelled as paid.
     */
    private fun shoppingResult(lines: List<String>, partial: Boolean): ShoppingResult {
        val heading = lines.indexOfFirst(::isShoppingSuccess)
        if (heading < 0) return ShoppingResult.Rejected(PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE)
        if (lines.any { it in shoppingFailure }) {
            return ShoppingResult.Rejected(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS)
        }
        val terminal = (heading + 1..lines.lastIndex).firstOrNull { lines[it] in shoppingTerminal }
        val end = when {
            terminal != null -> terminal
            // A "done" control in the title bar comes first; the block is then the few lines
            // under the heading, and any feed price among them makes the amount ambiguous.
            lines.take(heading).any { it in shoppingTerminal } -> minOf(heading + 1 + TITLE_BAR_BLOCK_LINES, lines.size)
            // The control that closes the block may be what a cut-off read did not reach.
            partial -> return ShoppingResult.Rejected(PaymentNotificationRejectionReason.PAGE_READ_LIMIT)
            else -> return ShoppingResult.Rejected(PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE)
        }
        val block = joinSplitAmounts(lines.subList(heading + 1, end))
        if (block.any { line -> shoppingForeign.any(line::contains) }) {
            return ShoppingResult.Rejected(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS)
        }
        val labelled = block.flatMapIndexed { index, line ->
            val label = shoppingAmountLabels.firstOrNull(line::startsWith) ?: return@flatMapIndexed emptyList()
            val inline = line.removePrefix(label).trimStart(':', '：', ' ')
            val value = inline.ifBlank { block.getOrNull(index + 1).orEmpty() }
            PaymentParserSupport.amountTokens(value).ifEmpty { listOf(value.trim()) }
        }
        val tokens = labelled.ifEmpty { block.flatMap(PaymentParserSupport::amountTokens) }
        val amount = PaymentParserSupport.evaluateAmounts(tokens)
        PaymentParserSupport.rejectionFor(amount)?.let { return ShoppingResult.Rejected(it) }
        return ShoppingResult.Block(
            (amount as AmountEvaluation.Valid).amountMinor,
            listOf(lines[heading]) + block,
        )
    }

    /** A price is often drawn as separate pieces ("¥", "128", ".00"); put them back together. */
    private fun joinSplitAmounts(lines: List<String>): List<String> {
        val joined = ArrayList<String>()
        var index = 0
        while (index < lines.size) {
            var line = lines[index++]
            if (line in currencySign && index < lines.size) line += lines[index++]
            if (line.lastOrNull()?.isDigit() == true && lines.getOrNull(index)?.let(fraction::matches) == true) {
                line += lines[index++]
            }
            joined += line
        }
        return joined
    }

    private fun normalized(texts: List<String>) = texts.map(PaymentParserSupport::normalizeEvidenceField)
        .filter(String::isNotBlank).distinct()

    private fun valuesForLabels(lines: List<String>, labels: List<String>): List<String> =
        lines.flatMapIndexed { index, line ->
            labels.mapNotNull { label ->
                when {
                    line.trimEnd(':', '：') == label -> lines.getOrNull(index + 1)
                    line.startsWith("$label：") || line.startsWith("$label:") ->
                        line.substring(label.length + 1).trim().ifBlank { null }
                    else -> null
                }
            }
        }

    private fun digest(value: String) = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}

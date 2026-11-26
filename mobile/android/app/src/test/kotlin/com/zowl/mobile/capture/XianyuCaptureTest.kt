package com.zowl.mobile.capture

import com.zowl.mobile.ocr.LocalOcrParser
import org.junit.Assert.*
import org.junit.Test

/**
 * Xianyu's embedded Alipay cashier, overlay closing, Alipay-app detour under risk control,
 * and Xianyu's own result page. [Flow] mirrors how PaymentAccessibilityService feeds the pure
 * classes; texts and amounts are made up.
 */
class XianyuCaptureTest {
    private val msp = "com.alipay.android.msp.ui.views.MspContainerActivity"
    private val fingerprint = "com.alipay.android.msp.ui.widget.FpFullViewCompatDialog"
    private val flutter = "com.idlefish.flutterbridge.flutterboost.boost.FishFlutterBoostActivity"
    private val flutterTransparent = "com.idlefish.flutterbridge.flutterboost.boost.FishFlutterBoostTransparencyActivity"
    private val cashierDialog = "com.idlefish.flutterbridge.AIOService.ApiService.handlers.cashier.CashierDialogActivity"
    private val mainActivity = "com.taobao.idlefish.maincontainer.activity.MainActivity"
    private val detailActivity = "com.taobao.idlefish.detail.DetailActivity"
    private val alipayHome = "com.eg.android.AlipayGphone.AlipayLogin"
    private val dialog = "android.app.Dialog"
    private val alipayActivities = setOf(msp, alipayHome)

    private val cashierText = "闲鱼订单\n¥35.00\n有立减0.50元可选\n储蓄卡\n使用指纹支付"
    private val cashierPaidText = "闲鱼订单\n¥35.00\n付款成功"
    private val alipayCashierText = "订单信息\n¥34.50\n付款方式\n储蓄卡"
    private val alipayResultLines = listOf("支付成功", "¥34.50", "收款方", "示例卖家", "完成")

    private data class Recorded(val platform: String, val amountMinor: Long, val parserId: String)

    private class Flow(private val alipayActivities: Set<String>) {
        var now = 0L
        val xianyuDialogs = CashierOverlayDialogs("xianyu") { now }
        val alipayDialogs = CashierOverlayDialogs("alipay") { now }
        val xianyuCashier = ShoppingCashierFlow(PaymentPageParser.confirmWindow("xianyu")) { now }
        val alipayCashier = ShoppingCashierFlow(PaymentPageParser.confirmWindow("alipay")) { now }
        val ocrSessions = PaymentPageOcrSessions { now }
        val windowClasses = HashMap<Int, String>()
        val recorded = mutableListOf<Recorded>()

        private fun ocrRole(platform: String, windowId: Int): PaymentPageOcrGate.Role? =
            PaymentPageOcrGate.role(platform, windowClasses[windowId])
                ?: PaymentPageOcrGate.Role.RESULT.takeIf { platform == "xianyu" && xianyuDialogs.isResultWindow(windowId) }
                ?: PaymentPageOcrGate.Role.OVERLAY.takeIf { platform == "alipay" && alipayDialogs.isResultWindow(windowId) }

        private fun settle(platform: String, amountMinor: Long, parserId: String) {
            recorded += Recorded(platform, amountMinor, parserId)
            when (platform) {
                "alipay" -> {
                    xianyuCashier.clear()
                    xianyuDialogs.onCashierActive()
                }
                "xianyu" -> {
                    alipayCashier.clear()
                    alipayDialogs.onCashierActive()
                }
            }
        }

        fun state(platform: String, windowId: Int, className: String) {
            if (platform == "xianyu") {
                val closed = xianyuDialogs.onWindowState(windowId, className)
                if (closed) {
                    xianyuCashier.onResultSuccess()?.let {
                        settle("xianyu", it.amountMinor, "xianyu_payment_page_v1")
                    }
                }
            } else if (platform == "alipay") {
                val screen = PaymentPageOcrGate.isAppClass(className) && className in alipayActivities
                val closed = alipayDialogs.onWindowState(windowId, className, screen, screensKnown = true)
                if (closed) {
                    alipayCashier.onResultSuccess()?.let {
                        settle("alipay", it.amountMinor, "alipay_payment_page_v1")
                    }
                }
            }
            if (PaymentPageOcrGate.isAppClass(className)) {
                if (ocrRole(platform, windowId) == null || PaymentPageOcrGate.allows(platform, className)) {
                    windowClasses[windowId] = className
                }
            }
        }

        fun nodes(platform: String, windowId: Int, texts: List<String>, partial: Boolean = false) {
            val chars = texts.sumOf { it.count { c -> !c.isWhitespace() } }
            val joined = texts.joinToString("\n")
            if (platform == "xianyu") {
                xianyuDialogs.onWindowRead(windowId, chars, recognised = false)
                if (texts.isNotEmpty() && ocrRole("xianyu", windowId) == PaymentPageOcrGate.Role.CASHIER) {
                    xianyuDialogs.onCashierActive()
                }
                if (texts.isNotEmpty() && !partial && ocrRole("xianyu", windowId) == PaymentPageOcrGate.Role.CASHIER) {
                    val clean = LocalOcrParser.withoutOffers(joined)
                    val fields = LocalOcrParser.parse(clean)
                    val amount = PaymentPageOcrFacts.amountMinor(fields)
                    if (fields.warning == null && amount != null) {
                        if (ocrSessions.onSuccessPage(windowId, amount) != null) {
                            xianyuCashier.onCashierSettled(windowId)
                            settle("xianyu", amount, "xianyu_payment_page_v1")
                        }
                    } else {
                        LocalOcrParser.singleAmount(clean)?.let(PaymentPageOcrFacts::minor)?.let {
                            xianyuCashier.onCashierAmount(windowId, it)
                        }
                    }
                } else if (ocrRole("xianyu", windowId) == null &&
                    XianyuCashierConfirmation.awaits(xianyuCashier, alipayCashier, PaymentPageParser.confirmWindow("xianyu"))
                ) {
                    if (PaymentPageParser.xianyuPage(texts) == PaymentPageParser.XianyuPage.Paid) {
                        XianyuCashierConfirmation.confirm(
                            xianyuCashier,
                            alipayCashier,
                            PaymentPageParser.confirmWindow("xianyu"),
                        )?.let { settle("xianyu", it.amountMinor, "xianyu_payment_page_v1") }
                    }
                }
            } else if (platform == "alipay") {
                alipayDialogs.onWindowRead(windowId, chars, recognised = false)
                if (texts.isNotEmpty() && alipayDialogs.isCashierWindow(windowId)) {
                    alipayDialogs.onCashierActive()
                    if (!partial) AlipayCashierText.apply(alipayCashier, windowId, joined)
                }
                val paid = alipayCashier.paidInCashier(windowId)
                val evaluation = PaymentPageParser.evaluate(
                    PaymentPageParser.ALIPAY_PACKAGE,
                    texts,
                    1_784_100_000_000L,
                    "session-1",
                    "device-1",
                    partial,
                    paid,
                )
                if (evaluation is PaymentNotificationEvaluation.Captured) {
                    alipayCashier.onPageCaptured(windowId)
                    alipayDialogs.onCashierActive()
                    settle("alipay", evaluation.payment.amountMinor, evaluation.parserId)
                }
            } else if (platform == "wechat") {
                // WeChat capture does not touch Xianyu's waiting amount.
                settle("wechat", 1_000L, "wechat_payment_page_v1")
            }
        }

        fun recognised(platform: String, windowId: Int, text: String) {
            val chars = text.count { !it.isWhitespace() }
            if (platform == "xianyu") {
                xianyuDialogs.onWindowRead(windowId, chars, recognised = true)
            } else if (platform == "alipay") {
                alipayDialogs.onWindowRead(windowId, chars, recognised = true)
            }
        }
    }

    @Test fun xianyuPlatformCapabilitiesAndOcrGateRules() {
        assertEquals("xianyu", PaymentPageParser.platform("com.taobao.idlefish"))
        assertEquals("xianyu", PaymentPageParser.platforms.last())
        assertTrue(PaymentPageParser.usesEmbeddedCashier("xianyu"))
        assertTrue(PaymentPageParser.usesEmbeddedCashier("taobao"))
        assertFalse(PaymentPageParser.readsPageText("xianyu"))
        assertTrue(PaymentPageParser.readsPartialPages("xianyu"))
        assertFalse(PaymentPageParser.usesOrderPanel("xianyu"))
        assertEquals(180_000L, PaymentPageParser.confirmWindow("xianyu"))
        assertFalse(OrderContextBuffer.collects("xianyu"))
        assertNull(PaymentPageParser.merchantName("xianyu", null, pupuOrderWaits = true))
        assertNull(PaymentPageParser.evaluate(
            PaymentPageParser.XIANYU_PACKAGE,
            listOf("支付成功", "¥35.00", "完成"),
            1_784_100_000_000L,
            "s",
            "d",
        ))
        // OCR gate admits only the embedded Alipay cashier, never Xianyu's Flutter or app screens.
        assertEquals(PaymentPageOcrGate.Role.CASHIER, PaymentPageOcrGate.role("xianyu", msp))
        assertEquals(PaymentPageOcrGate.Role.CASHIER, PaymentPageOcrGate.role("xianyu", fingerprint))
        listOf(flutter, flutterTransparent, cashierDialog, mainActivity, detailActivity, null).forEach {
            assertNull(it.toString(), PaymentPageOcrGate.role("xianyu", it))
            assertFalse(it.toString(), PaymentPageOcrGate.allows("xianyu", it))
        }
        assertFalse(PaymentPageOcrGate.isMerchantCashDesk("xianyu", "com.taobao.tao.alipay.cashdesk.CashDeskActivity"))
    }

    @Test fun embeddedCashierSuccessWithOneAmountCapturesOnce() {
        val flow = Flow(alipayActivities)
        with(flow) {
            state("xianyu", 10, flutter)
            state("xianyu", 11, cashierDialog)
            state("xianyu", 12, msp)
            nodes("xianyu", 12, cashierText.lines())
            now += 800
            nodes("xianyu", 12, cashierPaidText.lines())
            // Repeated read of the same cashier window and a subsequent result page add nothing.
            nodes("xianyu", 12, cashierPaidText.lines())
            state("xianyu", 13, flutter)
            nodes("xianyu", 13, listOf("支付成功", "查看订单", "¥99.00"))
        }
        assertEquals(listOf(Recorded("xianyu", 3_500L, "xianyu_payment_page_v1")), flow.recorded)
    }

    @Test fun embeddedCashierClosingWithTextFreeOverlayCapturesOnce() {
        val flow = Flow(alipayActivities)
        with(flow) {
            state("xianyu", 20, flutter)
            state("xianyu", 21, msp)
            nodes("xianyu", 21, cashierText.lines())
            now += 500
            state("xianyu", 22, fingerprint)
            nodes("xianyu", 22, listOf("请验证指纹", "使用密码"))
            now += 900
            state("xianyu", 23, dialog)
            assertTrue(xianyuDialogs.isResultWindow(23))
            nodes("xianyu", 23, emptyList())
            recognised("xianyu", 23, "")
            now += 1_400
            state("xianyu", 20, flutter)
            // Result page arriving right after does not duplicate the capture.
            nodes("xianyu", 20, listOf("支付成功", "查看订单"))
        }
        assertEquals(listOf(Recorded("xianyu", 3_500L, "xianyu_payment_page_v1")), flow.recorded)
    }

    @Test fun detourThroughAlipayAppCashierConfirmedByXianyuPaidPageWithin180Seconds() {
        val flow = Flow(alipayActivities)
        with(flow) {
            state("xianyu", 30, flutter)
            state("xianyu", 31, msp)
            nodes("xianyu", 31, cashierText.lines())
            now += 2_000
            // Risk control hands off to Alipay app; its cashier shows the updated amount.
            state("alipay", 40, msp)
            nodes("alipay", 40, alipayCashierText.lines())
            // Exceeds Alipay's own 30 s window (e.g. identity check), still within Xianyu's 180 s.
            now += 95_000
            assertFalse(alipayCashier.awaitsConfirmation())
            state("xianyu", 41, flutter)
            // Feed prices on the result page are ignored; the waiting cashier amount is used once.
            nodes("xianyu", 41, listOf("支付成功", "猜你喜欢", "¥19.90", "¥88.00"), partial = true)
            nodes("xianyu", 41, listOf("支付成功", "猜你喜欢", "¥19.90", "¥88.00"), partial = true)
        }
        assertEquals(listOf(Recorded("xianyu", 3_450L, "xianyu_payment_page_v1")), flow.recorded)

        // Same detour after 181 s: expired, nothing recorded.
        val expired = Flow(alipayActivities)
        with(expired) {
            state("xianyu", 50, msp)
            nodes("xianyu", 50, cashierText.lines())
            now += 2_000
            state("alipay", 51, msp)
            nodes("alipay", 51, alipayCashierText.lines())
            now += 181_000
            state("xianyu", 52, flutter)
            nodes("xianyu", 52, listOf("支付成功", "查看订单"))
        }
        assertTrue(expired.recorded.isEmpty())
    }

    @Test fun cancelFailureAndUnarmedPaidPageRecordNothing() {
        // Cancel: framework confirm dialog with text over the cashier, then back to Xianyu.
        val cancelled = Flow(alipayActivities)
        with(cancelled) {
            state("xianyu", 60, msp)
            nodes("xianyu", 60, cashierText.lines())
            state("xianyu", 61, "androidx.appcompat.app.AlertDialog")
            nodes("xianyu", 61, listOf("确定要放弃付款吗？", "放弃", "继续付款"))
            recognised("xianyu", 61, "确定要放弃付款吗？放弃继续付款")
            state("xianyu", 62, flutter)
        }
        assertTrue(cancelled.recorded.isEmpty())

        // Failure page on Xianyu while an amount waits.
        val failed = Flow(alipayActivities)
        with(failed) {
            state("xianyu", 63, msp)
            nodes("xianyu", 63, cashierText.lines())
            state("xianyu", 64, flutter)
            nodes("xianyu", 64, listOf("支付失败", "余额不足", "重新支付"))
        }
        assertTrue(failed.recorded.isEmpty())

        // Paid page with no waiting cashier amount (e.g. browsing or after process death).
        val unarmed = Flow(alipayActivities)
        with(unarmed) {
            state("xianyu", 65, flutter)
            nodes("xianyu", 65, listOf("支付成功", "¥35.00", "查看订单"))
        }
        assertTrue(unarmed.recorded.isEmpty())
    }

    @Test fun crossChannelSettlingBetweenAlipayAndXianyuPreventsDoubleCapture() {
        // Alipay captures first -> later Xianyu paid page records nothing.
        val alipayFirst = Flow(alipayActivities)
        with(alipayFirst) {
            state("xianyu", 70, msp)
            nodes("xianyu", 70, cashierText.lines())
            now += 1_500
            state("alipay", 71, msp)
            nodes("alipay", 71, alipayCashierText.lines())
            now += 1_000
            nodes("alipay", 71, alipayResultLines)
            now += 1_000
            state("xianyu", 72, flutter)
            nodes("xianyu", 72, listOf("支付成功", "查看订单"))
        }
        assertEquals(listOf(Recorded("alipay", 3_450L, "alipay_payment_page_v1")), alipayFirst.recorded)

        // Xianyu captures first -> later Alipay-side overlay confirmation records nothing.
        val xianyuFirst = Flow(alipayActivities)
        with(xianyuFirst) {
            state("xianyu", 80, msp)
            nodes("xianyu", 80, cashierText.lines())
            now += 1_000
            state("alipay", 81, msp)
            nodes("alipay", 81, alipayCashierText.lines())
            state("alipay", 82, dialog)
            recognised("alipay", 82, "")
            now += 1_000
            state("xianyu", 83, flutter)
            nodes("xianyu", 83, listOf("支付成功"))
            // Alipay later returns to its home screen; its waiting amount and overlay were cleared.
            now += 500
            state("alipay", 84, alipayHome)
        }
        assertEquals(listOf(Recorded("xianyu", 3_450L, "xianyu_payment_page_v1")), xianyuFirst.recorded)

        // WeChat capture does not clear Xianyu's waiting amount.
        val wechatUnrelated = Flow(alipayActivities)
        with(wechatUnrelated) {
            state("xianyu", 90, msp)
            nodes("xianyu", 90, cashierText.lines())
            nodes("wechat", 91, listOf("支付成功"))
            state("xianyu", 92, flutter)
            nodes("xianyu", 92, listOf("支付成功"))
        }
        assertEquals(
            listOf(
                Recorded("wechat", 1_000L, "wechat_payment_page_v1"),
                Recorded("xianyu", 3_500L, "xianyu_payment_page_v1"),
            ),
            wechatUnrelated.recorded,
        )
    }

    @Test fun xianyuPageRuleDistinguishesPaidFailedAndOtherAndShapeIsContentFree() {
        assertEquals(PaymentPageParser.XianyuPage.Paid, PaymentPageParser.xianyuPage(listOf("支付成功")))
        assertEquals(PaymentPageParser.XianyuPage.Paid, PaymentPageParser.xianyuPage(listOf("  付款成功！ ")))
        assertEquals(PaymentPageParser.XianyuPage.Paid, PaymentPageParser.xianyuPage(listOf("支付成功。", "¥12.80", "¥99.00", "猜你喜欢")))
        assertEquals(PaymentPageParser.XianyuPage.Paid, PaymentPageParser.xianyuPage(listOf("支付成功!", "查看订单")))
        // Mention inside a chat or sentence is not a standalone heading.
        assertEquals(PaymentPageParser.XianyuPage.Other, PaymentPageParser.xianyuPage(listOf("买家说支付成功了", "¥12.80")))
        assertEquals(PaymentPageParser.XianyuPage.Other, PaymentPageParser.xianyuPage(listOf("我刚付款成功", "发货吧")))
        assertEquals(PaymentPageParser.XianyuPage.Other, PaymentPageParser.xianyuPage(emptyList()))
        // Any failure, pending, retry, or refund wording rejects even if "支付成功" also appears.
        listOf(
            "支付失败", "付款失败", "支付未完成", "支付已取消",
            "待支付", "待付款", "重新支付", "继续支付", "退款", "申请退款",
        ).forEach { marker ->
            assertEquals(marker, PaymentPageParser.XianyuPage.Failed,
                PaymentPageParser.xianyuPage(listOf("支付成功", marker, "¥12.80")))
        }
        val shape = PaymentPageParser.xianyuShape(listOf("支付成功", "示例卖家", "¥", "12", ".80", "¥99.00"))
        assertTrue(shape, shape.contains("lines=6"))
        assertTrue(shape, shape.contains("doneLine=true"))
        assertTrue(shape, shape.contains("doneWord=1"))
        assertTrue(shape, shape.contains("notDone=false"))
        assertTrue(shape, shape.contains("amounts=2"))
        assertFalse(shape, shape.contains("12.80"))
        assertFalse(shape, shape.contains("示例卖家"))
        assertFalse(shape, shape.contains("支付成功"))
    }
}

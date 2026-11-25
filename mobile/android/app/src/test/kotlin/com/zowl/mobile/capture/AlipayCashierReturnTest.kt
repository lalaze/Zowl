package com.zowl.mobile.capture

import org.junit.Assert.*
import org.junit.Test

/**
 * Alipay's own cashier that closes with its overlay straight back to the page that opened it
 * (seen on a device), next to the result page it shows otherwise.
 * [Flow] mirrors how PaymentAccessibilityService feeds the pure classes; texts are made up.
 */
class AlipayCashierReturnTest {
    private val xriver = "com.alipay.mobile.nebulax.xriver.activity.XRiverActivity"
    private val progress = "com.alipay.android.msp.ui.widget.MiniProgressDialog"
    private val notice = "com.alipay.mobile.antui.dialog.AUNoticeDialog"
    private val msp = "com.alipay.android.msp.ui.views.MspContainerActivity"
    private val fingerprint = "com.alipay.android.msp.ui.widget.FpFullViewCompatDialog"
    private val dialog = "android.app.Dialog"
    private val activities = setOf(xriver, msp, "com.eg.android.AlipayGphone.AlipayLogin")

    private val cashierPage = "订单信息\n山岚咖啡\n¥12.80\n付款方式\n花呗\n有立减0.50元可选\n使用指纹支付"
    private val resultPage = listOf("支付成功", "￥12.80", "收款方", "山岚咖啡", "完成")

    private class Flow(private val activities: Set<String>, private val knowsActivities: Boolean = true) {
        var now = 0L
        val dialogs = CashierOverlayDialogs("alipay") { now }
        val cashier = ShoppingCashierFlow { now }
        val recorded = mutableListOf<Long>()
        var pageCaptures = 0

        /** A window-state event; a payment is recorded when the cashier closed with its overlay. */
        fun state(windowId: Int, className: String) {
            val screen = PaymentPageOcrGate.isAppClass(className) && (!knowsActivities || className in activities)
            if (dialogs.onWindowState(windowId, className, screen, screensKnown = knowsActivities)) {
                cashier.onResultSuccess()?.let { recorded += it.amountMinor }
            }
        }

        /** A node read of the active window. */
        fun nodes(windowId: Int, text: String) {
            dialogs.onWindowRead(windowId, text.count { !it.isWhitespace() }, recognised = false)
            if (text.isNotBlank() && dialogs.isCashierWindow(windowId)) {
                dialogs.onCashierActive()
                AlipayCashierText.apply(cashier, windowId, text)
            }
        }

        /** An on-device recognition of the overlay. */
        fun recognised(windowId: Int, text: String) =
            dialogs.onWindowRead(windowId, text.count { !it.isWhitespace() }, recognised = true)

        /** The node parser captured a result page. */
        fun pageCaptured() {
            pageCaptures++
            cashier.clear()
            dialogs.onCashierActive()
        }
    }

    @Test fun aCashierClosingWithItsOverlayStraightBackToTheMiniProgramIsThePayment() {
        val flow = Flow(activities)
        with(flow) {
            state(18579, xriver)
            nodes(18579, "商品\n¥12.80\n¥15.00\n立即购买")
            state(18580, notice)
            state(18581, progress)
            now += 470
            state(18582, msp)
            now += 1_050
            state(18582, msp)
            repeat(3) { nodes(18582, cashierPage) }
            now += 660
            state(18584, fingerprint)
            nodes(18584, "请验证指纹\n使用密码")
            now += 1_580
            state(18587, dialog)
            assertTrue(dialogs.isResultWindow(18587))
            now += 400
            nodes(18587, "")
            recognised(18587, "")
            now += 1_150
            state(18579, xriver)
            // Once only.
            state(18579, xriver)
        }
        assertEquals(listOf(1280L), flow.recorded)
        assertEquals(0, flow.pageCaptures)
    }

    @Test fun aCashierThatShowsItsResultPageIsRecordedOnlyByThatPage() {
        // 2026-11-17: the cashier came back over its overlay and showed the result page.
        val flow = Flow(activities)
        with(flow) {
            state(10584, xriver)
            state(10585, progress)
            state(10586, msp)
            nodes(10586, cashierPage)
            state(10587, dialog)
            recognised(10587, "")
            state(10586, msp)
            nodes(10586, resultPage.joinToString("\n"))
            val evaluation = PaymentPageParser.evaluate(PaymentPageParser.ALIPAY_PACKAGE, resultPage, 1_784_100_000_000, "s", "d")
            assertTrue(evaluation is PaymentNotificationEvaluation.Captured)
            pageCaptured()
            state(10584, xriver)
            state(10588, xriver)
        }
        assertEquals(1, flow.pageCaptures)
        assertEquals(emptyList<Long>(), flow.recorded)

        // Without a further window-state: the result page read in the cashier's window settles it.
        val quiet = Flow(activities)
        with(quiet) {
            state(1, xriver)
            state(2, msp)
            nodes(2, cashierPage)
            state(3, dialog)
            recognised(3, "")
            nodes(2, resultPage.joinToString("\n"))
            pageCaptured()
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), quiet.recorded)

        // Even if the result page's capture were missed, its success heading settles the cashier.
        val settled = Flow(activities)
        with(settled) {
            state(2, msp)
            nodes(2, cashierPage)
            state(3, dialog)
            recognised(3, "")
            nodes(2, resultPage.joinToString("\n"))
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), settled.recorded)
    }

    @Test fun aCancelledOrFailedPaymentThatLeavesTheCashierOpenIsNotRecorded() {
        fun cashierWithAmount(flow: Flow) = with(flow) {
            state(1, xriver)
            state(2, msp)
            nodes(2, cashierPage)
        }
        // Fingerprint cancelled: the cashier is in front again, then the user closes it.
        val cancelled = Flow(activities)
        with(cancelled) {
            cashierWithAmount(this)
            state(4, fingerprint)
            nodes(4, "请验证指纹\n取消")
            nodes(2, cashierPage)
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), cancelled.recorded)

        // Paid under the overlay but failed: the cashier stays and shows why.
        val failed = Flow(activities)
        with(failed) {
            cashierWithAmount(this)
            state(4, fingerprint)
            state(5, dialog)
            recognised(5, "")
            nodes(2, "支付失败\n余额不足\n¥12.80\n重新支付")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), failed.recorded)

        // The same, when the cashier announces its window again.
        val failedAgain = Flow(activities)
        with(failedAgain) {
            cashierWithAmount(this)
            state(5, dialog)
            recognised(5, "")
            state(2, msp)
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), failedAgain.recorded)

        // A framework dialog with something to say ("放弃付款？") is not the payment overlay.
        val gaveUp = Flow(activities)
        with(gaveUp) {
            cashierWithAmount(this)
            state(6, "androidx.appcompat.app.AlertDialog")
            nodes(6, "确定要放弃付款吗？\n放弃\n继续付款")
            recognised(6, "确定要放弃付款吗？放弃继续付款")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), gaveUp.recorded)

        // An overlay never recognised is no evidence that it was the text-free one.
        val unseen = Flow(activities)
        with(unseen) {
            cashierWithAmount(this)
            state(7, dialog)
            nodes(7, "")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), unseen.recorded)

        // Too long under the overlay to tell what ended it.
        val slow = Flow(activities)
        with(slow) {
            cashierWithAmount(this)
            state(8, dialog)
            recognised(8, "")
            now += CashierOverlayDialogs.OVERLAY_MAX + 1
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), slow.recorded)
    }

    @Test fun aCashierWithoutExactlyOneAmountIsNeverRecorded() {
        fun closeWithOverlay(flow: Flow, cashierText: String) = with(flow) {
            state(1, xriver)
            state(2, msp)
            nodes(2, cashierText)
            state(3, dialog)
            recognised(3, "")
            state(1, xriver)
        }
        val none = Flow(activities)
        closeWithOverlay(none, "订单信息\n山岚咖啡\n付款方式\n花呗")
        assertEquals(emptyList<Long>(), none.recorded)

        val several = Flow(activities)
        closeWithOverlay(several, "订单信息\n¥12.80\n原价 ¥15.00\n付款方式")
        assertEquals(emptyList<Long>(), several.recorded)

        // An amount read first stops counting once the cashier shows several.
        val redrawn = Flow(activities)
        with(redrawn) {
            state(1, xriver)
            state(2, msp)
            nodes(2, cashierPage)
            nodes(2, "订单信息\n¥12.80\n原价 ¥15.00\n付款方式")
            state(3, dialog)
            recognised(3, "")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), redrawn.recorded)

        // A frame without any amount (still loading) keeps the one read before it.
        val loading = Flow(activities)
        with(loading) {
            state(1, xriver)
            state(2, msp)
            nodes(2, cashierPage)
            nodes(2, "正在付款")
            state(3, dialog)
            recognised(3, "")
            state(1, xriver)
        }
        assertEquals(listOf(1280L), loading.recorded)

        assertEquals(AlipayCashierText.Frame.NONE, AlipayCashierText.apply(ShoppingCashierFlow { 0 }, 1, "付款方式"))
        assertEquals(AlipayCashierText.Frame.AMBIGUOUS, AlipayCashierText.apply(ShoppingCashierFlow { 0 }, 1, "¥1.00\n¥2.00"))
        assertEquals(AlipayCashierText.Frame.AMOUNT, AlipayCashierText.apply(ShoppingCashierFlow { 0 }, 1, cashierPage))
        assertEquals(AlipayCashierText.Frame.SETTLED, AlipayCashierText.apply(ShoppingCashierFlow { 0 }, 1, "支付成功\n¥12.80"))
    }

    @Test fun onlyAnotherAlipayActivityEndsTheCashierFlow() {
        // Alipay's own dialogs between the cashier and its overlay do not end the flow.
        val flow = Flow(activities)
        with(flow) {
            state(2, msp)
            nodes(2, cashierPage)
            state(4, fingerprint)
            state(5, "com.alipay.mobile.security.bio.ui.FpFullViewCompatDialog")
            state(6, dialog)
            recognised(6, "")
            state(1, xriver)
        }
        assertEquals(listOf(1280L), flow.recorded)

        // An Alipay dialog is not a cashier even when its class sits in the cashier's package.
        val dialogs = CashierOverlayDialogs("alipay") { 0 }
        dialogs.onWindowState(9, fingerprint, screen = false)
        assertFalse(dialogs.isCashierWindow(9))
        dialogs.onWindowState(10, dialog)
        assertFalse(dialogs.isResultWindow(10))

        // Another Alipay screen between the cashier and the overlay ends the flow.
        val other = Flow(activities)
        with(other) {
            state(2, msp)
            nodes(2, cashierPage)
            state(1, xriver)
            state(6, dialog)
            recognised(6, "")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), other.recorded)

        // When Alipay's Activities cannot be looked up, a dialog could pass for a screen, so no
        // return to a screen confirms a payment, whatever window comes back.
        val unknown = Flow(activities, knowsActivities = false)
        with(unknown) {
            state(2, msp)
            nodes(2, cashierPage)
            state(4, "com.alipay.mobile.security.bio.ui.FpFullViewCompatDialog")
            state(6, dialog)
            recognised(6, "")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), unknown.recorded)
        val unknownMsp = Flow(activities, knowsActivities = false)
        with(unknownMsp) {
            state(2, msp)
            nodes(2, cashierPage)
            state(4, fingerprint)
            state(6, dialog)
            recognised(6, "")
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), unknownMsp.recorded)
        val unknownNotice = Flow(activities, knowsActivities = false)
        with(unknownNotice) {
            state(1, xriver)
            state(2, msp)
            nodes(2, cashierPage)
            state(6, dialog)
            recognised(6, "")
            state(7, notice)
            state(1, xriver)
        }
        assertEquals(emptyList<Long>(), unknownNotice.recorded)
    }

    @Test fun anAlipayNoticeAfterTheOverlayVoidsIt() {
        // The overlay is recognised as text-free, then the payment fails and Alipay's own notice
        // says so; the user leaves from the notice and the cashier closes straight back.
        val failed = Flow(activities)
        with(failed) {
            state(18579, xriver)
            state(18582, msp)
            nodes(18582, cashierPage)
            state(18584, fingerprint)
            now += 1_500
            state(18587, dialog)
            recognised(18587, "")
            now += 800
            state(18590, notice)
            nodes(18590, "支付失败\n余额不足\n返回商家")
            now += 600
            state(18579, xriver)
        }
        assertEquals(emptyList<Long>(), failed.recorded)

        // A notice before the overlay does not void the overlay that follows it.
        val paid = Flow(activities)
        with(paid) {
            state(18579, xriver)
            state(18582, msp)
            nodes(18582, cashierPage)
            state(18583, notice)
            state(18584, fingerprint)
            state(18587, dialog)
            recognised(18587, "")
            state(18579, xriver)
        }
        assertEquals(listOf(1280L), paid.recorded)
    }

    @Test fun taobaoCashierIsNotAlipaysAndAlipaysIsNotTaobaos() {
        // Taobao's cashier flow ignores the screen flag and ends on any Taobao app class, as before.
        var now = 0L
        val taobao = CashierOverlayDialogs("taobao") { now }
        taobao.onWindowState(1, msp)
        taobao.onWindowState(2, "com.taobao.android.dialog.PromotionDialog", screen = false)
        taobao.onWindowState(3, dialog)
        assertFalse(taobao.isResultWindow(3))
        // Alipay's flow never treats Taobao's cash desk as its cashier.
        val alipay = CashierOverlayDialogs("alipay") { now }
        alipay.onWindowState(1, "com.taobao.tao.alipay.cashdesk.CashDeskActivity", screen = true)
        alipay.onWindowState(2, dialog)
        assertFalse(alipay.isResultWindow(2))
    }
}

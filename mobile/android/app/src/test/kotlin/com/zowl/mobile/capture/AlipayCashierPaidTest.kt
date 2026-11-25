package com.zowl.mobile.capture

import org.junit.Assert.*
import org.junit.Test

/**
 * Alipay's own cashier that shows its amount, then its success page in the same window: that pair
 * is the payment, also abroad and also when the last captured page is still the consumed session.
 * [Cashier] mirrors how PaymentAccessibilityService judges one read; texts are made up.
 */
class AlipayCashierPaidTest {
    private val abroad = "向示例商店付款\n¥71.20\n汇率 1.00 美元 = 7.12000000 人民币\n10.00 USD\n付款方式\n储蓄卡\n使用指纹支付"
    private val abroadPaid = "支付成功\n¥71.20\n10.00 美元\n收款方\n示例商店\n付款方式\n储蓄卡\n完成"
    private val home = "订单信息\n山岚咖啡\n¥12.80\n付款方式\n花呗"
    private val homePaid = "支付成功\n￥12.80\n收款方\n山岚咖啡\n完成"

    private class Cashier(var session: PaymentPageSession = PaymentPageSession()) {
        val flow = ShoppingCashierFlow { 0L }
        val captured = mutableListOf<CapturedPayment>()
        var lastReject: PaymentNotificationRejectionReason? = null

        /** A node read of a cashier window. */
        fun read(windowId: Int, text: String) {
            AlipayCashierText.apply(flow, windowId, text)
            judge(windowId, text)
        }

        /** A node read of any window, the cashier included. */
        fun judge(windowId: Int, text: String) {
            lastReject = null
            val lines = text.lines()
            if (PaymentPageParser.isCheckout(lines, "alipay")) {
                session = session.observeCheckout()
                return
            }
            session = session.leaveCheckout()
            val paid = flow.paidInCashier(windowId)
            val page = session.forPage(paid)
            val result = PaymentPageParser.evaluate(PaymentPageParser.ALIPAY_PACKAGE, lines, 1_784_100_000_000,
                page.id, "device", cashierPaidMinor = paid)
            when {
                result is PaymentNotificationEvaluation.Rejected -> lastReject = result.reason
                result is PaymentNotificationEvaluation.Captured && page.consumed ->
                    lastReject = PaymentNotificationRejectionReason.REPEATED_PAYMENT_PAGE
                result is PaymentNotificationEvaluation.Captured -> {
                    captured += result.payment
                    session = page.consume()
                    flow.onPageCaptured(windowId)
                }
            }
        }

        val amounts get() = captured.map { it.amountMinor }
    }

    @Test fun aPaymentAbroadIsTheYuanAmountTheCashierShowed() {
        val cashier = Cashier()
        with(cashier) {
            read(7, abroad)
            assertEquals(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS, lastReject)
            judge(9, "请验证指纹\n使用密码\n取消")
            read(7, abroadPaid)
            // Read again while it stays on screen, or as it redraws: the same payment.
            read(7, abroadPaid)
            read(7, "¥71.20\n完成")
            read(7, abroadPaid)
        }
        assertEquals(listOf(7_120L), cashier.amounts)
        assertEquals("示例商店", cashier.captured.single().merchantName)
        assertEquals("alipay_payment_page_v1", cashier.captured.single().parserId)
    }

    @Test fun theNextCashierIsANewPaymentThoughTheLastPageIsConsumed() {
        // Fingerprint cashiers never match the text of a checkout, so nothing else arms the session.
        val cashier = Cashier(PaymentPageSession().consume())
        with(cashier) {
            assertFalse(PaymentPageParser.isCheckout(home.lines(), "alipay"))
            read(11, home)
            read(11, homePaid)
            read(11, homePaid)
            assertEquals(PaymentNotificationRejectionReason.REPEATED_PAYMENT_PAGE, lastReject)
            // The same amount again, in a cashier of its own.
            read(15, home)
            read(15, homePaid)
        }
        assertEquals(listOf(1_280L, 1_280L), cashier.amounts)
        assertEquals(2, cashier.captured.map { it.idempotencyKey }.distinct().size)
    }

    @Test fun aSuccessPageWithoutItsOwnCashierIsStillJudgedAsBefore() {
        // No amount read before it: a page abroad is excluded, and a consumed session stays consumed.
        val cold = Cashier(PaymentPageSession().consume())
        with(cold) {
            read(7, abroadPaid)
            assertEquals(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS, lastReject)
            read(8, homePaid)
            assertEquals(PaymentNotificationRejectionReason.REPEATED_PAYMENT_PAGE, lastReject)
        }
        assertTrue(cold.captured.isEmpty())

        // Another window's amount, or another amount, is no confirmation.
        val other = Cashier(PaymentPageSession().consume())
        with(other) {
            read(7, abroad)
            read(8, abroadPaid)
            read(17, home)
            read(17, homePaid.replace("12.80", "13.80"))
        }
        assertTrue(other.captured.isEmpty())

        // Opening a cashier and leaving it arms no later page in another window.
        val left = Cashier(PaymentPageSession().consume())
        with(left) {
            read(7, home)
            judge(9, homePaid)
            assertEquals(PaymentNotificationRejectionReason.REPEATED_PAYMENT_PAGE, lastReject)
        }
        assertTrue(left.captured.isEmpty())
    }

    @Test fun anAmountNotStatedInYuanIsNeverTakenFromAPageAbroad() {
        // The sign is drawn apart from the number, which then stands alone like a yuan amount.
        val dollars = Cashier()
        with(dollars) {
            read(7, "向示例商店付款\n$\n10.00\n约合人民币\n付款方式")
            read(7, "支付成功\n$\n10.00\n收款方\n示例商店\n完成")
        }
        assertTrue(dollars.captured.isEmpty())

        // Stated on either page is enough, also with the yuan sign drawn apart.
        val split = Cashier()
        with(split) {
            read(7, "向示例商店付款\n¥\n71.20\n10.00 USD\n付款方式")
            read(7, "支付成功\n71.20\n10.00 USD\n收款方\n示例商店\n完成")
        }
        assertEquals(listOf(7_120L), split.amounts)

        // Yen share the yuan's sign, so they stay excluded.
        listOf("日元", "JPY").forEach { yen ->
            val page = Cashier()
            with(page) {
                read(7, "向示例商店付款\n¥1500.00\n$yen\n付款方式")
                read(7, "支付成功\n¥1500.00\n$yen\n完成")
                assertEquals(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS, lastReject)
            }
            assertTrue(page.captured.isEmpty())
        }
    }

    @Test fun whatTheCashierPaidForStillDecides() {
        listOf("转账", "退款", "红包", "支付失败").forEach { kind ->
            val cashier = Cashier()
            with(cashier) {
                read(7, "$home\n$kind")
                read(7, "$homePaid\n$kind")
            }
            assertTrue(kind, cashier.captured.isEmpty())
        }
        // Several amounts on the success page: not known which one was charged.
        val several = Cashier()
        with(several) {
            read(7, abroad)
            read(7, "支付成功\n¥71.20\n¥5.00\n10.00 USD\n完成")
        }
        assertTrue(several.captured.isEmpty())
    }

    @Test fun theSuccessPageMayFillInAfterItsHeading() {
        val cashier = Cashier()
        with(cashier) {
            read(7, abroad)
            read(7, "支付成功")
            read(7, abroadPaid)
        }
        assertEquals(listOf(7_120L), cashier.amounts)
    }

    @Test fun aPaymentAlreadyConfirmedByTheClosingCashierIsNotConfirmedAgain() {
        val flow = ShoppingCashierFlow { 0L }
        AlipayCashierText.apply(flow, 7, home)
        assertEquals(1_280L, flow.onResultSuccess()?.amountMinor)
        AlipayCashierText.apply(flow, 7, homePaid)
        assertNull(flow.paidInCashier(7))

        // And the other way around: settled by its own page, its closing confirms nothing.
        val settled = ShoppingCashierFlow { 0L }
        AlipayCashierText.apply(settled, 7, home)
        AlipayCashierText.apply(settled, 7, homePaid)
        assertEquals(1_280L, settled.paidInCashier(7))
        assertNull(settled.onResultSuccess())
        // The next cashier drops it.
        AlipayCashierText.apply(settled, 9, home)
        AlipayCashierText.apply(settled, 9, "支付成功")
        assertNull(settled.paidInCashier(7))
        assertNull(settled.paidInCashier(9))
    }
}

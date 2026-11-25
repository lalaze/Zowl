package com.zowl.mobile.capture

import org.junit.Assert.*
import org.junit.Test

class PaymentPageParserTest {
    private val page = listOf("支付成功", "￥18.80", "收款方", "山岚咖啡", "完成")
    private fun parse(lines: List<String> = page, session: String = "checkout-a", time: Long = 1_784_100_000_000) =
        PaymentPageParser.evaluate(PaymentPageParser.ALIPAY_PACKAGE, lines, time, session, "device")

    @Test fun readsSuccessPagesAndKeepsAnIdentityAcrossRefreshes() {
        val first = (parse() as PaymentNotificationEvaluation.Captured).payment
        val refresh = (parse(time = 1_784_100_003_000) as PaymentNotificationEvaluation.Captured).payment
        assertEquals(1880L, first.amountMinor)
        assertEquals("山岚咖啡", first.merchantName)
        assertEquals("alipay_payment_page_v1", first.parserId)
        assertEquals(first.idempotencyKey, refresh.idempotencyKey)
        val secondPayment = (parse(session = "checkout-b") as PaymentNotificationEvaluation.Captured).payment
        assertNotEquals(first.idempotencyKey, secondPayment.idempotencyKey)
    }

    @Test fun acceptsWechatAndMissingMerchantWithoutGuessing() {
        val result = PaymentPageParser.evaluate(PaymentPageParser.WECHAT_PACKAGE,
            listOf("付款成功", "¥12.00", "完成"), 1_784_100_000_000, "s", "d") as PaymentNotificationEvaluation.Captured
        assertEquals("wechat", result.platform)
        assertNull(result.payment.merchantName)
    }

    @Test fun ignoresOtherAppsAndRejectsHistoricalOrAmbiguousPages() {
        assertNull(PaymentPageParser.evaluate("other.app", page, 1L, "s", "d"))
        listOf(
            page + "账单详情", page + "退款", page + "交易详情", page + "切换到按住说话",
            page + "币种 USD",
            listOf("支付成功", "￥18.80"),
            listOf("好友说支付成功", "￥18.80", "完成"),
            listOf("支付成功", "￥18.80", "￥2.00", "完成"),
            listOf("支付成功", "￥0.00", "完成"),
        ).forEach { assertTrue(it.toString(), parse(it) is PaymentNotificationEvaluation.Rejected) }
    }

    @Test fun usesExplicitPaidAmountInsteadOfDiscountOrBalance() {
        val parsed = parse(listOf("支付成功", "实付金额", "18.80", "优惠￥2.00", "余额￥200.00", "完成")) as PaymentNotificationEvaluation.Captured
        assertEquals(1880L, parsed.payment.amountMinor)
        val separateCurrency = parse(listOf("支付成功", "￥", "18.80", "完成")) as PaymentNotificationEvaluation.Captured
        assertEquals(1880L, separateCurrency.payment.amountMinor)
        assertTrue(parse(listOf("支付成功", "付款金额", "18.80", "支付金额", "20.00", "完成")) is PaymentNotificationEvaluation.Rejected)
    }

    @Test fun consumedPageCannotRearmWithoutANewCheckout() {
        val first = PaymentPageSession().consume()
        assertTrue(first.leaveCheckout().consumed)
        assertEquals(first.id, first.leaveCheckout().id)
        val next = first.observeCheckout()
        assertFalse(next.consumed)
        assertNotEquals(first.id, next.id)
        assertEquals(next.id, next.observeCheckout().id)
        assertTrue(PaymentPageParser.isCheckout(listOf("确认付款", "￥18.80")))
        assertFalse(PaymentPageParser.isCheckout(page + "支付方式"))
        assertFalse(PaymentPageParser.isCheckout(listOf("账单详情", "支付方式")))
    }

    @Test fun showingAPaymentCodeArmsANewCheckoutButNeverPostsTheCodeItself() {
        val code = listOf("付款码", "向商家付款", "零钱")
        assertTrue(PaymentPageParser.isCheckout(code))
        assertTrue(PaymentPageParser.isCheckout(listOf("收付款", "优先使用此支付方式付款", "零钱")))
        assertTrue(parse(code) is PaymentNotificationEvaluation.Rejected)
        assertFalse(PaymentPageParser.isCheckout(listOf("收付款")))
        assertFalse(PaymentPageParser.isCheckout(listOf("付款码")))
        assertFalse(PaymentPageParser.isCheckout(listOf("二维码收款", "收款码")))
        assertFalse(PaymentPageParser.isCheckout(page + "付款码"))
    }

    private fun shop(packageName: String, lines: List<String>, partial: Boolean = false) =
        PaymentPageParser.evaluate(packageName, lines, 1_784_100_000_000, "s", "d", partial)

    @Test fun shoppingAppsReadOnlyTheResultBlockAboveTheFeedOfOtherGoods() {
        val page = listOf("支付成功", "实付款", "¥", "128", ".00", "查看订单", "返回首页", "猜你喜欢", "连衣裙", "¥39.90", "运动鞋", "¥199")
        val first = (shop(PaymentPageParser.JD_PACKAGE, page) as PaymentNotificationEvaluation.Captured).payment
        assertEquals(12_800L, first.amountMinor)
        assertEquals("jd", first.platform)
        assertEquals("jd_payment_page_v1", first.parserId)
        assertNull(first.merchantName)
        // The feed changes between visits and may be cut off; neither changes the candidate.
        val cutOff = (shop(PaymentPageParser.JD_PACKAGE, page.dropLast(3) + "¥59", partial = true)
            as PaymentNotificationEvaluation.Captured).payment
        assertEquals(first.evidenceDigest, cutOff.evidenceDigest)

        val labelled = shop(PaymentPageParser.JD_PACKAGE,
            listOf("完成", "支付成功！", "实付金额：¥59.90", "已优惠¥10.00", "查看订单", "为你推荐", "¥9.9")) as PaymentNotificationEvaluation.Captured
        assertEquals(5_990L, labelled.payment.amountMinor)
        val promotions = shop(PaymentPageParser.JD_PACKAGE,
            listOf("支付成功", "¥23.5", "查看订单", "继续逛逛", "极速退款", "领红包", "¥5.8")) as PaymentNotificationEvaluation.Captured
        assertEquals(2_350L, promotions.payment.amountMinor)
        val titleBarDone = shop(PaymentPageParser.JD_PACKAGE, listOf("完成", "支付成功", "¥128.00")) as PaymentNotificationEvaluation.Captured
        assertEquals(12_800L, titleBarDone.payment.amountMinor)
    }

    @Test fun taobaoPagesAreNeverJudgedFromTheirText() {
        // Its cashier and result page expose no text; the readable pages around them are not evidence.
        assertFalse(PaymentPageParser.readsPageText("taobao"))
        assertNull(shop(PaymentPageParser.TAOBAO_PACKAGE, listOf("支付成功", "实付款", "¥128", "查看订单")))
        assertEquals("taobao", PaymentPageParser.platform(PaymentPageParser.TAOBAO_PACKAGE))
        // Pinduoduo has no success page with an amount either; see pinduoduoPage.
        assertNull(shop(PaymentPageParser.PINDUODUO_PACKAGE, listOf("支付成功", "¥23.5", "查看订单")))
    }

    // The order panel as accessibility exposes it; goods and prices are made up.
    private val pinduoduoPanel = listOf(
        "#早于99%同类商品送达", "关闭", "退货包运费", "现在下单，承诺最晚周三(3月18日)送达", "商品主图",
        "#折后¥16.5", "¥22.9", "品牌官方正品", "已选: #24包 便携30x40cm-5L按压+家用装", "减少数量", "1", "增加数量",
        "优惠", "店铺", "券", "-5元",
        "12包 便携30x40cm-5L按压+家用装  ¥9.5", "24包 便携30x40cm-5L按压+家用装  ¥16.5", "120人回购",
        "48包 便携30x40cm-5L按压+家用装  ¥31.9", "36包 便携40x50cm-10L按压  ¥29.8",
    )

    @Test fun pinduoduoTakesTheAmountFromTheSubmitButtonOnly() {
        val payNow = pinduoduoPanel + listOf("优先使用 支付宝，更换支付方式", "11.11百亿补贴 仅 ¥45.67 ¥52.9", "11.11爆单中")
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(4_567L), PaymentPageParser.pinduoduoPage(payNow))
        val plain = pinduoduoPanel + listOf("优先使用 微信支付，更换支付方式", "立即支付", "¥", "16", ".5")
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(1_650L), PaymentPageParser.pinduoduoPage(plain))
        // The panel itself may report the charge before the paid notice replaces it.
        assertEquals(PaymentPageParser.PinduoduoPage.PaidPanel(4_567L), PaymentPageParser.pinduoduoPage(payNow + "支付成功"))
        assertFalse(PaymentPageParser.pinduoduoShape(payNow).contains("45.67"))
        // A pay-later order is recorded too, at the amount due on receipt, not the "0元" it starts with.
        val payLater = pinduoduoPanel + listOf("使用#先用后付，更换支付方式", "0元下单，确认收货后付款 ¥16.5", "热销12个月的经典款")
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(1_650L), PaymentPageParser.pinduoduoPage(payLater))
        assertEquals(PaymentPageParser.PinduoduoPage.PaidPanel(1_650L), PaymentPageParser.pinduoduoPage(payLater + "下单成功"))
        // The line a submitted pay-later panel adds below its button does not change the amount.
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(4_567L), PaymentPageParser.pinduoduoPage(
            pinduoduoPanel + listOf("优先使用 支付宝，更换支付方式", "11.11百亿补贴 仅 ¥45.67 ¥52.9", "先用后付下单中")))
        // Without the payment-method line there is no pay button to trust, however many prices show.
        assertEquals(PaymentPageParser.PinduoduoPage.Other, PaymentPageParser.pinduoduoPage(pinduoduoPanel))
        assertEquals(PaymentPageParser.PinduoduoPage.Other,
            PaymentPageParser.pinduoduoPage(pinduoduoPanel + listOf("优先使用 支付宝，更换支付方式", "立即支付")))
    }

    // Wording from the app's own bundle; layout not yet seen on a device. Goods and prices are made up.
    private val pupuGoods = listOf(
        "确认订单", "送达时间", "商品金额", "¥31.80", "配送费", "¥0.00", "优惠券", "-¥3.00", "支付方式", "支付宝", "免密支付更快捷",
    )

    @Test fun pupuTakesTheAmountNextToThePayButton() {
        val page = { lines: List<String> -> PaymentPageParser.orderPage("pupu", lines) }
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(2_880L), page(pupuGoods + listOf("合计", "¥28.80", "去支付")))
        // Split prices, the password-free button, and the discount beside the total.
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(2_880L),
            page(pupuGoods + listOf("合计 ", "¥", "28", ".80", "已优惠¥3.00", "免密支付")))
        // While the payment runs the panel is still there, and nothing is paid yet.
        assertEquals(PaymentPageParser.PinduoduoPage.OrderPanel(2_880L),
            page(pupuGoods + listOf("合计", "¥28.80", "免密支付", "免密支付中...")))
        assertFalse(PaymentPageParser.orderPageShape("pupu", pupuGoods + listOf("合计", "¥28.80", "去支付")).contains("28.80"))
    }

    @Test fun pupuNeverGuessesBetweenSeveralAmounts() {
        val page = { lines: List<String> -> PaymentPageParser.orderPage("pupu", lines) }
        assertEquals(PaymentPageParser.PinduoduoPage.Ambiguous, page(pupuGoods + listOf("合计", "¥28.80", "¥31.80", "去支付")))
        // No amount by the button; the ones further up are goods and fees.
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(pupuGoods + listOf("请选择配送时间", "去支付")))
        // Zero to pay (balance covers it) is not an expense.
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("合计", "¥0.00", "去支付")))
        // The cart's button, and a mention in a sentence, are not the checkout.
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("合计", "¥28.80", "去结算")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("¥28.80", "不要了，去支付")))
        // An order list has several unpaid orders, each with its own button.
        assertEquals(PaymentPageParser.PinduoduoPage.Ambiguous,
            page(listOf("实付", "¥28.80", "去支付", "实付", "¥19.90", "去支付")))
    }

    @Test fun pupuIsPaidOnlyOnItsCompletionPage() {
        val page = { lines: List<String> -> PaymentPageParser.orderPage("pupu", lines) }
        assertEquals(PaymentPageParser.PinduoduoPage.Paid, page(listOf("支付完成", "正在为您备货", "查看订单", "¥9.90", "¥12.80")))
        assertEquals(PaymentPageParser.PinduoduoPage.Paid, page(listOf("支付成功", "继续逛逛")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("免密支付中...")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("支付失败", "重新支付")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("支付完成后可查看订单", "待支付")))
        // A page that says both is not settled.
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("支付完成", "支付失败")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, page(listOf("支付成功", "待支付")))
    }

    @Test fun pupuIsACaptureSourceReadFromItsPagesOnly() {
        assertEquals("pupu", PaymentPageParser.platform("com.pupumall.customer"))
        assertTrue("pupu" in PaymentPageParser.platforms)
        assertTrue(PaymentPageParser.usesOrderPanel("pupu"))
        assertTrue(PaymentPageParser.readsPartialPages("pupu"))
        assertNull(PaymentPageParser.evaluate("com.pupumall.customer", listOf("支付成功", "¥28.80", "完成"), 0, "s", "i"))
        assertFalse(PaymentPageOcrGate.allows("pupu", "com.pupumall.proteus.base.pagev2.activity.PPReactContainerActivity"))
        // The order itself is paid in another app for longer than the usual wait for a notice.
        assertEquals(ShoppingCashierFlow.CONFIRM_WINDOW, PaymentPageParser.confirmWindow("pinduoduo"))
        assertTrue(PaymentPageParser.confirmWindow("pupu") > ShoppingCashierFlow.CONFIRM_WINDOW)
    }

    @Test fun anOrderPaidInAnotherAppIsConfirmedWithinThePlatformsOwnWindow() {
        var now = 0L
        val usual = ShoppingCashierFlow { now }
        val longer = ShoppingCashierFlow(PaymentPageParser.confirmWindow("pupu")) { now }
        usual.onCashierAmount(1, 2_880L)
        longer.onCashierAmount(1, 2_880L)
        now += 90_000
        assertNull(usual.onResultSuccess())
        assertTrue(longer.awaitsConfirmation())
        assertEquals(2_880L, longer.onResultSuccess()?.amountMinor)
        longer.onCashierAmount(2, 1_000L)
        now += PaymentPageParser.confirmWindow("pupu") + 1
        assertNull(longer.onResultSuccess())
    }

    @Test fun anOrderPaidInAlipayOrWechatNamesPupuWhenTheAmountIsItsOwn() {
        // Order of a device trace: checkout, Alipay's cashier seconds later, then Pupu's completion page.
        var now = 0L
        val pupu = ShoppingCashierFlow(PaymentPageParser.confirmWindow("pupu")) { now }
        fun merchant(platform: String, shown: String?, amountMinor: Long) =
            PaymentPageParser.merchantName(platform, shown, pupu.awaits(amountMinor))
        assertEquals("某***公司", merchant("alipay", "某***公司", 2_880L))
        pupu.onCashierAmount(1, 2_880L)
        now += 13_000
        assertEquals("朴朴", merchant("alipay", "某***公司", 2_880L))
        assertEquals("朴朴", merchant("wechat", null, 2_880L))
        // Another payment made while that order is left unpaid keeps its own merchant.
        assertEquals("便利店", merchant("alipay", "便利店", 1_990L))
        assertEquals("拼多多商家", merchant("pinduoduo", "拼多多商家", 2_880L))
        // Too late, and once the order is settled, it names nothing any more.
        now += PaymentPageParser.confirmWindow("pupu")
        assertEquals("便利店", merchant("alipay", "便利店", 2_880L))
        pupu.onCashierAmount(2, 2_880L)
        pupu.clear()
        assertEquals("便利店", merchant("alipay", "便利店", 2_880L))
    }

    @Test fun aPaymentMadeInsidePupuNamesPupu() {
        // Its completion page shows no merchant, and the amount no longer waits when it is recorded.
        assertEquals("朴朴", PaymentPageParser.merchantName("pupu", null, pupuOrderWaits = false))
        assertNull(PaymentPageParser.merchantName("taobao", null, pupuOrderWaits = false))
    }

    @Test fun pinduoduoRecognisesTheNoticeOfAPaidOrPayLaterOrder() {
        assertEquals(PaymentPageParser.PinduoduoPage.Paid, PaymentPageParser.pinduoduoPage(
            listOf("已支付", "还差1人，赶快邀请好友来拼单吧", "微信好友", "QQ好友", "继续逛逛", "查看订单详情")))
        assertEquals(PaymentPageParser.PinduoduoPage.Paid, PaymentPageParser.pinduoduoPage(
            listOf("下单成功，预计16小时内发货", "确认收货后，支付宝将自动付款¥16.5", "继续逛逛", "查看订单详情")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, PaymentPageParser.pinduoduoPage(listOf("下单成功率 99%", "继续逛逛")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, PaymentPageParser.pinduoduoPage(listOf("订单已支付成功", "实付: ¥45.67")))
        assertEquals(PaymentPageParser.PinduoduoPage.Other, PaymentPageParser.pinduoduoPage(emptyList()))
    }

    @Test fun shoppingAppsRejectPagesWithoutOneUnambiguousPaidAmount() {
        fun reason(lines: List<String>, partial: Boolean = false) =
            (shop(PaymentPageParser.JD_PACKAGE, lines, partial) as PaymentNotificationEvaluation.Rejected).reason
        assertEquals(PaymentNotificationRejectionReason.MISSING_AMOUNT, reason(listOf("支付成功", "查看订单", "猜你喜欢", "¥39.90")))
        assertEquals(PaymentNotificationRejectionReason.MULTIPLE_AMOUNTS, reason(listOf("支付成功", "¥128.00", "已优惠¥10.00", "查看订单")))
        assertEquals(PaymentNotificationRejectionReason.MULTIPLE_AMOUNTS,
            reason(listOf("完成", "支付成功", "¥128.00", "为你推荐", "短袖", "¥39.9")))
        assertEquals(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS, reason(listOf("支付成功", "US$12.00", "查看订单")))
        assertEquals(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS, reason(listOf("支付失败", "支付成功", "¥128.00", "查看订单")))
        assertEquals(PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE, reason(listOf("订单支付成功通知", "¥128.00", "查看订单")))
        assertEquals(PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE, reason(listOf("支付成功", "¥128.00", "猜你喜欢", "¥39.90")))
        assertEquals(PaymentNotificationRejectionReason.PAGE_READ_LIMIT, reason(listOf("支付成功", "¥128.00"), partial = true))
        assertEquals(PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE, reason(listOf("首页", "购物车", "¥39.90"), partial = true))
        // Payment apps still refuse any page that was not read in full.
        assertEquals(PaymentNotificationRejectionReason.PAGE_READ_LIMIT,
            (PaymentPageParser.evaluate(PaymentPageParser.ALIPAY_PACKAGE, page, 1L, "s", "d", partial = true)
                as PaymentNotificationEvaluation.Rejected).reason)
    }

    @Test fun submittingAnOrderInAShoppingAppArmsTheNextPayment() {
        assertTrue(PaymentPageParser.isCheckout(listOf("确认订单", "提交订单"), "jd"))
        assertTrue(PaymentPageParser.isCheckout(listOf("京东收银台", "立即支付 ¥128.00"), "jd"))
        assertFalse(PaymentPageParser.isCheckout(listOf("支付成功", "查看订单", "立即支付"), "jd"))
        assertFalse(PaymentPageParser.isCheckout(listOf("首页", "购物车", "立即购买"), "jd"))
        assertFalse(PaymentPageParser.isCheckout(listOf("提交订单")))
    }
}

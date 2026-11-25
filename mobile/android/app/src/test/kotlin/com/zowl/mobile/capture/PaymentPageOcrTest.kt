package com.zowl.mobile.capture

import com.zowl.mobile.ocr.LocalOcrParser
import org.junit.Assert.*
import org.junit.Test

class PaymentPageOcrTest {
    private fun candidate(text: String, windowId: Int = 7, generation: Int = 0, boot: Int = 3) =
        PaymentPageOcrFacts.candidate(LocalOcrParser.parse(text), text, "wechat", "com.tencent.mm",
            "install-1", boot, windowId, generation, 1_800_000_000_000)

    @Test fun pendingTransferPageBecomesAnExpenseToThePayeeUnderTheOcrIdentity() {
        val payment = candidate("O 支付成功\n待某某（昵称）确认收款\n¥1.00")!!
        assertEquals(100L, payment.amountMinor)
        assertEquals("某某（昵称）", payment.merchantName)
        assertEquals("wechat_payment_page_ocr_v1", payment.parserId)
        assertEquals(1, payment.parserVersion)
        assertEquals("com.tencent.mm", payment.sourcePackage)
        assertTrue(Regex("^[a-f0-9]{64}$").matches(payment.idempotencyKey))
        assertTrue(Regex("^[a-f0-9]{64}$").matches(payment.evidenceDigest))
        assertEquals(8_500, payment.confidenceBasisPoints)
        assertEquals(8_000, candidate("支付成功\n¥12.80")!!.confidenceBasisPoints)
    }

    @Test fun onlyOneUnambiguousAmountOnASuccessPageYieldsACandidate() {
        assertNull(candidate("支付成功\n¥1.00\n优惠¥2.00"))
        assertNull(candidate("支付成功\n完成"))
        assertNull(candidate("微信支付\n¥1.00"))
        assertNull(candidate("支付成功\n转账给某某\n¥1.00"))
        assertNull(candidate(""))
    }

    @Test fun identityIsStablePerWindowPageAndDistinctAcrossWindowsGenerationsAndBoots() {
        val text = "支付成功\n¥1.00"
        val key = candidate(text)!!.idempotencyKey
        assertEquals(key, candidate(text)!!.idempotencyKey) // a restart re-reading the same page
        assertEquals(key, candidate("O 支付成功\n¥ 1.00")!!.idempotencyKey) // not text-derived
        // A window id reused after a system restart must not collide with an older payment.
        assertNotEquals(key, candidate("支付成功\n¥9.99")!!.idempotencyKey)
        assertNotEquals(key, candidate(text, windowId = 8)!!.idempotencyKey)
        assertNotEquals(key, candidate(text, generation = 1)!!.idempotencyKey)
        assertNotEquals(key, candidate(text, boot = 4)!!.idempotencyKey)
    }

    @Test fun oneSuccessPageIsCapturedOnceAndRearmsOnlyAfterTwoOtherReads() {
        var time = 0L
        val sessions = PaymentPageOcrSessions { time }
        assertEquals(0, sessions.onSuccessPage(7, 100))
        assertNull(sessions.onSuccessPage(7, 100))
        assertNull(sessions.onSuccessPage(7, 700)) // a misread on the same page is not a new payment
        sessions.onOtherPage(7)
        assertNull(sessions.onSuccessPage(7, 100)) // one flaky read does not re-arm
        sessions.onOtherPage(7)
        sessions.onAmbiguousSuccessPage(7)
        sessions.onOtherPage(7)
        assertNull(sessions.onSuccessPage(7, 100))
        sessions.onOtherPage(7)
        sessions.onOtherPage(7)
        assertEquals(1, sessions.onSuccessPage(7, 100)) // next payment in the same window
        assertEquals(0, sessions.onSuccessPage(8, 100)) // another window is independent
        sessions.onOtherPage(9)
        sessions.onOtherPage(9)
        assertEquals(0, sessions.onSuccessPage(9, 100)) // misses before a capture never bump identity
        assertTrue(sessions.isCaptured(9))
        assertFalse(sessions.isCaptured(10))
        sessions.onOtherPage(9)
        assertTrue(sessions.isCaptured(9))
        sessions.onOtherPage(9)
        assertFalse(sessions.isCaptured(9))
    }

    @Test fun attemptsArePacedBackOffAndStopChainingOnceCapturedOrStale() {
        var time = 1_000L
        val sessions = PaymentPageOcrSessions { time }
        assertEquals(0L, sessions.delayBeforeAttempt(7))
        sessions.began(7)
        assertEquals(PaymentPageOcrSessions.FAST_INTERVAL, sessions.delayBeforeAttempt(7))
        time += 150
        assertEquals(PaymentPageOcrSessions.FAST_INTERVAL - 150, sessions.delayBeforeAttempt(7))
        time += PaymentPageOcrSessions.FAST_INTERVAL
        assertEquals(0L, sessions.delayBeforeAttempt(7))
        assertTrue(sessions.shouldChain(7))
        assertTrue(PaymentPageOcrSessions.FAST_INTERVAL in 334..500) // above the system minimum, well under a second
        repeat(PaymentPageOcrSessions.FAST_ATTEMPTS - 2) { sessions.began(7) }
        assertEquals(PaymentPageOcrSessions.FAST_INTERVAL, sessions.nextDelay(7))
        sessions.began(7)
        assertEquals(PaymentPageOcrSessions.SLOW_INTERVAL, sessions.nextDelay(7))
        repeat(PaymentPageOcrSessions.SLOW_ATTEMPTS - PaymentPageOcrSessions.FAST_ATTEMPTS) { sessions.began(7) }
        assertEquals(PaymentPageOcrSessions.IDLE_INTERVAL, sessions.nextDelay(7))
        sessions.onSuccessPage(7, 100)
        assertFalse(sessions.shouldChain(7))
        assertEquals(PaymentPageOcrSessions.CONSUMED_INTERVAL, sessions.nextDelay(7))
        assertTrue(sessions.shouldChain(8))
        time += PaymentPageOcrSessions.CHAIN_WINDOW
        assertFalse(sessions.shouldChain(8))
        assertEquals(0L, sessions.delayBeforeAttempt(8)) // events may still trigger a read
    }

    @Test fun onlyPaymentFlowWindowsAreEverScreenshotted() {
        listOf(
            "com.tencent.mm.plugin.remittance.ui.RemittanceResultNewUI",
            "com.tencent.mm.plugin.wallet_index.ui.WalletBrandUI",
            "com.tencent.mm.plugin.wallet.pay.ui.WalletPayUI",
            "com.tencent.kinda.framework.app.UIPageFragmentActivity",
            "com.tencent.mm.framework.app.UIPageFragmentActivity",
            "com.tencent.mm.plugin.offline.ui.WalletOfflineCoinPurseUI",
        ).forEach { assertTrue(it, PaymentPageOcrGate.allows("wechat", it)) }
        listOf(
            "com.tencent.mm.ui.LauncherUI",
            "com.tencent.mm.ui.chatting.ChattingUI",
            "com.tencent.mm.plugin.sns.ui.SnsTimeLineUI",
            "com.tencent.mm.plugin.appbrand.ui.AppBrandUI",
            "com.tencent.mm.plugin.webview.ui.tools.WebViewUI",
            null,
        ).forEach { assertFalse(it.toString(), PaymentPageOcrGate.allows("wechat", it)) }
        assertTrue(PaymentPageOcrGate.allows("alipay", "com.alipay.android.msp.ui.views.MspContainerActivity"))
        // "alipay" itself contains "pay": the package prefix must never open the gate.
        assertFalse(PaymentPageOcrGate.allows("alipay", "com.eg.android.AlipayGphone.AlipayLogin"))
        assertFalse(PaymentPageOcrGate.allows("alipay", "com.alipay.mobile.chatapp.ui.PersonalChatMsgActivity"))
        assertFalse(PaymentPageOcrGate.allows("cmb", "cmb.pb.wallet.PayActivity"))
        // Pinduoduo and JD are read from accessibility text only; no window of theirs is screenshotted.
        assertFalse(PaymentPageOcrGate.allows("jd", "com.jd.lib.cashier.sdk.pay.view.CashierPayActivity"))
        assertFalse(PaymentPageOcrGate.allows("pinduoduo", "com.xunmeng.pinduoduo.activity.NewPageActivity"))
    }

    private val lite = "com.tencent.mm.plugin.lite.ui.WxaLiteAppTransparentLiteUI"
    private val liteResult = "com.tencent.mm.plugin.lite.ui.WxaLiteAppLiteUI"
    private val walletBrand = "com.tencent.mm.plugin.wallet_index.ui.WalletBrandUI"
    private val offlineEntrance = "com.tencent.mm.plugin.offline.ui.WalletOfflineEntranceUI"
    private val paymentCode = "com.tencent.mm.framework.app.UIPageFragmentActivity"

    @Test fun wechatLiteAppWindowsAreNeverAdmittedByClassNameAlone() {
        assertTrue(PaymentPageOcrGate.isWechatLite(lite))
        assertTrue(PaymentPageOcrGate.isWechatLite(liteResult))
        assertFalse(PaymentPageOcrGate.isWechatLite(walletBrand))
        assertFalse(PaymentPageOcrGate.isWechatLite(null))
        assertFalse(PaymentPageOcrGate.allows("wechat", lite))
        assertFalse(PaymentPageOcrGate.allows("wechat", liteResult))
    }

    @Test fun miniProgramCashierJoinsThePaymentFlowWhenWalletBrandUiFollowsIt() {
        // Device trace: AppBrandUI00, then the cashier, then WalletBrandUI 0.4 s later.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(9689, "com.tencent.mm.plugin.appbrand.ui.AppBrandUI00")
        now += 3_000
        windows.onWindowState(9693, lite)
        assertFalse(windows.isPaymentWindow(9693))
        now += 375
        windows.onWindowState(9692, walletBrand)
        assertTrue(windows.isPaymentWindow(9693))
        assertFalse(windows.isPaymentWindow(9689))
        // Back on the mini-program page: the cashier window stays linked, nothing else joins.
        now += 7_000
        windows.onWindowState(9689, "com.tencent.mm.plugin.appbrand.ui.AppBrandUI00")
        windows.onWindowState(9700, lite)
        assertTrue(windows.isPaymentWindow(9693))
        assertFalse(windows.isPaymentWindow(9700))
    }

    @Test fun paymentCodeResultJoinsThePaymentFlowWhileTheCodeIsTheLastScreen() {
        // Device events: entrance, code page, then a lite page 6.6 s later.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(20, offlineEntrance)
        now += 130
        windows.onWindowState(21, paymentCode)
        now += 6_600
        windows.onWindowState(22, liteResult)
        assertTrue(windows.isPaymentWindow(22))
    }

    @Test fun aDialogOverThePaymentCodeDoesNotEndItsFlow() {
        // Device trace: the code page, 10 s later a one-line popup (obfuscated
        // `k2`, not an Activity) over it, then the lite result 1.55 s after the popup.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(11863, paymentCode)
        windows.onWindowState(11862, offlineEntrance)
        now += 10_400
        windows.onWindowState(11864, "com.tencent.mm.ui.widget.dialog.k2", screen = false)
        now += 1_550
        windows.onWindowState(11865, liteResult)
        assertTrue(windows.isPaymentWindow(11865))
        // The same lite window after a real screen in between stays out.
        windows.onWindowState(11870, paymentCode)
        windows.onWindowState(11871, "com.tencent.mm.ui.widget.dialog.k2", screen = false)
        windows.onWindowState(11872, "com.tencent.mm.ui.chatting.ChattingUI")
        windows.onWindowState(11873, liteResult)
        assertFalse(windows.isPaymentWindow(11873))
    }

    @Test fun liteWindowsOutsideThePaymentFlowAreNeverScreenshotted() {
        var now = 0L
        val windows = WechatLiteWindows { now }
        // No payment screen at all.
        windows.onWindowState(1, "com.tencent.mm.ui.LauncherUI")
        windows.onWindowState(2, lite)
        assertFalse(windows.isPaymentWindow(2))
        // A payment screen too long after the lite window.
        now += WechatLiteWindows.BEFORE_PAYMENT_SCREEN + 1
        windows.onWindowState(3, walletBrand)
        assertFalse(windows.isPaymentWindow(2))
        // The payment code was left for a chat before the lite window opened.
        windows.onWindowState(4, paymentCode)
        windows.onWindowState(5, "com.tencent.mm.ui.chatting.ChattingUI")
        windows.onWindowState(6, liteResult)
        assertFalse(windows.isPaymentWindow(6))
        // A lite window, then another screen, then a payment screen.
        windows.onWindowState(7, lite)
        windows.onWindowState(8, "com.tencent.mm.ui.chatting.ChattingUI")
        windows.onWindowState(9, walletBrand)
        assertFalse(windows.isPaymentWindow(7))
        // The payment code was on screen longer than any payment takes.
        windows.onWindowState(10, paymentCode)
        now += WechatLiteWindows.AFTER_PAYMENT_SCREEN + 1
        windows.onWindowState(11, liteResult)
        assertFalse(windows.isPaymentWindow(11))
    }

    private val appBrand = "com.tencent.mm.plugin.appbrand.ui.AppBrandUI00"
    private val taskProxy = "com.tencent.mm.plugin.appbrand.ui.AppBrandTaskProxyUI"
    private val launcher = "com.tencent.mm.ui.LauncherUI"

    @Test fun theMiniProgramTaskProxyDoesNotEndThePaymentFlow() {
        // Device trace: the cashier, the task proxy 0.26 s later, WalletBrandUI 0.13 s after that.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(19285, appBrand)
        now += 1_500
        windows.onWindowState(19293, lite)
        now += 262
        windows.onWindowState(19290, taskProxy)
        now += 134
        windows.onWindowState(19292, walletBrand)
        assertTrue(windows.isPaymentWindow(19293))
        assertFalse(windows.isPaymentWindow(19290))
        assertFalse(windows.isPaymentWindow(19285))
    }

    @Test fun aCashierReportedOnlyAsAFrameworkViewJoinsWhenWalletBrandUiFollowsIt() {
        // Two device traces: the cashier's own class is never reported.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(19350, appBrand)
        now += 13_000
        windows.onUnidentified(19354)
        assertFalse(windows.isPaymentWindow(19354))
        now += 217
        windows.onWindowState(19351, taskProxy)
        now += 120
        windows.onWindowState(19353, walletBrand)
        assertTrue(windows.isPaymentWindow(19354))
        assertFalse(windows.isPaymentWindow(19350))
    }

    @Test fun aTransparentLiteWindowTheTaskProxyOpensJoinsWithoutWalletBrandUi() {
        // Device trace: the task proxy, then the cashier 0.3 s later, no WalletBrandUI.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(20344, appBrand)
        now += 15_000
        windows.onWindowState(20345, taskProxy)
        now += 301
        windows.onWindowState(20348, lite)
        assertTrue(windows.isPaymentWindow(20348))
        // The proxy alone says nothing about a window whose class is not known, or the opaque lite page.
        now += 10_000
        windows.onWindowState(20400, taskProxy)
        windows.onUnidentified(20401)
        windows.onWindowState(20402, liteResult)
        assertFalse(windows.isPaymentWindow(20401))
        assertFalse(windows.isPaymentWindow(20402))
        // Nor does a proxy opened long before.
        windows.onWindowState(20403, taskProxy)
        now += WechatLiteWindows.BEFORE_PAYMENT_SCREEN + 1
        windows.onWindowState(20404, lite)
        assertFalse(windows.isPaymentWindow(20404))
    }

    @Test fun theCashierTaobaoHandsToWechatJoinsThePaymentFlow() {
        // Device trace: the WeChat cashier reports only FrameLayout, Taobao's cash
        // desk 0.12 s later, then a stale event of WeChat's launcher.
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onUnidentified(464)
        now += 51_000
        windows.onUnidentified(474)
        now += 118
        windows.onMerchantCashDesk(471)
        assertTrue(windows.isPaymentWindow(474))
        assertFalse(windows.isPaymentWindow(464))
        now += 270
        windows.onWindowState(9, launcher)
        assertTrue(windows.isPaymentWindow(474))
        assertFalse(windows.isPaymentWindow(9))
        // Coming back to the cash desk opens nothing: later WeChat popups stay out.
        now += 8_400
        windows.onMerchantCashDesk(471)
        windows.onUnidentified(480)
        assertFalse(windows.isPaymentWindow(480))
    }

    @Test fun theCashDeskAlsoLinksACashierThatOpensAfterIt() {
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onMerchantCashDesk(100)
        // WeChat's older windows come to the front first; they are not the cashier.
        now += 200
        windows.onWindowState(9, launcher)
        windows.onUnidentified(12)
        assertFalse(windows.isPaymentWindow(12))
        now += 600
        windows.onUnidentified(103)
        assertTrue(windows.isPaymentWindow(103))
        // One cash desk opens one cashier.
        windows.onUnidentified(104)
        assertFalse(windows.isPaymentWindow(104))
        // Too long after the cash desk opened.
        windows.onMerchantCashDesk(200)
        now += WechatLiteWindows.AFTER_CASH_DESK + 1
        windows.onWindowState(203, lite)
        assertFalse(windows.isPaymentWindow(203))
    }

    @Test fun aLinkedWindowThatTurnsOutToBeAnotherWechatScreenIsDropped() {
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onMerchantCashDesk(100)
        windows.onUnidentified(103)
        assertTrue(windows.isPaymentWindow(103))
        // A popup over it says nothing; a chat's own class does.
        assertFalse(windows.onIdentified(103, "com.tencent.mm.ui.widget.dialog.k2", screen = false))
        assertTrue(windows.isPaymentWindow(103))
        assertTrue(windows.onIdentified(103, "com.tencent.mm.ui.chatting.ChattingUI", screen = true))
        assertFalse(windows.isPaymentWindow(103))
        // The cashier's own class keeps it.
        windows.onMerchantCashDesk(110)
        windows.onUnidentified(113)
        assertFalse(windows.onIdentified(113, lite, screen = true))
        assertTrue(windows.isPaymentWindow(113))
        // A window linked by its lite class is never dropped by a class reported inside it.
        windows.onMerchantCashDesk(120)
        windows.onWindowState(123, lite)
        assertFalse(windows.onIdentified(123, launcher, screen = true))
        assertTrue(windows.isPaymentWindow(123))
    }

    @Test fun unidentifiedWindowsWithoutAPaymentNextToThemAreNeverScreenshotted() {
        var now = 0L
        val windows = WechatLiteWindows { now }
        windows.onWindowState(1, launcher)
        windows.onUnidentified(2)
        now += WechatLiteWindows.BEFORE_PAYMENT_SCREEN + 1
        windows.onWindowState(3, walletBrand)
        assertFalse(windows.isPaymentWindow(2))
        // A popup over a chat, then the chat again, then a payment screen.
        windows.onUnidentified(4)
        windows.onWindowState(5, "com.tencent.mm.ui.chatting.ChattingUI")
        windows.onWindowState(6, walletBrand)
        assertFalse(windows.isPaymentWindow(4))
        // Popups while the payment code is on screen or left for a chat are not its result.
        windows.onWindowState(7, paymentCode)
        windows.onUnidentified(8)
        assertFalse(windows.isPaymentWindow(8))
        // A cash desk that opened before any WeChat window did not open an older one.
        windows.onUnidentified(9)
        windows.onMerchantCashDesk(10)
        assertFalse(windows.isPaymentWindow(9))
    }

    @Test fun onlyTaobaosCashDeskHandsAPaymentToWechat() {
        assertTrue(PaymentPageOcrGate.isMerchantCashDesk("taobao", "com.taobao.tao.alipay.cashdesk.CashDeskActivity"))
        assertFalse(PaymentPageOcrGate.isMerchantCashDesk("taobao", "com.taobao.themis.container.app.TMSActivity"))
        assertFalse(PaymentPageOcrGate.isMerchantCashDesk("wechat", "com.taobao.tao.alipay.cashdesk.CashDeskActivity"))
        assertFalse(PaymentPageOcrGate.isMerchantCashDesk("taobao", null))
        // It is not screenshotted itself.
        assertFalse(PaymentPageOcrGate.allows("taobao", "com.taobao.tao.alipay.cashdesk.CashDeskActivity"))
    }

    @Test fun taobaoScreenshotsOnlyItsEmbeddedCashierAndResultPage() {
        assertEquals(PaymentPageOcrGate.Role.CASHIER,
            PaymentPageOcrGate.role("taobao", "com.alipay.android.msp.ui.views.MspContainerActivity"))
        assertEquals(PaymentPageOcrGate.Role.RESULT, PaymentPageOcrGate.role("taobao",
            "com.alibaba.android.ultron.vfw.weex2.highPerformance.widget.UltronTradeHybridActivity"))
        assertEquals(PaymentPageOcrGate.Role.PAYMENT,
            PaymentPageOcrGate.role("alipay", "com.alipay.android.msp.ui.views.MspContainerActivity"))
        listOf(
            "com.taobao.android.detail.alittdetail.TTDetailActivity",
            "com.taobao.android.tbabilitykit.pop.StdPopContainerActivity",
            "com.taobao.themis.container.app.TMSActivity",
            "com.taobao.tao.alipay.cashdesk.CashDeskActivity",
            "com.taobao.tao.welcome.Welcome",
            null,
        ).forEach { assertNull(it.toString(), PaymentPageOcrGate.role("taobao", it)) }
    }

    // Laid out as recognised on a device; shop, card, goods and prices are made up.
    private val cashierPaying = "天猫平台商户\n¥96.00\n招商银行储蓄卡(1234)\n正在付款中..."
    private val cashierPaid = "天猫平台商户\n¥96.00\n招商银行储蓄卡(1234)\n付款成功"
    private val resultPage = "支付成功\n本单确认收货后预计可+5.0淘气值\n帆布手提包\n查看订单\n100淘金币,立省!\n¥59\n¥79"

    @Test fun taobaoCashierShowsTheAmountAndBrieflyTheOutcomeOnOneWindow() {
        assertNull(LocalOcrParser.parse(cashierPaying).amount)
        assertEquals("96.00", LocalOcrParser.singleAmount(cashierPaying))
        val paid = PaymentPageOcrFacts.candidate(LocalOcrParser.parse(cashierPaid), cashierPaid, "taobao",
            "com.taobao.taobao", "install-1", 3, 41, 0, 1_800_000_000_000)!!
        assertEquals(9_600L, paid.amountMinor)
        assertEquals("taobao_payment_page_ocr_v1", paid.parserId)
        assertNull(paid.merchantName)
        // The result page has the heading but never a usable amount of its own.
        assertTrue(LocalOcrParser.hasSuccessHeading(resultPage))
        assertNull(LocalOcrParser.singleAmount(resultPage))
        assertFalse(LocalOcrParser.hasSuccessHeading("订单支付成功通知\n¥96.00"))
        assertNull(LocalOcrParser.singleAmount("¥32.00 x 3期\n¥96.00"))
        assertNull(LocalOcrParser.singleAmount(LocalOcrParser.withoutOffers("¥32.00 x 3期\n¥96.00")))
        // Whichever window confirms the payment, the candidate has one identity.
        val confirmed = PaymentPageOcrFacts.candidate(PaymentPageOcrFacts.fields(9_600L), resultPage, "taobao",
            "com.taobao.taobao", "install-1", 3, 41, 0, 1_800_000_000_500)!!
        assertEquals(paid.idempotencyKey, confirmed.idempotencyKey)
        assertEquals(9_600L, confirmed.amountMinor)
    }

    @Test fun anOfferUnderTheCashierAmountIsNotWhatIsCharged() {
        // Device layout (8 node lines, 2 amounts), prices made up: the offer below the
        // amount kept the cashier from remembering any amount, so payments were missed.
        val cashier = "关闭\n更改付款方式\n淘宝闪购商户\n¥28.80\n有立减0.50元可选\n招商银行储蓄卡(1234)\n" +
            "优先使用此方式，按支付顺序完成付款\n极速付款"
        assertNull(LocalOcrParser.singleAmount(cashier))
        assertEquals(1, LocalOcrParser.offerLines(cashier))
        assertEquals("28.80", LocalOcrParser.singleAmount(LocalOcrParser.withoutOffers(cashier)))
        // An applied offer: the amount charged is still the one standing alone.
        assertEquals("28.30", LocalOcrParser.singleAmount(LocalOcrParser.withoutOffers(
            "淘宝闪购商户\n¥28.30\n已立减0.50元\n招商银行储蓄卡(1234)")))
        // A struck-through original price stands alone too: two amounts, nothing is guessed.
        assertNull(LocalOcrParser.singleAmount(LocalOcrParser.withoutOffers(
            "淘宝闪购商户\n¥28.30\n¥28.80\n已优惠0.50元\n招商银行储蓄卡(1234)")))
        // Other offers seen on cashiers.
        listOf("红包抵扣¥5.00", "满20减3元", "使用优惠券 -¥2.00", "返现1.00元")
            .forEach { assertEquals(it, "12.00", LocalOcrParser.singleAmount(LocalOcrParser.withoutOffers("¥12.00\n$it"))) }
    }

    @Test fun taobaoResultPageConfirmsTheCashierAmountOnceAndOnlySoonAfter() {
        var clock = 0L
        val flow = ShoppingCashierFlow { clock }
        assertNull(flow.onResultSuccess()) // a result page with no cashier before it
        flow.onCashierAmount(41, 9_600L)
        clock = 4_000
        val confirmed = flow.onResultSuccess()!!
        assertEquals(41, confirmed.windowId)
        assertEquals(9_600L, confirmed.amountMinor)
        assertNull(flow.onResultSuccess()) // the page stays on screen and is read again
        flow.onCashierAmount(41, 9_600L) // a late frame of the same cashier
        assertNull(flow.onResultSuccess())

        // The cashier reported success itself: the result page adds nothing.
        flow.onCashierAmount(42, 990L)
        flow.onCashierSettled(42)
        assertNull(flow.onResultSuccess())

        // A cancelled checkout followed much later by some success page is not a payment.
        flow.onCashierAmount(43, 5_000L)
        clock += ShoppingCashierFlow.CONFIRM_WINDOW + 1
        assertNull(flow.onResultSuccess())

        // The amount the user changed to and then paid is the one confirmed.
        flow.onCashierAmount(44, 5_000L)
        clock += 2_000
        flow.onCashierAmount(44, 4_500L)
        clock += 1_500
        flow.onCashierAmount(44, 4_500L)
        clock += 100
        assertTrue(flow.awaitsConfirmation())
        assertEquals(4_500L, flow.onResultSuccess()!!.amountMinor)
        assertFalse(flow.awaitsConfirmation())

        // A checkout that redraws with another amount in the instant the payment completes was
        // paid at the amount submitted (seen on the device: 120 ms between redraw and success).
        flow.onCashierAmount(46, 4_567L)
        clock += 3_000
        flow.onCashierAmount(46, 7_500L)
        clock += 120
        val redrawn = flow.onResultSuccess()!!
        assertEquals(4_567L, redrawn.amountMinor)
        assertEquals(46, redrawn.windowId)

        // Another checkout window never lends its amount.
        flow.onCashierAmount(47, 1_000L)
        clock += 50
        flow.onCashierAmount(48, 2_000L)
        clock += 50
        assertEquals(2_000L, flow.onResultSuccess()!!.amountMinor)
    }

    @Test fun onlyAppClassesIdentifyAWindowAndLabelsAreBareIdentifiers() {
        assertTrue(PaymentPageOcrGate.isAppClass("com.tencent.mm.ui.LauncherUI"))
        listOf("android.widget.FrameLayout", "androidx.appcompat.app.AlertDialog", "android.app.Dialog", "NoDots", null)
            .forEach { assertFalse(it.toString(), PaymentPageOcrGate.isAppClass(it)) }
        assertEquals("RemittanceResultNewUI", PaymentPageOcrGate.label("com.tencent.mm.plugin.remittance.ui.RemittanceResultNewUI"))
        assertEquals("unknown", PaymentPageOcrGate.label(null))
        assertEquals("ab", PaymentPageOcrGate.label("x.a b！"))
    }

    private val tms = "com.taobao.themis.container.app.TMSActivity"
    private val cashDesk = "com.taobao.tao.alipay.cashdesk.CashDeskActivity"
    private val msp = "com.alipay.android.msp.ui.views.MspContainerActivity"

    @Test fun taobaoDialogOverTheCashierIsItsResultWindow() {
        // Device trace: an ele.me order in TMSActivity, the cash desk, the
        // cashier, then an empty android.app.Dialog 0.54 s later, closed with the cashier.
        var now = 0L
        val dialogs = CashierOverlayDialogs("taobao") { now }
        dialogs.onWindowState(10234, tms)
        dialogs.onWindowState(10235, cashDesk)
        now += 100
        dialogs.onWindowState(10238, msp)
        now += 540
        dialogs.onWindowState(10239, "android.app.Dialog")
        assertTrue(dialogs.isResultWindow(10239))
        assertFalse(dialogs.isResultWindow(10238))
        assertFalse(dialogs.isResultWindow(10234))
        // Back in the mini-program: the next dialog is not part of any payment.
        dialogs.onWindowState(10240, tms)
        dialogs.onWindowState(10241, "android.app.Dialog")
        assertFalse(dialogs.isResultWindow(10241))
    }

    @Test fun taobaoDialogsAwayFromTheCashierAreNeverScreenshotted() {
        var now = 0L
        val dialogs = CashierOverlayDialogs("taobao") { now }
        dialogs.onWindowState(1, "android.app.Dialog")
        assertFalse(dialogs.isResultWindow(1))
        dialogs.onWindowState(2, msp)
        now += CashierOverlayDialogs.AFTER_CASHIER + 1
        dialogs.onWindowState(3, "android.app.Dialog")
        assertFalse(dialogs.isResultWindow(3))
        // Only framework dialogs: a Taobao screen of its own ends the cashier flow instead.
        dialogs.onWindowState(4, msp)
        dialogs.onWindowState(5, "com.taobao.android.dialog.PromotionDialog")
        dialogs.onWindowState(6, "android.app.Dialog")
        assertFalse(dialogs.isResultWindow(5))
        assertFalse(dialogs.isResultWindow(6))
        // Framework windows that are not dialogs are neither linked nor end the flow.
        dialogs.onWindowState(7, msp)
        dialogs.onWindowState(8, "android.widget.FrameLayout")
        dialogs.onWindowState(9, "androidx.appcompat.app.AlertDialog")
        assertFalse(dialogs.isResultWindow(8))
        assertTrue(dialogs.isResultWindow(9))
    }

    @Test fun taobaoCashierClosingWithItsTextFreeOverlayReportsThePayment() {
        // Device trace (ele.me, password-free): the cashier read with one amount,
        // the overlay 0.58 s later recognised four times with no character, then TMSActivity
        // came back 1.56 s after the overlay opened, with no cashier screen in between.
        var now = 0L
        val dialogs = CashierOverlayDialogs("taobao") { now }
        assertFalse(dialogs.onWindowState(10755, tms))
        assertFalse(dialogs.onWindowState(10759, msp))
        dialogs.onCashierActive()
        now += 580
        assertFalse(dialogs.onWindowState(10760, "android.app.Dialog"))
        repeat(4) {
            now += 400
            dialogs.onWindowRead(10760, 0, recognised = false)
            dialogs.onWindowRead(10760, 0, recognised = true)
        }
        now += 360
        assertTrue(dialogs.onWindowState(10755, tms))
        // Once only.
        assertFalse(dialogs.onWindowState(10761, tms))
    }

    @Test fun taobaoCashierThatOutlivesItsOverlayIsNoProofOfPayment() {
        var now = 0L
        val dialogs = CashierOverlayDialogs("taobao") { now }
        fun overlayRecognisedOver(window: Int) {
            dialogs.onWindowState(window, msp)
            now += 500
            dialogs.onWindowState(window + 1, "android.app.Dialog")
            now += 400
            dialogs.onWindowRead(window + 1, 1, recognised = true)
        }
        // A failed payment: the cashier is back on top (its own window-state, or the active window).
        overlayRecognisedOver(10)
        dialogs.onWindowState(10, msp)
        assertFalse(dialogs.onWindowState(1, tms))
        overlayRecognisedOver(20)
        dialogs.onCashierActive()
        assertFalse(dialogs.onWindowState(1, tms))
        // A dialog with something to read, e.g. "give up this payment?", is not the overlay.
        overlayRecognisedOver(30)
        dialogs.onWindowRead(31, CashierOverlayDialogs.TEXT_FREE_LIMIT, recognised = true)
        assertFalse(dialogs.onWindowState(1, tms))
        overlayRecognisedOver(40)
        dialogs.onWindowRead(41, 12, recognised = false)
        assertFalse(dialogs.onWindowState(1, tms))
        // An overlay never recognised is no evidence that it was the text-free one.
        dialogs.onWindowState(50, msp)
        dialogs.onWindowState(51, "android.app.Dialog")
        dialogs.onWindowRead(51, 0, recognised = false)
        assertFalse(dialogs.onWindowState(1, tms))
        // Too long under the overlay to tell what ended it.
        overlayRecognisedOver(60)
        now += CashierOverlayDialogs.OVERLAY_MAX
        assertFalse(dialogs.onWindowState(1, tms))
        // Reads of other windows do not count for the overlay.
        dialogs.onWindowState(70, msp)
        dialogs.onWindowState(71, "android.app.Dialog")
        dialogs.onWindowRead(70, 0, recognised = true)
        assertFalse(dialogs.onWindowState(1, tms))
        // Framework windows that are not dialogs neither end the overlay nor report it.
        overlayRecognisedOver(80)
        assertFalse(dialogs.onWindowState(2, "android.widget.FrameLayout"))
        assertTrue(dialogs.onWindowState(1, tms))
    }
}

package com.zowl.mobile.capture

import org.junit.Assert.*
import org.junit.Test

class PaymentCodeWatchTest {
    private var now = 0L
    private val watch = PaymentCodeWatch { now }

    @Test fun paymentCodeScreensAreRecognisedByTheirOwnPackageOfWeChat() {
        assertTrue(PaymentPageOcrGate.isWechatPaymentCode("com.tencent.mm.plugin.offline.ui.WalletOfflineEntranceUI"))
        assertTrue(PaymentPageOcrGate.isWechatPaymentCode("com.tencent.mm.plugin.offline.ui.WalletOfflineCoinPurseUI"))
        assertFalse(PaymentPageOcrGate.isWechatPaymentCode("com.tencent.mm.framework.app.UIPageFragmentActivity"))
        assertFalse(PaymentPageOcrGate.isWechatPaymentCode("com.tencent.mm.plugin.wallet_index.ui.WalletBrandUI"))
        assertFalse(PaymentPageOcrGate.isWechatPaymentCode(null))
    }

    @Test fun leavingTheCodeWithoutACaptureAsksOnceAfterTheGracePeriod() {
        watch.onCodeShown()
        now += 20_000
        watch.onLeftFlow()
        now += PaymentCodeWatch.GRACE - 1
        assertFalse(watch.takeDue())
        now += 1
        assertTrue(watch.takeDue())
        assertFalse(watch.pending())
        now += 60_000
        assertFalse(watch.takeDue())
    }

    @Test fun aCaptureAtAnyPointMeansThereIsNothingToAsk() {
        watch.onCodeShown()
        watch.onLeftFlow()
        now += 5_000
        // The result page was read just after leaving.
        watch.onCaptured()
        now += PaymentCodeWatch.GRACE
        assertFalse(watch.takeDue())
        assertFalse(watch.pending())
    }

    @Test fun anotherAppOrADarkScreenCountsAsLeavingButAGlanceAwayDoesNot() {
        watch.onCodeShown()
        now += 2_000
        watch.onFront(wechat = false) // notification shade pulled down
        now += 3_000
        watch.onFront(wechat = true)  // back on the code
        now += PaymentCodeWatch.GRACE
        assertFalse(watch.takeDue())
        watch.onFront(wechat = false) // home screen
        now += PaymentCodeWatch.GRACE
        assertTrue(watch.takeDue())
    }

    @Test fun returningToWeChatAfterMovingToAnotherScreenStillAsks() {
        watch.onCodeShown()
        watch.onLeftFlow()            // e.g. back to the service page
        now += 3_000
        watch.onFront(wechat = true)  // WeChat is in front, but not on the code
        now += PaymentCodeWatch.GRACE
        assertTrue(watch.takeDue())
    }

    @Test fun reopeningTheCodeWithinTheGracePeriodKeepsWatching() {
        watch.onCodeShown()
        watch.onLeftFlow()
        now += 4_000
        watch.onCodeShown()
        now += PaymentCodeWatch.GRACE
        assertFalse(watch.takeDue())
        assertTrue(watch.pending())
    }

    @Test fun aCodeLeftOnScreenIsAskedAboutOnceItHasBeenUpTooLong() {
        watch.onCodeShown()
        now += PaymentCodeWatch.MAX_SHOWN - 1
        assertFalse(watch.takeDue())
        now += 1
        assertTrue(watch.takeDue())
    }

    @Test fun nothingIsWatchedUntilACodeIsShown() {
        watch.onLeftFlow()
        watch.onFront(wechat = false)
        now += PaymentCodeWatch.MAX_SHOWN
        assertFalse(watch.pending())
        assertFalse(watch.takeDue())
    }
}

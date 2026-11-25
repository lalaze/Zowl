package com.zowl.mobile.capture

import org.junit.Assert.assertEquals
import org.junit.Test

class LookDelayTest {
    @Test
    fun aSettlingPageIsReadHalfASecondAfterItsLastEvent() {
        assertEquals(500L, LookDelay.millis("pinduoduo", fast = false, waited = 0))
        assertEquals(500L, LookDelay.millis("pinduoduo", fast = false, waited = 900))
        assertEquals(500L, LookDelay.millis("alipay", fast = false, waited = 0))
    }

    // 2026-11-20: a Pinduoduo order panel redrew for 15 s and was never read.
    @Test
    fun anOrderPanelThatNeverSettlesIsStillReadWithinABoundedWait() {
        assertEquals(300L, LookDelay.millis("pinduoduo", fast = false, waited = 1_200))
        assertEquals(0L, LookDelay.millis("pinduoduo", fast = false, waited = 1_500))
        assertEquals(0L, LookDelay.millis("pinduoduo", fast = false, waited = 9_000))
    }

    @Test
    fun otherAppsKeepWaitingForAQuietPage() {
        for (platform in listOf("alipay", "wechat", "taobao", "jd")) {
            assertEquals(500L, LookDelay.millis(platform, fast = false, waited = 9_000))
        }
    }

    @Test
    fun aPaymentWindowReadByOcrIsLookedAtAtOnce() {
        assertEquals(120L, LookDelay.millis("taobao", fast = true, waited = 0))
        assertEquals(120L, LookDelay.millis("wechat", fast = true, waited = 9_000))
    }
}

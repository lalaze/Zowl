package com.zowl.mobile.ocr

import org.junit.Assert.*
import org.junit.Test
import com.zowl.mobile.ocr.LocalOcrWindowPolicy.Window
import com.zowl.mobile.ocr.LocalOcrWindowPolicy.Bounds
import com.zowl.mobile.ocr.LocalOcrWindowPolicy.Kind

class LocalOcrTest {
    @Test fun parserRequiresExplicitSuccessAndNeverGuessesMissingFacts() {
        val fields = LocalOcrParser.parse("支付成功\n￥12.80\n收款方：山岚咖啡\n完成")
        assertEquals("12.80", fields.amount)
        assertEquals("山岚咖啡", fields.merchant)
        assertNull(fields.warning)
        assertNull(LocalOcrParser.parse("支付成功\n¥12.80\n完成").merchant)
        assertEquals("missing_amount", LocalOcrParser.parse("付款成功\n完成").warning)
        assertEquals("12.80", LocalOcrParser.parse("付款成功\n实付金额\n12.80\n完成").amount)
    }

    @Test fun parserRejectsHistoricalChatRefundForeignAndEmptyText() {
        assertEquals("empty_text", LocalOcrParser.parse(" \n").warning)
        listOf("好友说支付成功\n￥12.80", "支付成功\n退款\n￥12.80", "交易详情\n支付成功\n￥12.80",
            "支付成功\nUSD 12.80", "支付成功\n港币￥12.80", "切换到按住说话\n支付成功\n￥12.80").forEach {
            assertEquals("unsupported_page", LocalOcrParser.parse(it).warning)
            assertNull(LocalOcrParser.parse(it).amount)
        }
        assertEquals("too_much_text", LocalOcrParser.parse("a".repeat(12001)).warning)
    }

    @Test fun ambiguityNeverRanksAmountsOrMerchants() {
        val fields = LocalOcrParser.parse("支付成功\n实付金额12.80\n优惠￥2.00\n收款方：甲\n收款方：乙")
        assertEquals("multiple_amounts", fields.warning)
        assertNull(fields.amount)
        assertNull(fields.merchant)
        assertEquals("12.80", LocalOcrParser.parse("支付成功\n￥12.80\n12.8元").amount)
        listOf("￥0.00", "￥12.345", "￥1,234.56", "1,234.56元", "￥999999999999.99").forEach {
            assertNull(LocalOcrParser.parse("支付成功\n$it").amount)
        }
    }

    @Test fun ownerBoundSingleUseDraftExpiresAndCannotCompleteAfterCancellation() {
        var time = 100L
        val state = LocalOcrState { time }
        assertNull(state.begin(7, "com.tencent.mm"))
        state.bind("alice")
        val request = state.begin(7, "com.tencent.mm")!!
        assertNull(state.begin(7, "com.tencent.mm"))
        assertTrue(state.capturing())
        assertTrue(state.complete(request.id, LocalOcrParser.Fields("12.80", null, null)))
        assertFalse(state.capturing())
        assertFalse(state.complete(request.id, LocalOcrParser.Fields("99.00", null, null)))
        assertNull(state.take("bob"))
        assertEquals("12.80", state.take("alice")!!.amount)
        assertNull(state.take("alice"))
        assertTrue(state.valid(request.id, "alice"))
        state.clear("old-id")
        assertTrue(state.valid(request.id, "alice"))
        time += LocalOcrState.DRAFT_TTL
        assertFalse(state.valid(request.id, "alice"))
        assertFalse(state.busy())
        val next = state.begin(7, "com.tencent.mm")!!
        state.bind("bob")
        assertFalse(state.complete(next.id, LocalOcrParser.Fields("1.00", null, null)))
        assertNull(state.take("bob"))
        state.bind(null)
        assertNull(state.begin(7, "com.tencent.mm"))
    }

    @Test fun requestTimeoutAndSameOwnerRebinding() {
        var time = 1L
        val state = LocalOcrState { time }
        state.bind("alice")
        val request = state.begin(1, "com.tencent.mm")!!
        state.bind("alice")
        assertTrue(state.current(request.id))
        time += LocalOcrState.REQUEST_TTL
        assertFalse(state.complete(request.id, LocalOcrParser.Fields("1.00", null, null)))
        assertNull(state.take("alice"))
    }

    private val app = Window(1, "com.tencent.mm", Kind.APP, 0, true, true, Bounds(0, 0, 1080, 2400))
    private fun safe(vararg windows: Window) = LocalOcrWindowPolicy.safe(windows.toList(), 1, "com.tencent.mm", 100)

    @Test fun onlyOriginalFocusedPaymentWindowWithNoOcclusionPasses() {
        assertTrue(safe(app)) // Empty node tree is not part of the policy at all.
        assertFalse(safe(app.copy(pkg = "com.zowl.mobile")))
        assertFalse(safe(app.copy(pkg = "com.eg.android.AlipayGphone")))
        assertFalse(safe(app.copy(pkg = null)))
        assertFalse(safe(app.copy(id = 2)))
        assertFalse(safe(app.copy(active = false)))
        assertFalse(safe(app.copy(displayId = 1)))
        assertFalse(safe(app, app.copy(id = 2, pkg = "other.app", layer = 2)))
        val shade = Window(2, "com.android.systemui", Kind.SYSTEM, 5, true, true, Bounds(0, 0, 1080, 2400))
        assertFalse(safe(app, shade))
        assertFalse(safe(app, shade.copy(active = false, focused = false)))
        assertFalse(safe(app, shade.copy(kind = Kind.OVERLAY, active = false, focused = false)))
        assertFalse(safe(app, shade.copy(kind = Kind.KEYBOARD, active = false, focused = false)))
        assertTrue(safe(app, shade.copy(active = false, focused = false, bounds = Bounds(0, 0, 1080, 80))))
    }

    @Test fun unboundRequestBindsOnceToTheWindowFoundAfterThePanelCollapses() {
        val state = LocalOcrState { 1L }
        state.bind("alice")
        val request = state.begin()!!
        assertEquals(LocalOcrState.NO_WINDOW, request.windowId)
        assertNull(state.bindTarget("other-id", 7, "com.tencent.mm"))
        assertNull(state.bindTarget(request.id, LocalOcrState.NO_WINDOW, "com.tencent.mm"))
        assertNull(state.bindTarget(request.id, 7, ""))
        val bound = state.bindTarget(request.id, 7, "com.tencent.mm")!!
        assertEquals(request.id, bound.id)
        assertEquals(7, bound.windowId)
        assertNull(state.bindTarget(request.id, 8, "com.eg.android.AlipayGphone"))
        assertTrue(state.complete(request.id, LocalOcrParser.Fields("12.80", null, null)))
        assertEquals("com.tencent.mm", state.take("alice")!!.request.packageName)
        state.clear()
        val next = state.begin()!!
        state.bind("bob")
        assertNull(state.bindTarget(next.id, 7, "com.tencent.mm"))
    }

    private fun verdict(vararg windows: Window) = LocalOcrWindowPolicy.verdict(windows.toList(), null, null, 100)

    @Test fun expandedPanelHidesTheAppWindowAndIsReportedAsNoAppWindow() {
        val panel = Window(2, "com.android.systemui", Kind.SYSTEM, 5, true, true, Bounds(0, 0, 1080, 2400))
        // What accessibility reports at tile-click time: the payment window is not listed at all.
        assertEquals(LocalOcrDiagnosticsSchema.Reason.NO_APP_WINDOW, verdict(panel))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.BLOCKED_WINDOW, verdict(app.copy(focused = true), panel))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.READY, verdict(app))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.READY, verdict(app.copy(pkg = "com.eg.android.AlipayGphone")))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.PACKAGE_EMPTY, verdict(app.copy(pkg = null)))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.PACKAGE_UNSUPPORTED, verdict(app.copy(pkg = "other.app")))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.MULTIPLE_APP_WINDOWS, verdict(app, app.copy(id = 2)))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.NOT_FOCUSED, verdict(app.copy(focused = false)))
        assertEquals(LocalOcrDiagnosticsSchema.Reason.TARGET_CHANGED,
            LocalOcrWindowPolicy.verdict(listOf(app), 9, "com.tencent.mm", 100))
    }

    @Test fun smallUnfocusedOverlaysDoNotBlockButLargeCoversDo() {
        val floatingButton = Window(3, "com.android.systemui", Kind.SYSTEM, 6, false, false, Bounds(960, 1200, 1080, 1320))
        val banner = Window(4, "com.android.systemui", Kind.SYSTEM, 6, false, false, Bounds(30, 90, 1050, 420))
        assertTrue(safe(app, floatingButton))
        assertTrue(safe(app, floatingButton.copy(kind = Kind.OVERLAY, pkg = "other.service")))
        assertTrue(safe(app, banner))
        assertTrue(safe(app, floatingButton, banner))
        assertFalse(safe(app, floatingButton.copy(focused = true)))
        assertFalse(safe(app, banner.copy(bounds = Bounds(0, 0, 1080, 1200)))) // half-open panel
        assertFalse(safe(app, floatingButton.copy(kind = Kind.KEYBOARD)))
        assertTrue(safe(app, banner.copy(layer = -1, bounds = Bounds(0, 0, 1080, 2400)))) // below the target
    }

    @Test fun headingToleratesIconNoiseAndBareAmountLinesButNotSurroundingWords() {
        // The WeChat result page as a screenshot: brand icon beside the heading, payee line, bare amount.
        listOf("支付成功", "O 支付成功", "© 支付成功", "✓支付成功", "支 付 成 功", "支付成功 >").forEach { heading ->
            val fields = LocalOcrParser.parse("$heading\n待某某（昵称）确认收款\n¥1.00")
            assertNull(heading, fields.warning)
            assertEquals(heading, "1.00", fields.amount)
        }
        listOf("1.00", "Y1.00", "¥ 1.00", "￥1.00").forEach {
            assertEquals(it, "1.00", LocalOcrParser.parse("支付成功\n$it").amount)
        }
        listOf("好友说支付成功", "支付成功了吗", "ABC支付成功", "等待支付成功通知").forEach {
            val fields = LocalOcrParser.parse("$it\n¥1.00")
            assertEquals(it, "unsupported_page", fields.warning)
            assertEquals(it, "no_success_marker", fields.detail)
        }
        assertEquals("excluded_content", LocalOcrParser.parse("支付成功\n转账给某某\n¥1.00").detail)
        assertEquals("missing_amount", LocalOcrParser.parse("支付成功\n10:30\n1.5").warning)
        assertEquals("multiple_amounts", LocalOcrParser.parse("支付成功\n1.00\n2.00").warning)
    }

    @Test fun billDetailWithASuccessStatusIsNeverANewPayment() {
        listOf("当前状态\n支付成功\n¥12.80", "支付成功\n¥12.80\n支付时间 2026年11月13日", "支付成功\n¥12.80\n交易单号 4200001",
            "支付成功\n¥12.80\n商户单号 88").forEach {
            val fields = LocalOcrParser.parse(it)
            assertEquals(it, "unsupported_page", fields.warning)
            assertEquals(it, "excluded_content", fields.detail)
        }
    }
}

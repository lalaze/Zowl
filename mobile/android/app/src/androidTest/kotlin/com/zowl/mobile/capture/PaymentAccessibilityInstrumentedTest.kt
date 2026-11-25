package com.zowl.mobile.capture

import android.content.Context
import android.app.UiAutomation
import android.content.Intent
import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PaymentAccessibilityInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val preferences by lazy { CapturePreferences(context) }
    private val queue by lazy { EncryptedCaptureQueue(context) }
    private val success = listOf("支付成功", "￥18.80", "收款方", "测试咖啡店", "完成")
    private var previousServices = ""
    private var previousEnabled = "0"

    @Before fun setup() {
        previousServices = shell("settings get secure enabled_accessibility_services").trim().takeUnless { it == "null" }.orEmpty()
        previousEnabled = shell("settings get secure accessibility_enabled").trim().takeUnless { it == "null" } ?: "0"
        val component = "${context.packageName}/${PaymentAccessibilityService::class.java.name}"
        val services = (previousServices.split(':').filter(String::isNotBlank) + component).distinct().joinToString(":")
        shell("settings put secure enabled_accessibility_services $services")
        shell("settings put secure accessibility_enabled 1")
        preferences.enabled = true
        preferences.setSourceEnabled("alipay", true)
        preferences.configureSession("https://money.example", "test-only", "page-test-user")
        preferences.pauseSession() // Keep all candidates in the local encrypted queue.
        preferences.savePageSession("alipay", "page-test-user", PaymentPageSession())
        queue.clear()
        waitUntil { PaymentAccessibilityService.connected }
        instrumentation.startActivitySync(Intent(context, PaymentPageFixtureActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        waitUntil { PaymentPageFixtureActivity.current != null }
    }

    @After fun cleanup() {
        preferences.enabled = false
        preferences.clearSession()
        queue.clear()
        NotificationCaptureWorker.cancel(context)
        instrumentation.runOnMainSync { PaymentPageFixtureActivity.current?.finish() }
        if (previousServices.isBlank()) shell("settings delete secure enabled_accessibility_services")
        else shell("settings put secure enabled_accessibility_services $previousServices")
        shell("settings put secure accessibility_enabled $previousEnabled")
    }

    @Test fun realAccessibilityCallbacksCaptureOnceAndAllowANewSameAmountCheckout() {
        show(success)
        waitUntil { queue.count() == 1 }
        val first = queue.peek().single()
        assertEquals(1880L, first.amountMinor)
        assertEquals("测试咖啡店", first.merchantName)
        assertEquals("alipay_payment_page_v1", first.parserId)
        show(success + "广告已更新")
        Thread.sleep(1000)
        assertEquals(1, queue.count())
        // Simulate leaving and returning to the old success page.
        show(listOf("首页"))
        Thread.sleep(750)
        show(success)
        Thread.sleep(1000)
        assertEquals(1, queue.count())
        // Persisted session state must survive a real service unbind/rebind.
        if (previousServices.isBlank()) shell("settings delete secure enabled_accessibility_services")
        else shell("settings put secure enabled_accessibility_services $previousServices")
        waitUntil { !PaymentAccessibilityService.connected }
        val component = "${context.packageName}/${PaymentAccessibilityService::class.java.name}"
        val services = (previousServices.split(':').filter(String::isNotBlank) + component).distinct().joinToString(":")
        shell("settings put secure enabled_accessibility_services $services")
        shell("settings put secure accessibility_enabled 1")
        waitUntil { PaymentAccessibilityService.connected }
        show(success + "页面重新显示")
        Thread.sleep(1000)
        assertEquals(1, queue.count())
        show(listOf("确认付款", "￥18.80"))
        waitUntil { !preferences.pageSession("alipay", "page-test-user").consumed }
        show(success)
        waitUntil { queue.count() == 2 }
        assertNotEquals(first.idempotencyKey, queue.peek()[1].idempotencyKey)
    }

    @Test fun masterAndSourceSwitchesStopCaptureAndHistoricalDetailsAreRejected() {
        show(success + "账单详情")
        Thread.sleep(1000)
        assertEquals(0, queue.count())
        preferences.enabled = false
        show(success)
        Thread.sleep(1000)
        assertEquals(0, queue.count())
        preferences.enabled = true
        preferences.setSourceEnabled("alipay", false)
        show(success + "页面更新")
        Thread.sleep(1000)
        assertEquals(0, queue.count())
    }

    @Test fun readsWechatPaymentTextInsideANotImportantContainer() {
        preferences.setSourceEnabled("wechat", true)
        preferences.savePageSession("wechat", "page-test-user", PaymentPageSession())
        CaptureDiagnosticsStore(context).reset()
        instrumentation.runOnMainSync {
            PaymentAccessibilityService.debugFixtureSource = PaymentPageParser.WECHAT_PACKAGE
            requireNotNull(PaymentPageFixtureActivity.current).show(success, unimportantContainer = true)
        }
        Thread.sleep(1800)
        assertEquals("Local diagnostics: ${CaptureDiagnosticsStore(context).snapshot()}", 1, queue.count())
        assertEquals("wechat", queue.peek().single().platform)
    }

    @Test fun readsDeeplyNestedWechatSuccessPages() {
        preferences.setSourceEnabled("wechat", true)
        preferences.savePageSession("wechat", "page-test-user", PaymentPageSession())
        CaptureDiagnosticsStore(context).reset()
        instrumentation.runOnMainSync {
            PaymentAccessibilityService.debugFixtureSource = PaymentPageParser.WECHAT_PACKAGE
            requireNotNull(PaymentPageFixtureActivity.current).show(success, depth = 16)
        }
        Thread.sleep(1800)
        assertEquals("Local diagnostics: ${CaptureDiagnosticsStore(context).snapshot()}", 1, queue.count())
    }

    @Test fun aNewPaymentCodeCanArmEachWechatPaymentWithoutRecordingTheCode() {
        preferences.setSourceEnabled("wechat", true)
        preferences.savePageSession("wechat", "page-test-user", PaymentPageSession().consume())
        CaptureDiagnosticsStore(context).reset()
        instrumentation.runOnMainSync {
            PaymentAccessibilityService.debugFixtureSource = PaymentPageParser.WECHAT_PACKAGE
        }
        repeat(2) { index ->
            show(listOf("收付款", "优先使用此支付方式付款", "零钱"))
            waitUntil { preferences.pageSession("wechat", "page-test-user").checkoutVisible }
            assertEquals(index, queue.count())
            show(success)
            waitUntil { queue.count() == index + 1 }
        }
        assertNotEquals(queue.peek()[0].idempotencyKey, queue.peek()[1].idempotencyKey)
        val counts = CaptureDiagnosticsStore(context).snapshot()
        assertTrue(counts.any { it.platform == "wechat" && it.reason == CaptureDiagnosticsStore.REASON_CHECKOUT })
        assertTrue(counts.any { it.platform == "wechat" && it.reason == CaptureDiagnosticsStore.REASON_PAGE_READABLE })
        assertFalse(counts.toString().contains("测试咖啡店"))
        assertFalse(counts.toString().contains("18.80"))
    }

    @Test fun incompleteTreesAreDiagnosedInsteadOfPostingPartialFacts() {
        CaptureDiagnosticsStore(context).reset()
        instrumentation.runOnMainSync {
            requireNotNull(PaymentPageFixtureActivity.current).show(success, depth = 40)
        }
        waitUntil { CaptureDiagnosticsStore(context).snapshot().any { it.reason == "page_read_limit" } }
        assertEquals(0, queue.count())
    }

    private fun show(lines: List<String>) = instrumentation.runOnMainSync {
        requireNotNull(PaymentPageFixtureActivity.current).show(lines)
    }
    private fun waitUntil(condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 15_000
        while (!condition() && System.currentTimeMillis() < deadline) Thread.sleep(100)
        assertTrue("Timed out waiting for accessibility capture", condition())
    }
    private fun shell(command: String): String = ParcelFileDescriptor.AutoCloseInputStream(
        instrumentation.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES).executeShellCommand(command),
    ).bufferedReader().use { it.readText() }
}

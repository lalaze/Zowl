package com.zowl.mobile.capture

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.app.NotificationCompat
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.runner.AndroidJUnit4
import com.zowl.mobile.AppLanguage
import com.zowl.mobile.NativeLanguage
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class CaptureQueueInstrumentedTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context: Context = instrumentation.targetContext
    private val queue by lazy { EncryptedCaptureQueue(context) }
    private val quickConfirmQueue by lazy { EncryptedQuickConfirmQueue(context) }
    private val preferences by lazy { CapturePreferences(context) }

    private var appLanguage = AppLanguage.SYSTEM

    @Before
    fun setUp() {
        // Native text follows the app's language, so pin it: these tests assert the English copy.
        appLanguage = NativeLanguage.current(context)
        NativeLanguage.save(context, AppLanguage.EN)
        context.getSystemService(NotificationManager::class.java).cancelAll()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            shell("pm grant ${context.packageName} ${Manifest.permission.POST_NOTIFICATIONS}")
        }
        queue.clear()
        quickConfirmQueue.remove(
            "user-a",
            quickConfirmQueue.snapshot("user-a").mapTo(mutableSetOf()) { it.captureId },
        )
        quickConfirmQueue.remove(
            "user-b",
            quickConfirmQueue.snapshot("user-b").mapTo(mutableSetOf()) { it.captureId },
        )
        preferences.clearSession()
        preferences.configureSession("https://money.example", "token-a", "user-a")
        preferences.enabled = true
    }

    @After
    fun tearDown() {
        NativeLanguage.save(context, appLanguage)
        context.getSystemService(NotificationManager::class.java).cancelAll()
        preferences.enabled = false
        preferences.clearSession()
        queue.clear()
        quickConfirmQueue.remove(
            "user-a",
            quickConfirmQueue.snapshot("user-a").mapTo(mutableSetOf()) { it.captureId },
        )
        quickConfirmQueue.remove(
            "user-b",
            quickConfirmQueue.snapshot("user-b").mapTo(mutableSetOf()) { it.captureId },
        )
    }

    @Test
    fun encryptedQueueEnforcesCapacityAndRetention() {
        val now = Instant.now()
        val template =
            CapturedPayment(
                idempotencyKey = "0".repeat(64),
                platform = "alipay",
                sourcePackage = PaymentPageParser.ALIPAY_PACKAGE,
                postedAt = now.toString(),
                parserId = "alipay_payment_page_v1",
                parserVersion = 1,
                evidenceDigest = "a".repeat(64),
                confidenceBasisPoints = 9_000,
                amountMinor = 100,
                merchantName = null,
            )
        queue.enqueue(
            template.copy(
                idempotencyKey = "f".repeat(64),
                postedAt = now.minusSeconds(8L * 24 * 60 * 60).toString(),
            ),
            "user-a",
        )
        assertEquals(0, queue.count())

        repeat(101) { index ->
            queue.enqueue(
                template.copy(
                    idempotencyKey = "%064x".format(index),
                    postedAt = now.plusMillis(index.toLong()).toString(),
                ),
                "user-a",
            )
        }

        val stored = queue.peek(20)
        assertEquals(100, queue.count())
        assertEquals("%064x".format(1), stored.first().idempotencyKey)
    }

    @Test
    fun queueSwitchesOwnersWithoutRetainingThePreviousAccountsEvents() {
        val now = Instant.now()
        val first =
            CapturedPayment(
                idempotencyKey = "1".repeat(64),
                platform = "alipay",
                sourcePackage = PaymentPageParser.ALIPAY_PACKAGE,
                postedAt = now.toString(),
                parserId = "alipay_payment_page_v1",
                parserVersion = 1,
                evidenceDigest = "a".repeat(64),
                confidenceBasisPoints = 9_000,
                amountMinor = 100,
                merchantName = null,
            )
        queue.enqueue(first, "user-a")
        queue.enqueue(first.copy(idempotencyKey = "2".repeat(64)), "user-b")

        val snapshot = queue.snapshot()!!
        assertEquals("user-b", snapshot.ownerUserId)
        assertEquals(listOf("2".repeat(64)), snapshot.events.map { it.idempotencyKey })
        queue.remove("user-a", setOf("2".repeat(64)))
        assertEquals(1, queue.count())
    }

    @Test
    fun pausingAuthenticationRetainsTheQueueOwnerAndEvents() {
        val payment =
            CapturedPayment(
                idempotencyKey = "3".repeat(64),
                platform = "alipay",
                sourcePackage = PaymentPageParser.ALIPAY_PACKAGE,
                postedAt = Instant.now().toString(),
                parserId = "alipay_payment_page_v1",
                parserVersion = 1,
                evidenceDigest = "b".repeat(64),
                confidenceBasisPoints = 9_000,
                amountMinor = 100,
                merchantName = null,
            )
        queue.enqueue(payment, "user-a")

        preferences.pauseSession()

        assertEquals("user-a", preferences.queueOwnerUserId)
        assertEquals(null, preferences.session())
        assertTrue(preferences.authPaused)
        assertEquals(1, queue.count())
    }

    @Test
    fun legacyOwnerlessQueueIsDiscardedAsUntrusted() {
        val file = File(context.noBackupFilesDir, "payment-capture-queue.enc")
        file.writeText(
            AndroidKeystoreCipher.encrypt("[]".toByteArray(Charsets.UTF_8)),
            Charsets.UTF_8,
        )

        assertEquals(0, queue.count())
        assertFalse(file.exists())
    }

    @Test
    fun quickConfirmQueueEncryptsMerchantAndKeepsActionsBoundToEachOwner() {
        quickConfirmQueue.enqueue(
            QuickConfirmAction.create(
                captureId = "capture-a",
                ownerUserId = "user-a",
                merchantName = "山岚咖啡",
            ),
        )
        quickConfirmQueue.enqueue(
            QuickConfirmAction.create(
                captureId = "capture-b",
                ownerUserId = "user-b",
            ),
        )

        assertEquals(
            listOf("capture-a"),
            quickConfirmQueue.snapshot("user-a").map { it.captureId },
        )
        assertEquals(
            listOf("capture-b"),
            quickConfirmQueue.snapshot("user-b").map { it.captureId },
        )
        val persisted =
            File(context.noBackupFilesDir, "payment-quick-confirm-queue.enc")
                .readText(Charsets.UTF_8)
        assertFalse(persisted.contains("山岚咖啡"))
        assertFalse(persisted.contains("merchantName"))
        assertFalse(persisted.contains("capture-a"))
    }

    @Test
    fun captureNotificationsAreGroupedPerItemAndExposeRemoteInputOnlyWhenNeeded() {
        CaptureNotificationPublisher.showCaptureReview(
            context,
            platform = "wechat",
            captureId = "capture-missing",
            amountMinor = 10,
            merchantName = null,
            ownerUserId = "user-a",
        )
        CaptureNotificationPublisher.showCaptureReview(
            context,
            platform = "other-source",
            captureId = "capture-known",
            amountMinor = 1_880,
            merchantName = "山岚咖啡",
            ownerUserId = "user-a",
        )
        CaptureNotificationPublisher.showCaptureReview(
            context,
            platform = "alipay",
            captureId = "capture-alipay",
            amountMinor = 500,
            merchantName = "便利店",
            ownerUserId = "user-a",
        )

        val active = context.getSystemService(NotificationManager::class.java).activeNotifications
        val missing =
            active
                .map { it.notification }
                .single { it.extras.getString("android.title") == "WeChat Pay expense ¥0.10" }
        val known =
            active
                .map { it.notification }
                .single { it.extras.getString("android.title") == "Payment expense ¥18.80" }
        val alipay =
            active
                .map { it.notification }
                .single { it.extras.getString("android.title") == "Alipay expense ¥5.00" }

        assertEquals(missing.group, known.group)
        assertEquals(missing.group, alipay.group)
        assertEquals(
            CaptureNotificationPublisher.REMOTE_INPUT_MERCHANT,
            missing.actions.single().remoteInputs.single().resultKey,
        )
        assertTrue(known.actions.single().remoteInputs.isNullOrEmpty())
        assertEquals(null, missing.deleteIntent)
        assertEquals(NotificationCompat.VISIBILITY_PRIVATE, missing.visibility)
        val publicEvidence = requireNotNull(missing.publicVersion).extras.toString()
        assertFalse(publicEvidence.contains("0.10"))
        assertFalse(publicEvidence.contains("微信"))
        assertFalse(publicEvidence.contains("山岚咖啡"))

        CaptureNotificationPublisher.clearCaptureNotifications(context)
        waitUntil {
            context
                .getSystemService(NotificationManager::class.java)
                .activeNotifications
                .none { it.notification.group == missing.group }
        }
    }

    @Test
    fun nativeTextAndStoredErrorsFollowTheAppLanguageNotThePhones() {
        val manager = context.getSystemService(NotificationManager::class.java)
        NativeLanguage.save(context, AppLanguage.ZH)
        CaptureNotificationPublisher.showCaptureReview(
            context,
            platform = "alipay",
            captureId = "capture-zh",
            amountMinor = 500,
            merchantName = "便利店",
            ownerUserId = "user-a",
        )
        waitUntil {
            manager.activeNotifications.any {
                it.notification.extras.getString(Notification.EXTRA_TITLE) == "支付宝支出 ¥5.00"
            }
        }
        assertTrue(preferences.setLastErrorIfOwnedBy("user-a", CaptureError.PROTOCOL, 426))
        assertEquals("服务器协议或版本不兼容（HTTP 426），本地候选已保留", preferences.lastError)
        assertEquals("zh-CN", NativeLanguage.acceptLanguage(context))

        // An error written before the switch is reworded; existing channels are renamed.
        NativeLanguage.save(context, AppLanguage.EN)
        CaptureNotificationPublisher.refreshChannels(context)
        assertEquals(
            "The server’s protocol or version isn’t compatible (HTTP 426). The candidates are kept on this device",
            preferences.lastError,
        )
        assertEquals("en-US", NativeLanguage.acceptLanguage(context))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            assertEquals(
                "Payment capture candidates",
                manager.getNotificationChannel("payment_capture_review").name,
            )
        }
    }

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
            ParcelFileDescriptor
                .AutoCloseInputStream(descriptor)
                .bufferedReader()
                .use { it.readText() }
        }
    }

    private fun waitUntil(
        timeoutMillis: Long = 10_000,
        condition: () -> Boolean,
    ) {
        val deadline = System.currentTimeMillis() + timeoutMillis
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(100)
        }
        assertTrue("Condition was not met within ${timeoutMillis}ms", condition())
    }
}

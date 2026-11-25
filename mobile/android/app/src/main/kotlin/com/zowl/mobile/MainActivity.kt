package com.zowl.mobile

import android.Manifest
import android.content.ClipData
import android.content.Intent
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.FileProvider
import com.zowl.mobile.capture.CaptureNotificationPublisher
import com.zowl.mobile.capture.CaptureAccountLock
import com.zowl.mobile.capture.CaptureDiagnosticsStore
import com.zowl.mobile.capture.CaptureLog
import com.zowl.mobile.capture.CapturePreferences
import com.zowl.mobile.capture.EncryptedCaptureQueue
import com.zowl.mobile.capture.NotificationCaptureWorker
import com.zowl.mobile.capture.EncryptedQuickConfirmQueue
import com.zowl.mobile.capture.QuickConfirmWorker
import com.zowl.mobile.capture.PaymentAccessibilityService
import com.zowl.mobile.capture.PaymentPageParser
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import com.zowl.mobile.ocr.LocalOcrChannel
import com.zowl.mobile.ocr.LocalOcrTileService

class MainActivity : FlutterActivity() {
    private var localOcrChannel: LocalOcrChannel? = null
    private var screenshotShare: ScreenshotShareBridge? = null
    private var captureChannel: MethodChannel? = null
    private var pendingRoute: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        localOcrChannel?.dispose()
        localOcrChannel = LocalOcrChannel(this)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "com.zowl.mobile/local_ocr")
            .setMethodCallHandler(localOcrChannel)
        screenshotShare?.dispose()
        screenshotShare = ScreenshotShareBridge(this, flutterEngine.dartExecutor.binaryMessenger).also { it.accept(intent) }
        pendingRoute = intent?.getStringExtra(CaptureNotificationPublisher.ROUTE_EXTRA)
        captureChannel =
            MethodChannel(
                flutterEngine.dartExecutor.binaryMessenger,
                CAPTURE_CHANNEL,
            ).also { channel ->
                channel.setMethodCallHandler(::handleCaptureMethod)
            }
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, LANGUAGE_CHANNEL)
            .setMethodCallHandler(::handleLanguageMethod)
    }

    // Flutter sends the app's language at start and on every change (lib/core/native_language.dart).
    private fun handleLanguageMethod(
        call: MethodCall,
        result: MethodChannel.Result,
    ) {
        if (call.method != "setLanguage") return result.notImplemented()
        val language =
            AppLanguage.fromWireName(call.argument<String>("language"))
                ?: return result.error("INVALID_ARGUMENT", "Invalid language", null)
        val changed = NativeLanguage.save(applicationContext, language)
        // Also on an unchanged choice: under "system" the phone's language may have changed.
        CaptureNotificationPublisher.refreshChannels(applicationContext)
        if (changed) LocalOcrTileService.requestRelabel(applicationContext)
        result.success(null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        screenshotShare?.accept(intent)
        val route = intent.getStringExtra(CaptureNotificationPublisher.ROUTE_EXTRA) ?: return
        pendingRoute = route
        captureChannel?.invokeMethod("captureRoute", route)
    }

    override fun onDestroy() {
        localOcrChannel?.dispose()
        localOcrChannel = null
        screenshotShare?.dispose()
        screenshotShare = null
        super.onDestroy()
    }

    private fun handleCaptureMethod(
        call: MethodCall,
        result: MethodChannel.Result,
    ) {
        val preferences = CapturePreferences(applicationContext)
        val queue = EncryptedCaptureQueue(applicationContext)
        val quickConfirmQueue = EncryptedQuickConfirmQueue(applicationContext)
        when (call.method) {
            "getStatus" -> result.success(captureStatus(preferences, queue, quickConfirmQueue))
            "openAccessibilitySettings" -> {
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                result.success(null)
            }
            "requestNotificationPermission" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    ActivityCompat.requestPermissions(
                        this,
                        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                        POST_NOTIFICATIONS_REQUEST,
                    )
                }
                result.success(null)
            }
            "setEnabled" -> {
                val enabled = call.argument<Boolean>("enabled") ?: false
                synchronized(CaptureAccountLock.monitor) {
                    preferences.enabled = enabled
                    if (!enabled) {
                        preferences.clearSession()
                        queue.clear()
                        quickConfirmQueue.clear()
                    }
                }
                if (enabled) {
                    NotificationCaptureWorker.enqueue(applicationContext)
                } else {
                    NotificationCaptureWorker.cancel(applicationContext)
                    QuickConfirmWorker.cancel(applicationContext)
                    CaptureNotificationPublisher.clearCaptureNotifications(applicationContext)
                }
                result.success(captureStatus(preferences, queue, quickConfirmQueue))
            }
            "setSourceEnabled" -> {
                val platform = call.argument<String>("platform")
                val enabled = call.argument<Boolean>("enabled")
                if (
                    platform == null ||
                    enabled == null ||
                    platform !in PaymentPageParser.platforms
                ) {
                    result.error("INVALID_ARGUMENT", "Invalid capture source", null)
                } else {
                    preferences.setSourceEnabled(platform, enabled)
                    result.success(captureStatus(preferences, queue, quickConfirmQueue))
                }
            }
            "setOrderDetailsEnabled" -> {
                val enabled = call.argument<Boolean>("enabled")
                if (enabled == null) {
                    result.error("INVALID_ARGUMENT", "Invalid item recognition setting", null)
                } else {
                    preferences.orderDetailsEnabled = enabled
                    result.success(captureStatus(preferences, queue, quickConfirmQueue))
                }
            }
            "configureSession" -> {
                val apiBaseUrl = call.argument<String>("apiBaseUrl")
                val token = call.argument<String>("token")
                val userId = call.argument<String>("userId")
                if (apiBaseUrl.isNullOrBlank() || token.isNullOrBlank() || userId.isNullOrBlank()) {
                    result.error("INVALID_ARGUMENT", "Invalid login sync parameters", null)
                } else {
                    synchronized(CaptureAccountLock.monitor) {
                        if (preferences.queueOwnerUserId != userId) {
                            queue.clear()
                            quickConfirmQueue.clear()
                        }
                        preferences.configureSession(apiBaseUrl, token, userId)
                    }
                    if (preferences.enabled) NotificationCaptureWorker.enqueue(applicationContext)
                    QuickConfirmWorker.enqueue(applicationContext)
                    result.success(captureStatus(preferences, queue, quickConfirmQueue))
                }
            }
            "clearSession" -> {
                synchronized(CaptureAccountLock.monitor) {
                    preferences.enabled = false
                    preferences.clearSession()
                    queue.clear()
                    quickConfirmQueue.clear()
                }
                NotificationCaptureWorker.cancel(applicationContext)
                QuickConfirmWorker.cancel(applicationContext)
                CaptureNotificationPublisher.clearCaptureNotifications(applicationContext)
                result.success(captureStatus(preferences, queue, quickConfirmQueue))
            }
            "pauseSession" -> {
                preferences.pauseSession()
                result.success(captureStatus(preferences, queue, quickConfirmQueue))
            }
            "flushNow" -> {
                NotificationCaptureWorker.enqueue(applicationContext)
                QuickConfirmWorker.enqueue(applicationContext)
                result.success(null)
            }
            "resetDiagnostics" -> {
                CaptureDiagnosticsStore(applicationContext).reset()
                result.success(captureStatus(preferences, queue, quickConfirmQueue))
            }
            // True once the share sheet is up; false when there is no log yet.
            "exportCaptureLog" -> CaptureLog.export { file ->
                if (file == null || isDestroyed) return@export result.success(false)
                val uri = FileProvider.getUriForFile(this, "$packageName.capturelog", file)
                val send = Intent(Intent.ACTION_SEND)
                    .setType("application/zip")
                    .putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                send.clipData = ClipData.newRawUri(file.name, uri)
                val title = NativeLanguage.localized(this).getString(R.string.capture_log_share_title)
                startActivity(Intent.createChooser(send, title))
                result.success(true)
            }
            "takePendingRoute" -> {
                val route = pendingRoute
                pendingRoute = null
                result.success(route)
            }
            else -> result.notImplemented()
        }
    }

    private fun captureStatus(
        preferences: CapturePreferences,
        queue: EncryptedCaptureQueue,
        quickConfirmQueue: EncryptedQuickConfirmQueue,
    ): Map<String, Any?> =
        mapOf(
            "supported" to true,
            "accessibilityAccessGranted" to PaymentAccessibilityService.accessGranted(applicationContext),
            "accessibilityConnected" to PaymentAccessibilityService.connected,
            "enabled" to preferences.enabled,
            "queuedCount" to
                queue.count() +
                quickConfirmQueue.count(
                    preferences.session()?.userId,
                ),
            "lastCaptureAt" to preferences.lastCaptureAt.takeIf { it > 0 },
            "authPaused" to preferences.authPaused,
            "syncError" to preferences.lastError,
            // Kept for older Flutter clients.
            "lastError" to preferences.lastError,
            "diagnostics" to
                CaptureDiagnosticsStore(applicationContext)
                    .snapshot()
                    .map { it.toStatusMap() },
            "orderDetailsEnabled" to preferences.orderDetailsEnabled,
        ) +
            // alipayEnabled, wechatEnabled, taobaoEnabled, pinduoduoEnabled, jdEnabled, pupuEnabled
            PaymentPageParser.platforms.associate { "${it}Enabled" to preferences.isSourceEnabled(it) }

    companion object {
        private const val CAPTURE_CHANNEL = "com.zowl.mobile/payment_capture"
        private const val LANGUAGE_CHANNEL = "com.zowl.mobile/language"
        private const val POST_NOTIFICATIONS_REQUEST = 4210
    }
}

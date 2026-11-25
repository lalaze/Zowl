package com.zowl.mobile.ocr

import android.accessibilityservice.AccessibilityService
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Toast
import androidx.annotation.StringRes
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.zowl.mobile.MainActivity
import com.zowl.mobile.NativeLanguage
import com.zowl.mobile.R
import com.zowl.mobile.capture.CaptureNotificationPublisher
import com.zowl.mobile.capture.PaymentPageOcr
import com.zowl.mobile.ocr.LocalOcrWindowPolicy.Window
import com.zowl.mobile.ocr.LocalOcrWindowPolicy.Bounds
import com.zowl.mobile.ocr.LocalOcrWindowPolicy.Kind
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Stage
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Reason
import com.zowl.mobile.ocr.LocalOcrDiagnosticsSchema.Metric

/** One explicitly requested screenshot. No files, network transport, workers or capture queue. */
object LocalOcrCapture {
    val state = LocalOcrState(SystemClock::elapsedRealtime)
    private val handler = Handler(Looper.getMainLooper())
    var service: AccessibilityService? = null
    private var windowEpoch = 0L
    const val ROUTE = "/local-ocr/review"
    const val SETTINGS_ROUTE = "/settings/local-ocr"

    fun enabled(context: Context) = context.getSharedPreferences("local_ocr", Context.MODE_PRIVATE)
        .getBoolean("enabled", false)

    fun setEnabled(context: Context, enabled: Boolean) {
        context.getSharedPreferences("local_ocr", Context.MODE_PRIVATE).edit().putBoolean("enabled", enabled).apply()
        if (!enabled) state.clear()
    }

    fun onEvent(event: AccessibilityEvent?) {
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOWS_CHANGED ||
            event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) windowEpoch++
    }

    fun unlocked(context: Context) = !context.getSystemService(KeyguardManager::class.java).isKeyguardLocked &&
        context.getSystemService(PowerManager::class.java).isInteractive

    private fun windows(): List<Window>? = try {
        service?.windows?.map { window ->
            try {
                val root = window.root
                val pkg = try { root?.packageName?.toString() } finally {
                    @Suppress("DEPRECATION")
                    root?.recycle()
                }
                val bounds = Rect().also(window::getBoundsInScreen)
                val kind = when (window.type) {
                    AccessibilityWindowInfo.TYPE_APPLICATION -> Kind.APP
                    AccessibilityWindowInfo.TYPE_SYSTEM -> Kind.SYSTEM
                    AccessibilityWindowInfo.TYPE_INPUT_METHOD -> Kind.KEYBOARD
                    AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY -> Kind.OVERLAY
                    else -> Kind.OTHER
                }
                Window(window.id, pkg, kind, window.layer, window.isActive, window.isFocused,
                    Bounds(bounds.left, bounds.top, bounds.right, bounds.bottom),
                    if (Build.VERSION.SDK_INT >= 30) window.displayId else 0)
            } finally {
                @Suppress("DEPRECATION")
                window.recycle()
            }
        }
    } catch (_: Exception) { null }

    // The expanded Quick Settings panel covers the screen, so accessibility does not report the
    // app window underneath at click time. The click only opens a request; the payment window
    // is resolved and bound after the panel has collapsed (see begin).
    fun prepare(context: Context): LocalOcrState.Request? {
        if (Build.VERSION.SDK_INT < 34 || !unlocked(context) || !enabled(context)) return null
        val diagnostics = LocalOcrDiagnostics(context)
        return state.begin().also {
            diagnostics.record(Stage.PREPARE, if (it == null) Reason.REQUEST_UNAVAILABLE else Reason.READY)
        }
    }

    private fun barSize(context: Context) = (64 * context.resources.displayMetrics.density).toInt()

    private fun safe(request: LocalOcrState.Request): Boolean {
        val currentService = service ?: return false
        if (!state.current(request.id) || !enabled(currentService) || !unlocked(currentService)) return false
        if (request.windowId == LocalOcrState.NO_WINDOW) return false
        // Split screen, picture-in-picture, keyboards, dialogs, large covers and the shade fail closed.
        return LocalOcrWindowPolicy.safe(windows() ?: return false, request.windowId, request.packageName,
            barSize(currentService))
    }

    private fun windowMetrics(windows: List<Window>?): Map<Metric, Int> {
        val apps = windows.orEmpty().filter { it.kind == Kind.APP }
        val allowed = setOf("com.tencent.mm", "com.eg.android.AlipayGphone")
        return mapOf(
            Metric.WINDOW_COUNT to (windows?.size ?: -1),
            Metric.APP_WINDOW_COUNT to apps.size,
            Metric.APP_PACKAGE_EMPTY_COUNT to apps.count { it.pkg.isNullOrBlank() },
            Metric.ALLOWED_APP_COUNT to apps.count { it.pkg in allowed },
            Metric.SYSTEM_APP_COUNT to windows.orEmpty().count { it.kind != Kind.APP },
        )
    }

    // Fixed, content-free wording per reason so a failed attempt explains itself on screen.
    private fun timeoutMessage(reason: Reason) = when (reason) {
        Reason.NO_APP_WINDOW, Reason.WINDOWS_UNAVAILABLE -> R.string.local_ocr_no_app_window
        Reason.MULTIPLE_APP_WINDOWS -> R.string.local_ocr_multiple_windows
        Reason.PACKAGE_EMPTY -> R.string.local_ocr_package_empty
        Reason.PACKAGE_UNSUPPORTED -> R.string.local_ocr_package_unsupported
        Reason.BLOCKED_WINDOW -> R.string.local_ocr_blocked_window
        Reason.NOT_ACTIVE, Reason.NOT_FOCUSED -> R.string.local_ocr_not_focused
        else -> R.string.local_ocr_window_unconfirmed
    }

    /**
     * Runs from the tile click itself. It must not depend on an Activity launch: some OEM
     * builds silently block background activity starts, which left the request waiting forever.
     * Collapsing the shade is a system global action, not a gesture inside the payment app.
     */
    fun begin(id: String, fallbackCollapse: (() -> Unit)? = null) {
        val startService = service ?: return fail(id, R.string.local_ocr_service_lost)
        if (!state.current(id)) return
        val collapsed = try {
            startService.performGlobalAction(AccessibilityService.GLOBAL_ACTION_DISMISS_NOTIFICATION_SHADE)
        } catch (_: Exception) { false }
        LocalOcrDiagnostics(startService).record(Stage.COLLAPSE,
            if (collapsed) Reason.GLOBAL_ACTION else Reason.GLOBAL_ACTION_FAILED)
        var fallback = fallbackCollapse
        if (!collapsed) {
            fallback?.invoke()
            fallback = null
        }
        val start = SystemClock.elapsedRealtime()
        var stableSince = 0L
        var epoch = windowEpoch
        var candidate = LocalOcrState.NO_WINDOW
        var lastReason = Reason.WAITING
        LocalOcrDiagnostics(startService).record(Stage.STABLE_TARGET, Reason.WAITING)
        fun poll() {
            val currentService = service ?: return fail(id, R.string.local_ocr_service_lost)
            if (!state.current(id)) return
            if (!unlocked(currentService)) return fail(id, R.string.local_ocr_unlock_retry)
            val now = SystemClock.elapsedRealtime()
            val current = windows()
            if (now - start > 6_000) {
                LocalOcrDiagnostics(currentService).record(Stage.STABLE_TARGET,
                    if (lastReason == Reason.WAITING) Reason.TIMEOUT else lastReason, windowMetrics(current))
                return fail(id, timeoutMessage(lastReason))
            }
            val verdict = if (current == null) Reason.WINDOWS_UNAVAILABLE
                else LocalOcrWindowPolicy.verdict(current, null, null, barSize(currentService))
            val target = if (verdict == Reason.READY) LocalOcrWindowPolicy.target(current!!) else null
            if (target != null) {
                if (stableSince == 0L || epoch != windowEpoch || candidate != target.id) stableSince = now
                epoch = windowEpoch
                candidate = target.id
                if (now - stableSince >= 450) {
                    if (PaymentPageOcr.captured(target.id)) {
                        return fail(id, R.string.local_ocr_already_captured)
                    }
                    val bound = state.bindTarget(id, target.id, target.pkg!!)
                        ?: return fail(id, R.string.local_ocr_request_expired)
                    LocalOcrDiagnostics(currentService).record(Stage.STABLE_TARGET, Reason.READY, windowMetrics(current))
                    screenshot(bound)
                    return
                }
            } else {
                stableSince = 0L
                candidate = LocalOcrState.NO_WINDOW
                lastReason = verdict
                // The panel is apparently still up: try the tile's own collapse once.
                if (fallback != null && now - start > 1_500) {
                    LocalOcrDiagnostics(currentService).record(Stage.COLLAPSE, Reason.FALLBACK_REQUESTED)
                    fallback?.invoke()
                    fallback = null
                }
            }
            handler.postDelayed({ poll() }, 100)
        }
        handler.postDelayed({ poll() }, 250)
        handler.postDelayed({
            if (state.current(id) && state.capturing()) fail(id, R.string.local_ocr_timeout)
        }, 12_000)
    }

    private fun screenshot(request: LocalOcrState.Request) {
        val currentService = service ?: return
        val diagnostics = LocalOcrDiagnostics(currentService)
        if (Build.VERSION.SDK_INT < 34 || !safe(request)) return fail(request.id, R.string.local_ocr_window_changed)
        val epoch = windowEpoch
        try {
            diagnostics.record(Stage.SCREENSHOT, Reason.REQUESTED)
            currentService.takeScreenshotOfWindow(request.windowId, currentService.mainExecutor,
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                        diagnostics.record(Stage.SCREENSHOT, Reason.API_SUCCESS)
                        val buffer = result.hardwareBuffer
                        var bitmap: Bitmap? = null
                        try {
                            if (epoch != windowEpoch || !safe(request)) {
                                diagnostics.record(Stage.SCREENSHOT, Reason.WINDOW_CHANGED)
                                fail(request.id, R.string.local_ocr_window_changed_discarded)
                                return
                            }
                            val hardware = Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
                            bitmap = try { hardware?.copy(Bitmap.Config.ARGB_8888, false) } finally { hardware?.recycle() }
                        } catch (_: Exception) {
                            diagnostics.record(Stage.SCREENSHOT, Reason.BITMAP_ERROR)
                            fail(request.id, R.string.local_ocr_bitmap_failed)
                        } finally { buffer.close() }
                        val image = bitmap ?: return fail(request.id, R.string.local_ocr_screenshot_unavailable)
                        recognize(request, image)
                    }
                    override fun onFailure(errorCode: Int) {
                        diagnostics.record(Stage.SCREENSHOT, Reason.API_ERROR, mapOf(Metric.ERROR_CODE to errorCode))
                        fail(request.id, if (errorCode == AccessibilityService.ERROR_TAKE_SCREENSHOT_SECURE_WINDOW)
                            R.string.local_ocr_secure_window else R.string.local_ocr_screenshot_refused)
                    }
                })
        } catch (_: Exception) {
            diagnostics.record(Stage.SCREENSHOT, Reason.API_EXCEPTION)
            fail(request.id, R.string.local_ocr_screenshot_access)
        }
    }

    private fun recognize(request: LocalOcrState.Request, bitmap: Bitmap) {
        val diagnostics = service?.let { LocalOcrDiagnostics(it) }
        val recognizer = try {
            TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
        } catch (_: Exception) {
            diagnostics?.record(Stage.OCR, Reason.MODEL_ERROR)
            bitmap.recycle()
            return fail(request.id, R.string.local_ocr_model_unavailable)
        }
        try {
            diagnostics?.record(Stage.OCR, Reason.STARTED)
            recognizer.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener { text ->
                    diagnostics?.record(Stage.OCR, Reason.SUCCESS)
                    if (!safe(request)) {
                        diagnostics?.record(Stage.OCR, Reason.WINDOW_CHANGED)
                        fail(request.id, R.string.local_ocr_result_discarded)
                    } else {
                        val fields = LocalOcrParser.parse(text.text)
                        diagnostics?.record(Stage.OCR, when (fields.warning) {
                            "empty_text" -> Reason.EMPTY_TEXT
                            "unsupported_page" -> when (fields.detail) {
                                "no_success_marker" -> Reason.NO_SUCCESS_MARKER
                                "excluded_content" -> Reason.EXCLUDED_CONTENT
                                else -> Reason.UNSUPPORTED_PAGE
                            }
                            "too_much_text" -> Reason.TOO_MUCH_TEXT
                            "multiple_amounts" -> Reason.MULTIPLE_AMOUNTS
                            "missing_amount" -> Reason.MISSING_AMOUNT
                            null -> Reason.READY
                            else -> Reason.REJECTED
                        }, mapOf(Metric.LINE_COUNT to fields.lines, Metric.AMOUNT_COUNT to fields.amounts))
                        if (fields.warning in setOf("empty_text", "unsupported_page", "too_much_text")) {
                            fail(request.id, when (fields.warning) {
                                "empty_text" -> R.string.local_ocr_empty_text
                                "too_much_text" -> R.string.local_ocr_too_much_text
                                else -> when (fields.detail) {
                                    "no_success_marker" -> R.string.local_ocr_no_success_marker
                                    "excluded_content" -> R.string.local_ocr_excluded_content
                                    else -> R.string.local_ocr_unsupported_page
                                }
                            })
                        } else if (state.complete(request.id, fields)) {
                            diagnostics?.record(Stage.REVIEW, Reason.DRAFT_READY)
                            handler.postDelayed({ state.clear(request.id) }, LocalOcrState.DRAFT_TTL)
                            openReview()
                        }
                    }
                }
                .addOnFailureListener {
                    diagnostics?.record(Stage.OCR, Reason.TASK_ERROR)
                    fail(request.id, R.string.local_ocr_recognition_failed)
                }
                .addOnCompleteListener { bitmap.recycle(); recognizer.close() }
        } catch (_: Exception) {
            diagnostics?.record(Stage.OCR, Reason.TASK_ERROR)
            bitmap.recycle()
            recognizer.close()
            fail(request.id, R.string.local_ocr_recognition_failed)
        }
    }

    // A background activity start can be dropped without any error, so the review is always
    // reachable from a notification as well and the user is told which one to expect.
    private fun openReview() {
        val currentService = service ?: return
        val diagnostics = LocalOcrDiagnostics(currentService)
        val notified = CaptureNotificationPublisher.showLocalOcrReady(currentService, ROUTE)
        if (notified) diagnostics.record(Stage.REVIEW, Reason.NOTIFIED)
        message(currentService, if (notified) R.string.local_ocr_review_opening_notified
            else R.string.local_ocr_review_opening)
        try {
            currentService.startActivity(Intent(currentService, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                .putExtra(CaptureNotificationPublisher.ROUTE_EXTRA, ROUTE))
            diagnostics.record(Stage.REVIEW, Reason.OPEN_REQUESTED)
        } catch (_: Exception) {
            diagnostics.record(Stage.REVIEW, Reason.OPEN_ERROR)
            if (!notified) {
                state.clear()
                message(currentService, R.string.local_ocr_review_failed)
            }
        }
    }

    private fun fail(id: String, @StringRes reason: Int) {
        if (!state.current(id)) return
        state.clear(id)
        service?.let { message(it, reason) }
    }
    // In the language chosen in the app, which may differ from the phone's.
    fun message(context: Context, @StringRes message: Int) =
        Toast.makeText(context, NativeLanguage.localized(context).getString(message), Toast.LENGTH_LONG).show()

    fun disconnect() {
        if (state.capturing()) service?.let { message(it, R.string.local_ocr_cancelled_disconnected) }
        state.clear()
        handler.removeCallbacksAndMessages(null)
        service = null
    }
}

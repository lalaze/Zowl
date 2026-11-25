package com.zowl.mobile.capture

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.chinese.ChineseTextRecognizerOptions
import com.zowl.mobile.ocr.LocalOcrParser

/**
 * Automatic fallback for payment-page mode when a supported payment app exposes an empty
 * accessibility tree. It screenshots only that app's own window, recognises it with the bundled
 * on-device model and keeps the image and text in memory only. Main thread only.
 */
object PaymentPageOcr {
    private val handler = Handler(Looper.getMainLooper())
    private val sessions = PaymentPageOcrSessions(SystemClock::elapsedRealtime)
    private val cashiers = HashMap<String, ShoppingCashierFlow>()
    private fun cashier(platform: String) =
        cashiers.getOrPut(platform) {
            ShoppingCashierFlow(PaymentPageParser.confirmWindow(platform), SystemClock::elapsedRealtime)
        }
    private var cashierAmountReported: Int? = null
    private var inFlight = false
    private var attemptSeq = 0
    private var attemptStartedAt = 0L
    private var missedRechecks = 0
    private var lastReject: Pair<Int, PaymentNotificationRejectionReason>? = null
    private var pending: Runnable? = null
    private var recognizer: TextRecognizer? = null

    /** A system callback that never arrives must not stop all later reads. */
    private const val ATTEMPT_TIMEOUT = 5_000L
    /** Bridges page transitions and system dialogs (e.g. a fingerprint prompt) during a payment. */
    private const val MAX_MISSED_RECHECKS = 8

    /** True once this window's current success page has produced a candidate. */
    fun captured(windowId: Int): Boolean = sessions.isCaptured(windowId)

    /**
     * A scheduled reread could not look at a payment window (no root yet, or another window is
     * briefly on top). Keep the chain alive for a short while instead of waiting for an event.
     */
    fun onRecheckMissed(recheck: () -> Unit) {
        if (inFlight || missedRechecks++ >= MAX_MISSED_RECHECKS) return
        schedule(PaymentPageOcrSessions.FAST_INTERVAL, recheck)
    }

    /**
     * Called for every settled, empty-tree observation of an enabled payment app window.
     * [recheck] re-runs the caller's full eligibility and window checks before any reread.
     */
    fun onEmptyPage(
        service: AccessibilityService,
        windowId: Int,
        sourcePackage: String,
        platform: String,
        installationId: String,
        role: PaymentPageOcrGate.Role,
        recheck: () -> Unit,
        deliver: (CapturedPayment) -> Unit,
        recognised: (String) -> Unit = {},
    ) {
        if (Build.VERSION.SDK_INT < 34) return
        missedRechecks = 0
        val startedAt = SystemClock.elapsedRealtime()
        if (inFlight && startedAt - attemptStartedAt < ATTEMPT_TIMEOUT) return
        val wait = sessions.delayBeforeAttempt(windowId)
        if (wait > 0) return schedule(wait, recheck)
        val diagnostics = CaptureDiagnosticsStore(service)
        // Reads repeat several times a second; count a reason once per window state, not per read.
        fun reject(reason: PaymentNotificationRejectionReason) {
            val key = windowId to reason
            if (lastReject == key) return
            lastReject = key
            diagnostics.record(PaymentNotificationEvaluation.Rejected(platform,
                PaymentPageOcrFacts.parserId(platform), PaymentPageOcrFacts.PARSER_VERSION, reason))
        }
        val token = ++attemptSeq
        fun current() = inFlight && token == attemptSeq
        fun finish() {
            if (!current()) return
            inFlight = false
            // Pace from the start of the last attempt, so recognition time is not added on top.
            if (sessions.shouldChain(windowId)) schedule(sessions.delayBeforeAttempt(windowId).coerceAtLeast(30), recheck)
        }
        inFlight = true
        attemptStartedAt = startedAt
        sessions.began(windowId)
        try {
            service.takeScreenshotOfWindow(windowId, service.mainExecutor,
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                        val buffer = result.hardwareBuffer
                        val bitmap = try {
                            val hardware = Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
                            try { hardware?.copy(Bitmap.Config.ARGB_8888, false) } finally { hardware?.recycle() }
                        } catch (_: Exception) { null } finally { buffer.close() }
                        if (!current()) {
                            bitmap?.recycle()
                            return
                        }
                        if (bitmap == null) {
                            reject(PaymentNotificationRejectionReason.PAGE_READ_ERROR)
                            return finish()
                        }
                        recognize(service, bitmap, onText = { text ->
                            if (!current()) return@recognize
                            CaptureTrace.d { "ocr $platform window=$windowId role=$role ${LocalOcrParser.shape(text)}" }
                            recognised(text)
                            // Only whether the overlay has text, which [recognised] has reported.
                            if (role == PaymentPageOcrGate.Role.OVERLAY) return@recognize finish()
                            if (role == PaymentPageOcrGate.Role.RESULT) {
                                // Never a source of amounts: it only confirms what the cashier showed.
                                sessions.onOtherPage(windowId)
                                val confirmed = if (LocalOcrParser.hasSuccessHeading(text)) cashier(platform).onResultSuccess() else null
                                val payment = confirmed?.let {
                                    PaymentPageOcrFacts.candidate(PaymentPageOcrFacts.fields(it.amountMinor), text, platform,
                                        sourcePackage, installationId, bootCount(service), it.windowId, 0, System.currentTimeMillis())
                                }
                                if (payment != null) deliver(payment)
                                return@recognize finish()
                            }
                            if (role == PaymentPageOcrGate.Role.CASHIER) {
                                val paid = cashierFrame(service, windowId, sourcePackage, platform, installationId, text, read = false)
                                if (paid != null) deliver(paid) else sessions.onOtherPage(windowId)
                                return@recognize finish()
                            }
                            val fields = LocalOcrParser.parse(text)
                            val amount = PaymentPageOcrFacts.amountMinor(fields)
                            when {
                                fields.warning == null && amount != null -> {
                                    val generation = sessions.onSuccessPage(windowId, amount)
                                    val payment = generation?.let {
                                        PaymentPageOcrFacts.candidate(fields, text, platform, sourcePackage, installationId,
                                            bootCount(service), windowId, it, System.currentTimeMillis())
                                    }
                                    if (payment != null) {
                                        lastReject = null
                                        deliver(payment)
                                    }
                                }
                                fields.warning == "multiple_amounts" -> {
                                    sessions.onAmbiguousSuccessPage(windowId)
                                    reject(PaymentNotificationRejectionReason.MULTIPLE_AMOUNTS)
                                }
                                fields.warning == "missing_amount" -> {
                                    sessions.onAmbiguousSuccessPage(windowId)
                                    reject(PaymentNotificationRejectionReason.MISSING_AMOUNT)
                                }
                                fields.detail == "excluded_content" -> {
                                    sessions.onOtherPage(windowId)
                                    reject(PaymentNotificationRejectionReason.EXCLUDED_SEMANTICS)
                                }
                                else -> {
                                    sessions.onOtherPage(windowId)
                                    reject(if (fields.warning == "empty_text") PaymentNotificationRejectionReason.EMPTY_CONTENT
                                        else PaymentNotificationRejectionReason.UNSUPPORTED_PAYMENT_PAGE)
                                }
                            }
                            finish()
                        }, onError = {
                            reject(PaymentNotificationRejectionReason.PAGE_READ_ERROR)
                            finish()
                        })
                    }

                    override fun onFailure(errorCode: Int) {
                        CaptureTrace.d { "screenshot $platform window=$windowId role=$role failed code=$errorCode" }
                        // A protected window (password entry) is by definition not the success page.
                        if (errorCode == AccessibilityService.ERROR_TAKE_SCREENSHOT_SECURE_WINDOW) {
                            sessions.onOtherPage(windowId)
                            reject(PaymentNotificationRejectionReason.PAGE_SCREENSHOT_PROTECTED)
                        } else if (errorCode != AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) {
                            // "Too soon" from the system is only pacing, not a fact about the page.
                            reject(PaymentNotificationRejectionReason.PAGE_SCREENSHOT_FAILED)
                        }
                        finish()
                    }
                })
        } catch (_: Exception) {
            reject(PaymentNotificationRejectionReason.PAGE_SCREENSHOT_FAILED)
            finish()
        }
    }

    /**
     * The embedded cashier's text, as accessibility nodes expose it. No screenshot is involved;
     * the same rules apply as when the cashier has to be read by OCR.
     */
    fun onCashierText(
        service: AccessibilityService,
        windowId: Int,
        sourcePackage: String,
        platform: String,
        installationId: String,
        text: String,
        deliver: (CapturedPayment) -> Unit,
    ) {
        CaptureTrace.d { "cashier-text $platform window=$windowId ${LocalOcrParser.shape(text)} offers=${LocalOcrParser.offerLines(text)}" }
        cashierFrame(service, windowId, sourcePackage, platform, installationId, text, read = true)?.let(deliver)
    }

    /**
     * Alipay's own cashier, as accessibility nodes expose it: its one amount is remembered for
     * [onPaidNotice] if the cashier closes with its overlay. Never a payment by itself.
     */
    fun onAlipayCashierText(service: AccessibilityService, windowId: Int, text: String) {
        val frame = AlipayCashierText.apply(cashier("alipay"), windowId, text)
        CaptureTrace.d {
            "cashier-text alipay window=$windowId ${LocalOcrParser.shape(text)} offers=${LocalOcrParser.offerLines(text)} " +
                "frame=${frame.name.lowercase()}"
        }
        if (frame == AlipayCashierText.Frame.AMOUNT && cashierAmountReported != windowId) {
            cashierAmountReported = windowId
            CaptureDiagnosticsStore(service).recordCashierAmount("alipay", "alipay_payment_page_v1")
        }
    }

    /** A success page of [platform] was captured: no cashier amount waits for confirmation any more. */
    fun onPageCaptured(platform: String) {
        cashiers[platform]?.clear()
    }

    /** An order panel whose pay button shows what is about to be paid. Text only, no screenshot. */
    fun onOrderPanelAmount(service: AccessibilityService, platform: String, windowId: Int, amountMinor: Long) {
        cashier(platform).onCashierAmount(windowId, amountMinor)
        if (cashierAmountReported != windowId) {
            cashierAmountReported = windowId
            CaptureDiagnosticsStore(service).recordCashierAmount(platform, "${platform}_payment_page_v1")
        }
    }

    /** The order panel now shows several amounts by its pay button: an earlier one is not confirmed either. */
    fun onOrderPanelAmbiguous(platform: String, windowId: Int) {
        cashiers[platform]?.onCashierAmbiguous(windowId)
    }

    /** [platform]'s order panel showed exactly this amount and nothing has confirmed it yet. */
    fun awaits(platform: String, amountMinor: Long): Boolean = cashiers[platform]?.awaits(amountMinor) == true

    fun awaitsConfirmation(platform: String): Boolean = cashiers[platform]?.awaitsConfirmation() == true

    /**
     * The app reports the order as paid without showing an amount (Pinduoduo's paid notice, or
     * Taobao's or Alipay's cashier closing with its payment overlay): the payment is the amount
     * its order panel or cashier showed, once.
     */
    fun onPaidNotice(
        service: AccessibilityService,
        platform: String,
        sourcePackage: String,
        installationId: String,
    ): CapturedPayment? {
        val confirmed = cashier(platform).onResultSuccess() ?: return null
        // The notice has no text worth digesting; the evidence is the amount it confirms.
        return PaymentPageOcrFacts.candidate(PaymentPageOcrFacts.fields(confirmed.amountMinor),
            "paid\n${confirmed.amountMinor}", platform, sourcePackage, installationId, bootCount(service),
            confirmed.windowId, 0, System.currentTimeMillis(),
        )?.copy(parserId = "${platform}_payment_page_v1", confidenceBasisPoints = 9_000)
    }

    /**
     * One look at the cashier. Its success state with exactly one amount is the payment, returned
     * once per cashier window; before that, the one amount on show is remembered for the result
     * page to confirm. [read] tells node text from OCR, which have separate parser identities.
     * Offer lines ("有立减0.30元可选") are dropped first: an offer is not the amount charged.
     */
    private fun cashierFrame(
        service: AccessibilityService,
        windowId: Int,
        sourcePackage: String,
        platform: String,
        installationId: String,
        shown: String,
        read: Boolean,
    ): CapturedPayment? {
        val text = LocalOcrParser.withoutOffers(shown)
        val fields = LocalOcrParser.parse(text)
        val amount = PaymentPageOcrFacts.amountMinor(fields)
        if (fields.warning == null && amount != null) {
            val generation = sessions.onSuccessPage(windowId, amount) ?: return null
            cashier(platform).onCashierSettled(windowId)
            val payment = PaymentPageOcrFacts.candidate(fields, text, platform, sourcePackage, installationId,
                bootCount(service), windowId, generation, System.currentTimeMillis()) ?: return null
            return if (read) payment.copy(parserId = "${platform}_payment_page_v1", confidenceBasisPoints = 9_000) else payment
        }
        LocalOcrParser.singleAmount(text)?.let(PaymentPageOcrFacts::minor)?.let {
            cashier(platform).onCashierAmount(windowId, it)
            if (cashierAmountReported != windowId) {
                cashierAmountReported = windowId
                CaptureDiagnosticsStore(service).recordCashierAmount(platform)
            }
        }
        return null
    }

    /**
     * One on-device read of the screen a shopping app's cashier was opened from, so the payment
     * can say what it bought (ADR-0014). It is never evidence of a payment and takes no part in
     * the payment-page reads above. The image is recycled once recognised; [onText] gets the text.
     */
    fun readOrderPage(service: AccessibilityService, platform: String, windowId: Int, retry: Boolean = true, onText: (String) -> Unit) {
        if (Build.VERSION.SDK_INT < 34) return
        try {
            service.takeScreenshotOfWindow(windowId, service.mainExecutor,
                object : AccessibilityService.TakeScreenshotCallback {
                    override fun onSuccess(result: AccessibilityService.ScreenshotResult) {
                        val buffer = result.hardwareBuffer
                        val bitmap = try {
                            val hardware = Bitmap.wrapHardwareBuffer(buffer, result.colorSpace)
                            try { hardware?.copy(Bitmap.Config.ARGB_8888, false) } finally { hardware?.recycle() }
                        } catch (_: Exception) { null } finally { buffer.close() }
                        if (bitmap == null) {
                            CaptureTrace.d { "order-page $platform window=$windowId no image" }
                            return
                        }
                        recognize(service, bitmap, onText = { text ->
                            CaptureTrace.d { "order-page $platform window=$windowId ${LocalOcrParser.shape(text)}" }
                            onText(text)
                        }, onError = { CaptureTrace.d { "order-page $platform window=$windowId recognition failed" } })
                    }

                    override fun onFailure(errorCode: Int) {
                        CaptureTrace.d { "order-page $platform window=$windowId screenshot failed code=$errorCode" }
                        // The system paces screenshots; the cashier's own read may have just used the slot.
                        if (retry && errorCode == AccessibilityService.ERROR_TAKE_SCREENSHOT_INTERVAL_TIME_SHORT) {
                            handler.postDelayed({ readOrderPage(service, platform, windowId, retry = false, onText) },
                                PaymentPageOcrSessions.FAST_INTERVAL)
                        }
                    }
                })
        } catch (_: Exception) {
            CaptureTrace.d { "order-page $platform window=$windowId screenshot refused" }
        }
    }

    private fun recognize(service: AccessibilityService, bitmap: Bitmap, onText: (String) -> Unit, onError: () -> Unit) {
        try {
            val client = recognizer ?: TextRecognition.getClient(ChineseTextRecognizerOptions.Builder().build())
                .also { recognizer = it }
            client.process(InputImage.fromBitmap(bitmap, 0))
                .addOnSuccessListener(service.mainExecutor) { onText(it.text) }
                .addOnFailureListener(service.mainExecutor) { onError() }
                .addOnCompleteListener(service.mainExecutor) { bitmap.recycle() }
        } catch (_: Exception) {
            bitmap.recycle()
            onError()
        }
    }

    private fun schedule(delay: Long, recheck: () -> Unit) {
        pending?.let(handler::removeCallbacks)
        pending = Runnable {
            pending = null
            recheck()
        }.also { handler.postDelayed(it, delay) }
    }

    private fun bootCount(service: AccessibilityService): Int =
        try { Settings.Global.getInt(service.contentResolver, Settings.Global.BOOT_COUNT, 0) } catch (_: Exception) { 0 }

    fun cancel() {
        pending?.let(handler::removeCallbacks)
        pending = null
        inFlight = false
        attemptSeq++
        missedRechecks = 0
        lastReject = null
        cashierAmountReported = null
        cashiers.clear()
        sessions.clear()
        try { recognizer?.close() } catch (_: Exception) { }
        recognizer = null
    }
}

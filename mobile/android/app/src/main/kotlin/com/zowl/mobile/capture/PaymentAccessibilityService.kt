package com.zowl.mobile.capture

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.widget.Toast
import android.view.accessibility.AccessibilityManager
import android.view.accessibility.AccessibilityNodeInfo
import com.zowl.mobile.NativeLanguage
import com.zowl.mobile.R
import com.zowl.mobile.ocr.LocalOcrCapture

class PaymentAccessibilityService : AccessibilityService() {
    private val handler = Handler(Looper.getMainLooper())
    private var pending: Runnable? = null
    private var pendingFast = false
    // When the look now pending was first asked for; later events may delay it only so far.
    private var pendingSince = 0L
    // Rereads after a look that could not see the window, since the last accessibility event.
    private var transientLooks = 0
    // Rereads of a page whose payment is still to be confirmed, since the last accessibility event.
    private var confirmationLooks = 0
    // Activity class per window id, from window-state events. Identifiers only, in memory only.
    private val windowClasses = LinkedHashMap<Int, String>()
    private val reportedOcrWindows = LinkedHashSet<Int>()
    // WeChat lite-app windows that opened next to its payment flow. Window ids only, in memory only.
    private val wechatLite = WechatLiteWindows(
        onLinked = { windowId, why -> CaptureTrace.d { "payment window wechat window=$windowId joined by $why" } },
        now = SystemClock::elapsedRealtime,
    )
    // Framework dialogs Taobao lays over its embedded cashier. Window ids only, in memory only.
    private val taobaoDialogs = CashierOverlayDialogs("taobao", SystemClock::elapsedRealtime)
    // The same over Alipay's own cashier, when no result page follows it. Window ids only, in memory only.
    private val alipayDialogs = CashierOverlayDialogs("alipay", SystemClock::elapsedRealtime)
    private val paymentCode = PaymentCodeWatch(SystemClock::elapsedRealtime)
    // Whether a window-state class is one of its app's Activities. Class names only, in memory only.
    private val activityClasses = LinkedHashMap<String, Boolean?>()
    private val paymentCodeCheck = Runnable { checkPaymentCode() }
    // Whether each platform's events are acted on, as last written to the capture log.
    private val readiness = HashMap<String, String>()
    // The last few shopping-app screens, scrubbed, for the payment that follows them (ADR-0014).
    // In memory only, and only while the user has item recognition on.
    private val orderContext = OrderContextBuffer(SystemClock::elapsedRealtime)
    // Taobao's last screen that was not its cashier: the one a cashier is opened from. Window id only.
    private var taobaoPage: Int? = null
    private var taobaoPageReadAt = 0L

    override fun onServiceConnected() {
        connected = true
        LocalOcrCapture.service = this
        CaptureTrace.d { "service connected" }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Window metadata protects the one-shot OCR request. No additional tree text is read.
        LocalOcrCapture.onEvent(event)
        if (LocalOcrCapture.state.capturing()) return
        val eventPackage = event?.packageName?.toString() ?: return
        val sourcePackage = sourcePackage(eventPackage) ?: return
        val preferences = CapturePreferences(this)
        val platform = PaymentPageParser.platform(sourcePackage) ?: return
        val cashierClosed = rememberWindowClass(event, platform)
        traceReadiness(preferences, platform)
        if (!eligible(preferences, platform)) return
        val owner = preferences.queueOwnerUserId ?: return
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && platform == "taobao" &&
            PaymentPageOcrGate.role(platform, event.className?.toString()) == PaymentPageOcrGate.Role.CASHIER) {
            readTaobaoOrderPage(preferences, owner)
        }
        if (cashierClosed) {
            // Taobao's or Alipay's cashier closed with its payment overlay: the cashier amount was paid.
            val payment = PaymentPageOcr.onPaidNotice(this, platform, sourcePackage, preferences.installationId)
            CaptureTrace.d { "cashier closed with its overlay $platform: ${if (payment != null) "confirmed" else "no amount waiting"}" }
            payment?.let { deliverOcr(platform, owner, it) }
        }
        // A known payment-flow window is read by OCR, which needs no settled node tree: look soon
        // and do not let a stream of events keep pushing the look back. Other pages keep the
        // settle debounce the node parser relies on.
        val fast = Build.VERSION.SDK_INT >= 34 &&
            ocrRole(platform, event.windowId) != null
        // A pending fast look reads whatever window is active, so nothing may delay or replace it.
        if (pendingFast && pending != null) return
        val now = SystemClock.elapsedRealtime()
        if (pending == null) pendingSince = now
        pending?.let(handler::removeCallbacks)
        pendingFast = fast
        pending = Runnable {
            pending = null
            pendingFast = false
            confirmationLooks = 0
            transientLooks = 0
            capture(sourcePackage, eventPackage, platform, owner)
        }.also { handler.postDelayed(it, LookDelay.millis(platform, fast, now - pendingSince)) }
    }

    private enum class Look { OCR, TRANSIENT, DONE }

    private fun capture(source: String, eventPackage: String, platform: String, owner: String) {
        // A window that cannot be seen for a moment (no root yet, mid-transition) is looked at
        // again shortly, rather than only when the app happens to send another event.
        if (look(source, eventPackage, platform, owner) == Look.TRANSIENT && pending == null &&
            transientLooks < MAX_TRANSIENT_LOOKS) {
            transientLooks++
            handler.postDelayed({
                if (pending == null) capture(source, eventPackage, platform, owner)
            }, TRANSIENT_LOOK_INTERVAL)
        }
    }

    // Scheduled OCR rereads come back through here; a transient miss keeps the chain alive.
    private fun recheckOcr(source: String, eventPackage: String, platform: String, owner: String) {
        if (look(source, eventPackage, platform, owner) == Look.TRANSIENT) {
            PaymentPageOcr.onRecheckMissed { recheckOcr(source, eventPackage, platform, owner) }
        }
    }

    private fun look(source: String, eventPackage: String, platform: String, owner: String): Look {
        if (LocalOcrCapture.state.capturing()) return Look.TRANSIENT
        val preferences = CapturePreferences(this)
        if (!eligible(preferences, platform) || preferences.queueOwnerUserId != owner) return Look.DONE
        val diagnostics = CaptureDiagnosticsStore(this)
        fun reject(reason: PaymentNotificationRejectionReason) = diagnostics.record(
            PaymentNotificationEvaluation.Rejected(platform, "${platform}_payment_page_v1", 1, reason),
        )
        val root = try { rootInActiveWindow } catch (_: Exception) {
            CaptureTrace.d { "look $platform could not get the active window" }
            reject(PaymentNotificationRejectionReason.PAGE_READ_ERROR)
            return Look.TRANSIENT
        }
        if (root == null) {
            CaptureTrace.d { "look $platform no active window" }
            reject(PaymentNotificationRejectionReason.PAGE_ROOT_UNAVAILABLE)
            return Look.TRANSIENT
        }
        val texts = ArrayList<String>()
        // Include-not-important nodes retain more layout wrappers than the default tree.
        val allowance = PaymentPageParser.readBudget(platform)
        val budget = intArrayOf(allowance.nodes, allowance.characters, 0)
        var windowId = -1
        try {
            windowId = root.windowId
            // An event may be delayed until another app is foreground. Never read it.
            if (root.packageName?.toString() != eventPackage) {
                CaptureTrace.d { "look $platform window=$windowId active window belongs to ${root.packageName}" }
                reject(PaymentNotificationRejectionReason.PAGE_WINDOW_CHANGED)
                return Look.TRANSIENT
            }
            collect(root, texts, 0, budget, allowance.depth)
        } catch (_: Exception) {
            CaptureTrace.d { "look $platform window=$windowId read failed" }
            reject(PaymentNotificationRejectionReason.PAGE_READ_ERROR)
            return Look.TRANSIENT
        } finally {
            @Suppress("DEPRECATION")
            root.recycle()
        }
        val partial = budget[2] != 0
        CaptureTrace.d {
            "look $platform window=$windowId class=${PaymentPageOcrGate.label(windowClasses[windowId])} " +
                "texts=${texts.size} partial=$partial"
        }
        if (platform == "taobao") {
            if (ocrRole(platform, windowId) != PaymentPageOcrGate.Role.CASHIER && !taobaoDialogs.isResultWindow(windowId)) {
                taobaoPage = windowId
            }
            taobaoDialogs.onWindowRead(windowId, texts.sumOf { it.count { c -> !c.isWhitespace() } }, recognised = false)
            // A cashier back on top with text (a failure says why) cancels the overlay's evidence; one
            // with an empty tree is closing (seen 0.3 s before Taobao's screen).
            if (texts.isNotEmpty() && ocrRole(platform, windowId) == PaymentPageOcrGate.Role.CASHIER) {
                taobaoDialogs.onCashierActive()
            }
        }
        if (platform == "alipay") {
            alipayDialogs.onWindowRead(windowId, texts.sumOf { it.count { c -> !c.isWhitespace() } }, recognised = false)
            // Alipay's cashier with text in front again: the payment has not ended under the overlay.
            if (texts.isNotEmpty() && alipayDialogs.isCashierWindow(windowId)) {
                alipayDialogs.onCashierActive()
                if (!partial) PaymentPageOcr.onAlipayCashierText(this, windowId, texts.joinToString("\n"))
            }
        }
        // Kept before any page is judged: a cut-off read is no evidence of a payment, but it still
        // shows what is being bought. The cashier is left out: it names the bank card, not goods.
        val collectsContext = OrderContextBuffer.collects(platform)
        if (collectsContext && !preferences.orderDetailsEnabled) orderContext.clear()
        if (collectsContext && preferences.orderDetailsEnabled && texts.isNotEmpty() &&
            ocrRole(platform, windowId) != PaymentPageOcrGate.Role.CASHIER) {
            orderContext.onPage(owner, platform, windowId, "node", texts)
        }
        if (partial && !PaymentPageParser.readsPartialPages(platform)) {
            // A partial tree can hide a second amount or a failure/refund marker.
            reject(PaymentNotificationRejectionReason.PAGE_READ_LIMIT)
            return Look.DONE
        }
        if (texts.isEmpty() && Build.VERSION.SDK_INT >= 34 && windowId != -1) {
            // The app exposes no readable node at all, possibly on every screen including chats.
            // Only windows whose Activity belongs to the payment flow are read by on-device OCR.
            val windowClass = windowClasses[windowId]
            val role = ocrRole(platform, windowId)
            val allowed = role != null
            if (reportedOcrWindows.add(windowId)) {
                while (reportedOcrWindows.size > 32) reportedOcrWindows.remove(reportedOcrWindows.first())
                diagnostics.recordOcrWindow(platform, PaymentPageOcrGate.label(windowClass), allowed)
            }
            if (role == null) return Look.DONE
            // Nothing is on screen to read while the display is off.
            if (!getSystemService(PowerManager::class.java).isInteractive) return Look.DONE
            PaymentPageOcr.onEmptyPage(this, windowId, source, platform, preferences.installationId, role,
                recheck = { recheckOcr(source, eventPackage, platform, owner) },
                deliver = { payment -> deliverOcr(platform, owner, payment) },
                recognised = { text ->
                    if (platform == "taobao") {
                        taobaoDialogs.onWindowRead(windowId, text.count { !it.isWhitespace() }, recognised = true)
                    }
                    if (platform == "alipay") {
                        alipayDialogs.onWindowRead(windowId, text.count { !it.isWhitespace() }, recognised = true)
                    }
                    // Taobao's order and result pages have no node text; what OCR already reads of
                    // them for the payment is also what names the goods. No extra screenshot.
                    if (collectsContext && role == PaymentPageOcrGate.Role.RESULT &&
                        CapturePreferences(this).orderDetailsEnabled) {
                        orderContext.onPage(owner, platform, windowId, "ocr", text.lines())
                    }
                })
            return Look.OCR
        }
        if (PaymentPageParser.usesOrderPanel(platform)) {
            val page = PaymentPageParser.orderPage(platform, texts)
            CaptureTrace.d {
                val kind = when (page) {
                    is PaymentPageParser.PinduoduoPage.OrderPanel -> "order-panel"
                    is PaymentPageParser.PinduoduoPage.PaidPanel -> "paid-panel"
                    PaymentPageParser.PinduoduoPage.Paid -> "paid-notice"
                    PaymentPageParser.PinduoduoPage.Ambiguous -> "ambiguous"
                    PaymentPageParser.PinduoduoPage.Other -> "other"
                }
                "page $platform window=$windowId kind=$kind ${PaymentPageParser.orderPageShape(platform, texts)}"
            }
            when (page) {
                is PaymentPageParser.PinduoduoPage.OrderPanel -> {
                    if (preferences.orderDetailsEnabled) {
                        orderContext.onPage(owner, platform, windowId, "node", emptyList(), checkout = true)
                    }
                    PaymentPageOcr.onOrderPanelAmount(this, platform, windowId, page.amountMinor)
                }
                is PaymentPageParser.PinduoduoPage.PaidPanel -> {
                    PaymentPageOcr.onOrderPanelAmount(this, platform, windowId, page.amountMinor)
                    PaymentPageOcr.onPaidNotice(this, platform, source, preferences.installationId)
                        ?.let { deliverOcr(platform, owner, it) }
                }
                PaymentPageParser.PinduoduoPage.Paid ->
                    PaymentPageOcr.onPaidNotice(this, platform, source, preferences.installationId)
                        ?.let { deliverOcr(platform, owner, it) }
                PaymentPageParser.PinduoduoPage.Ambiguous -> PaymentPageOcr.onOrderPanelAmbiguous(platform, windowId)
                PaymentPageParser.PinduoduoPage.Other -> Unit
            }
            // The paid notice fills in a moment after its window appears, without a further event.
            if (PaymentPageOcr.awaitsConfirmation(platform) && confirmationLooks < MAX_CONFIRMATION_LOOKS) {
                confirmationLooks++
                handler.postDelayed({ look(source, eventPackage, platform, owner) }, CONFIRMATION_LOOK_INTERVAL)
            }
            return Look.DONE
        }
        if (!PaymentPageParser.readsPageText(platform)) {
            // Of Taobao's readable windows only the embedded cashier is evidence; no other page is evaluated.
            if (texts.isNotEmpty() && !partial &&
                ocrRole(platform, windowId) == PaymentPageOcrGate.Role.CASHIER) {
                PaymentPageOcr.onCashierText(this, windowId, source, platform, preferences.installationId,
                    texts.joinToString("\n")) { payment -> deliverOcr(platform, owner, payment) }
            }
            return Look.DONE
        }
        synchronized(CaptureAccountLock.monitor) {
            if (!eligible(preferences, platform) || preferences.queueOwnerUserId != owner) return Look.DONE
            if (texts.isNotEmpty()) diagnostics.recordPageObservation(platform, CaptureDiagnosticsStore.REASON_PAGE_READABLE)
            var session = preferences.pageSession(platform, owner)
            if (PaymentPageParser.isCheckout(texts, platform)) {
                diagnostics.recordPageObservation(platform, CaptureDiagnosticsStore.REASON_CHECKOUT)
                preferences.savePageSession(platform, owner, session.observeCheckout())
                return Look.DONE
            }
            session = session.leaveCheckout()
            if (!preferences.savePageSession(platform, owner, session)) return Look.DONE
            val cashierPaid = if (platform == "alipay") PaymentPageOcr.paidInCashier(windowId) else null
            session = session.forPage(cashierPaid)
            val evaluation = PaymentPageParser.evaluate(source, texts, System.currentTimeMillis(), session.id,
                preferences.installationId, partial, cashierPaid) ?: return Look.DONE
            val captured = evaluation as? PaymentNotificationEvaluation.Captured
            if (captured != null && session.consumed) {
                CaptureDiagnosticsStore(this).record(PaymentNotificationEvaluation.Rejected(
                    platform, captured.parserId, 1, PaymentNotificationRejectionReason.REPEATED_PAYMENT_PAGE,
                ))
                return Look.DONE
            }
            CaptureDiagnosticsStore(this).record(evaluation)
            if (captured == null) return Look.DONE
            if (platform == "wechat") paymentCode.onCaptured()
            // The cashier's own result page was the evidence; its closing must not record it again.
            if (platform == "alipay") {
                PaymentPageOcr.onPageCaptured(platform, windowId)
                alipayDialogs.onCashierActive()
            }
            val payment = settleOrderPaidElsewhere(platform, captured.payment)
            val queued = EncryptedCaptureQueue(this).enqueue(payment, owner)
            // The same opaque identity also survives a crash between enqueue and consume.
            preferences.savePageSession(platform, owner, session.consume())
            if (queued) {
                preferences.lastCaptureAt = System.currentTimeMillis()
                preferences.clearLastError()
                NotificationCaptureWorker.enqueue(this)
            }
        }
        return Look.DONE
    }

    /** Returns true when this event shows Taobao's or Alipay's cashier just closed together with its payment overlay. */
    private fun rememberWindowClass(event: AccessibilityEvent, platform: String): Boolean {
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return false
        CaptureTrace.d { "window-state $platform window=${event.windowId} class=${PaymentPageOcrGate.label(event.className?.toString())}" }
        var cashierClosed = false
        if (platform == "taobao") {
            cashierClosed = taobaoDialogs.onWindowState(event.windowId, event.className?.toString())
            if (taobaoDialogs.isResultWindow(event.windowId)) CaptureTrace.d { "cashier dialog taobao window=${event.windowId}" }
        }
        if (platform == "alipay") {
            val name = event.className?.toString()
            // The fingerprint prompt and Alipay's other dialogs over the cashier do not end its flow.
            val kind = if (name != null && PaymentPageOcrGate.isAppClass(name)) activityKind(event.packageName.toString(), name) else false
            val screen = kind != false
            if (PaymentPageOcrGate.isAppClass(name) && !screen) {
                CaptureTrace.d { "window-state alipay window=${event.windowId} is a dialog or popup" }
            }
            if (kind == null) CaptureTrace.d { "window-state alipay window=${event.windowId} activities unknown" }
            cashierClosed = alipayDialogs.onWindowState(event.windowId, name, screen, screensKnown = kind != null)
            if (alipayDialogs.isResultWindow(event.windowId)) CaptureTrace.d { "cashier dialog alipay window=${event.windowId}" }
        }
        val windowId = event.windowId
        if (PaymentPageOcrGate.isMerchantCashDesk(platform, event.className?.toString())) {
            wechatLite.onMerchantCashDesk(windowId)
        }
        val className = event.className?.toString()?.takeIf(PaymentPageOcrGate::isAppClass)
        if (className == null) {
            if (platform == "wechat" && windowClasses[windowId] == null) wechatLite.onUnidentified(windowId)
            return cashierClosed
        }
        if (platform == "wechat" && wechatLite.onIdentified(windowId, className, isActivity(event.packageName.toString(), className))) {
            CaptureTrace.d { "payment window wechat window=$windowId is another screen: dropped" }
        }
        // A payment window stays a payment window even if a later in-window view reports another class.
        if (ocrRole(platform, windowId) != null && !PaymentPageOcrGate.allows(platform, className)) return cashierClosed
        if (platform == "wechat") {
            val screen = isActivity(event.packageName.toString(), className)
            if (!screen) CaptureTrace.d { "window-state wechat window=$windowId is a dialog or popup" }
            wechatLite.onWindowState(windowId, className, screen)
        }
        windowClasses.remove(windowId)
        windowClasses[windowId] = className
        while (windowClasses.size > 32) windowClasses.remove(windowClasses.keys.first())
        if (platform == "wechat") onWechatScreen(windowId, className)
        return cashierClosed
    }

    /**
     * True when [className] is an Activity of [packageName], i.e. a screen of its own rather than a
     * dialog or popup over one. Obfuscation never renames Activities, which the manifest declares.
     * If the package is not visible to this app every lookup would fail, so all count as screens.
     */
    private fun isActivity(packageName: String, className: String): Boolean = activityKind(packageName, className) ?: true

    /** Like [isActivity], but null when the lookup cannot tell (the package is not visible). */
    private fun activityKind(packageName: String, className: String): Boolean? {
        if (activityClasses.containsKey(className)) return activityClasses[className]
        val activity = try {
            packageManager.getActivityInfo(ComponentName(packageName, className), 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            try {
                packageManager.getPackageInfo(packageName, 0)
                false
            } catch (_: PackageManager.NameNotFoundException) { null }
        } catch (_: Exception) { null }
        activityClasses[className] = activity
        while (activityClasses.size > 64) activityClasses.remove(activityClasses.keys.first())
        return activity
    }

    private fun onWechatScreen(windowId: Int, className: String) {
        when {
            PaymentPageOcrGate.isWechatPaymentCode(className) -> {
                if (!paymentCode.pending()) CaptureTrace.d { "payment-code shown window=$windowId" }
                paymentCode.onCodeShown()
                handler.removeCallbacks(paymentCodeCheck)
                handler.postDelayed(paymentCodeCheck, PaymentCodeWatch.CHECK_INTERVAL)
            }
            ocrRole("wechat", windowId) == null -> paymentCode.onLeftFlow()
        }
    }

    /** While a payment code is being watched: is WeChat still in front, and is it time to ask? */
    private fun checkPaymentCode() {
        if (!paymentCode.pending()) return
        val front = try {
            rootInActiveWindow?.let { root ->
                try { root.packageName?.toString() } finally {
                    @Suppress("DEPRECATION")
                    root.recycle()
                }
            }
        } catch (_: Exception) { null }
        // An unknown front window (none yet, or mid-transition) is not evidence either way.
        if (!getSystemService(PowerManager::class.java).isInteractive) paymentCode.onFront(false)
        else if (front != null) paymentCode.onFront(PaymentPageParser.platform(front) == "wechat")
        if (!paymentCode.takeDue()) {
            handler.postDelayed(paymentCodeCheck, PaymentCodeWatch.CHECK_INTERVAL)
            return
        }
        val preferences = CapturePreferences(this)
        if (!eligible(preferences, "wechat") || preferences.queueOwnerUserId == null) return
        CaptureTrace.d { "payment-code left without a capture: reminder" }
        CaptureDiagnosticsStore(this).recordPageObservation("wechat", CaptureDiagnosticsStore.REASON_PAYMENT_CODE_REMINDER)
        CaptureNotificationPublisher.showPaymentCodeReminder(this)
    }

    /** Logs when a platform's events start or stop being acted on, and why. */
    private fun traceReadiness(preferences: CapturePreferences, platform: String) {
        val state = when {
            !preferences.enabled -> "capture off"
            !preferences.isSourceEnabled(platform) -> "source off"
            preferences.queueOwnerUserId == null -> "signed out"
            else -> "ready"
        }
        if (readiness.put(platform, state) != state) CaptureTrace.d { "$platform $state" }
    }

    /** What automatic OCR may read from this window; null means it is never screenshotted. */
    private fun ocrRole(platform: String, windowId: Int): PaymentPageOcrGate.Role? =
        PaymentPageOcrGate.role(platform, windowClasses[windowId])
            ?: PaymentPageOcrGate.Role.PAYMENT.takeIf { platform == "wechat" && wechatLite.isPaymentWindow(windowId) }
            ?: PaymentPageOcrGate.Role.RESULT.takeIf { platform == "taobao" && taobaoDialogs.isResultWindow(windowId) }
            ?: PaymentPageOcrGate.Role.OVERLAY.takeIf { platform == "alipay" && alipayDialogs.isResultWindow(windowId) }

    /**
     * Taobao's cashier is opening over the order page, most of which has no node text (its
     * mini-program pages expose three or four lines). With item recognition on, that one page is
     * screenshotted once and recognised on this device, so its goods can go with the payment
     * (ADR-0014). The image is never kept; the text is scrubbed like any other screen.
     */
    private fun readTaobaoOrderPage(preferences: CapturePreferences, owner: String) {
        if (!preferences.orderDetailsEnabled || Build.VERSION.SDK_INT < 34) return
        val page = taobaoPage
        if (page == null) {
            CaptureTrace.d { "order-page taobao no page seen before the cashier" }
            return
        }
        // The loading dialog and the cashier itself both announce the same opening.
        val now = SystemClock.elapsedRealtime()
        if (now - taobaoPageReadAt < ORDER_PAGE_READ_INTERVAL) return
        taobaoPageReadAt = now
        PaymentPageOcr.readOrderPage(this, "taobao", page) { text ->
            val current = CapturePreferences(this)
            if (current.orderDetailsEnabled && current.queueOwnerUserId == owner) {
                orderContext.onPage(owner, "taobao", page, "ocr", text.lines(), checkout = true, replace = true)
            }
        }
    }

    private fun deliverOcr(platform: String, owner: String, captured: CapturedPayment) {
        synchronized(CaptureAccountLock.monitor) {
            val preferences = CapturePreferences(this)
            if (!eligible(preferences, platform) || preferences.queueOwnerUserId != owner) return
            if (platform == "wechat") paymentCode.onCaptured()
            val settled = settleOrderPaidElsewhere(platform, captured)
            // The screens the payment was made from go with it, once, when the user allows it.
            val context = if (OrderContextBuffer.collects(platform) && preferences.orderDetailsEnabled) {
                orderContext.take(owner, platform)
            } else {
                null
            }
            if (OrderContextBuffer.collects(platform)) {
                CaptureTrace.d {
                    if (context == null) "order-context $platform none"
                    else "order-context $platform pages=${context.context.pages.size} lines=${context.lines} " +
                        "dropped=${context.dropped} checkout=${context.checkout}"
                }
            }
            val payment = if (context == null) settled else settled.copy(orderContext = context.context)
            CaptureDiagnosticsStore(this).record(PaymentNotificationEvaluation.Captured(payment))
            if (EncryptedCaptureQueue(this).enqueue(payment, owner)) {
                preferences.lastCaptureAt = System.currentTimeMillis()
                preferences.clearLastError()
                NotificationCaptureWorker.enqueue(this)
                // Immediate, on-device confirmation while the user is still on the result page.
                val amount = CaptureNotificationPublisher.formatAmount(payment.amountMinor)
                val text = NativeLanguage.localized(this).getString(R.string.payment_page_recognized_toast, amount)
                Toast.makeText(this, text, Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * A Pupu order may be paid in Alipay or WeChat, where the payment is captured as theirs. Pupu's
     * own completion page then confirms the same order and must not record it again, or the other
     * way around when it came first. Returns the payment with Pupu as its merchant when it is one
     * of its orders.
     */
    private fun settleOrderPaidElsewhere(platform: String, payment: CapturedPayment): CapturedPayment {
        val orderWaits = PaymentPageOcr.awaits("pupu", payment.amountMinor)
        if (PaymentPageOcr.awaitsConfirmation("pupu") && platform != "pupu") {
            CaptureTrace.d { "order pupu paid in $platform: same amount=$orderWaits" }
        }
        when (platform) {
            "alipay", "wechat" -> PaymentPageOcr.onPageCaptured("pupu")
            "pupu" -> {
                PaymentPageOcr.onPageCaptured("alipay")
                alipayDialogs.onCashierActive()
            }
        }
        return payment.copy(merchantName = PaymentPageParser.merchantName(platform, payment.merchantName, orderWaits))
    }

    private fun collect(node: AccessibilityNodeInfo, texts: MutableList<String>, depth: Int, budget: IntArray, maxDepth: Int) {
        if (depth > maxDepth || budget[0]-- <= 0 || budget[1] <= 0) {
            budget[2] = 1
            return
        }
        if (node.isPassword) return
        if (node.isVisibleToUser) {
            listOfNotNull(node.text, node.contentDescription).map { it.toString().trim() }
                .filter(String::isNotBlank).distinct().forEach { value ->
                    val text = value.take(minOf(240, budget[1].coerceAtLeast(0)))
                    if (text.length != value.length) budget[2] = 1
                    if (text.isNotEmpty()) texts.add(text)
                    budget[1] -= text.length
                }
        }
        for (index in 0 until node.childCount) {
            if (budget[0] <= 0 || budget[1] <= 0) {
                budget[2] = 1
                break
            }
            val child = node.getChild(index) ?: continue
            try { collect(child, texts, depth + 1, budget, maxDepth) } finally {
                @Suppress("DEPRECATION")
                child.recycle()
            }
        }
    }

    private fun sourcePackage(eventPackage: String): String? {
        if (PaymentPageParser.platform(eventPackage) != null) return eventPackage
        // Only a debug-only fixture activity in our own process can opt into this path.
        if (isDebuggable && eventPackage == packageName) return debugFixtureSource
        return null
    }

    private fun eligible(preferences: CapturePreferences, platform: String) =
        preferences.enabled && preferences.isSourceEnabled(platform)

    private val isDebuggable: Boolean
        get() = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

    // The system asks to interrupt spoken feedback, which this service never gives. It is not a
    // cancellation: dropping capture state here lost recognised drafts and re-read captured pages.
    override fun onInterrupt() = Unit
    override fun onUnbind(intent: Intent?): Boolean {
        CaptureTrace.d { "service unbound" }
        connected = false
        LocalOcrCapture.disconnect()
        PaymentPageOcr.cancel()
        orderContext.clear()
        pending?.let(handler::removeCallbacks)
        handler.removeCallbacks(paymentCodeCheck)
        return super.onUnbind(intent)
    }
    override fun onDestroy() {
        CaptureTrace.d { "service destroyed" }
        connected = false
        LocalOcrCapture.disconnect()
        PaymentPageOcr.cancel()
        orderContext.clear()
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    companion object {
        private const val MAX_CONFIRMATION_LOOKS = 6
        private const val CONFIRMATION_LOOK_INTERVAL = 500L
        private const val ORDER_PAGE_READ_INTERVAL = 3_000L
        private const val MAX_TRANSIENT_LOOKS = 3
        private const val TRANSIENT_LOOK_INTERVAL = 300L
        @Volatile var connected: Boolean = false
            private set
        @Volatile var debugFixtureSource: String? = null
        fun accessGranted(context: Context): Boolean {
            val expected = ComponentName(context, PaymentAccessibilityService::class.java)
            return context.getSystemService(AccessibilityManager::class.java)
                .getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                .any { ComponentName.unflattenFromString(it.id) == expected }
        }
    }
}

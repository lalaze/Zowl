package com.zowl.mobile.capture

import com.zowl.mobile.ocr.LocalOcrParser
import java.math.BigDecimal
import java.security.MessageDigest
import java.time.Instant
import java.time.ZoneId

/**
 * Pacing and identity for automatic OCR of payment windows whose accessibility tree is empty.
 * Pure state: window ids, counters and the last captured amount stay in memory only.
 *
 * One success page yields one candidate. A window is re-armed for another payment only after
 * two consecutive reads that are not a success page, so one flaky read can neither duplicate
 * a payment nor turn a misread amount on the same page into a second candidate.
 */
class PaymentPageOcrSessions(private val now: () -> Long) {
    private class Window(var firstSeen: Long) {
        var attempts = 0
        var lastAttempt: Long? = null
        var generation = 0
        var consumedAmountMinor: Long? = null
        var misses = 0
    }

    private val windows = LinkedHashMap<Int, Window>()

    private fun window(id: Int): Window {
        windows[id]?.let { return it }
        while (windows.size >= MAX_WINDOWS) windows.remove(windows.keys.first())
        return Window(now()).also { windows[id] = it }
    }

    private fun interval(window: Window): Long = when {
        window.consumedAmountMinor != null -> CONSUMED_INTERVAL
        window.attempts < FAST_ATTEMPTS -> FAST_INTERVAL
        window.attempts < SLOW_ATTEMPTS -> SLOW_INTERVAL
        else -> IDLE_INTERVAL
    }

    /** 0 when a screenshot may be taken now, otherwise the milliseconds still to wait. */
    fun delayBeforeAttempt(windowId: Int): Long {
        val window = window(windowId)
        val last = window.lastAttempt ?: return 0
        return (last + interval(window) - now()).coerceAtLeast(0)
    }

    fun began(windowId: Int) {
        val window = window(windowId)
        window.attempts++
        window.lastAttempt = now()
    }

    /** The generation for a new candidate, or null when this success page was already captured. */
    fun onSuccessPage(windowId: Int, amountMinor: Long): Int? {
        val window = window(windowId)
        window.misses = 0
        if (window.consumedAmountMinor != null) return null
        window.consumedAmountMinor = amountMinor
        return window.generation
    }

    /** A success heading without one unambiguous amount: neither captured nor a reason to re-arm. */
    fun onAmbiguousSuccessPage(windowId: Int) {
        window(windowId).misses = 0
    }

    /** Anything that is not a success page, including a protected window that cannot be captured. */
    fun onOtherPage(windowId: Int) {
        val window = window(windowId)
        if (window.consumedAmountMinor == null) return
        if (++window.misses < REARM_MISSES) return
        window.consumedAmountMinor = null
        window.misses = 0
        window.generation++
        window.attempts = 0
        window.firstSeen = now()
    }

    /** Timer-driven rereads only while a fresh window may still reach its success page. */
    fun shouldChain(windowId: Int): Boolean {
        val window = window(windowId)
        return window.consumedAmountMinor == null && now() - window.firstSeen < CHAIN_WINDOW
    }

    fun nextDelay(windowId: Int): Long = interval(window(windowId))

    fun isCaptured(windowId: Int): Boolean = windows[windowId]?.consumedAmountMinor != null

    fun clear() = windows.clear()

    companion object {
        // Just above the system's minimum gap between accessibility screenshots, so a result
        // page is read within a fraction of a second instead of making the user wait on it.
        const val FAST_INTERVAL = 400L
        const val SLOW_INTERVAL = 2_000L
        const val IDLE_INTERVAL = 10_000L
        const val FAST_ATTEMPTS = 75
        const val SLOW_ATTEMPTS = 150
        const val CONSUMED_INTERVAL = 4_000L
        const val CHAIN_WINDOW = 120_000L
        const val REARM_MISSES = 2
        private const val MAX_WINDOWS = 8
    }
}

/** Pure candidate construction for OCR-read payment pages. No Android dependencies. */
object PaymentPageOcrFacts {
    fun parserId(platform: String) = "${platform}_payment_page_ocr_v1"
    const val PARSER_VERSION = 1

    fun amountMinor(fields: LocalOcrParser.Fields): Long? = fields.amount?.let(::minor)

    /** Yuan with up to two decimals, as OCR parsing reports it, in fen. */
    fun minor(amount: String): Long? =
        amount.toBigDecimalOrNull()?.takeIf { it > BigDecimal.ZERO }?.movePointRight(2)
            ?.let { runCatching { it.longValueExact() }.getOrNull() }

    /** Fields for an amount established on another window; the page it is confirmed on names no payee. */
    fun fields(amountMinor: Long) =
        LocalOcrParser.Fields(BigDecimal(amountMinor).movePointLeft(2).toPlainString(), null, null)

    /** Builds the candidate from parsed OCR fields; null unless exactly one amount was read. */
    fun candidate(
        fields: LocalOcrParser.Fields,
        text: String,
        platform: String,
        sourcePackage: String,
        installationId: String,
        bootCount: Int,
        windowId: Int,
        generation: Int,
        capturedAtMillis: Long,
    ): CapturedPayment? {
        if (fields.warning != null) return null
        val amountMinor = amountMinor(fields) ?: return null
        val evidence = text.lines().map(PaymentParserSupport::normalizeEvidenceField).filter(String::isNotBlank)
        return CapturedPayment(
            // Stable for one success page of one window, so a service restart cannot mint a duplicate.
            // Window ids restart after a system restart that keeps the boot count; the amount and
            // local day keep a reused id from silently matching an older payment's key.
            idempotencyKey = digest(
                "$installationId|$sourcePackage|payment-page-ocr|$bootCount|$windowId|$generation|$amountMinor|" +
                    Instant.ofEpochMilli(capturedAtMillis).atZone(ZoneId.systemDefault()).toLocalDate(),
            ),
            platform = platform,
            sourcePackage = sourcePackage,
            postedAt = Instant.ofEpochMilli(capturedAtMillis).toString(),
            parserId = parserId(platform),
            parserVersion = PARSER_VERSION,
            evidenceDigest = digest(evidence.joinToString("\n")),
            confidenceBasisPoints = if (fields.merchant == null) 8_000 else 8_500,
            amountMinor = amountMinor,
            merchantName = fields.merchant,
        )
    }

    private fun digest(value: String) = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
}

/**
 * Taobao pays through an Alipay cashier embedded in its own app, and splits the facts across two
 * windows: the cashier shows the amount (and, for about half a second, "付款成功"), while the
 * unreadable result page that follows shows "支付成功" but only prices of other goods. A payment is
 * therefore the cashier's amount confirmed by either window. Amounts stay in memory only.
 */
class ShoppingCashierFlow(private val confirmWindow: Long = CONFIRM_WINDOW, private val now: () -> Long) {
    /** [yuan] is whether the page stated the amount as yuan, rather than as a bare number. */
    data class Pending(val windowId: Int, val amountMinor: Long, val seenAt: Long, val yuan: Boolean = false)

    private var pending: Pending? = null
    // When the amount now on show first appeared, and the amount it replaced on the same window.
    private var pendingSince = 0L
    private var replaced: Pending? = null
    private var settledWindow: Int? = null
    // What the settled window showed before its success, and the same once its success page repeated it.
    private var settling: Pending? = null
    private var paid: Pending? = null

    /** A cashier frame showing exactly one amount and no outcome yet. */
    fun onCashierAmount(windowId: Int, amountMinor: Long, yuan: Boolean = false) {
        if (windowId == settledWindow) return
        val shown = pending
        if (shown != null && shown.windowId == windowId && shown.amountMinor == amountMinor) {
            pending = shown.copy(seenAt = now(), yuan = shown.yuan || yuan)
            return
        }
        replaced = shown?.takeIf { it.windowId == windowId }
        pendingSince = now()
        pending = Pending(windowId, amountMinor, now(), yuan)
    }

    /**
     * A cashier frame showing several amounts: what it charges is no longer known, so an amount
     * remembered from an earlier frame of the same window is not confirmed either.
     */
    fun onCashierAmbiguous(windowId: Int) {
        if (pending?.windowId != windowId) return
        pending = null
        replaced = null
    }

    /**
     * The cashier itself showed its success state: there is nothing left for the result page to confirm.
     * [shownMinor] is the one amount of that success page, which may fill in after its heading.
     */
    fun onCashierSettled(windowId: Int, shownMinor: Long? = null, yuan: Boolean = false) {
        if (windowId != settledWindow) {
            settling = pending?.takeIf { it.windowId == windowId }
            paid = null
        }
        settledWindow = windowId
        pending = null
        replaced = null
        val before = settling ?: return
        if (shownMinor == before.amountMinor && (before.yuan || yuan)) paid = before
    }

    /**
     * The yuan amount this cashier window showed and then reported as paid on its success page.
     * The pair is a payment of its own, whichever page was captured last; null once it is recorded.
     */
    fun paidInCashier(windowId: Int): Long? = paid?.takeIf { it.windowId == windowId }?.amountMinor

    /** The success page in [windowId] was recorded; nothing this window still shows is another payment. */
    fun onPageCaptured(windowId: Int) {
        clear()
        settledWindow = windowId
    }

    /**
     * The result page shows a success heading. Returns the cashier payment it confirms, once;
     * null when no cashier amount was read just before (a cancelled or much older checkout).
     */
    fun onResultSuccess(maxAge: Long = confirmWindow): Pending? {
        val shown = pending ?: return null
        val before = replaced
        pending = null
        replaced = null
        if (now() - shown.seenAt > maxAge) return null
        settledWindow = shown.windowId
        settling = null
        paid = null
        // A checkout may redraw as the payment completes (Pinduoduo's panel falls back to its
        // default payment method). What was paid is the amount that stood there when the order
        // was submitted, not one that appeared in the instant before the success.
        return if (before != null && now() - pendingSince < REDRAW_WINDOW) shown.copy(amountMinor = before.amountMinor)
        else shown
    }

    /** The pending amount waiting for confirmation within [maxAge], if any. */
    fun pending(maxAge: Long = confirmWindow): Pending? = pending?.takeIf { now() - it.seenAt <= maxAge }

    /** Exactly [amountMinor] is waiting for its payment to be confirmed. */
    fun awaits(amountMinor: Long): Boolean = awaitsConfirmation() && pending?.amountMinor == amountMinor

    /** An amount is waiting for its payment to be confirmed. */
    fun awaitsConfirmation(maxAge: Long = confirmWindow): Boolean = pending(maxAge) != null

    fun clear() {
        pending = null
        replaced = null
        settledWindow = null
        settling = null
        paid = null
    }

    companion object {
        /** The result page replaces the cashier within a second or two of the payment. */
        const val CONFIRM_WINDOW = 30_000L
        /** Submitting and charging an order takes longer than this; a redraw at completion does not. */
        const val REDRAW_WINDOW = 400L
    }
}

/**
 * Limits automatic OCR to windows of the payment flow. A payment app may expose an empty
 * accessibility tree on every screen, chats included, so "unreadable" alone is not a trigger:
 * the window's own Activity class must look like a wallet/payment screen. Unknown classes are
 * denied. Class names are code identifiers, never page content.
 */
object PaymentPageOcrGate {
    private val wechat = listOf("wallet", "kinda", "remittance", "offline", "uipagefragment", ".pay.", "paydesk", "honey_pay")
    private val alipay = listOf(".msp.", "cashier", "payresult", "transfer", ".pay.")

    /** What a screenshotted window may contribute. */
    enum class Role {
        /** A payment app's own flow: the success page carries the amount. */
        PAYMENT,
        /** The Alipay cashier embedded in Taobao: the amount, and briefly the outcome. */
        CASHIER,
        /** Taobao's result page: the outcome only; amounts on it belong to other goods. */
        RESULT,
        /**
         * The overlay over Alipay's own cashier: only whether it shows any text. Never amounts or an
         * outcome, since a success page after it is the node parser's (see [CashierOverlayDialogs]).
         */
        OVERLAY,
    }

    /** Events from plain framework views carry android.* classes; only app classes identify a screen. */
    fun isAppClass(className: String?): Boolean =
        className != null && className.contains('.') &&
            listOf("android.", "androidx.", "java.", "kotlin.").none(className::startsWith)

    fun role(platform: String, className: String?): Role? {
        val name = className?.lowercase() ?: return null
        return when (platform) {
            "wechat" -> Role.PAYMENT.takeIf { wechat.any(name::contains) }
            "alipay" -> Role.PAYMENT.takeIf { alipay.any(name::contains) }
            // Only these two windows of Taobao; its trade pages share the result page's Activity.
            "taobao" -> when {
                name.contains(".msp.") -> Role.CASHIER
                name.endsWith(".ultrontradehybridactivity") -> Role.RESULT
                else -> null
            }
            // Only Xianyu's embedded Alipay cashier; its Flutter screens include chats and are never screenshotted.
            "xianyu" -> Role.CASHIER.takeIf { name.contains(".msp.") }
            else -> null
        }
    }

    fun allows(platform: String, className: String?): Boolean = role(platform, className) != null

    /**
     * WeChat's general "lite app" container. It also hosts features unrelated to payment, so it is
     * never admitted by class name alone; see [WechatLiteWindows].
     */
    fun isWechatLite(className: String?): Boolean =
        className?.lowercase()?.contains(".plugin.lite.ui.wxalite") == true

    /** The lite container as a cashier is drawn in it: over the page that asked for the payment. */
    fun isWechatTransparentLite(className: String?): Boolean =
        isWechatLite(className) && className!!.lowercase().contains("transparent")

    /** A mini-program's Activity that only starts something else, a payment among others. */
    fun isWechatTaskProxy(className: String?): Boolean =
        className?.lowercase()?.endsWith(".appbrandtaskproxyui") == true

    /** Opens together with the cashier a mini-program asked for. */
    fun isWechatWalletBrand(className: String?): Boolean =
        className?.lowercase()?.endsWith(".walletbrandui") == true

    /** A shopping app's own screen that hands the payment to WeChat's (or another) cashier. */
    fun isMerchantCashDesk(platform: String, className: String?): Boolean =
        platform == "taobao" && className?.lowercase()?.endsWith(".cashdeskactivity") == true

    /** WeChat's payment-code screens; the code page itself refuses screenshots. */
    fun isWechatPaymentCode(className: String?): Boolean =
        className?.lowercase()?.contains(".plugin.offline.ui.") == true

    /** Simple class name only, for the on-device diagnostics list. */
    fun label(className: String?): String =
        className?.substringAfterLast('.')?.filter { it.isLetterOrDigit() || it == '_' || it == '$' }
            ?.take(48)?.ifBlank { null } ?: "unknown"
}

/**
 * WeChat shows parts of its payment flow in its general lite-app container: the cashier a
 * mini-program or another app opens, and the result after a payment code is scanned. A lite window
 * becomes a payment window only when a payment opens right next to it:
 *  - the mini-program cashier appears a moment before WalletBrandUI reports its window, or a moment
 *    after the mini-program's task proxy when WalletBrandUI never reports one;
 *  - the cashier Taobao hands to WeChat appears next to Taobao's cash desk;
 *  - the payment-code result opens while the payment-code page is still the last WeChat screen.
 * The cashier does not always report its own class: its window may only ever send events of a
 * framework view. Such an unidentified window counts next to
 * WalletBrandUI or the cash desk, until it turns out to be another WeChat screen.
 * Any other WeChat screen (a chat, a mini-program page) ends the flow. A dialog or popup shown
 * over a screen is not another screen: the payment code raises one just before its result opens
 * (seen 2026-11-18: an obfuscated `k2` window 1.5 s before the lite result), and neither is the
 * task proxy, which has nothing to show. Window ids and times only, in memory only.
 */
class WechatLiteWindows(
    private val onLinked: (windowId: Int, why: String) -> Unit = { _, _ -> },
    private val now: () -> Long,
) {
    private var lastLite: Int? = null
    private var lastLiteAt = 0L
    private var lastUnidentified: Int? = null
    private var lastUnidentifiedAt = 0L
    private var paymentScreenAt: Long? = null
    private var taskProxyAt: Long? = null
    private var cashDesk: Int? = null
    // Null once the cash desk has opened its one cashier.
    private var cashDeskAt: Long? = null
    private val linked = LinkedHashSet<Int>()
    // Linked before their class was known; see [onIdentified].
    private val provisional = HashSet<Int>()

    /**
     * A window-state event of WeChat with an app class, for a window not already a payment window.
     * [screen] is false when the class is not one of WeChat's Activities (a dialog or popup).
     */
    fun onWindowState(windowId: Int, className: String, screen: Boolean = true) {
        val time = now()
        when {
            PaymentPageOcrGate.isWechatLite(className) -> {
                val paymentAt = paymentScreenAt
                val proxyAt = taskProxyAt
                when {
                    paymentAt != null && time - paymentAt <= AFTER_PAYMENT_SCREEN -> link(windowId, "payment screen")
                    PaymentPageOcrGate.isWechatTransparentLite(className) && proxyAt != null &&
                        time - proxyAt <= BEFORE_PAYMENT_SCREEN -> link(windowId, "task proxy")
                    openedByCashDesk(windowId, time) -> linkToCashDesk(windowId)
                }
                lastLite = windowId
                lastLiteAt = time
            }
            PaymentPageOcrGate.allows("wechat", className) -> {
                paymentScreenAt = time
                taskProxyAt = null
                val lite = lastLite
                if (lite != null && time - lastLiteAt <= BEFORE_PAYMENT_SCREEN) link(lite, "payment screen")
                val unidentified = lastUnidentified
                if (PaymentPageOcrGate.isWechatWalletBrand(className) && unidentified != null &&
                    unidentified != windowId && time - lastUnidentifiedAt <= BEFORE_PAYMENT_SCREEN) {
                    link(unidentified, "payment screen", unidentified = true)
                }
            }
            PaymentPageOcrGate.isWechatTaskProxy(className) -> taskProxyAt = time
            !screen -> Unit
            else -> {
                paymentScreenAt = null
                taskProxyAt = null
                lastLite = null
                lastUnidentified = null
            }
        }
    }

    /** A window-state event of WeChat with a framework class, for a window whose class is not known. */
    fun onUnidentified(windowId: Int) {
        val time = now()
        if (openedByCashDesk(windowId, time)) linkToCashDesk(windowId, unidentified = true)
        lastUnidentified = windowId
        lastUnidentifiedAt = time
    }

    /**
     * Another app's cash desk showed its window. It hands the payment to WeChat's cashier, whose
     * window opens next: ids only grow, so an older WeChat window is never the cashier.
     */
    fun onMerchantCashDesk(windowId: Int) {
        // The desk reports itself again when WeChat returns to it; it opens nothing then.
        if (windowId == cashDesk) return
        val time = now()
        cashDesk = windowId
        cashDeskAt = time
        val lite = lastLite
        val unidentified = lastUnidentified
        if (lite != null && lite > windowId && time - lastLiteAt <= BEFORE_PAYMENT_SCREEN) linkToCashDesk(lite)
        else if (unidentified != null && unidentified > windowId && time - lastUnidentifiedAt <= BEFORE_PAYMENT_SCREEN) {
            linkToCashDesk(unidentified, unidentified = true)
        }
    }

    /**
     * A payment window reported an app class after all. True when it was linked without one and
     * turns out to be another of WeChat's screens, so it is no payment window any more.
     */
    fun onIdentified(windowId: Int, className: String, screen: Boolean): Boolean {
        if (windowId !in provisional || !screen) return false
        provisional.remove(windowId)
        if (PaymentPageOcrGate.isWechatLite(className) || PaymentPageOcrGate.allows("wechat", className)) return false
        linked.remove(windowId)
        return true
    }

    fun isPaymentWindow(windowId: Int): Boolean = windowId in linked

    private fun openedByCashDesk(windowId: Int, time: Long): Boolean {
        val desk = cashDesk ?: return false
        val at = cashDeskAt ?: return false
        return windowId > desk && time - at <= AFTER_CASH_DESK
    }

    private fun linkToCashDesk(windowId: Int, unidentified: Boolean = false) {
        cashDeskAt = null
        link(windowId, "cash desk", unidentified)
    }

    private fun link(windowId: Int, why: String, unidentified: Boolean = false) {
        if (!linked.remove(windowId)) {
            if (unidentified) provisional.add(windowId)
            onLinked(windowId, why)
        }
        linked.add(windowId)
        while (linked.size > MAX_WINDOWS) {
            val oldest = linked.first()
            linked.remove(oldest)
            provisional.remove(oldest)
        }
    }

    companion object {
        /** Observed 0.4 s between the cashier and WalletBrandUI; a little slack, nothing more. */
        const val BEFORE_PAYMENT_SCREEN = 2_000L
        /** A payment code can be on screen for a while before the cashier scans it. */
        const val AFTER_PAYMENT_SCREEN = 300_000L
        /** Observed within 0.2 s; WeChat may have to start first. */
        const val AFTER_CASH_DESK = 5_000L
        private const val MAX_WINDOWS = 8
    }
}

/**
 * Taobao's embedded Alipay cashier, once the user confirms, is covered by a plain framework
 * dialog (class `android.app.Dialog`, empty accessibility tree, nothing to recognise) while the
 * payment runs. A dialog counts as a result window, which only confirms the amount the cashier
 * showed and is never a source of amounts, when it opens after a cashier window with no other
 * Taobao screen in between, within [AFTER_CASHIER].
 *
 * The overlay also removes the cashier from the accessibility window list, so the cashier's own
 * success state cannot be read under it. What can be seen is how it ends: after a payment the
 * cashier closes together with the overlay and Taobao's own screen comes back; after a failure
 * the cashier stays and shows why. So a text-free overlay that was recognised at least once and
 * was followed directly by a Taobao screen, within [OVERLAY_MAX], reports the payment as done.
 *
 * Alipay's own cashier (its `.msp.` Activity) ends the same way when a mini-program or web page
 * opened it and no result page follows. There the dialog is only an
 * [PaymentPageOcrGate.Role.OVERLAY] window, since a result page that does follow is read by the
 * node parser, and Alipay raises its own dialogs (fingerprint prompt, notices, loading) while
 * paying: only another Alipay Activity ends the flow, as in [WechatLiteWindows]. Any such dialog
 * after the overlay voids it, and without a way to tell Activities from dialogs nothing is confirmed.
 * Window ids, times and character counts only, in memory only.
 */
class CashierOverlayDialogs(private val platform: String, private val now: () -> Long) {
    private var cashierAt: Long? = null
    private var cashierWindow: Int? = null
    private val linked = LinkedHashSet<Int>()
    // The linked dialog last opened over the cashier, until any other screen of the app follows it.
    private var overlay: Int? = null
    private var overlayAt = 0L
    private var overlayRecognised = 0
    private var overlayHasText = false

    private fun isCashier(className: String?, screen: Boolean): Boolean = when {
        PaymentPageParser.usesEmbeddedCashier(platform) ->
            PaymentPageOcrGate.role(platform, className) == PaymentPageOcrGate.Role.CASHIER
        platform == "alipay" -> screen && PaymentPageOcrGate.isAppClass(className) && className!!.lowercase().contains(".msp.")
        else -> false
    }

    /**
     * Every window-state event of the app, whatever its class. [screen] is false when an app class
     * is not one of the app's Activities (a dialog or popup); only Alipay's flow tells them apart.
     * [screensKnown] is false when the app's Activities cannot be looked up, so [screen] is only a
     * guess: then no screen confirms a payment, since a dialog could pass for one.
     * True, once, when this event is the app's screen that came back as the cashier closed
     * together with its text-free overlay.
     */
    fun onWindowState(windowId: Int, className: String?, screen: Boolean = true, screensKnown: Boolean = true): Boolean {
        when {
            isCashier(className, screen) -> {
                cashierAt = now()
                cashierWindow = windowId
                overlay = null
            }
            isFrameworkDialog(className) -> {
                val at = cashierAt
                if (at != null && now() - at <= AFTER_CASHIER) {
                    linked.remove(windowId)
                    linked.add(windowId)
                    while (linked.size > MAX_WINDOWS) linked.remove(linked.first())
                    if (overlay != windowId) {
                        overlay = windowId
                        overlayAt = now()
                        overlayRecognised = 0
                        overlayHasText = false
                    }
                }
            }
            // A dialog of Alipay's own after the overlay (a failure notice, say) may be how the
            // payment ended, so the overlay alone no longer says it went through.
            platform == "alipay" && !screen -> overlay = null
            PaymentPageOcrGate.isAppClass(className) -> {
                cashierAt = null
                cashierWindow = null
                val closed = screensKnown && overlay != null && overlayRecognised > 0 && !overlayHasText &&
                    now() - overlayAt <= OVERLAY_MAX
                overlay = null
                return closed
            }
        }
        return false
    }

    fun isResultWindow(windowId: Int): Boolean = windowId in linked

    /** The cashier window of the flow now open, if any. */
    fun isCashierWindow(windowId: Int): Boolean = windowId == cashierWindow

    /**
     * What one read of a window found: [chars] non-blank characters, by on-device recognition
     * when [recognised], else from accessibility nodes. Only the current overlay is tracked.
     */
    fun onWindowRead(windowId: Int, chars: Int, recognised: Boolean) {
        if (windowId != overlay) return
        if (chars >= TEXT_FREE_LIMIT) overlayHasText = true
        else if (recognised) overlayRecognised++
    }

    /** The cashier is the active window again and shows text: whatever the overlay was, it is readable. */
    fun onCashierActive() {
        overlay = null
    }

    companion object {
        /** Seen 0.5 s after the cashier; entering a payment password takes longer. */
        const val AFTER_CASHIER = 30_000L
        /** Seen 1.4-1.6 s from the overlay opening to the cashier closing; a slow network takes longer. */
        const val OVERLAY_MAX = 15_000L
        /** The loading animation's Alipay mark can be recognised as a stray character or two. */
        const val TEXT_FREE_LIMIT = 3
        private const val MAX_WINDOWS = 8

        /** A dialog class of the platform or a support library, not one of the app's own screens. */
        fun isFrameworkDialog(className: String?): Boolean =
            className != null && !PaymentPageOcrGate.isAppClass(className) &&
                className.substringAfterLast('.').endsWith("Dialog")
    }
}

/**
 * One accessibility-node read of Alipay's own cashier. The cashier is never a payment by itself:
 * its success page, when it shows one, is the node parser's, which is told when that page repeats
 * the amount the cashier showed ([ShoppingCashierFlow.paidInCashier]). Before that, its one amount
 * is what [CashierOverlayDialogs] confirms if the cashier closes with its overlay instead. Offer
 * lines are dropped first, as on Taobao's cashier. Amounts stay in memory only.
 */
object AlipayCashierText {
    enum class Frame { AMOUNT, SETTLED, AMBIGUOUS, NONE }

    fun apply(flow: ShoppingCashierFlow, windowId: Int, shown: String): Frame {
        val text = LocalOcrParser.withoutOffers(shown)
        val amount = LocalOcrParser.singleAmount(text)?.let(PaymentPageOcrFacts::minor)
        val yuan = amount != null && PaymentPageParser.statesYuan(text.lines(), amount)
        if (LocalOcrParser.hasSuccessHeading(text)) {
            flow.onCashierSettled(windowId, amount, yuan)
            return Frame.SETTLED
        }
        if (amount != null) {
            flow.onCashierAmount(windowId, amount, yuan)
            return Frame.AMOUNT
        }
        if (LocalOcrParser.amountCount(text) > 1) {
            flow.onCashierAmbiguous(windowId)
            return Frame.AMBIGUOUS
        }
        return Frame.NONE
    }
}

/**
 * A payment started in Xianyu's embedded cashier may be handed off to the Alipay app under risk
 * control and return straight to Xianyu's own result page. Picks whichever cashier saw an amount
 * most recently within [maxAge], confirms it once, and clears both flows.
 */
object XianyuCashierConfirmation {
    fun awaits(xianyu: ShoppingCashierFlow?, alipay: ShoppingCashierFlow?, maxAge: Long): Boolean =
        latest(xianyu, alipay, maxAge) != null

    fun confirm(
        xianyu: ShoppingCashierFlow?,
        alipay: ShoppingCashierFlow?,
        maxAge: Long,
    ): ShoppingCashierFlow.Pending? {
        val chosen = latest(xianyu, alipay, maxAge) ?: return null
        val confirmed = chosen.onResultSuccess(maxAge)
        if (chosen !== xianyu) xianyu?.clear()
        if (chosen !== alipay) alipay?.clear()
        return confirmed
    }

    private fun latest(
        xianyu: ShoppingCashierFlow?,
        alipay: ShoppingCashierFlow?,
        maxAge: Long,
    ): ShoppingCashierFlow? {
        val x = xianyu?.pending(maxAge)
        val a = alipay?.pending(maxAge)
        return when {
            x == null && a == null -> null
            x == null -> alipay
            a == null -> xianyu
            a.seenAt > x.seenAt -> alipay
            else -> xianyu
        }
    }
}

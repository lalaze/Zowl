package com.zowl.mobile.capture

/**
 * WeChat's payment-code page cannot be screenshotted, so a payment made with it is recorded only
 * when its result page can be read. Once the code has been shown and the user has left it with
 * no WeChat payment captured, they are asked once whether they paid. Times only, in memory only.
 */
class PaymentCodeWatch(private val now: () -> Long) {
    private var shownAt: Long? = null
    private var awaySince: Long? = null
    private var leftFlow = false

    fun pending(): Boolean = shownAt != null

    fun onCodeShown() {
        if (shownAt == null) shownAt = now()
        awaySince = null
        leftFlow = false
    }

    /** A WeChat payment was captured, so there is nothing to ask about. */
    fun onCaptured() = reset()

    /** WeChat moved on to a screen outside its payment flow, such as a chat or its service page. */
    fun onLeftFlow() {
        if (shownAt == null) return
        leftFlow = true
        if (awaySince == null) awaySince = now()
    }

    /**
     * A periodic look at the front app. [wechat] is false for another app, the notification shade
     * or a dark screen. Coming back to WeChat undoes a glance away, not a move to another screen.
     */
    fun onFront(wechat: Boolean) {
        if (shownAt == null) return
        when {
            !wechat -> if (awaySince == null) awaySince = now()
            !leftFlow -> awaySince = null
        }
    }

    /** True once, when it is time to ask; the watch is then over. */
    fun takeDue(): Boolean {
        val shown = shownAt ?: return false
        val away = awaySince
        val due = if (away != null) now() - away >= GRACE else now() - shown >= MAX_SHOWN
        if (due) reset()
        return due
    }

    private fun reset() {
        shownAt = null
        awaySince = null
        leftFlow = false
    }

    companion object {
        /** A result page read just after leaving still counts as captured. */
        const val GRACE = 10_000L
        /** A code left on screen this long is asked about anyway, and the watch ends. */
        const val MAX_SHOWN = 600_000L
        /** How often the front app is checked while a code is being watched. */
        const val CHECK_INTERVAL = 3_000L
    }
}

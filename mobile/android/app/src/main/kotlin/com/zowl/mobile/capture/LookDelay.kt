package com.zowl.mobile.capture

/**
 * How long to wait after an accessibility event before reading the window. A page is read once
 * it has settled, so each new event pushes the read back. A page that never settles (a countdown
 * redrawing several times a second) would then never be read: a Pinduoduo order
 * panel was once up for 15 s and paid from without one read, so its amount was unknown when the paid
 * notice came. Where the payment is read from such a panel, the wait is therefore bounded.
 */
object LookDelay {
    const val FAST = 120L
    const val SETTLE = 500L
    const val MAX_WAIT = 1_500L

    /** [waited] is how long the pending read has already been put off by earlier events. */
    fun millis(platform: String, fast: Boolean, waited: Long): Long = when {
        fast -> FAST
        PaymentPageParser.usesOrderPanel(platform) -> SETTLE.coerceAtMost(MAX_WAIT - waited).coerceAtLeast(0)
        else -> SETTLE
    }
}

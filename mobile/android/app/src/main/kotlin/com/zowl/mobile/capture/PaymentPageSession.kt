package com.zowl.mobile.capture

import java.util.UUID

/** A captured success remains consumed across app switches and service restarts.
 * Only a newly observed checkout can arm the next success. No amount-based merge. */
data class PaymentPageSession(
    val id: String = UUID.randomUUID().toString(),
    val consumed: Boolean = false,
    val checkoutVisible: Boolean = false,
) {
    fun observeCheckout(): PaymentPageSession =
        if (checkoutVisible) this else PaymentPageSession(checkoutVisible = true)

    /** A success page whose own cashier showed the amount first is a new payment, not a repeat. */
    fun forPage(cashierPaidMinor: Long?): PaymentPageSession =
        if (consumed && cashierPaidMinor != null) PaymentPageSession() else this

    fun leaveCheckout(): PaymentPageSession = copy(checkoutVisible = false)
    fun consume(): PaymentPageSession = copy(consumed = true, checkoutVisible = false)
}

package com.zowl.mobile.ocr

import java.util.UUID

/** No Android storage, credentials, images or raw OCR text. Access on the main thread only. */
class LocalOcrState(private val now: () -> Long) {
    data class Request(val id: String, val owner: String, val windowId: Int, val packageName: String)
    data class Draft(val request: Request, val amount: String?, val merchant: String?, val warning: String?)
    private var owner: String? = null
    private var request: Request? = null
    private var draft: Draft? = null
    private var ready = false
    private var deadline = 0L

    fun bind(userId: String?) {
        if (owner != userId) clear()
        owner = userId
    }
    fun owner(): String? = owner
    fun busy(): Boolean {
        if (now() >= deadline) clear()
        return request != null
    }
    /** Starts unbound by default: the payment window is only resolvable once the panel has collapsed. */
    fun begin(windowId: Int = NO_WINDOW, packageName: String = ""): Request? {
        if (busy()) return null
        val user = owner ?: return null
        return Request(UUID.randomUUID().toString(), user, windowId, packageName).also {
            request = it
            deadline = now() + REQUEST_TTL
        }
    }
    /** Binds the still-unbound current request to exactly one window. Never rebinds. */
    fun bindTarget(id: String, windowId: Int, packageName: String): Request? {
        val pending = request?.takeIf { current(id) && !ready && it.windowId == NO_WINDOW } ?: return null
        if (windowId == NO_WINDOW || packageName.isBlank()) return null
        return pending.copy(windowId = windowId, packageName = packageName).also { request = it }
    }
    fun current(id: String): Boolean = busy() && request?.id == id && request?.owner == owner
    fun capturing(): Boolean = busy() && !ready
    fun complete(id: String, fields: LocalOcrParser.Fields): Boolean {
        if (!current(id) || ready) return false
        draft = Draft(request!!, fields.amount, fields.merchant, fields.warning)
        ready = true
        deadline = now() + DRAFT_TTL
        return true
    }
    fun take(userId: String): Draft? {
        if (!busy() || owner != userId) return null
        return draft.also { draft = null }
    }
    fun valid(id: String, userId: String) = current(id) && ready && owner == userId
    fun remaining() = (deadline - now()).coerceAtLeast(0)
    fun clear(id: String? = null) {
        if (id != null && request?.id != id) return
        request = null
        draft = null
        ready = false
        deadline = 0
    }
    companion object {
        const val NO_WINDOW = -1
        const val REQUEST_TTL = 15_000L
        const val DRAFT_TTL = 300_000L
    }
}

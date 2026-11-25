package com.zowl.mobile.capture

enum class CaptureUploadDisposition {
    ACCEPT_RESPONSE,
    UNAUTHORIZED,
    PROTOCOL_ERROR,
    RETRY,
}

object CaptureUploadHttpPolicy {
    fun classify(status: Int): CaptureUploadDisposition =
        when (status) {
            in 200..299 -> CaptureUploadDisposition.ACCEPT_RESPONSE
            401 -> CaptureUploadDisposition.UNAUTHORIZED
            408, 429, in 500..599 -> CaptureUploadDisposition.RETRY
            in 400..499 -> CaptureUploadDisposition.PROTOCOL_ERROR
            else -> CaptureUploadDisposition.RETRY
        }
}

enum class QuickConfirmDisposition {
    COMPLETED,
    NEEDS_REVIEW,
    UNAUTHORIZED,
    TERMINAL_REJECTION,
    RETRY,
}

object QuickConfirmHttpPolicy {
    fun classify(status: Int): QuickConfirmDisposition =
        when (status) {
            in 200..299 -> QuickConfirmDisposition.COMPLETED
            409 -> QuickConfirmDisposition.NEEDS_REVIEW
            401 -> QuickConfirmDisposition.UNAUTHORIZED
            408, 429, in 500..599 -> QuickConfirmDisposition.RETRY
            in 400..499 -> QuickConfirmDisposition.TERMINAL_REJECTION
            else -> QuickConfirmDisposition.RETRY
        }
}

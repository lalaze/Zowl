package com.zowl.mobile.capture

class QuickConfirmAction private constructor(
    val captureId: String,
    val ownerUserId: String,
    val merchantName: String?,
    val createdAtEpochMillis: Long,
) {
    companion object {
        fun create(
            captureId: String,
            ownerUserId: String,
            merchantName: String? = null,
            createdAtEpochMillis: Long = System.currentTimeMillis(),
        ): QuickConfirmAction {
            val normalizedCaptureId = captureId.trim()
            val normalizedOwnerUserId = ownerUserId.trim()
            val normalizedMerchantName = merchantName?.trim()
            require(normalizedCaptureId.isNotEmpty() && normalizedCaptureId.length <= 128)
            require(normalizedOwnerUserId.isNotEmpty() && normalizedOwnerUserId.length <= 128)
            require(
                normalizedMerchantName == null ||
                    normalizedMerchantName.isNotEmpty() &&
                    normalizedMerchantName.length <= 120,
            )
            return QuickConfirmAction(
                captureId = normalizedCaptureId,
                ownerUserId = normalizedOwnerUserId,
                merchantName = normalizedMerchantName,
                createdAtEpochMillis = createdAtEpochMillis,
            )
        }
    }
}

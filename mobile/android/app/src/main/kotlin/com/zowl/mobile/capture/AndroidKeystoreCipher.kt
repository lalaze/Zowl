package com.zowl.mobile.capture

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal object AndroidKeystoreCipher {
    private const val KEY_ALIAS = "zemoney-payment-capture-v1"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    @Synchronized
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec
                .Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    fun encrypt(value: ByteArray): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val payload = ByteArray(1 + cipher.iv.size + cipher.getOutputSize(value.size))
        payload[0] = cipher.iv.size.toByte()
        cipher.iv.copyInto(payload, 1)
        val encrypted = cipher.doFinal(value)
        encrypted.copyInto(payload, 1 + cipher.iv.size)
        return Base64.encodeToString(payload.copyOf(1 + cipher.iv.size + encrypted.size), Base64.NO_WRAP)
    }

    fun decrypt(value: String): ByteArray {
        val payload = Base64.decode(value, Base64.NO_WRAP)
        require(payload.isNotEmpty()) { "Encrypted payload is empty" }
        val ivLength = payload[0].toInt() and 0xff
        require(ivLength in 12..32 && payload.size > 1 + ivLength) {
            "Encrypted payload is malformed"
        }
        val iv = payload.copyOfRange(1, 1 + ivLength)
        val encrypted = payload.copyOfRange(1 + ivLength, payload.size)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
        return cipher.doFinal(encrypted)
    }
}

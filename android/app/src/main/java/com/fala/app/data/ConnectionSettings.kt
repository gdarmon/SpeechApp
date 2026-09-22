package com.fala.app.data

import com.fala.app.BuildConfig
import org.json.JSONObject
import java.time.Instant
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class ConnectionSettings(context: Context) {
    private val prefs = context.getSharedPreferences("connection", Context.MODE_PRIVATE)
    val url = BuildConfig.API_BASE_URL
    init {
        // The developer renamed the same Netlify site. Keep existing device sessions on this one approved move.
        if (url == "https://falachatapp.netlify.app" && prefs.getString("origin", "") == "https://legendary-florentine-6b3c1f.netlify.app") {
            prefs.edit().putString("origin", url).apply()
        }
    }
    val email: String get() = prefs.getString("email", "").orEmpty()
    val signedIn: Boolean get() = token.startsWith("fala_") && prefs.getLong("expires", 0) > System.currentTimeMillis()

    fun saveSession(session: JSONObject) {
        val value = session.getString("token")
        require(value.matches(Regex("fala_[A-Za-z0-9_-]{43}"))) { "Please sign in again." }
        val expires = Instant.parse(session.getString("expires_at")).toEpochMilli()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
        val encrypted = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
        prefs.edit().putString("token", "$iv:$encrypted").putString("origin", url)
            .putString("email", session.getString("email")).putLong("expires", expires).remove("active").remove("url").apply()
    }
    fun clearSession() {
        prefs.edit().remove("token").remove("origin").remove("email").remove("expires").remove("active").remove("url").remove("rewardProfile").apply()
    }
    // Kept across sign-out, scoped to the account on this device. Never synced as learning data.
    private val walkthroughKey: String get() = "walkthroughSeen:" + java.security.MessageDigest.getInstance("SHA-256")
        .digest(email.lowercase(java.util.Locale.ROOT).toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    var walkthroughSeen: Boolean
        get() = prefs.getBoolean(walkthroughKey, false)
        set(value) { prefs.edit().putBoolean(walkthroughKey, value).apply() }
    // An app update belongs to this installation, not to a particular learner.
    val dismissedUpdateVersion: Int get() = prefs.getInt("dismissedUpdateVersion", 0)
    val updateReminderAfter: Long get() = prefs.getLong("updateReminderAfter", 0)
    fun postponeUpdate(version: Int, until: Long) {
        prefs.edit().putInt("dismissedUpdateVersion", version).putLong("updateReminderAfter", until).apply()
    }
    var rewardProfile: String
        get() = prefs.getString("rewardProfile", "{}").orEmpty()
        set(value) { prefs.edit().putString("rewardProfile", value).apply() }
    var activeSession: String
        get() = prefs.getString("active", "") ?: ""
        set(value) { prefs.edit().putString("active", value).apply() }
    var networkRecognition: Boolean
        get() = prefs.getBoolean("networkRecognition", false)
        set(value) { prefs.edit().putBoolean("networkRecognition", value).apply() }
    var practiceTopic: String
        get() = prefs.getString("practiceTopic", "capoeira class") ?: "capoeira class"
        set(value) { prefs.edit().putString("practiceTopic", value).apply() }
    var listenFirst: Boolean
        get() = prefs.getBoolean("listenFirst", false)
        set(value) { prefs.edit().putBoolean("listenFirst", value).apply() }
    var showReplyIdeas: Boolean
        get() = prefs.getBoolean("showReplyIdeas", true)
        set(value) { prefs.edit().putBoolean("showReplyIdeas", value).apply() }
    var consent: Boolean
        get() = prefs.getBoolean("consent", false)
        set(value) { prefs.edit().putBoolean("consent", value).apply() }
    var supportLanguage: String
        get() = prefs.getString("supportLanguage", "").orEmpty().takeIf { it in listOf("en-US", "he-IL") }.orEmpty()
        set(value) {
            require(value in listOf("en-US", "he-IL"))
            prefs.edit().putString("supportLanguage", value).apply()
        }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("fala-device", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("fala-device", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }

    val token: String
        get() = runCatching {
            if (prefs.getString("origin", "") != url) return ""
            val encoded = prefs.getString("token", null) ?: return ""
            val pieces = encoded.split(":")
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(pieces[0], Base64.NO_WRAP)))
            String(cipher.doFinal(Base64.decode(pieces[1], Base64.NO_WRAP)), Charsets.UTF_8)
        }.getOrDefault("")
}

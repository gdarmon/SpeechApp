package com.fala.app

import android.Manifest
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.provider.Settings
import android.speech.SpeechRecognizer
import androidx.core.content.FileProvider
import com.fala.app.data.ConnectionSettings
import com.fala.app.voice.VoiceLog
import java.io.File
import java.time.Instant

class SupportDiagnostics(private val context: Context, val events: VoiceLog = VoiceLog()) {
    fun microphoneAllowed() = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun report(settings: ConnectionSettings): String = buildString {
        appendLine("Fala diagnostic report — ${Instant.now()}")
        appendLine("App: ${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
        appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("Android: ${Build.VERSION.RELEASE}; SDK ${Build.VERSION.SDK_INT}; security patch ${Build.VERSION.SECURITY_PATCH}")
        appendLine("System build: ${Build.DISPLAY}")
        appendLine("Microphone permission: ${microphoneAllowed()}")
        appendLine("Microphone muted: ${context.getSystemService(AudioManager::class.java)?.isMicrophoneMute}")
        appendLine("Network recognition chosen: ${settings.networkRecognition}")
        appendLine("Help language: ${settings.supportLanguage}")
        appendLine("Recognition service available: ${runCatching { SpeechRecognizer.isRecognitionAvailable(context) }.getOrNull()}")
        appendLine("On-device recognition available: ${if (Build.VERSION.SDK_INT >= 31) runCatching { SpeechRecognizer.isOnDeviceRecognitionAvailable(context) }.getOrNull() else false}")
        // Only speech-service component names, not installed-app inventories or device/account identifiers.
        val selected = runCatching { Settings.Secure.getString(context.contentResolver, "voice_recognition_service") }.getOrNull()
        appendLine("Selected recognition service: ${selected.orEmpty()}")
        val services = runCatching {
            context.packageManager.queryIntentServices(Intent("android.speech.RecognitionService"), 0)
                .map { "${it.serviceInfo.packageName}/${it.serviceInfo.name}" }.sorted().joinToString(", ")
        }.getOrDefault("Unavailable")
        appendLine("Recognition services: $services")
        val ttsEngine = runCatching { Settings.Secure.getString(context.contentResolver, "tts_default_synth") }.getOrNull()
        appendLine("Selected text-to-speech engine: ${ttsEngine.orEmpty()}")
        val ttsServices = runCatching {
            context.packageManager.queryIntentServices(Intent("android.intent.action.TTS_SERVICE"), 0)
                .map { it.serviceInfo.packageName }.distinct().sorted().joinToString(", ")
        }.getOrDefault("Unavailable")
        appendLine("Text-to-speech engines: $ttsServices")
        val audio = context.getSystemService(AudioManager::class.java)
        appendLine("Media volume: ${audio?.getStreamVolume(AudioManager.STREAM_MUSIC)} / ${audio?.getStreamMaxVolume(AudioManager.STREAM_MUSIC)}")
        appendLine()
        appendLine("Recent events from this app run (no recordings, conversation text, email or sign-in credentials):")
        appendLine(events.text())
        appendLine()
        appendLine("Microphone permission: code 1 = allowed; 0 = denied.")
        appendLine("Recognition errors: 1/2 = network; 3 = audio; 4 = server; 5 = client; 6/7 = no speech/match; 8 = busy; 9 = permission; 10 = too many requests; 11 = disconnected; 12/13 = language unavailable.")
        appendLine("Playback errors (separate from microphone recognition): -1 = generic; -3 = synthesis; -4 = service; -5 = output; -6/-7 = network; -8 = invalid request; -9 = voice download incomplete; -101 = no installed Brazilian voice; -102 = callback timeout.")
        appendLine("Fala recognition errors: -1 = no on-device service; -2 = no default service; -3 = operation threw; -4 = ready timeout; -5 = result timeout.")
    }

    fun clear() {
        events.clear()
        File(context.cacheDir, "support-reports").listFiles()?.forEach { if (it.isFile) it.delete() }
    }

    fun shareIntent(report: String): Intent {
        val directory = File(context.cacheDir, "support-reports").apply { mkdirs() }
        directory.listFiles()?.filter { it.isFile && it.name.startsWith("fala-diagnostics-") }
            ?.sortedByDescending { it.lastModified() }?.forEachIndexed { index, file ->
                if (index >= 4 || System.currentTimeMillis() - file.lastModified() > 86400000L) file.delete()
            }
        val file = File.createTempFile("fala-diagnostics-", ".txt", directory).apply { writeText(report) }
        val uri = FileProvider.getUriForFile(context, "${BuildConfig.APPLICATION_ID}.support-files", file)
        return Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, "Fala ${BuildConfig.VERSION_NAME} — diagnostic report")
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newRawUri("Fala diagnostic report", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }
}

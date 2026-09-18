package com.fala.app.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID

class AndroidSpeechOutput(context: Context) : SpeechOutput {
    private val handler = Handler(Looper.getMainLooper())
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private var focus: AudioFocusRequest? = null
    private var engine: TextToSpeech? = null
    private var ready = false
    private var problem = "Brazilian voice is still loading. Tap Replay in a moment."
    private var active: String? = null
    private var onDone: (() -> Unit)? = null
    private var onError: ((String) -> Unit)? = null

    init {
        engine = TextToSpeech(context.applicationContext) { status ->
            handler.post {
                val tts = engine
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    problem = "Speech playback is unavailable. Enable a text-to-speech engine in Android settings."
                } else {
                    tts.setLanguage(Locale.forLanguageTag("pt-BR"))
                    val voice = tts.voices?.filter { it.locale.language == "pt" && it.locale.country == "BR" }
                        ?.sortedBy { it.isNetworkConnectionRequired }?.firstOrNull()
                    if (voice == null || tts.setVoice(voice) != TextToSpeech.SUCCESS) {
                        problem = "Install a Brazilian Portuguese voice (pt-BR) in Android text-to-speech settings, then reopen Fala."
                    } else {
                        ready = true
                        tts.setAudioAttributes(attributes)
                    }
                    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                        override fun onStart(utteranceId: String?) {}
                        override fun onDone(utteranceId: String?) { handler.post { complete(utteranceId, null) } }
                        @Deprecated("Required by Android")
                        override fun onError(utteranceId: String?) { handler.post { complete(utteranceId, "Speech playback stopped. Tap Replay to try again.") } }
                    })
                }
            }
        }
    }

    private fun complete(id: String?, error: String?) {
        if (id == null || id != active) return
        val done = onDone
        val failed = onError
        active = null; onDone = null; onError = null
        focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
        if (error != null) failed?.invoke(error) else done?.invoke()
    }

    override fun speak(text: String, slow: Boolean, done: () -> Unit, error: (String) -> Unit) {
        stop()
        if (!ready) { error(problem); return }
        val id = UUID.randomUUID().toString()
        active = id; onDone = done; onError = error
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener { change ->
                if (change < 0) {
                    val failed = onError
                    stop()
                    failed?.invoke("Playback paused by another app. Tap Replay when you're ready.")
                }
            }.build()
        focus = request
        if (audio.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            complete(id, "Audio is busy. Tap Replay when you're ready."); return
        }
        engine?.setSpeechRate(if (slow) 0.78f else 0.93f)
        if (engine?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
            complete(id, "Could not play the Brazilian voice. Check Android voice settings.")
        }
    }

    override fun stop() {
        active = null; onDone = null; onError = null
        engine?.stop()
        focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    }
    override fun close() { stop(); engine?.shutdown() }
}

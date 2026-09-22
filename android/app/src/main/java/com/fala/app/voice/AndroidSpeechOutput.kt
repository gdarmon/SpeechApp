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

class AndroidSpeechOutput(context: Context, private val log: VoiceLog) : SpeechOutput {
    private val handler = Handler(Looper.getMainLooper())
    private val audio = context.getSystemService(AudioManager::class.java)
    private val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private var focus: AudioFocusRequest? = null
    private var engine: TextToSpeech? = null
    private var ready = false
    private var initializing = true
    private var pending: (() -> Unit)? = null
    private var pendingError: ((String) -> Unit)? = null
    private val startupTimeout = Runnable {
        log.record(VoiceEvent.PLAYBACK_ERROR, -4, operation = VoiceOperation.INITIALIZE_TTS)
        val fail = pendingError
        pending = null; pendingError = null
        fail?.invoke("The Brazilian voice is taking longer to load. Tap Listen to try again.")
    }
    private var problem = "Brazilian voice is still loading. Tap Listen in a moment."
    private var active: String? = null
    private var onDone: (() -> Unit)? = null
    private var onError: ((String) -> Unit)? = null

    init {
        engine = TextToSpeech(context.applicationContext) { status ->
            handler.post {
                log.record(VoiceEvent.PLAYBACK_INIT, status, operation = VoiceOperation.INITIALIZE_TTS)
                val tts = engine
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    problem = "Speech playback is unavailable. Enable a text-to-speech engine in Android settings."
                } else {
                    log.record(VoiceEvent.PLAYBACK_LANGUAGE, tts.setLanguage(Locale.forLanguageTag("pt-BR")), language = "pt-BR", operation = VoiceOperation.SET_TTS_LANGUAGE)
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
                        override fun onError(utteranceId: String?) { onError(utteranceId, TextToSpeech.ERROR) }
                        override fun onError(utteranceId: String?, errorCode: Int) {
                            handler.post {
                                if (utteranceId != null && utteranceId == active) log.record(VoiceEvent.PLAYBACK_ERROR, errorCode, operation = VoiceOperation.PLAYBACK_CALLBACK)
                                complete(utteranceId, "Speech playback stopped. Tap Listen to try again.")
                            }
                        }
                    })
                }
                initializing = false
                val waiting = pending
                pending = null; pendingError = null; handler.removeCallbacks(startupTimeout)
                waiting?.invoke()
            }
        }
    }

    private fun complete(id: String?, error: String?) {
        if (id == null || id != active) return
        if (error == null) log.record(VoiceEvent.PLAYBACK_DONE)
        val done = onDone
        val failed = onError
        active = null; onDone = null; onError = null
        focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
        if (error != null) failed?.invoke(error) else done?.invoke()
    }

    override fun speak(text: String, slow: Boolean, done: () -> Unit, error: (String) -> Unit) {
        stop()
        if (!ready) {
            if (initializing) {
                pending = { speak(text, slow, done, error) }; pendingError = error
                handler.postDelayed(startupTimeout, 8000)
            } else {
                log.record(VoiceEvent.PLAYBACK_ERROR, -2, operation = VoiceOperation.INITIALIZE_TTS)
                error(problem)
            }
            return
        }
        val id = UUID.randomUUID().toString()
        active = id; onDone = done; onError = error
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(attributes).setOnAudioFocusChangeListener { change ->
                if (change < 0) {
                    log.record(VoiceEvent.PLAYBACK_ERROR, change, operation = VoiceOperation.REQUEST_AUDIO_FOCUS)
                    val failed = onError
                    stop()
                    failed?.invoke("Playback paused by another app. Tap Listen when you're ready.")
                }
            }.build()
        focus = request
        val focusResult = audio.requestAudioFocus(request)
        if (focusResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            log.record(VoiceEvent.PLAYBACK_ERROR, focusResult, operation = VoiceOperation.REQUEST_AUDIO_FOCUS)
            complete(id, "Audio is busy. Tap Listen when you're ready."); return
        }
        engine?.setSpeechRate(if (slow) 0.78f else 0.93f)
        log.record(VoiceEvent.PLAYBACK_START, language = "pt-BR", operation = VoiceOperation.SPEAK)
        val speakResult = engine?.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
        if (speakResult != TextToSpeech.SUCCESS) {
            log.record(VoiceEvent.PLAYBACK_ERROR, speakResult, operation = VoiceOperation.SPEAK)
            complete(id, "Could not play the Brazilian voice. Check Android voice settings.")
        }
    }

    override fun stop() {
        pending = null; pendingError = null; handler.removeCallbacks(startupTimeout)
        active = null; onDone = null; onError = null
        engine?.stop()
        focus?.let { audio.abandonAudioFocusRequest(it) }; focus = null
    }
    override fun close() { stop(); engine?.shutdown() }
}

package com.fala.app.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.UUID

/** Vendor boundary: tests can reproduce failures without an emulator's voice pack. */
internal interface PlaybackEngine {
    fun voices(): List<PlaybackVoice>
    fun defaultVoice(): String?
    fun select(name: String): Int
    fun speak(text: String, rate: Float, id: String): Int
    fun stop()
    fun close()
}
internal interface PlaybackEvents {
    fun initialized(code: Int)
    fun started(id: String?)
    fun finished(id: String?)
    fun failed(id: String?, code: Int)
}

class AndroidSpeechOutput private constructor(
    private val log: VoiceLog,
    private val createEngine: (PlaybackEvents) -> PlaybackEngine,
    private val acquireAudio: (() -> Unit) -> Boolean,
    private val releaseAudio: () -> Unit,
    private val handler: Handler
) : SpeechOutput {
    constructor(context: Context, log: VoiceLog) : this(log, androidEngine(context), AndroidPlaybackFocus(context))
    private constructor(log: VoiceLog, factory: (PlaybackEvents) -> PlaybackEngine, focus: AndroidPlaybackFocus) :
        this(log, factory, focus::acquire, focus::release, Handler(Looper.getMainLooper()))
    internal constructor(log: VoiceLog, factory: (PlaybackEvents) -> PlaybackEngine) :
        this(log, factory, { true }, {}, Handler(Looper.getMainLooper()))

    private var engine: PlaybackEngine? = null
    private var engineGeneration = 0
    private var initializing = false
    private var closed = false
    private var candidates = emptyList<PlaybackVoice>()
    private val broken = mutableSetOf<String>()
    private var lastFailure = PlaybackFailure(PlaybackFailure.MISSING_VOICE)
    private data class Request(val text: String, val slow: Boolean, val done: () -> Unit,
        val error: (PlaybackFailure) -> Unit, var attempt: String? = null, var voice: PlaybackVoice? = null,
        var started: Boolean = false, var attempts: Int = 0)
    private var request: Request? = null
    private var timeout: Runnable? = null
    init { initialize() }

    private fun initialize() {
        val generation = ++engineGeneration
        engine?.close(); engine = null
        initializing = true; candidates = emptyList(); broken.clear()
        lastFailure = PlaybackFailure(PlaybackFailure.MISSING_VOICE)
        val events = object : PlaybackEvents {
            override fun initialized(code: Int) { handler.post {
                if (closed || generation != engineGeneration) return@post
                initializing = false
                log.record(VoiceEvent.PLAYBACK_INIT, code, operation = VoiceOperation.INITIALIZE_TTS)
                if (code == TextToSpeech.SUCCESS) {
                    candidates = runCatching { playbackVoices(engine!!.voices(), engine!!.defaultVoice()) }.getOrDefault(emptyList())
                    lastFailure = PlaybackFailure(PlaybackFailure.MISSING_VOICE, VoiceOperation.SET_TTS_VOICE)
                } else lastFailure = PlaybackFailure(code, VoiceOperation.INITIALIZE_TTS)
                request?.let { playNext(it) }
            } }
            override fun started(id: String?) { handler.post {
                val r = current(id, generation) ?: return@post
                r.started = true
                deadline(r, ((r.text.length * 180L) + 15_000L).coerceIn(30_000L, 180_000L))
            } }
            override fun finished(id: String?) { handler.post { current(id, generation)?.let { finish(it, null) } } }
            override fun failed(id: String?, code: Int) { handler.post {
                current(id, generation)?.let { failAttempt(it, code, VoiceOperation.PLAYBACK_CALLBACK) }
            } }
        }
        runCatching { createEngine(events) }.onSuccess { engine = it }.onFailure { events.initialized(TextToSpeech.ERROR_SERVICE) }
    }
    private fun current(id: String?, generation: Int): Request? = request?.takeIf {
        !closed && generation == engineGeneration && id != null && id == it.attempt
    }
    override fun speak(text: String, slow: Boolean, done: () -> Unit, error: (PlaybackFailure) -> Unit) {
        stop()
        if (closed) { error(PlaybackFailure(TextToSpeech.ERROR_SERVICE)); return }
        broken.clear()
        val r = Request(text, slow, done, error)
        request = r
        if (initializing) deadline(r, 8000) else playNext(r)
    }
    private fun playNext(r: Request) {
        if (request !== r) return
        clearDeadline()
        // An offline failure must not silently change to a network voice.
        val voice = candidates.firstOrNull { it.name !in broken && (r.voice == null || !it.network) }
        if (voice == null || r.attempts >= 3) { finish(r, lastFailure); return }
        r.voice = voice; r.attempts++; r.started = false
        r.attempt = UUID.randomUUID().toString()
        log.record(VoiceEvent.PLAYBACK_VOICE, language = "pt-BR", network = voice.network, operation = VoiceOperation.SET_TTS_VOICE)
        val selected = runCatching { engine?.select(voice.name) }.getOrNull()
        if (selected != TextToSpeech.SUCCESS) { failAttempt(r, selected ?: TextToSpeech.ERROR_SERVICE, VoiceOperation.SET_TTS_VOICE); return }
        if (!acquireAudio {
                if (request === r) {
                    log.record(VoiceEvent.PLAYBACK_ERROR, operation = VoiceOperation.REQUEST_AUDIO_FOCUS)
                    finish(r, PlaybackFailure(TextToSpeech.ERROR_OUTPUT, VoiceOperation.REQUEST_AUDIO_FOCUS))
                }
            }) {
            finish(r, PlaybackFailure(TextToSpeech.ERROR_OUTPUT, VoiceOperation.REQUEST_AUDIO_FOCUS)); return
        }
        log.record(VoiceEvent.PLAYBACK_START, language = "pt-BR", operation = VoiceOperation.SPEAK)
        deadline(r, 12_000)
        val rate = if (r.slow) 0.45f else 1f
        log.record(VoiceEvent.PLAYBACK_RATE, if (r.slow) 45 else 100, operation = VoiceOperation.SET_TTS_RATE)
        val result = runCatching { engine?.speak(r.text, rate, r.attempt!!) }.getOrNull()
        if (result != TextToSpeech.SUCCESS) failAttempt(r, result ?: TextToSpeech.ERROR_SERVICE, VoiceOperation.SPEAK)
    }
    private fun failAttempt(r: Request, code: Int, operation: VoiceOperation) {
        if (request !== r) return
        log.record(VoiceEvent.PLAYBACK_ERROR, code, operation = operation)
        lastFailure = PlaybackFailure(code, operation)
        val retry = !r.started && code in setOf(-1, TextToSpeech.ERROR_SYNTHESIS,
            TextToSpeech.ERROR_SERVICE, TextToSpeech.ERROR_NOT_INSTALLED_YET, TextToSpeech.ERROR_NETWORK, TextToSpeech.ERROR_NETWORK_TIMEOUT)
        r.voice?.let { broken.add(it.name) }
        // Retire the utterance before stop(), whose callback can arrive after a retry.
        r.attempt = null
        runCatching { engine?.stop() }
        releaseAudio()
        if (retry) { log.record(VoiceEvent.PLAYBACK_RETRY); playNext(r) } else finish(r, lastFailure)
    }
    private fun deadline(r: Request, milliseconds: Long) {
        clearDeadline()
        timeout = Runnable {
            if (request === r) {
                log.record(VoiceEvent.PLAYBACK_ERROR, PlaybackFailure.TIMEOUT, operation = VoiceOperation.AWAIT_PLAYBACK)
                finish(r, PlaybackFailure(PlaybackFailure.TIMEOUT, VoiceOperation.AWAIT_PLAYBACK))
            }
        }.also { handler.postDelayed(it, milliseconds) }
    }
    private fun clearDeadline() { timeout?.let(handler::removeCallbacks); timeout = null }
    private fun finish(r: Request, failure: PlaybackFailure?) {
        if (request !== r) return
        request = null; clearDeadline()
        if (failure != null) runCatching { engine?.stop() }
        releaseAudio()
        if (failure == null) { log.record(VoiceEvent.PLAYBACK_DONE); r.done() } else r.error(failure)
    }
    override fun stop() {
        request = null; clearDeadline()
        runCatching { engine?.stop() }
        releaseAudio()
    }
    override fun refresh() { if (!closed) { stop(); initialize() } }
    override fun close() { stop(); closed = true; engineGeneration++; engine?.close(); engine = null }
}

private val playbackAttributes: AudioAttributes get() = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

private class AndroidPlaybackFocus(context: Context) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private var request: AudioFocusRequest? = null
    private var generation = 0
    fun acquire(lost: () -> Unit): Boolean {
        release()
        val current = ++generation
        val next = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            .setAudioAttributes(playbackAttributes).setOnAudioFocusChangeListener { change ->
                if (change < 0 && current == generation && request != null) lost()
            }.build()
        request = next
        return audio.requestAudioFocus(next) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }
    fun release() { generation++; val previous = request; request = null; previous?.let { audio.abandonAudioFocusRequest(it) } }
}

private fun androidEngine(context: Context): (PlaybackEvents) -> PlaybackEngine = { events ->
    object : PlaybackEngine {
        private val tts = TextToSpeech(context.applicationContext, events::initialized)
        init {
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) = events.started(utteranceId)
                override fun onDone(utteranceId: String?) = events.finished(utteranceId)
                @Deprecated("Required by Android")
                override fun onError(utteranceId: String?) = events.failed(utteranceId, TextToSpeech.ERROR)
                override fun onError(utteranceId: String?, errorCode: Int) = events.failed(utteranceId, errorCode)
            })
        }
        override fun voices(): List<PlaybackVoice> = tts.voices.orEmpty().map {
            PlaybackVoice(it.name, it.locale.language, it.locale.country, it.isNetworkConnectionRequired,
                TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features.orEmpty())
        }
        override fun defaultVoice(): String? = tts.defaultVoice?.name
        override fun select(name: String): Int {
            val voice = tts.voices?.firstOrNull { it.name == name } ?: return TextToSpeech.ERROR_NOT_INSTALLED_YET
            return tts.setVoice(voice)
        }
        override fun speak(text: String, rate: Float, id: String): Int {
            tts.setAudioAttributes(playbackAttributes)
            if (tts.setSpeechRate(rate) != TextToSpeech.SUCCESS) return TextToSpeech.ERROR_SYNTHESIS
            return tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id)
        }
        override fun stop() { tts.stop() }
        override fun close() { tts.shutdown() }
    }
}

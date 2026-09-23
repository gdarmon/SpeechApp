package com.fala.app.voice

import java.time.Instant

enum class VoiceEvent {
    APP_FOREGROUND, APP_BACKGROUND, MICROPHONE_PERMISSION_REQUEST, MICROPHONE_PERMISSION, NETWORK_CHOICE, HOLD_START, HOLD_RELEASE, HOLD_CANCEL,
    RECOGNITION_START, RECOGNITION_CREATE, RECOGNITION_READY, SPEECH_START, SPEECH_END, RECOGNITION_RESULT,
    RECOGNITION_ERROR, RECOGNITION_STOP, RECOGNITION_CANCEL, RECOGNITION_CLEANUP_ERROR,
    PLAYBACK_INIT, PLAYBACK_LANGUAGE, PLAYBACK_VOICE, PLAYBACK_RETRY, PLAYBACK_START, PLAYBACK_DONE, PLAYBACK_ERROR, API_ERROR
}

enum class VoiceOperation {
    CHECK_PERMISSION, REQUEST_PERMISSION, CHECK_RECOGNITION_SERVICE, CREATE_RECOGNIZER,
    START_LISTENING, AWAIT_READY, AWAIT_RESULT, RECOGNITION_CALLBACK, STOP_LISTENING, CANCEL_RECOGNIZER, DESTROY_RECOGNIZER,
    INITIALIZE_TTS, SET_TTS_LANGUAGE, SET_TTS_VOICE, REQUEST_AUDIO_FOCUS, SPEAK, PLAYBACK_CALLBACK, AWAIT_PLAYBACK
}

/** Deliberately has no free-text field: never accept speech, prompts, URLs, exceptions or credentials. */
class VoiceLog(private val clock: () -> Long = System::currentTimeMillis, private val limit: Int = 80) {
    private val entries = ArrayDeque<String>()
    init { require(limit in 1..200) }
    @Synchronized fun record(event: VoiceEvent, code: Int? = null, language: String? = null, network: Boolean? = null, operation: VoiceOperation? = null) {
        val line = buildString {
            append(Instant.ofEpochMilli(clock())).append(' ').append(event.name)
            operation?.let { append(" operation=").append(it.name) }
            code?.let { append(" code=").append(it) }
            language?.let { append(" language=").append(if (it in listOf("pt-BR", "he-IL", "en-US")) it else "other") }
            network?.let { append(" network=").append(it) }
        }
        entries.addLast(line)
        while (entries.size > limit) entries.removeFirst()
    }
    @Synchronized fun text(): String = entries.joinToString("\n").ifBlank { "No voice events in this app run." }
    @Synchronized fun clear() = entries.clear()
}

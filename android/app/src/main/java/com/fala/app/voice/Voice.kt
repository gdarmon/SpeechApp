package com.fala.app.voice

data class Heard(val text: String, val speechMs: Long)

interface SpeechInput {
    fun listen(language: String, allowNetwork: Boolean, ready: () -> Unit, level: (Float) -> Unit,
        partial: (String) -> Unit, result: (Heard) -> Unit, error: (SpeechFailure) -> Unit)
    fun finish()
    fun cancel()
    fun close()
}

interface SpeechOutput {
    fun speak(text: String, slow: Boolean, done: () -> Unit, error: (PlaybackFailure) -> Unit)
    fun refresh() {}
    fun stop()
    fun close()
}

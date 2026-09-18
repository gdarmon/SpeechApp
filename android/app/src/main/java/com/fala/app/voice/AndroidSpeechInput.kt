package com.fala.app.voice

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

class AndroidSpeechInput(private val context: Context) : SpeechInput {
    private var recognizer: SpeechRecognizer? = null
    private var generation = 0

    override fun listen(language: String, allowNetwork: Boolean, partial: (String) -> Unit, result: (Heard) -> Unit, error: (String) -> Unit) {
        cancel()
        val id = generation
        var speechStart = 0L
        var speechEnd = 0L
        var completed = false
        fun fail(message: String) { if (id == generation && !completed) { completed = true; error(message) } }
        val onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
        if (!allowNetwork && !onDevice) {
            fail("On-device recognition is unavailable. You can enable your phone's network speech service in Settings.")
            return
        }
        if (allowNetwork && !SpeechRecognizer.isRecognitionAvailable(context)) {
            fail("No speech recognition service is installed. Enable one in Android settings.")
            return
        }
        try {
            val engine = if (!allowNetwork && Build.VERSION.SDK_INT >= 31) SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                else SpeechRecognizer.createSpeechRecognizer(context)
            recognizer = engine
            engine.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() { speechStart = SystemClock.elapsedRealtime() }
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() { speechEnd = SystemClock.elapsedRealtime() }
                override fun onEvent(eventType: Int, params: Bundle?) {}
                override fun onPartialResults(results: Bundle?) {
                    if (id == generation && !completed) partial(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty())
                }
                override fun onError(code: Int) = fail(when (code) {
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "I didn't catch that. Tap the microphone to try again."
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Microphone access is needed. Enable it in Android app settings."
                    SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED, SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE -> "That speech language isn't available. Install its language pack or enable network recognition in Settings."
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Speech recognition lost its connection. Tap to retry."
                    else -> "Speech recognition paused. Tap the microphone to retry."
                })
                override fun onResults(results: Bundle?) {
                    if (id != generation || completed) return
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
                    val confidence = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull() ?: -1f
                    if (text.isBlank() || (confidence in 0f..0.40f)) {
                        fail("I couldn't hear that clearly. Please say it again.")
                        return
                    }
                    completed = true
                    val duration = if (speechStart == 0L) 0 else ((if (speechEnd > 0) speechEnd else SystemClock.elapsedRealtime()) - speechStart).coerceIn(0, 180000)
                    result(Heard(text, duration))
                }
            })
            engine.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, !allowNetwork)
            })
        } catch (_: Exception) { fail("Speech recognition could not start. Check microphone and language settings.") }
    }

    override fun finish() { recognizer?.stopListening() }
    override fun cancel() {
        generation++
        recognizer?.cancel()
        recognizer?.destroy()
        recognizer = null
    }
    override fun close() = cancel()
}

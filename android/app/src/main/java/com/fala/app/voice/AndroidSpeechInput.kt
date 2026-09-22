package com.fala.app.voice

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

class AndroidSpeechInput(private val context: Context, private val log: VoiceLog) : SpeechInput {
    private var recognizer: SpeechRecognizer? = null
    private var generation = 0
    private val handler = Handler(Looper.getMainLooper())
    private var startupTimeout: Runnable? = null
    private var activeFailure: ((Int, VoiceOperation) -> Unit)? = null

    private fun clearTimeout() { startupTimeout?.let(handler::removeCallbacks); startupTimeout = null }

    override fun listen(language: String, allowNetwork: Boolean, ready: () -> Unit, level: (Float) -> Unit,
        partial: (String) -> Unit, result: (Heard) -> Unit, error: (SpeechFailure) -> Unit) {
        cancel()
        val id = generation
        var speechStart = 0L
        var speechEnd = 0L
        var completed = false
        fun fail(code: Int, operation: VoiceOperation) {
            if (id != generation || completed) return
            completed = true; clearTimeout(); activeFailure = null
            log.record(VoiceEvent.RECOGNITION_ERROR, code, operation = operation)
            error(SpeechFailure(code))
        }
        activeFailure = ::fail
        val allowed = context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        log.record(VoiceEvent.MICROPHONE_PERMISSION, if (allowed) 1 else 0, operation = VoiceOperation.CHECK_PERMISSION)
        if (!allowed) { fail(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS, VoiceOperation.CHECK_PERMISSION); return }
        var operation = VoiceOperation.CHECK_RECOGNITION_SERVICE
        try {
            val onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
            if (!allowNetwork && !onDevice) { fail(-1, operation); return }
            if (allowNetwork && !SpeechRecognizer.isRecognitionAvailable(context)) { fail(-2, operation); return }
            operation = VoiceOperation.CREATE_RECOGNIZER
            log.record(VoiceEvent.RECOGNITION_CREATE, language = language, network = allowNetwork, operation = operation)
            val engine = if (!allowNetwork && Build.VERSION.SDK_INT >= 31) SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
                else SpeechRecognizer.createSpeechRecognizer(context)
            recognizer = engine
            engine.setRecognitionListener(object : RecognitionListener {
                override fun onReadyForSpeech(params: Bundle?) {
                    if (id != generation || completed) return
                    clearTimeout(); log.record(VoiceEvent.RECOGNITION_READY); ready()
                }
                override fun onBeginningOfSpeech() {
                    if (id != generation || completed) return
                    speechStart = SystemClock.elapsedRealtime(); log.record(VoiceEvent.SPEECH_START)
                }
                override fun onRmsChanged(rmsdB: Float) { if (id == generation && !completed) level(((rmsdB + 2f) / 12f).coerceIn(0f, 1f)) }
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {
                    if (id != generation || completed) return
                    speechEnd = SystemClock.elapsedRealtime(); log.record(VoiceEvent.SPEECH_END)
                }
                override fun onEvent(eventType: Int, params: Bundle?) {}
                override fun onPartialResults(results: Bundle?) {
                    if (id == generation && !completed) partial(results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty())
                }
                override fun onError(code: Int) = fail(code, VoiceOperation.RECOGNITION_CALLBACK)
                override fun onResults(results: Bundle?) {
                    if (id != generation || completed) return
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty().trim()
                    // Learners can review/edit low-confidence words. No transcript goes into diagnostics.
                    if (text.isBlank()) { fail(SpeechRecognizer.ERROR_NO_MATCH, VoiceOperation.RECOGNITION_CALLBACK); return }
                    completed = true; clearTimeout(); activeFailure = null
                    log.record(VoiceEvent.RECOGNITION_RESULT)
                    val duration = if (speechStart == 0L) 0 else ((if (speechEnd > 0) speechEnd else SystemClock.elapsedRealtime()) - speechStart).coerceIn(0, 180000)
                    result(Heard(text, duration))
                }
            })
            operation = VoiceOperation.START_LISTENING
            log.record(VoiceEvent.RECOGNITION_START, language = language, network = allowNetwork, operation = operation)
            startupTimeout = Runnable { fail(-4, VoiceOperation.AWAIT_READY) }.also { handler.postDelayed(it, 12000) }
            engine.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, !allowNetwork)
            })
        } catch (_: SecurityException) { fail(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS, operation) }
        catch (_: Exception) { fail(-3, operation) }
    }

    override fun finish() {
        log.record(VoiceEvent.RECOGNITION_STOP, operation = VoiceOperation.STOP_LISTENING)
        try { recognizer?.stopListening() }
        catch (_: SecurityException) { activeFailure?.invoke(SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS, VoiceOperation.STOP_LISTENING) }
        catch (_: Exception) { activeFailure?.invoke(-3, VoiceOperation.STOP_LISTENING) }
    }
    override fun cancel() {
        generation++; clearTimeout(); activeFailure = null
        val engine = recognizer ?: return
        recognizer = null
        log.record(VoiceEvent.RECOGNITION_CANCEL)
        // Invalidate callbacks first; a vendor service may call back synchronously during cleanup.
        runCatching { engine.cancel() }.onFailure { log.record(VoiceEvent.RECOGNITION_CLEANUP_ERROR, operation = VoiceOperation.CANCEL_RECOGNIZER) }
        runCatching { engine.destroy() }.onFailure { log.record(VoiceEvent.RECOGNITION_CLEANUP_ERROR, operation = VoiceOperation.DESTROY_RECOGNIZER) }
    }
    override fun close() = cancel()
}

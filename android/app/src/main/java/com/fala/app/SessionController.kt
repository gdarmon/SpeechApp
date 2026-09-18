package com.fala.app

import android.app.Application
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.fala.app.data.ConnectionSettings
import com.fala.app.data.SessionApi
import com.fala.app.data.ServerFailure
import com.fala.app.data.SignInCancelled
import com.fala.app.voice.AndroidSpeechInput
import com.fala.app.voice.AndroidSpeechOutput
import com.fala.app.voice.SpeechInput
import com.fala.app.voice.SpeechOutput
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class SessionController(application: Application) : AndroidViewModel(application) {
    val settings = ConnectionSettings(application)
    private val api = SessionApi(settings)
    private val input: SpeechInput = AndroidSpeechInput(application)
    private val output: SpeechOutput = AndroidSpeechOutput(application)
    var screen by mutableStateOf(if (settings.consent && settings.signedIn) "home" else "welcome")
        private set
    var busy by mutableStateOf(false)
        private set
    var phase by mutableStateOf("Ready")
        private set
    var error by mutableStateOf("")
        private set
    var heard by mutableStateOf("")
        private set
    var reply by mutableStateOf(JSONObject())
        private set
    var session by mutableStateOf(JSONObject())
        private set
    var history by mutableStateOf(JSONArray())
        private set
    var progress by mutableStateOf(JSONObject())
        private set
    var feedback by mutableStateOf(JSONObject())
        private set
    var demo by mutableStateOf(false)
        private set
    var helpLanguage by mutableStateOf("en-US")
    var slow by mutableStateOf(false)
    var transcriptVisible by mutableStateOf(false)
    var retryAvailable by mutableStateOf(false)
        private set
    private var foreground = false
    private var audioEnabled = false
    private var voiceGeneration = 0
    private var timeout: Job? = null
    private var retryAction: (suspend () -> Unit)? = null
    private var helpNext = false
    private var job: Job? = null

    init { if (screen == "home") refresh() }

    private fun execute(retryable: Boolean = true, action: suspend () -> Unit) {
        if (busy) return
        busy = true; error = ""; retryAvailable = false; retryAction = if (retryable) action else null
        job = viewModelScope.launch {
            try { action(); retryAction = null }
            catch (cancel: CancellationException) { throw cancel }
            catch (_: SignInCancelled) { retryAction = null }
            catch (failure: Exception) {
                if (failure is ServerFailure && failure.status == 401) clearAccount()
                error = failure.message?.take(350) ?: "Something interrupted the conversation. Please retry."
                phase = "Paused"; retryAvailable = retryable && screen != "welcome"
            } finally { busy = false }
        }
    }

    fun retry() { retryAction?.let { execute(action = it) } }
    fun report(message: String) { error = message }

    fun signIn(network: Boolean, credential: suspend (String, String) -> String) {
        execute(retryable = false) {
            val challenge = api.post("/auth/google/challenge")
            val idToken = credential(challenge.getString("google_client_id"), challenge.getString("nonce"))
            val result = api.post("/auth/google", JSONObject().put("challenge_id", challenge.getString("challenge_id")).put("id_token", idToken))
            settings.saveSession(result)
            settings.networkRecognition = network; settings.consent = true
            screen = "home"
            loadProgress()
        }
    }

    private fun clearAccount() {
        pause(); settings.clearSession()
        history = JSONArray(); progress = JSONObject(); session = JSONObject(); reply = JSONObject()
        feedback = JSONObject(); heard = ""; demo = false; transcriptVisible = false
        retryAction = null; retryAvailable = false; screen = "welcome"
    }

    fun signOut(clearGoogle: suspend () -> Unit) = execute(retryable = false) {
        try { api.post("/auth/logout") } catch (_: java.io.IOException) { /* Local sign-out still works offline. */ }
        catch (_: ServerFailure) { /* An expired session already needs local cleanup. */ }
        clearAccount(); clearGoogle()
    }

    fun deleteAccount(clearGoogle: suspend () -> Unit) = execute(retryable = false) {
        pause(); api.delete("/account")
        clearAccount(); clearGoogle()
    }

    private suspend fun loadProgress() {
        val dashboard = api.get("/dashboard")
        progress = dashboard.getJSONObject("progress")
        history = dashboard.getJSONArray("history")
        demo = dashboard.getJSONObject("status").optBoolean("demo")
    }

    fun refresh() = execute { loadProgress() }

    fun navigate(destination: String) {
        if (busy || !settings.signedIn) return
        pause()
        error = ""; retryAction = null; retryAvailable = false
        screen = destination
        if (destination in listOf("home", "history", "progress")) refresh()
    }

    fun start(assessment: Boolean, topic: String = "choose for me") {
        if (busy) return
        audioEnabled = true
        val request = JSONObject().put("request_id", UUID.randomUUID().toString())
            .put("kind", if (assessment) "assessment" else "conversation").put("topic", topic)
        execute {
            val result = api.post("/sessions", request)
            session = result; settings.activeSession = result.getString("id")
            reply = result.getJSONObject("opening"); heard = ""; feedback = JSONObject()
            screen = "talk"; helpNext = false
            playReply()
        }
    }

    fun resume(id: String = settings.activeSession) = execute {
        session = api.get("/sessions/$id")
        if (!session.isNull("feedback")) {
            feedback = session.getJSONObject("feedback"); screen = "feedback"
        } else {
            settings.activeSession = id
            val turns = session.getJSONArray("turns")
            reply = if (turns.length() > 0) turns.getJSONObject(turns.length() - 1).getJSONObject("reply") else session.getJSONObject("opening")
            screen = "talk"; phase = "Paused"; heard = ""; helpNext = false
        }
    }

    private fun stopVoice() {
        voiceGeneration++
        timeout?.cancel(); timeout = null
        input.cancel(); output.stop()
    }

    fun pause() { audioEnabled = false; stopVoice(); phase = "Paused" }
    fun setForeground(value: Boolean) { foreground = value; if (!value) pause() }

    fun play() {
        if (busy || retryAvailable) return
        audioEnabled = true
        playReply()
    }

    private fun playReply() {
        stopVoice()
        if (!audioEnabled || !foreground || screen != "talk") { phase = "Paused"; return }
        val text = reply.optString("text")
        if (text.isBlank()) return
        phase = "Speaking"
        val generation = voiceGeneration
        output.speak(text, slow || reply.optString("pace") == "slow", done = {
            if (audioEnabled && generation == voiceGeneration && foreground && screen == "talk") {
                helpNext = false
                listen()
            }
        }, error = { message ->
            if (generation == voiceGeneration) { phase = "Paused"; error = message }
        })
    }

    fun mic() {
        if (busy || retryAvailable) return
        audioEnabled = true
        if (phase == "Listening") {
            phase = "Recognizing"; input.finish()
        } else { helpNext = false; listen() }
    }

    fun help(language: String) {
        if (busy || retryAvailable) return
        audioEnabled = true
        helpLanguage = language; helpNext = true; listen()
    }

    private fun listen() {
        stopVoice()
        if (!audioEnabled || !foreground || screen != "talk") { phase = "Paused"; return }
        phase = "Listening"; error = ""; heard = ""
        val generation = voiceGeneration
        val help = helpNext
        val language = if (help) helpLanguage else "pt-BR"
        timeout = viewModelScope.launch {
            delay(45000)
            if (generation == voiceGeneration) { pause(); error = "Listening paused. Tap the microphone when you're ready." }
        }
        input.listen(language, settings.networkRecognition,
            partial = { if (generation == voiceGeneration) heard = it },
            result = { result ->
                if (generation == voiceGeneration) {
                    timeout?.cancel(); heard = result.text; phase = "Thinking"
                    val body = JSONObject().put("request_id", UUID.randomUUID().toString())
                        .put("text", result.text).put("help", help).put("language", language).put("speech_ms", result.speechMs)
                    val id = session.getString("id")
                    execute {
                        val resultReply = api.post("/sessions/$id/turns", body)
                        // The saved reply acknowledges this turn; avoid another network trip before speaking.
                        val updated = JSONObject(session.toString())
                        val turns = updated.getJSONArray("turns")
                        if ((0 until turns.length()).none {
                            turns.getJSONObject(it).optString("request_id") == body.getString("request_id")
                        }) {
                            turns.put(JSONObject(body.toString()).put("session_id", id)
                                .put("help", if (help) 1 else 0).put("reply", resultReply))
                        }
                        session = updated
                        reply = resultReply; helpNext = false
                        playReply()
                    }
                }
            }, error = { message ->
                if (generation == voiceGeneration) { timeout?.cancel(); phase = "Paused"; error = message }
            })
    }

    fun finish(confidence: String?) {
        if (busy) return
        pause()
        val id = session.optString("id")
        execute {
            val body = JSONObject()
            if (confidence != null) body.put("confidence", confidence)
            feedback = api.post("/sessions/$id/finish", body)
            settings.activeSession = ""; screen = "feedback"
            loadProgress()
        }
    }

    fun deleteSession(id: String) = execute {
        pause()
        api.delete("/sessions/$id")
        if (settings.activeSession == id) settings.activeSession = ""
        if (session.optString("id") == id) { session = JSONObject(); reply = JSONObject(); feedback = JSONObject(); heard = "" }
        screen = "history"; loadProgress()
    }

    fun deleteAll() = execute {
        pause()
        api.delete("/learner")
        settings.activeSession = ""; session = JSONObject(); reply = JSONObject()
        feedback = JSONObject(); heard = ""; screen = "home"; loadProgress()
    }

    override fun onCleared() { timeout?.cancel(); input.close(); output.close() }
}

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
import com.fala.app.voice.ReplyDraft
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

class SessionController(application: Application) : AndroidViewModel(application) {
    val settings = ConnectionSettings(application)
    private val api = SessionApi(settings) { seconds ->
        connectionNotice = if (seconds > 0) "The conversation service is busy. Retrying in $seconds second${if (seconds == 1) "" else "s"}…" else ""
    }
    private val input: SpeechInput = AndroidSpeechInput(application)
    private val output: SpeechOutput = AndroidSpeechOutput(application)
    var screen by mutableStateOf(if (settings.consent && settings.signedIn) {
        if (settings.supportLanguage.isBlank()) "language" else "home"
    } else "welcome")
        private set
    var walkthroughStep by mutableStateOf<Int?>(null)
        private set
    fun openWalkthrough(force: Boolean = false): Boolean {
        if (screen != "talk" || practiceComplete || (!force && settings.walkthroughSeen)) return false
        pause()
        settings.walkthroughSeen = true // Remember even if the app closes halfway through.
        walkthroughStep = 0
        return true
    }
    fun closeWalkthrough() { walkthroughStep = null }
    fun nextWalkthroughStep() {
        val step = walkthroughStep ?: return
        walkthroughStep = if (step < 4) step + 1 else null
    }
    fun previousWalkthroughStep() { walkthroughStep = walkthroughStep?.let { (it - 1).coerceAtLeast(0) } }
    fun requestWalkthrough() {
        if (busy) return
        settings.walkthroughSeen = false
        navigate("home")
    }
    var busy by mutableStateOf(false)
        private set
    var phase by mutableStateOf("Ready")
        private set
    var error by mutableStateOf("")
        private set
    var connectionNotice by mutableStateOf("")
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
    var rewards by mutableStateOf(JSONObject().put("profile", runCatching { JSONObject(settings.rewardProfile) }.getOrDefault(JSONObject())))
        private set
    var friends by mutableStateOf(JSONObject())
        private set
    var celebration by mutableStateOf("")
        private set
    var unlockedInstructors by mutableStateOf(emptyList<String>())
        private set
    var feedback by mutableStateOf(JSONObject())
        private set
    var demo by mutableStateOf(false)
        private set
    var supportLanguage by mutableStateOf(settings.supportLanguage)
        private set
    var practiceTopic by mutableStateOf(settings.practiceTopic)
        private set
    var selectedLevel by mutableStateOf(0)
        private set
    var listenFirst by mutableStateOf(settings.listenFirst)
        private set
    internal var replySupport by mutableStateOf(ReplySupport.start(settings.listenFirst, settings.showReplyIdeas))
        private set
    val conversationLanguage: String get() = session.optString("support_language", supportLanguage.ifBlank { "en-US" })
    var draft by mutableStateOf(ReplyDraft())
        private set
    var partialWords by mutableStateOf("")
        private set
    var voiceNotice by mutableStateOf("")
        private set
    var voiceLevel by mutableStateOf(0f)
        private set
    var holding by mutableStateOf(false)
        private set
    var helpMode by mutableStateOf(false)
        private set
    val recording: Boolean get() = holding || phase == "Recognizing"
    val targetTurns: Int get() = session.optInt("target_turns", 10).coerceIn(1, 80)
    val completedTurns: Int get() = session.optJSONArray("turns")?.let { turns ->
        (0 until turns.length()).count { turns.getJSONObject(it).optInt("help") != 1 }
    } ?: 0
    val practiceComplete: Boolean get() = completedTurns >= targetTurns
    private var segmentJob: Job? = null
    var slow by mutableStateOf(false)
    var retryAvailable by mutableStateOf(false)
        private set
    private var foreground = false
    private var audioEnabled = false
    private var voiceGeneration = 0
    private var timeout: Job? = null
    private var retryAction: (suspend () -> Unit)? = null
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
                error = if (failure is org.json.JSONException) "Fala could not read this reply. Please retry."
                    else failure.message?.take(350) ?: "Something interrupted the conversation. Please retry."
                phase = "Paused"; retryAvailable = retryable && screen != "welcome"
            } finally { busy = false; connectionNotice = "" }
        }
    }

    fun retry() { retryAction?.let { execute(action = it) } }
    fun submitContentReport(summary: Boolean, category: String, note: String, sent: () -> Unit) = execute(retryable = false) {
        val turns = session.optJSONArray("turns")
        val turn = if (turns != null && turns.length() > 0) turns.getJSONObject(turns.length() - 1) else null
        val target = if (summary) "summary" else if (turn == null) "opening" else "reply"
        api.post("/content-reports", JSONObject().put("session_id", session.getString("id")).put("target", target)
            .put("turn_id", if (target == "reply") turn!!.getInt("id") else JSONObject.NULL).put("category", category).put("note", note))
        sent()
    }
    fun report(message: String) { error = message }

    fun chooseSupportLanguage(language: String) {
        if (busy) return
        settings.supportLanguage = language; supportLanguage = language
    }

    fun chooseTopic(topic: String) { if (!busy) { practiceTopic = topic; settings.practiceTopic = topic } }
    fun chooseLevel(level: Int) { if (!busy && level in 0..5) selectedLevel = level }
    fun chooseListenFirst(enabled: Boolean) { if (!busy) { listenFirst = enabled; settings.listenFirst = enabled } }
    fun revealText() { replySupport = replySupport.revealText() }
    fun revealIdeas() {
        if (busy || recording) return
        replySupport = replySupport.revealIdeas()
    }
    fun hideIdeas() {
        if (busy || recording) return
        settings.showReplyIdeas = false
        replySupport = replySupport.hideIdeas()
        voiceNotice = "Try your own words from the next question. Answer ideas are always available."
    }
    private fun resetReplySupport(resuming: Boolean = false) {
        replySupport = ReplySupport.start(listenFirst, settings.showReplyIdeas, resuming || reply.optString("practice_phrase").isNotBlank())
    }

    fun finishLanguageSetup() {
        if (supportLanguage.isBlank() || busy) return
        screen = "home"; refresh()
    }

    fun signIn(network: Boolean, credential: suspend (String, String) -> String) {
        if (supportLanguage.isBlank()) return
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
        closeWalkthrough()
        ReminderScheduler.cancel(getApplication())
        pause(); settings.clearSession()
        history = JSONArray(); progress = JSONObject(); session = JSONObject(); reply = JSONObject()
        feedback = JSONObject(); heard = ""; draft = ReplyDraft(); voiceNotice = ""; demo = false
        retryAction = null; retryAvailable = false; screen = "welcome"
        selectedLevel = 0
        rewards = JSONObject(); friends = JSONObject(); celebration = ""; unlockedInstructors = emptyList()
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
        dashboard.optJSONObject("rewards")?.let { updateRewards(it) }
        if (rewards.has("profile") && !rewards.getJSONObject("profile").optBoolean("timezone_confirmed")) {
            updateRewards(api.post("/rewards/settings", JSONObject().put("timezone", java.time.ZoneId.systemDefault().id)))
        }
    }

    private fun updateRewards(value: JSONObject) {
        rewards = value
        value.optJSONObject("profile")?.let { profile ->
            settings.rewardProfile = profile.toString()
            ReminderScheduler.schedule(getApplication(), profile)
        }
    }
    fun saveRewardPreferences(input: JSONObject) = execute {
        updateRewards(api.post("/rewards/settings", input))
    }
    fun circleAction(action: String, value: String = "") = execute {
        val body = JSONObject().put("action", action)
        if (action == "create" || action == "join") body.put("value", value)
        friends = api.post("/friends", body)
    }
    private suspend fun celebratePractice() {
        val prior = rewards
        loadProgress()
        unlockedInstructors = newlyUnlockedInstructors(prior, rewards)
        celebration = "${rewards.optInt("today_xp")} XP today · ${rewards.optInt("xp")} XP total"
    }

    fun refresh() = execute { loadProgress() }

    fun navigate(destination: String) {
        if (busy || !settings.signedIn) return
        pause()
        error = ""; retryAction = null; retryAvailable = false
        closeWalkthrough()
        screen = destination
        if (destination in listOf("home", "history", "progress")) refresh()
        if (destination == "rewards") execute { updateRewards(api.get("/rewards")) }
        if (destination == "friends") execute { updateRewards(api.get("/rewards")); friends = api.get("/friends") }
    }

    fun start(assessment: Boolean, topic: String = practiceTopic) {
        if (busy) return
        celebration = ""; unlockedInstructors = emptyList()
        audioEnabled = true
        val request = JSONObject().put("request_id", UUID.randomUUID().toString())
            .put("kind", if (assessment) "assessment" else "conversation").put("topic", topic)
            .put("support_language", supportLanguage.ifBlank { "en-US" })
        if (selectedLevel != 0) request.put("practice_level", selectedLevel)
        execute {
            val result = api.post("/sessions", request)
            session = result; settings.activeSession = result.getString("id")
            reply = result.getJSONObject("opening"); heard = ""; feedback = JSONObject()
            screen = "talk"; helpMode = false; draft = ReplyDraft(); voiceNotice = ""
            resetReplySupport()
            if (!openWalkthrough()) playReply()
        }
    }

    fun resume(id: String = settings.activeSession) = execute {
        celebration = ""; unlockedInstructors = emptyList()
        pause()
        session = api.get("/sessions/$id")
        if (!session.isNull("feedback")) {
            feedback = session.getJSONObject("feedback"); screen = "feedback"
        } else {
            settings.activeSession = id
            val turns = session.getJSONArray("turns")
            reply = if (turns.length() > 0) turns.getJSONObject(turns.length() - 1).getJSONObject("reply") else session.getJSONObject("opening")
            screen = "talk"; phase = "Your turn"; heard = ""; helpMode = false; draft = ReplyDraft(); voiceNotice = ""; feedback = JSONObject()
            resetReplySupport(resuming = true)
            if (practiceComplete) completePractice(id) else openWalkthrough()
        }
    }

    private fun stopVoice() {
        voiceGeneration++
        holding = false; voiceLevel = 0f
        timeout?.cancel(); timeout = null
        segmentJob?.cancel(); segmentJob = null
        input.cancel(); output.stop()
        partialWords = ""
    }

    fun pause() { audioEnabled = false; stopVoice(); phase = "Your turn"; showSummaryWhenReady() }
    fun setForeground(value: Boolean) { foreground = value; if (!value) pause() }

    fun play() {
        if (busy || retryAvailable) return
        audioEnabled = true; voiceNotice = ""
        playReply()
    }

    private fun playReply() {
        if (screen != "talk" || walkthroughStep != null) return
        val feedback = reply.optJSONObject("turn_feedback")
        speakPortuguese(replySpeech(reply.optString("text"), feedback?.optString("kind").orEmpty(), feedback?.optString("natural").orEmpty()))
    }

    fun listenTo(text: String) {
        if (busy || recording || retryAvailable) return
        audioEnabled = true; voiceNotice = ""
        speakPortuguese(text)
    }

    private fun showSummaryWhenReady() {
        if (screen == "talk" && practiceComplete && feedback.has("summary") && phase != "Speaking") screen = "feedback"
    }

    private suspend fun completePractice(id: String) {
        feedback = api.post("/sessions/$id/finish")
        settings.activeSession = ""
        showSummaryWhenReady()
        celebratePractice()
    }

    private fun speakPortuguese(text: String) {
        stopVoice()
        if (!audioEnabled || !foreground) { phase = "Your turn"; return }
        if (text.isBlank()) { phase = "Your turn"; return }
        phase = "Speaking"
        val generation = voiceGeneration
        output.speak(text, slow || reply.optString("pace") == "slow", done = {
            if (generation == voiceGeneration) { phase = "Your turn"; showSummaryWhenReady() }
        }, error = { message ->
            if (generation == voiceGeneration) { phase = "Your turn"; voiceNotice = message; showSummaryWhenReady() }
        })
    }

    fun editDraft(text: String) {
        if (busy || recording) return
        draft = draft.edited(text)
    }

    fun chooseSuggestion(text: String) {
        if (busy || retryAvailable || practiceComplete) return
        pause(); helpMode = false
        draft = ReplyDraft(text = text, assisted = true)
        voiceNotice = "Try this aloud, or edit it before sending."
    }

    fun toggleHelp() {
        if (busy || retryAvailable || practiceComplete) return
        pause(); helpMode = !helpMode; draft = ReplyDraft(); voiceNotice = ""
    }

    fun beginHolding() {
        if (busy || retryAvailable || recording || practiceComplete || !foreground || screen != "talk") return
        stopVoice(); audioEnabled = true; holding = true; voiceNotice = ""
        draft = ReplyDraft(assisted = draft.assisted)
        val generation = voiceGeneration
        timeout = viewModelScope.launch {
            delay(45000)
            if (generation == voiceGeneration) finishHolding()
        }
        listenSegment(generation)
    }

    fun finishHolding() {
        if (!holding) return
        holding = false; voiceLevel = 0f; timeout?.cancel()
        if (phase == "Listening") {
            phase = "Recognizing"
            val generation = voiceGeneration
            timeout = viewModelScope.launch {
                delay(8000)
                if (generation == voiceGeneration) {
                    val partial = partialWords
                    stopVoice()
                    if (partial.isNotBlank()) draft = draft.edited(listOf(draft.text, partial).filter { it.isNotBlank() }.joinToString(" "))
                    phase = "Your turn"; voiceNotice = "Check the words below, or hold to try again."
                }
            }
            input.finish()
        } else {
            val wasStarting = phase == "Starting microphone"
            stopVoice(); phase = "Your turn"
            if (wasStarting && draft.text.isBlank()) voiceNotice = "Hold until you see Listening, then speak."
        }
    }

    fun cancelHolding() {
        if (!recording) return
        stopVoice(); draft = ReplyDraft(); phase = "Your turn"; voiceNotice = "Recording cancelled."
    }

    private fun listenSegment(generation: Int) {
        if (!holding || generation != voiceGeneration || !foreground) return
        phase = "Starting microphone"
        val language = if (helpMode) conversationLanguage else "pt-BR"
        input.listen(language, settings.networkRecognition,
            ready = { if (generation == voiceGeneration && holding) phase = "Listening" },
            level = { if (generation == voiceGeneration && holding) voiceLevel = it },
            partial = { if (generation == voiceGeneration) partialWords = it },
            result = { result ->
                if (generation == voiceGeneration) {
                    draft = draft.segment(result.text, result.speechMs); partialWords = ""; voiceLevel = 0f
                    if (holding) {
                        // Some engines end at a pause even while the finger is held down.
                        phase = "Between phrases"
                        segmentJob = viewModelScope.launch { delay(200); listenSegment(generation) }
                    } else { timeout?.cancel(); phase = "Your turn" }
                }
            }, error = { message ->
                if (generation == voiceGeneration) {
                    val partial = partialWords
                    stopVoice()
                    if (partial.isNotBlank()) draft = draft.edited(listOf(draft.text, partial).filter { it.isNotBlank() }.joinToString(" "))
                    phase = "Your turn"; voiceNotice = message
                }
            })
    }

    fun sendDraft() {
        if (busy || recording || retryAvailable || practiceComplete || draft.text.isBlank()) return
        val answer = draft
        val help = helpMode
        stopVoice(); audioEnabled = true; phase = "Thinking"; voiceNotice = ""
        val body = JSONObject().put("request_id", UUID.randomUUID().toString())
            .put("text", answer.text.trim()).put("help", help)
            .put("language", if (help) conversationLanguage else "pt-BR")
            .put("speech_ms", answer.speechMs).put("source", answer.source).put("assisted", answer.assisted || replySupport.usedIdeas)
            .put("ideas_hidden", !replySupport.usedIdeas && !answer.assisted)
        val id = session.getString("id")
        execute {
            val resultReply = api.post("/sessions/$id/turns", body)
            val updated = JSONObject(session.toString())
            val turns = updated.getJSONArray("turns")
            if ((0 until turns.length()).none { turns.getJSONObject(it).optString("request_id") == body.getString("request_id") }) {
                turns.put(JSONObject(body.toString()).put("session_id", id)
                    .put("help", if (help) 1 else 0).put("reply", resultReply))
            }
            session = updated; heard = answer.text; draft = ReplyDraft()
            reply = resultReply; helpMode = false
            resetReplySupport()
            playReply()
            if (practiceComplete) completePractice(id)
        }
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
            celebratePractice()
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

    override fun onCleared() { timeout?.cancel(); segmentJob?.cancel(); input.close(); output.close() }
}

package com.fala.app

import com.fala.app.data.GoogleSignIn
import androidx.compose.ui.platform.LocalUriHandler
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.focusable
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.key.*
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModelProvider
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private val google by lazy { GoogleSignIn(this) }
    private lateinit var controller: SessionController
    private var permissionAction: (() -> Unit)? = null
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) permissionAction?.invoke()
        else controller.report("Microphone access is needed for speaking practice. You can enable it in Android app settings.")
        permissionAction = null
    }
    private fun withMicrophone(action: () -> Unit) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) action()
        else { permissionAction = action; microphone.launch(Manifest.permission.RECORD_AUDIO) }
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        controller = ViewModelProvider(this)[SessionController::class.java]
        setContent {
            MaterialTheme(colorScheme = lightColorScheme(
                primary = Color(0xFF12664F), onPrimary = Color.White,
                background = Color(0xFFFFFCF5), surface = Color(0xFFFFFCF5),
                secondaryContainer = Color(0xFFE3EEE6), onSecondaryContainer = Color(0xFF164734)
            )) {
                FalaApp(controller, ::withMicrophone, google,
                    appSettings = { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) },
                    voiceSettings = { runCatching { startActivity(Intent("com.android.settings.TTS_SETTINGS")) }
                        .onFailure { startActivity(Intent(Settings.ACTION_SETTINGS)) } })
            }
        }
    }
    override fun onStart() { super.onStart(); if (::controller.isInitialized) controller.setForeground(true) }
    override fun onStop() { controller.setForeground(false); super.onStop() }
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }

@Composable
private fun FalaApp(c: SessionController, mic: (() -> Unit) -> Unit, google: GoogleSignIn, appSettings: () -> Unit, voiceSettings: () -> Unit) {
    var deleteTarget by remember { mutableStateOf<String?>(null) }
    var finishDialog by remember { mutableStateOf(false) }
    BackHandler(c.screen !in listOf("home", "welcome", "language")) { if (!c.busy) c.navigate("home") }
    val scroll = rememberScrollState()
    LaunchedEffect(c.screen, c.reply) { scroll.scrollTo(0) }
    Scaffold(modifier = Modifier.imePadding(), containerColor = MaterialTheme.colorScheme.background,
        bottomBar = { if (c.screen == "talk") ConversationComposer(c, mic) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(scroll).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.fala_logo), contentDescription = "Fala",
                    modifier = Modifier.size(if (c.screen == "talk") 40.dp else 64.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(18.dp)))
                Text("PORTUGUÊS BRASILEIRO", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            if (c.screen !in listOf("home", "welcome", "language") && c.settings.signedIn) TextButton(onClick = { c.navigate("home") }, enabled = !c.busy) { Text("Back to home") }
            if (c.demo) Notice("Connection test mode · scripted replies, no AI teaching or assessment.")
            if (c.busy) { LinearProgressIndicator(Modifier.fillMaxWidth()); Text("One moment…", style = MaterialTheme.typography.labelMedium) }
            if (c.error.isNotBlank()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Column(Modifier.padding(16.dp)) {
                        Text(c.error)
                        if (c.retryAvailable) TextButton(onClick = c::retry, enabled = !c.busy) { Text("Retry") }
                    }
                }
            }
            when (c.screen) {
                "welcome" -> Welcome(c, google)
                "settings" -> AccountSettings(c, google, appSettings, voiceSettings, onDelete = { deleteTarget = "all" }, onDeleteAccount = { deleteTarget = "account" })
                "language" -> {
                    Title("A little help, in your language.", "Choose translations once. You can change this in Settings.")
                    SupportLanguageChoice(c)
                    Button(onClick = c::finishLanguageSetup, enabled = c.supportLanguage.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Continue") }
                }
                "home" -> Home(c)
                "talk" -> Conversation(c, voiceSettings) { c.pause(); finishDialog = true }
                "history" -> {
                    Title("Your conversations", "A little more Portuguese, each time.")
                    if (c.history.length() == 0) Text("Your first conversation will appear here.")
                    c.history.objects().forEach { s ->
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(s.getString("topic"), fontWeight = FontWeight.Bold)
                                Text("${s.getString("started_at").take(10)} · ${s.getInt("turn_count")} turns${if (s.optBoolean("demo") || s.optInt("demo") == 1) " · connection test" else ""}")
                                Row {
                                    TextButton(onClick = { c.resume(s.getString("id")) }, enabled = !c.busy) { Text(if (s.isNull("ended_at")) "Resume" else "Feedback") }
                                    TextButton(onClick = { deleteTarget = s.getString("id") }, enabled = !c.busy) { Text("Delete") }
                                }
                            }
                        }
                    }
                }
                "progress" -> Progress(c.progress)
                "feedback" -> Feedback(c.feedback, c.session)
            }
            Spacer(Modifier.height(12.dp))
        }
    }
    if (deleteTarget != null) AlertDialog(onDismissRequest = { deleteTarget = null }, title = { Text("Delete this learning data?") },
        text = { Text(if (deleteTarget == "account") "This permanently deletes your Fala account, conversations, and learning progress and signs out all your devices. It does not delete your Google account."
            else if (deleteTarget == "all") "This deletes all your conversations, assessments, and learning memory. It cannot be undone."
            else "This deletes the conversation, its feedback, and the memory learned from it.") },
        confirmButton = { TextButton(onClick = { val id = deleteTarget; deleteTarget = null; if (id == "account") c.deleteAccount(google::clear) else if (id == "all") c.deleteAll() else if (id != null) c.deleteSession(id) }) { Text("Delete") } },
        dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("Keep") } })
    if (finishDialog) AlertDialog(onDismissRequest = { finishDialog = false }, title = { Text("How did speaking feel?") },
        text = { Column {
            Text("An optional check-in from you. We won't guess your confidence from your grammar.")
            listOf("hard" to "Hard today", "okay" to "Okay", "comfortable" to "Comfortable").forEach { (value, label) ->
                TextButton(onClick = { finishDialog = false; c.finish(value) }) { Text(label) }
            }
        } }, confirmButton = { TextButton(onClick = { finishDialog = false; c.finish(null) }) { Text("Skip and finish") } })
}

@Composable private fun Title(title: String, subtitle: String) {
    Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
    Text(subtitle, style = MaterialTheme.typography.bodyLarge)
}

@Composable private fun Notice(text: String) {
    Text(text, Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.secondaryContainer, RoundedCornerShape(16.dp)).padding(16.dp))
}

@Composable private fun Home(c: SessionController) {
    val assessment = c.progress.optJSONObject("assessment")
    Title("Let’s start talking.", "Fala asks first. Take your time to answer.")
    if (assessment == null && !c.demo) Notice("Let's get to know your spoken Portuguese with a short conversation. No beginner level assumed.")
    Button(onClick = { c.start(assessment == null) }, enabled = !c.busy,
        modifier = Modifier.fillMaxWidth().height(100.dp), shape = RoundedCornerShape(28.dp)) {
        Text("Talk", style = MaterialTheme.typography.headlineLarge)
    }
    Text(if (assessment == null) "First conversation · a short spoken assessment" else "Make 5–15 minutes for your Portuguese.")
    if (c.settings.activeSession.isNotBlank()) OutlinedButton(onClick = { c.resume() }, enabled = !c.busy, modifier = Modifier.fillMaxWidth()) { Text("Resume your conversation") }
    val memory = c.progress.optJSONArray("memory")?.takeIf { it.length() > 0 }
        ?: c.progress.optJSONArray("help_patterns")
    if (memory != null && memory.length() > 0) {
        Text("Today's focus", fontWeight = FontWeight.Bold)
        Notice(memory.getJSONObject(0).getString("natural"))
        Text("We'll create opportunities to use this in conversation.")
    }
    c.history.objects().firstOrNull { it.optInt("demo") == 0 }?.let { recent ->
        TextButton(onClick = { c.start(false, recent.getString("topic")) }, enabled = !c.busy) { Text("Continue topic: ${recent.getString("topic")}") }
    }
    if (assessment == null) TextButton(onClick = { c.start(false) }, enabled = !c.busy) { Text("Just have a conversation") }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        TextButton(onClick = { c.navigate("history") }, enabled = !c.busy) { Text("History") }
        TextButton(onClick = { c.navigate("progress") }, enabled = !c.busy) { Text("Progress") }
        TextButton(onClick = { c.navigate("settings") }, enabled = !c.busy) { Text("Settings") }
    }
}

@Composable private fun TranslatedText(text: String, language: String) {
    Text(text, Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.onSurfaceVariant,
        style = MaterialTheme.typography.bodyMedium.copy(
            textDirection = if (language == "he-IL") TextDirection.Rtl else TextDirection.Ltr,
            textAlign = if (language == "he-IL") TextAlign.Right else TextAlign.Left))
}

@Composable private fun HoldToSpeak(c: SessionController, mic: (() -> Unit) -> Unit, modifier: Modifier = Modifier) {
    val enabled = !c.busy && !c.retryAvailable && c.phase != "Recognizing"
    var keyboardHeld by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { keyboardHeld = false } }
    fun accessibleToggle() {
        if (c.holding) c.finishHolding() else mic { c.beginHolding() }
    }
    Surface(color = MaterialTheme.colorScheme.primary, contentColor = MaterialTheme.colorScheme.onPrimary,
        shape = RoundedCornerShape(24.dp), modifier = modifier.heightIn(min = 72.dp)
            .semantics {
                role = Role.Button
                contentDescription = "Hold to speak. Release to finish."
                if (!enabled) disabled()
                onClick(label = "Start or stop recording") { if (enabled) { accessibleToggle(); true } else false }
            }
            .onKeyEvent { event ->
                if (event.key !in listOf(Key.Spacebar, Key.Enter)) false
                else if (event.type == KeyEventType.KeyUp) {
                    val wasHeld = keyboardHeld
                    keyboardHeld = false
                    if (wasHeld) c.finishHolding()
                    wasHeld
                } else if (event.type == KeyEventType.KeyDown && enabled) {
                    if (!keyboardHeld) { keyboardHeld = true; mic { if (keyboardHeld) c.beginHolding() } }
                    true
                } else false
            }.onFocusChanged {
                if (!it.isFocused && keyboardHeld) { keyboardHeld = false; c.cancelHolding() }
            }.focusable(enabled)
            .pointerInput(enabled) {
                if (enabled) detectTapGestures(onPress = {
                    var released = false
                    mic { if (!released) c.beginHolding() }
                    try {
                        val completed = tryAwaitRelease()
                        released = true
                        if (completed) c.finishHolding() else c.cancelHolding()
                    } finally {
                        released = true
                        if (c.holding) c.cancelHolding()
                    }
                })
            }) {
        Box(Modifier.padding(18.dp), contentAlignment = Alignment.Center) {
            Text(when {
                c.phase == "Recognizing" -> "Finishing…"
                c.phase == "Starting microphone" -> "Getting ready…"
                c.holding -> "Release to stop"
                else -> "Hold to speak"
            }, style = MaterialTheme.typography.titleLarge)
        }
    }
}

@Composable private fun Conversation(c: SessionController, voiceSettings: () -> Unit, finish: () -> Unit) {
    var speechOptions by remember { mutableStateOf(false) }
    var network by remember { mutableStateOf(c.settings.networkRecognition) }
    val language = c.conversationLanguage
    val languageName = if (language == "he-IL") "Hebrew" else "English"
    Text(if (c.session.optString("kind") == "assessment") "Getting to know your Portuguese" else c.session.optString("topic"),
        style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
    Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Fala", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Text(c.reply.optString("text"), style = MaterialTheme.typography.headlineSmall.copy(textDirection = TextDirection.Ltr))
            if (c.reply.optString("translation").isNotBlank()) TranslatedText(c.reply.optString("translation"), language)
            else Text("Translations will appear with the next reply.", style = MaterialTheme.typography.bodySmall)
            Row {
                TextButton(onClick = c::play, enabled = !c.busy && !c.recording && !c.retryAvailable) { Text("Listen again") }
                TextButton(onClick = { c.slow = !c.slow }, enabled = !c.recording) { Text(if (c.slow) "Slow ✓" else "Slower") }
                if (c.phase == "Speaking") TextButton(onClick = c::pause) { Text("Stop") }
            }
        }
    }
    val ideas = c.reply.optJSONArray("suggested_replies")?.objects().orEmpty()
    if (ideas.isNotEmpty()) {
        Text("You could say…", style = MaterialTheme.typography.titleMedium)
        ideas.forEach { idea ->
            OutlinedCard(onClick = { c.chooseSuggestion(idea.getString("text")) }, enabled = !c.busy && !c.recording && !c.retryAvailable,
                modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(idea.getString("text"), style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr))
                    TranslatedText(idea.optString("translation"), language)
                }
            }
        }
        Text("Tap an idea to use or adapt it. Your own words are welcome, too.", style = MaterialTheme.typography.bodySmall)
    } else if (c.reply.optString("practice_phrase").isNotBlank()) {
        OutlinedButton(onClick = { c.chooseSuggestion(c.reply.getString("practice_phrase")) }, enabled = !c.busy && !c.recording) {
            Text(c.reply.getString("practice_phrase"))
        }
    }
    TextButton(onClick = c::toggleHelp, enabled = !c.busy && !c.recording && !c.retryAvailable) {
        Text(if (c.helpMode) "Back to Portuguese" else "I need to say it in $languageName first")
    }
    TextButton(onClick = { c.pause(); speechOptions = !speechOptions }, enabled = !c.busy) { Text("Speech options") }
    if (speechOptions) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Switch(network, { network = it; c.settings.networkRecognition = it })
            Text("Use network speech recognition", Modifier.padding(start = 8.dp).weight(1f))
        }
        Text("If on-device recognition cannot hear Portuguese, try your phone’s online speech service. It may send audio to your phone’s speech provider.", style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = voiceSettings) { Text("Brazilian voice settings") }
    }
    OutlinedButton(onClick = finish, enabled = !c.busy && !c.recording, modifier = Modifier.fillMaxWidth()) { Text("Finish conversation") }
}

@Composable private fun ConversationComposer(c: SessionController, mic: (() -> Unit) -> Unit) {
    val language = c.conversationLanguage
    val languageName = if (language == "he-IL") "Hebrew" else "English"
    Surface(shadowElevation = 6.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (c.voiceNotice.isNotBlank()) Text(c.voiceNotice, style = MaterialTheme.typography.bodySmall)
            if (c.holding) LinearProgressIndicator(progress = { c.voiceLevel }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = if (c.recording) listOf(c.draft.text, c.partialWords).filter { it.isNotBlank() }.joinToString(" ") else c.draft.text,
                onValueChange = c::editDraft,
                label = { Text(if (c.helpMode) "Say what you mean in $languageName" else "Your reply in Portuguese") },
                placeholder = { Text("Speak or type here") },
                modifier = Modifier.fillMaxWidth(), enabled = !c.busy && !c.recording && !c.retryAvailable,
                minLines = 1, maxLines = 3,
                textStyle = LocalTextStyle.current.copy(textDirection = if (c.helpMode && language == "he-IL") TextDirection.Rtl else TextDirection.Ltr))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                HoldToSpeak(c, mic, Modifier.weight(1f))
                Button(onClick = c::sendDraft, enabled = c.draft.text.isNotBlank() && !c.busy && !c.recording && !c.retryAvailable,
                    modifier = Modifier.heightIn(min = 72.dp), shape = RoundedCornerShape(24.dp)) { Text("Send") }
            }
            Text(when {
                c.phase == "Starting microphone" -> "Wait for Listening, then speak."
                c.holding -> "Listening · keep holding while you speak."
                c.phase == "Recognizing" -> "Finishing your words…"
                c.busy -> "Fala is preparing a reply…"
                c.helpMode -> "Send your meaning; Fala will help you say it in Portuguese."
                else -> "Hold, speak, release. Check your words, then send."
            }, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable private fun SupportLanguageChoice(c: SessionController) {
    Text("Translations and reply ideas", style = MaterialTheme.typography.titleMedium)
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        FilterChip(selected = c.supportLanguage == "en-US", onClick = { c.chooseSupportLanguage("en-US") },
            label = { Text("English") }, enabled = !c.busy)
        FilterChip(selected = c.supportLanguage == "he-IL", onClick = { c.chooseSupportLanguage("he-IL") },
            label = { Text("עברית") }, enabled = !c.busy)
    }
}

@Composable private fun PrivacyLink() {
    val uri = LocalUriHandler.current
    TextButton(onClick = { uri.openUri(BuildConfig.API_BASE_URL + "/privacy.html") }) { Text("Privacy policy") }
}

@Composable private fun Welcome(c: SessionController, google: GoogleSignIn) {
    var network by remember { mutableStateOf(c.settings.networkRecognition) }
    var consent by remember { mutableStateOf(c.settings.consent) }
    Title("Make room for speaking.", "A Brazilian conversation partner that helps you find your own words.")
    Text("Sign in to keep your conversations and progress together, wherever you practice.")
    SupportLanguageChoice(c)
    Text("Choose once. Fala speaks Portuguese and shows help in your language.")
    Text("Fala sends your transcript to its conversation service and AI provider. Your conversations and learning memory are saved to your account until you delete them. Fala does not record audio.")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Switch(network, { network = it }, enabled = !c.busy)
        Text("Use network speech recognition", Modifier.padding(start = 12.dp))
    }
    Text("On-device speech recognition is preferred. Network recognition may send audio to your phone's speech provider. Voice playback can also use the network.")
    PrivacyLink()
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(consent, { consent = it }, enabled = !c.busy)
        Text("I understand how my speech and conversations are processed.", Modifier.padding(start = 4.dp))
    }
    OutlinedButton(onClick = { c.signIn(network, google::credential) }, enabled = consent && c.supportLanguage.isNotBlank() && !c.busy,
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Color.White, contentColor = Color(0xFF1F1F1F))) {
        Image(painterResource(R.drawable.google_g), contentDescription = null, modifier = Modifier.size(20.dp))
        Spacer(Modifier.width(12.dp))
        Text("Sign in with Google")
    }
}

@Composable private fun AccountSettings(c: SessionController, google: GoogleSignIn, appSettings: () -> Unit,
    voiceSettings: () -> Unit, onDelete: () -> Unit, onDeleteAccount: () -> Unit) {
    var network by remember { mutableStateOf(c.settings.networkRecognition) }
    Title("Your Fala", c.settings.email)
    SupportLanguageChoice(c)
    Text("This choice applies to new conversations.", style = MaterialTheme.typography.bodySmall)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Switch(network, { network = it; c.settings.networkRecognition = it }, enabled = !c.busy)
        Text("Use network speech recognition", Modifier.padding(start = 12.dp))
    }
    Text("Network recognition may send audio to your phone's speech provider. Voice playback may also use a network voice if no local voice is installed.")
    TextButton(onClick = appSettings) { Text("Microphone permissions") }
    TextButton(onClick = voiceSettings) { Text("Brazilian voice settings") }
    PrivacyLink()
    OutlinedButton(onClick = { c.signOut(google::clear) }, enabled = !c.busy, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
    TextButton(onClick = onDelete, enabled = !c.busy) { Text("Delete all my learning data") }
    TextButton(onClick = onDeleteAccount, enabled = !c.busy) { Text("Delete my Fala account") }
}

@Composable private fun Progress(p: JSONObject) {
    Title("More of your own words.", "Useful practice, without points or streaks.")
    Notice("${p.optInt("conversations")} conversations · ${p.optLong("speech_ms") / 60000} minutes speaking")
    Text("Speaking time is approximate and excludes English/Hebrew help. Connection tests are excluded.")
    Text("${p.optInt("learner_turns")} spoken replies · ${p.optInt("typed_turns")} typed replies · ${p.optInt("help_requests")} requests for help")
    val topics = p.optJSONArray("topics")?.strings().orEmpty()
    if (topics.isNotEmpty()) Text("Topics practiced: ${topics.joinToString()}")
    p.optJSONObject("assessment")?.let { Assessment(it) }
    Text("Patterns we're practicing", style = MaterialTheme.typography.titleLarge)
    val memory = p.optJSONArray("memory")?.objects().orEmpty()
    if (memory.isEmpty()) Text("Your own recurring patterns will appear after conversations. There are no random word lists.")
    memory.forEach { item -> Notice("${item.getString("natural")}\nSeen in ${item.getInt("occurrences")} conversation(s) · review from ${item.getString("due_at").take(10)}") }
    val help = p.optJSONArray("help_patterns")?.objects().orEmpty()
    if (help.isNotEmpty()) {
        Text("Phrases you needed help finding", style = MaterialTheme.typography.titleLarge)
        help.forEach { item -> Notice("${item.getString("natural")}\n${item.getInt("occurrences")} conversation(s) · ${item.getString("topic")}") }
    }
}

@Composable private fun Assessment(a: JSONObject) {
    Text("Speaking snapshot", style = MaterialTheme.typography.titleLarge)
    if (!a.isNull("cefr")) Text("Approximate ${a.optString("cefr")} · provisional, based on a short conversation")
    listOf("comprehension", "vocabulary", "grammar", "sentence_construction", "fluency", "pronunciation", "confidence").forEach { key ->
        a.optJSONObject(key)?.let { dimension ->
            Text(key.replace('_', ' ').replaceFirstChar { it.uppercase() }, fontWeight = FontWeight.Bold)
            Text(dimension.optString("observation"))
            if (dimension.optString("evidence").isNotBlank()) Text("“${dimension.getString("evidence")}”")
        }
    }
}

@Composable private fun Feedback(f: JSONObject, session: JSONObject) {
    Title("Take this into your next conversation.", f.optString("summary"))
    f.optJSONArray("corrections")?.objects()?.forEach { correction ->
        Card {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("WHAT I SAID", style = MaterialTheme.typography.labelSmall)
                Text(correction.getString("said"))
                Text("NATURAL BRAZILIAN PORTUGUESE", style = MaterialTheme.typography.labelSmall)
                Text(correction.getString("natural"), fontWeight = FontWeight.Bold)
                Text(correction.getString("explanation"))
                Text("Example: ${correction.getString("example")}")
            }
        }
    }
    if (f.optJSONArray("corrections")?.length() == 0) Text("No corrections added. We don't invent mistakes to fill a report.")
    val review = f.optJSONArray("review_phrases")?.strings().orEmpty()
    if (review.isNotEmpty()) {
        Text("Keep these close", style = MaterialTheme.typography.titleLarge)
        review.forEach { Notice(it) }
    }
    f.optJSONObject("assessment")?.let { Assessment(it) }
    var show by remember { mutableStateOf(false) }
    TextButton(onClick = { show = !show }) { Text(if (show) "Hide conversation" else "Read conversation") }
    if (show) {
        Text("Partner: ${session.optJSONObject("opening")?.optString("text").orEmpty()}")
        session.optJSONArray("turns")?.objects()?.forEach { turn ->
            Text("You${if (turn.optInt("help") == 1) " (help)" else ""}: ${turn.getString("text")}")
            Text("Partner: ${turn.getJSONObject("reply").getString("text")}")
        }
    }
}

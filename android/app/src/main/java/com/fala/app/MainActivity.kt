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
    BackHandler(c.screen != "home" && c.screen != "welcome") { if (!c.busy) c.navigate("home") }
    Scaffold(containerColor = MaterialTheme.colorScheme.background) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Image(painterResource(R.drawable.fala_logo), contentDescription = "Fala",
                    modifier = Modifier.size(72.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(18.dp)))
                Text("PORTUGUÊS BRASILEIRO", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            }
            if (c.screen != "home" && c.screen != "welcome" && c.settings.signedIn) TextButton(onClick = { c.navigate("home") }, enabled = !c.busy) { Text("Back to home") }
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
                "home" -> Home(c, mic)
                "talk" -> Conversation(c, mic) { c.pause(); finishDialog = true }
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

@Composable private fun Home(c: SessionController, mic: (() -> Unit) -> Unit) {
    val assessment = c.progress.optJSONObject("assessment")
    Title("A real conversation\nstarts with you.", "A few minutes of speaking. A little more confidence.")
    if (assessment == null && !c.demo) Notice("Let's get to know your spoken Portuguese with a short conversation. No beginner level assumed.")
    Button(onClick = { mic { c.start(assessment == null) } }, enabled = !c.busy,
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
        TextButton(onClick = { mic { c.start(false, recent.getString("topic")) } }, enabled = !c.busy) { Text("Continue topic: ${recent.getString("topic")}") }
    }
    if (assessment == null) TextButton(onClick = { mic { c.start(false) } }, enabled = !c.busy) { Text("Just have a conversation") }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        TextButton(onClick = { c.navigate("history") }, enabled = !c.busy) { Text("History") }
        TextButton(onClick = { c.navigate("progress") }, enabled = !c.busy) { Text("Progress") }
        TextButton(onClick = { c.navigate("settings") }, enabled = !c.busy) { Text("Settings") }
    }
}

@Composable private fun Conversation(c: SessionController, mic: (() -> Unit) -> Unit, finish: () -> Unit) {
    var helpOpen by remember { mutableStateOf(false) }
    Text(if (c.session.optString("kind") == "assessment") "Getting to know your Portuguese" else c.session.optString("topic"), style = MaterialTheme.typography.titleMedium)
    if (c.session.optString("kind") == "assessment" && (c.session.optJSONArray("turns")?.objects()?.count { it.optInt("help") == 0 } ?: 0) >= 5) {
        Notice("There's enough for a first speaking snapshot. Keep talking, or finish when you're ready.")
    }
    Text(c.phase, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
    if (c.reply.optString("practice_phrase").isNotBlank()) {
        Notice(c.reply.getString("practice_phrase"))
        Text("Your turn: say this in Portuguese, then keep the conversation going.")
    }
    if (c.reply.optString("explanation").isNotBlank()) Text(c.reply.getString("explanation"))
    Button(onClick = { mic { c.mic() } }, enabled = !c.busy && !c.retryAvailable,
        modifier = Modifier.fillMaxWidth().height(90.dp), shape = RoundedCornerShape(28.dp)) {
        Text(when (c.phase) { "Listening" -> "I'm done speaking"; "Speaking" -> "Speak now"; else -> "Microphone" }, style = MaterialTheme.typography.titleLarge)
    }
    Text("Your partner speaks, then listens automatically. Tap to interrupt playback.")
    Row {
        TextButton(onClick = c::play, enabled = !c.busy && !c.retryAvailable) { Text("Replay") }
        TextButton(onClick = c::pause) { Text("Pause") }
        TextButton(onClick = { c.slow = !c.slow }) { Text(if (c.slow) "Slow ✓" else "Slow down") }
    }
    OutlinedButton(onClick = { c.pause(); helpOpen = true }, enabled = !c.busy && !c.retryAvailable, modifier = Modifier.fillMaxWidth()) { Text("What should I say?") }
    if (helpOpen) {
        Text("Tell me what you want to say:")
        Row {
            TextButton(onClick = { helpOpen = false; mic { c.help("en-US") } }) { Text("Speak English") }
            TextButton(onClick = { helpOpen = false; mic { c.help("he-IL") } }) { Text("לדבר בעברית") }
        }
    }
    TextButton(onClick = { c.transcriptVisible = !c.transcriptVisible }) { Text(if (c.transcriptVisible) "Hide transcript" else "Show transcript") }
    if (c.transcriptVisible) {
        Text(c.reply.optString("text"), style = MaterialTheme.typography.bodyLarge)
        if (c.heard.isNotBlank()) Text("You: ${c.heard}")
        Text("Speech recognition can make mistakes. Feedback uses this transcript.", style = MaterialTheme.typography.labelSmall)
    }
    OutlinedButton(onClick = finish, enabled = !c.busy, modifier = Modifier.fillMaxWidth()) { Text("Finish conversation") }
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
    OutlinedButton(onClick = { c.signIn(network, google::credential) }, enabled = consent && !c.busy,
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
    Text("${p.optInt("learner_turns")} speaking turns · ${p.optInt("help_requests")} requests for help")
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

package com.fala.app

import com.fala.app.data.GoogleSignIn
import com.fala.app.voice.VoiceEvent
import com.fala.app.voice.VoiceOperation
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import android.Manifest
import android.media.AudioManager
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
import androidx.compose.ui.text.style.TextOverflow
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
    private lateinit var updates: AppUpdates
    private val updateLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { result ->
        if (::updates.isInitialized) updates.onResult(result.resultCode)
    }
    private var permissionAction: (() -> Unit)? = null
    private var microphoneDenied by mutableStateOf(false)
    private val microphone = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        controller.microphonePermissionResult(granted)
        val action = permissionAction
        permissionAction = null
        if (granted) action?.invoke() else microphoneDenied = true
    }
    private fun withMicrophone(action: () -> Unit) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) action()
        else {
            controller.diagnostics.events.record(VoiceEvent.MICROPHONE_PERMISSION_REQUEST, operation = VoiceOperation.REQUEST_PERMISSION)
            permissionAction = action; microphone.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
    private fun openAppSettings() {
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        volumeControlStream = AudioManager.STREAM_MUSIC
        controller = ViewModelProvider(this)[SessionController::class.java]
        updates = AppUpdates(this, controller.settings, updateLauncher) {
            controller.screen in listOf("home", "settings") && !controller.busy
        }
        setContent {
            FalaTheme(controller) {
                FalaApp(controller, ::withMicrophone, google, updates,
                    appSettings = ::openAppSettings,
                    voiceSettings = { runCatching { startActivity(Intent("com.android.settings.TTS_SETTINGS")) }
                        .onFailure { startActivity(Intent(Settings.ACTION_SETTINGS)) } })
                if (microphoneDenied) {
                    val he = controller.conversationLanguage == "he-IL"
                    AlertDialog(onDismissRequest = { microphoneDenied = false },
                        title = { Text(if (he) "צריך לאפשר גישה למיקרופון" else "Allow microphone access") },
                        text = { Text(if (he) "בהגדרות Fala במכשיר, פתחו הרשאות ← מיקרופון ובחרו לאפשר בזמן השימוש באפליקציה. חזרו ל־Fala והחזיקו שוב את כפתור המיקרופון. אפשר גם להמשיך בהקלדה."
                            else "In Fala’s app settings, open Permissions → Microphone and allow access while using the app. Return to Fala and hold the microphone again. You can also keep typing.") },
                        confirmButton = { TextButton(onClick = { microphoneDenied = false; openAppSettings() }) { Text(if (he) "פתיחת הגדרות" else "Open settings") } },
                        dismissButton = { TextButton(onClick = { microphoneDenied = false }) { Text(if (he) "להמשיך בהקלדה" else "Keep typing") } })
                }
            }
        }
    }
    override fun onStart() { super.onStart(); if (::controller.isInitialized) controller.setForeground(true) }
    override fun onResume() { super.onResume(); if (::updates.isInitialized) updates.resume() }
    override fun onPause() { if (::updates.isInitialized) updates.pause(); super.onPause() }
    override fun onDestroy() { if (::updates.isInitialized) updates.close(); super.onDestroy() }
    override fun onStop() { controller.setForeground(false); super.onStop() }
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
private fun JSONArray.strings(): List<String> = (0 until length()).map { getString(it) }

@Composable
private fun FalaApp(c: SessionController, mic: (() -> Unit) -> Unit, google: GoogleSignIn, updates: AppUpdates, appSettings: () -> Unit, voiceSettings: () -> Unit) {
    var deleteTarget by remember { mutableStateOf<String?>(null) }
    var finishDialog by remember { mutableStateOf(false) }
    var conversationOptions by remember { mutableStateOf(false) }
    var microphoneHelp by remember { mutableStateOf(false) }
    var playbackHelp by remember { mutableStateOf(false) }
    val openMicrophoneHelp: () -> Unit = { c.pause(); microphoneHelp = true }
    val openPlaybackHelp: () -> Unit = { c.pause(); conversationOptions = false; playbackHelp = true }
    BackHandler(c.screen !in listOf("home", "welcome", "language")) { if (!c.busy) c.navigate("home") }
    val scroll = rememberScrollState()
    LaunchedEffect(c.screen, c.reply) { scroll.scrollTo(0) }
    val walkthroughTargets = remember { mutableStateMapOf<Int, WalkthroughAnchor>() }
    CompositionLocalProvider(LocalWalkthroughTargets provides walkthroughTargets) {
    Scaffold(modifier = Modifier.imePadding(), containerColor = MaterialTheme.colorScheme.background,
        topBar = { if (c.screen == "talk") ConversationHeader(c) { conversationOptions = true } },
        bottomBar = {
            if (c.screen == "talk") ConversationComposer(c, mic, openMicrophoneHelp, openPlaybackHelp)
            else if (c.settings.signedIn && c.screen in listOf("home", "rewards", "friends", "settings")) Surface(color=MaterialTheme.colorScheme.surface) {
                Row(Modifier.fillMaxWidth().navigationBarsPadding().padding(6.dp),horizontalArrangement=Arrangement.SpaceEvenly) {
                    listOf("home" to "Practise", "friends" to "Friends", "rewards" to "Rewards", "settings" to "Settings").forEach { (destination,label) ->
                        TextButton(onClick={c.navigate(destination)},enabled=!c.busy) { Text(label,fontWeight=if(c.screen==destination) FontWeight.Bold else FontWeight.Normal) }
                    }
                }
            }
        }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(scroll).padding(if (c.screen == "talk") 16.dp else 24.dp),
            verticalArrangement = Arrangement.spacedBy(if (c.screen == "talk") 12.dp else 18.dp)) {
            if (c.screen != "talk") {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Image(painterResource(R.drawable.fala_logo), contentDescription = "Fala",
                            modifier = Modifier.size(56.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(18.dp)))
                        Text(BuildConfig.VERSION_NAME, style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.semantics { contentDescription = "App version ${BuildConfig.VERSION_NAME}" })
                    }
                    Text("PORTUGUÊS BRASILEIRO", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                }
                if (c.screen !in listOf("home", "welcome", "language") && c.settings.signedIn) TextButton(onClick = { c.navigate("home") }, enabled = !c.busy) { Text("Back to home") }
                if (c.demo) Notice("Connection test mode · scripted replies, no AI teaching or assessment.")
                if (c.busy) { LinearProgressIndicator(Modifier.fillMaxWidth()); Text(c.connectionNotice.ifBlank { "One moment…" }, style = MaterialTheme.typography.labelMedium) }
                if (c.error.isNotBlank()) {
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                        Column(Modifier.padding(16.dp)) {
                            Text(c.error)
                            if (c.retryAvailable) TextButton(onClick = c::retry, enabled = !c.busy) { Text("Retry") }
                        }
                    }
                }
            }
            if (updates.visible(c.screen, c.busy)) UpdateCard(updates, c.supportLanguage == "he-IL")
            when (c.screen) {
                "welcome" -> Welcome(c, google)
                "settings" -> AccountSettings(c, google, openMicrophoneHelp, openPlaybackHelp, onDelete = { deleteTarget = "all" }, onDeleteAccount = { deleteTarget = "account" })
                "language" -> {
                    Title("A little help, in your language.", "Choose translations once. You can change this in Settings.")
                    SupportLanguageChoice(c)
                    Button(onClick = c::finishLanguageSetup, enabled = c.supportLanguage.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Continue") }
                }
                "home" -> Home(c)
                "talk" -> Conversation(c)
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
                "rewards" -> RewardsScreen(c)
                "friends" -> FriendsScreen(c)
                "progress" -> Progress(c.progress)
                "feedback" -> Feedback(c)
            }
            Spacer(Modifier.height(12.dp))
        }
    }
    }
    if (c.screen == "talk" && !microphoneHelp && !playbackHelp) Walkthrough(c, walkthroughTargets, openMicrophoneHelp)
    if (microphoneHelp) MicrophoneHelp(c, mic, appSettings, voiceSettings) { microphoneHelp = false }
    if (playbackHelp) MicrophoneHelp(c, mic, appSettings, voiceSettings, playback = true) { c.pause(); playbackHelp = false }
    if (conversationOptions && c.screen == "talk") ConversationOptions(c, openPlaybackHelp,
        microphoneHelp = { conversationOptions = false; openMicrophoneHelp() },
        close = { conversationOptions = false }, finish = { conversationOptions = false; c.pause(); finishDialog = true })
    if (deleteTarget != null) AlertDialog(onDismissRequest = { deleteTarget = null }, title = { Text("Delete this learning data?") },
        text = { Text(if (deleteTarget == "account") "This permanently deletes your Fala account, conversations, and learning progress and signs out all your devices. It does not delete your Google account."
            else if (deleteTarget == "all") "This deletes all conversations and learning memory, and resets your points, streak and unlocked looks. It cannot be undone."
            else "This deletes the conversation, its feedback, and the memory learned from it. Your practice points stay.") },
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
    val recommended = c.progress.optJSONObject("practice")?.optInt("level", 1)?.coerceIn(1,5) ?: 1
    val level = if (c.selectedLevel == 0) recommended else c.selectedLevel
    var chooseLevel by remember { mutableStateOf(false) }
    RewardsHome(c)
    Title("Let's have a conversation.", "${if(c.practiceTopic == "capoeira class") "Capoeira class" else "Everyday life"} · Level $level · 10 replies")
    Button(onClick = { c.start(false) }, enabled = !c.busy,
        modifier = Modifier.fillMaxWidth().height(64.dp), shape = RoundedCornerShape(20.dp)) {
        Text("Talk", style = MaterialTheme.typography.headlineSmall)
    }
    if (c.walkthroughNeeded) TranslatedText(
        if (c.supportLanguage == "he-IL") "לחצו על Talk כדי להתחיל. הדרכה קצרה תראה לכם איך להקשיב, לדבר ולשלוח תשובה."
        else "Tap Talk to start. A short guide will show you how to listen, speak and send your reply.", c.supportLanguage)
    InstructorHome(c)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("Practice level $level · ${practiceLevels[level - 1].first}", fontWeight = FontWeight.Bold)
            Text(practiceLevels[level - 1].second)
            TextButton(onClick = { chooseLevel = true }, enabled = !c.busy) { Text("Choose an easier or harder level") }
        }
    }
    if (chooseLevel) AlertDialog(onDismissRequest = { chooseLevel = false }, title = { Text("Your practice level") }, text = {
        Column(Modifier.heightIn(max = 440.dp).verticalScroll(rememberScrollState())) {
            Text("A conversation difficulty, not a formal language qualification. You can explore any level.")
            TextButton(onClick = { c.chooseLevel(0); chooseLevel = false }) { Text("Follow Fala's recommendation · level $recommended") }
            practiceLevels.forEachIndexed { index, item ->
                TextButton(onClick = { c.chooseLevel(index + 1); chooseLevel = false }) { Text("${index + 1}. ${item.first}\n${item.second}") }
            }
        }
    }, confirmButton = { TextButton(onClick = { chooseLevel = false }) { Text("Close") } })
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        FilterChip(selected = c.practiceTopic == "capoeira class", onClick = { c.chooseTopic("capoeira class") }, enabled = !c.busy, label = { Text("Capoeira class") })
        FilterChip(selected = c.practiceTopic == "choose for me", onClick = { c.chooseTopic("choose for me") }, enabled = !c.busy, label = { Text("Everyday life") })
    }
    if (c.practiceTopic == "capoeira class") Text("Understand your instructor, follow directions, and ask for clarification.")
    Row(verticalAlignment = Alignment.CenterVertically) {
        Switch(c.listenFirst, c::chooseListenFirst, enabled = !c.busy)
        Text("Listen first · reveal the text when needed", Modifier.padding(start = 8.dp).weight(1f))
    }

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
    val enabled = !c.busy && !c.retryAvailable && !c.practiceComplete && !c.finishingSpeech && c.phase != "Recognizing"
    var keyboardHeld by remember { mutableStateOf(false) }
    DisposableEffect(Unit) { onDispose { keyboardHeld = false } }
    fun accessibleToggle() {
        if (c.holding) c.finishHolding() else mic { c.beginHolding() }
    }
    Surface(color = if (c.holding || c.finishingSpeech) Color(0xFFA23C31) else MaterialTheme.colorScheme.primary,
        contentColor = if (c.holding || c.finishingSpeech) Color.White else MaterialTheme.colorScheme.onPrimary,
        shape = when(c.rewards.optJSONObject("profile")?.optString("skin")) {
            "wave" -> RoundedCornerShape(topStart=28.dp,topEnd=12.dp,bottomEnd=28.dp,bottomStart=12.dp)
            "rhythm" -> RoundedCornerShape(28.dp)
            else -> RoundedCornerShape(16.dp)
        }, modifier = modifier.heightIn(min = 52.dp)
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
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
            Icon(painterResource(R.drawable.ic_mic), contentDescription = null, modifier = Modifier.size(20.dp))
            Text(when {
                c.finishingSpeech -> if (c.conversationLanguage == "he-IL") "משלים את סוף המשפט…" else "Catching the last words…"
                c.phase == "Recognizing" -> "Finishing…"
                c.phase == "Starting microphone" -> "Getting ready…"
                c.holding -> "Release to stop"
                else -> if(c.rewards.optJSONObject("profile")?.optString("skin")=="rhythm") "♪ Hold to speak" else "Hold to speak"
            }, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable private fun ConversationHeader(c: SessionController, options: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.background) {
        Column(Modifier.statusBarsPadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { c.navigate("home") }, enabled = !c.busy) {
                    Icon(painterResource(R.drawable.ic_back), contentDescription = "Back to home")
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Image(painterResource(R.drawable.fala_logo), "Fala", Modifier.size(36.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(10.dp)))
                    Text(BuildConfig.VERSION_NAME, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(c.session.optString("topic").replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(if (c.demo) "Connection test · scripted replies" else "Level ${c.session.optJSONObject("practice")?.optInt("level", 1) ?: 1} · Speaking practice", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Surface(modifier = Modifier.walkthroughTarget(4), color = MaterialTheme.colorScheme.secondaryContainer, shape = RoundedCornerShape(20.dp)) {
                    Text("${(c.completedTurns + 1).coerceAtMost(c.targetTurns)} / ${c.targetTurns}", Modifier.padding(horizontal = 10.dp, vertical = 7.dp), style = MaterialTheme.typography.labelMedium)
                }
                IconButton(onClick = { c.pause(); options() }, enabled = !c.recording) {
                    Icon(painterResource(R.drawable.ic_more), contentDescription = "Conversation options")
                }
            }
            LinearProgressIndicator(progress = { c.completedTurns.toFloat() / c.targetTurns }, modifier = Modifier.fillMaxWidth().height(3.dp))
        }
    }
}

@Composable private fun Conversation(c: SessionController) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (maxWidth >= 700.dp) {
            Row(horizontalArrangement = Arrangement.spacedBy(24.dp)) {
                Column(Modifier.weight(1.1f), verticalArrangement = Arrangement.spacedBy(12.dp)) { ConversationQuestion(c); TurnFeedback(c) }
                Column(Modifier.weight(1f)) { ConversationIdeas(c) }
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { ConversationQuestion(c); TurnFeedback(c); ConversationIdeas(c) }
        }
    }
}

@Composable private fun ConversationQuestion(c: SessionController) {
    val language = c.conversationLanguage
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            InstructorIdentity(c)
            if (c.replySupport.textVisible || c.practiceComplete) {
                Text(c.reply.optString("text"), style = MaterialTheme.typography.headlineSmall.copy(textDirection = TextDirection.Ltr), fontWeight = FontWeight.SemiBold)
                if (c.reply.optString("translation").isNotBlank()) TranslatedText(c.reply.optString("translation"), language)
            } else {
                Text("Listen, then try to answer. Replay whenever you need.")
                OutlinedButton(onClick = c::revealText) { Text("Show the words and translation") }
            }
            Row(Modifier.walkthroughTarget(0), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = { c.play(false) }, enabled = !c.busy && !c.recording && !c.retryAvailable) {
                    Icon(painterResource(R.drawable.ic_play), null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Listen")
                }
                TextButton(onClick = { c.play(true) }, enabled = !c.busy && !c.recording && !c.retryAvailable) { Text("Slower") }
                Spacer(Modifier.weight(1f))
                if (c.phase == "Speaking") TextButton(onClick = c::pause) { Text("Stop") }
            }
        }
    }
}

@Composable private fun TurnFeedback(c: SessionController) {
    c.reply.optJSONObject("turn_feedback")?.let { feedback ->
        Surface(color = MaterialTheme.colorScheme.tertiaryContainer, contentColor = MaterialTheme.colorScheme.onTertiaryContainer, shape = RoundedCornerShape(14.dp)) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TranslatedText(feedback.optString("message"), c.conversationLanguage)
                if (feedback.optString("kind") == "correction" && feedback.optString("natural").isNotBlank()) {
                    Text(feedback.getString("natural"), style = MaterialTheme.typography.bodyMedium.copy(textDirection = TextDirection.Ltr), fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable private fun ConversationIdeas(c: SessionController) {
    val ideas = c.reply.optJSONArray("suggested_replies")?.objects().orEmpty()
    val enabled = !c.busy && !c.recording && !c.retryAvailable && !c.practiceComplete
    if (c.practiceComplete) return
    if (ideas.isNotEmpty() && c.replySupport.ideasVisible) {
        OutlinedCard(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 4.dp)) {
                Row(Modifier.fillMaxWidth().walkthroughTarget(1), verticalAlignment = Alignment.CenterVertically) {
                    Text("Ideas for your reply", style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    TextButton(onClick = c::hideIdeas, enabled = enabled) { Text("Hide", style = MaterialTheme.typography.labelMedium) }
                }
                Text("Say it your way, or tap an idea to edit it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ideas.forEach { idea ->
                    HorizontalDivider(Modifier.padding(top = 8.dp))
                    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        // Keep both LTR and RTL text inside the clickable row's rounded clipping boundary.
                        TextButton(onClick = { c.chooseSuggestion(idea.getString("text")) }, enabled = enabled,
                            modifier = Modifier.weight(1f), shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(vertical = 10.dp, horizontal = 12.dp)) {
                            Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(idea.getString("text"), color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold,
                                    style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr))
                                TranslatedText(idea.optString("translation"), c.conversationLanguage)
                            }
                        }
                        PhrasePlaybackControls(idea.getString("text"), c.conversationLanguage, enabled) { slower ->
                            c.listenTo(idea.getString("text"), slower)
                        }
                    }
                }
            }
        }
    } else if (ideas.isNotEmpty()) {
        OutlinedButton(onClick = c::revealIdeas, enabled = enabled, modifier = Modifier.fillMaxWidth().walkthroughTarget(1)) { Text("Show answer ideas") }
    } else if (c.replySupport.textVisible && c.reply.optString("practice_phrase").isNotBlank()) {
        OutlinedButton(onClick = { c.chooseSuggestion(c.reply.getString("practice_phrase")) }, enabled = enabled, modifier = Modifier.walkthroughTarget(1)) { Text(c.reply.getString("practice_phrase")) }
    }
}

@Composable private fun ConversationOptions(c: SessionController, voiceSettings: () -> Unit, microphoneHelp: () -> Unit, close: () -> Unit, finish: () -> Unit) {
    AlertDialog(onDismissRequest = close, title = { Text("Conversation options") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = { c.toggleHelp(); close() }, enabled = !c.busy && !c.retryAvailable && !c.practiceComplete) {
                Text(if (c.helpMode) "Back to Portuguese" else "Help me say it in ${if (c.conversationLanguage == "he-IL") "Hebrew" else "English"} first")
            }
            c.session.optJSONObject("practice")?.optString("answer_goal")?.takeIf { it.isNotBlank() }?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Switch(c.networkRecognition, c::chooseNetworkRecognition)
                Text("Network speech recognition", Modifier.padding(start = 8.dp).weight(1f))
            }
            Text("Your phone’s online speech service may receive your audio when this is on.", style = MaterialTheme.typography.bodySmall)
            TextButton(onClick = microphoneHelp) { Text(if (c.conversationLanguage == "he-IL") "עזרת מיקרופון ושיתוף דוח תקלה" else "Microphone help & share a report") }
            TextButton(onClick = { close(); c.openWalkthrough(true) }, enabled = !c.busy && !c.recording && !c.practiceComplete) {
                Text(if (c.conversationLanguage == "he-IL") "הצגת הדרכת השיחה" else "Show conversation guide")
            }
            ReportContentAction(c)
            TextButton(onClick = voiceSettings) { Text(if (c.supportLanguage == "he-IL") "עזרת השמעה וקול פורטוגזי" else "Playback help & Portuguese voice") }
            OutlinedButton(onClick = finish, enabled = !c.busy && !c.recording) { Text("Finish and review") }
        }
    }, confirmButton = { TextButton(onClick = close) { Text("Done") } })
}

@Composable private fun ConversationComposer(c: SessionController, mic: (() -> Unit) -> Unit, microphoneHelp: () -> Unit, playbackHelp: () -> Unit) {
    val language = c.conversationLanguage
    val keyboard = LocalSoftwareKeyboardController.current
    val focus = LocalFocusManager.current
    val enabled = !c.busy && !c.recording && !c.retryAvailable && !c.practiceComplete
    Surface(shadowElevation = 8.dp, color = MaterialTheme.colorScheme.surface, contentColor = MaterialTheme.colorScheme.onSurface) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (c.error.isNotBlank()) {
                Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.errorContainer, RoundedCornerShape(12.dp)).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(c.error, Modifier.weight(1f).heightIn(max = 72.dp).verticalScroll(rememberScrollState()).padding(vertical = 10.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onErrorContainer)
                    if (c.retryAvailable) TextButton(onClick = c::retry, enabled = !c.busy) { Text("Retry") }
                }
            }
            if (c.voiceNotice.isNotBlank()) Text(c.voiceNotice, Modifier.heightIn(max = 64.dp).verticalScroll(rememberScrollState()), style = MaterialTheme.typography.bodySmall)
            if (c.voiceTrouble && c.voiceNotice.isNotBlank()) TextButton(onClick = microphoneHelp, contentPadding = PaddingValues(horizontal = 4.dp)) {
                Text(if (language == "he-IL") "עזרת מיקרופון" else "Microphone help")
            }
            if (c.playbackTrouble && c.voiceNotice.isNotBlank()) TextButton(onClick = playbackHelp, contentPadding = PaddingValues(horizontal = 4.dp)) {
                Text(if (language == "he-IL") "עזרת השמעה" else "Playback help")
            }
            if (c.busy) LinearProgressIndicator(Modifier.fillMaxWidth().height(3.dp))
            if (c.holding || c.finishingSpeech) LinearProgressIndicator(progress = { c.voiceLevel }, modifier = Modifier.fillMaxWidth().height(3.dp))
            if (!c.practiceComplete) {
                Row(Modifier.walkthroughTarget(3), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(value = if (c.recording) listOf(c.draft.text, c.partialWords).filter { it.isNotBlank() }.joinToString(" ") else c.draft.text,
                        onValueChange = c::editDraft, placeholder = { Text(if (c.helpMode) "Say it in ${if (language == "he-IL") "Hebrew" else "English"} first…" else "Your reply… speak or type", style = MaterialTheme.typography.bodyMedium) },
                        modifier = Modifier.weight(1f).semantics { contentDescription = "Your answer — check before sending" }, enabled = enabled,
                        minLines = 1, maxLines = 2, shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(disabledTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            disabledPlaceholderColor = MaterialTheme.colorScheme.onSurfaceVariant),
                        textStyle = LocalTextStyle.current.copy(textDirection = if (c.helpMode && language == "he-IL") TextDirection.Rtl else TextDirection.Ltr))
                    FilledIconButton(onClick = { keyboard?.hide(); focus.clearFocus(); c.sendDraft() }, enabled = c.draft.text.isNotBlank() && enabled,
                        modifier = Modifier.size(52.dp), shape = RoundedCornerShape(14.dp)) {
                        Icon(painterResource(R.drawable.ic_send), "Send answer", Modifier.size(22.dp))
                    }
                }
                HoldToSpeak(c, { action -> keyboard?.hide(); mic(action) }, Modifier.fillMaxWidth().walkthroughTarget(2))
            }
            Text(when {
                c.phase == "Starting microphone" -> "Wait for Listening, then speak."
                c.holding -> "Listening · keep holding while you speak."
                c.finishingSpeech -> if (language == "he-IL") "אפשר לשחרר — המיקרופון מקשיב עוד שנייה לסיום המשפט." else "You can let go — the microphone listens for one more second."
                c.phase == "Recognizing" -> "Finishing your words…"
                c.practiceComplete -> "Practice complete · preparing your summary…"
                c.busy -> c.connectionNotice.ifBlank { "Fala is preparing a reply…" }
                c.helpMode -> "Say it in your language. Fala will help with Portuguese."
                else -> "Hold, speak, release. Check your words, then send."
            }, modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
    OnlineSpeechChoice(c.supportLanguage == "he-IL", network, { network = it }, enabled = !c.busy)
    Text(if (c.supportLanguage == "he-IL") "הקראת משפטים (Listen) יכולה גם היא להשתמש בקול שדורש אינטרנט."
        else "Voice playback (Listen) can also use a voice that needs the internet.")
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

@Composable private fun AccountSettings(c: SessionController, google: GoogleSignIn, microphoneHelp: () -> Unit,
    voiceSettings: () -> Unit, onDelete: () -> Unit, onDeleteAccount: () -> Unit) {
    Title("Your Fala", c.settings.email)
    OutlinedButton(onClick = c::requestWalkthrough, enabled = !c.busy) {
        Text(if (c.supportLanguage == "he-IL") "הצגת הדרכת השיחה שוב" else "Show the conversation guide again")
    }
    RewardPreferences(c)
    SupportLanguageChoice(c)
    Text("This choice applies to new conversations.", style = MaterialTheme.typography.bodySmall)
    OnlineSpeechChoice(c.supportLanguage == "he-IL", c.networkRecognition, c::chooseNetworkRecognition, enabled = !c.busy)
    Text(if (c.supportLanguage == "he-IL") "הקראת משפטים (Listen) יכולה להשתמש באינטרנט אם אין קול מקומי מותקן."
        else "Voice playback (Listen) may use the internet if no local voice is installed.")
    TextButton(onClick = microphoneHelp) { Text(if (c.supportLanguage == "he-IL") "עזרת מיקרופון ושיתוף דוח תקלה" else "Microphone help & share a report") }
    TextButton(onClick = voiceSettings) { Text(if (c.supportLanguage == "he-IL") "עזרת השמעה וקול פורטוגזי" else "Playback help & Portuguese voice") }
    PrivacyLink()
    OutlinedButton(onClick = { c.signOut(google::clear) }, enabled = !c.busy, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
    TextButton(onClick = onDelete, enabled = !c.busy) { Text("Delete all my learning data") }
    TextButton(onClick = onDeleteAccount, enabled = !c.busy) { Text("Delete my Fala account") }
}

@Composable private fun Progress(p: JSONObject) {
    Title("More of your own words.", "Useful practice, without points or streaks.")
    val practice = p.optJSONObject("practice")
    val level = practice?.optInt("level", 1)?.coerceIn(1,5) ?: 1
    Notice("Recommended level $level · ${practiceLevels[level - 1].first}\n${practiceLevels[level - 1].second}")
    Text("Fala recommends a harder level after two complete conversations with at least six varied, clear spoken answers of the target length, without answer ideas. You can also choose a level yourself.")
    Text("Use ‘Try without answer ideas’ during a conversation. Reading suggestions and typing are useful guided practice; they don't raise the recommendation.", style = MaterialTheme.typography.bodySmall)
    if (level < 5) Text("${practice?.optInt("ready_sessions") ?: 0} of 2 qualifying conversations at this level", style = MaterialTheme.typography.labelLarge)
    Text("The path ahead", style = MaterialTheme.typography.titleMedium)
    practiceLevels.forEachIndexed { index, item -> Text("${index + 1}. ${item.first} · ${item.second}") }
    Text("These are practice goals, not CEFR grades or a promise tied to days studied. Listening without text and speaking aloud both take practice.", style = MaterialTheme.typography.bodySmall)
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

@Composable private fun Feedback(c: SessionController) {
    RewardCelebration(c)
    val f = c.feedback
    val session = c.session
    val language = c.conversationLanguage
    Text("Your conversation", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
    TranslatedText(f.optString("summary"), language)
    if (c.voiceNotice.isNotBlank()) {
        Notice(c.voiceNotice)
        TextButton(onClick = { c.navigate("settings") }) { Text("Voice settings") }
    }
    val pointers = f.optJSONArray("pointers")?.strings().orEmpty()
    if (pointers.isNotEmpty()) {
        Text("Try next time", style = MaterialTheme.typography.titleLarge)
        pointers.forEach { TranslatedText(it, language) }
    }
    f.optJSONArray("corrections")?.objects()?.forEach { correction ->
        Card {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("WHAT I SAID", style = MaterialTheme.typography.labelSmall)
                Text(correction.getString("said"))
                Text("NATURAL BRAZILIAN PORTUGUESE", style = MaterialTheme.typography.labelSmall)
                Text(correction.getString("natural"), fontWeight = FontWeight.Bold)
                TranslatedText(correction.getString("explanation"), language)
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
    val vocabulary = f.optJSONArray("vocabulary")?.objects().orEmpty().take(5)
    if (vocabulary.isNotEmpty()) {
        Text("${vocabulary.size} words to keep", style = MaterialTheme.typography.titleLarge)
        Text("A few useful words to practise again.", style = MaterialTheme.typography.bodySmall)
        vocabulary.forEach { word ->
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(word.getString("word"), fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyLarge.copy(textDirection = TextDirection.Ltr))
                        TextButton(onClick = { c.listenTo(word.getString("word")) }, enabled = !c.busy) { Text("▶ Listen") }
                    }
                    TranslatedText(word.optString("translation").ifBlank { "Translation unavailable" }, language)
                    val count = word.optInt("occurrences")
                    Text((if (word.optBoolean("seen_before")) "Seen before" else "New in your Fala history") + (if (count > 1) " · used $count times in this conversation" else ""), style = MaterialTheme.typography.labelSmall)
                }
            }
        }
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
    ReportContentAction(c, summary = true)
    Button(onClick = { c.start(false) }, enabled = !c.busy, modifier = Modifier.fillMaxWidth()) { Text("Another short conversation") }
}

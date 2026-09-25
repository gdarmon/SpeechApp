package com.fala.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.core.view.WindowCompat
import android.app.Activity
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale

private fun JSONArray.items() = (0 until length()).map { getJSONObject(it) }

@Composable fun FalaTheme(c: SessionController, content: @Composable () -> Unit) {
    val p = c.rewards.optJSONObject("profile") ?: JSONObject()
    val dark = when(p.optString("appearance")) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
    val pair = when(p.optString("theme")) {
        "beach" -> Color(0xFF006B80) to Color(0xFF97DBE5)
        "roda" -> Color(0xFF815214) to Color(0xFFEBC17E)
        "sunset" -> Color(0xFF963F40) to Color(0xFFF4B2A6)
        else -> Color(0xFF12664F) to Color(0xFFA4DFC7)
    }
    val colors = if(dark) darkColorScheme(primary=pair.second,onPrimary=Color(0xFF172A21),background=Color(0xFF14211D),surface=Color(0xFF20332B),secondaryContainer=Color(0xFF294237),onSecondaryContainer=Color(0xFFEFF5ED))
        else lightColorScheme(primary=pair.first,onPrimary=Color.White,background=Color(0xFFFFFCF5),surface=Color(0xFFFFFCF5),secondaryContainer=Color(0xFFE3EEE6),onSecondaryContainer=Color(0xFF164734))
    val view=LocalView.current
    SideEffect {
        (view.context as? Activity)?.window?.let { window ->
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !dark
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !dark
        }
    }
    val language = c.supportLanguage.ifBlank { if (Locale.getDefault().language == "he") "he-IL" else "en-US" }
    CompositionLocalProvider(LocalUiLanguage provides language,
        LocalLayoutDirection provides if (language == "he-IL") LayoutDirection.Rtl else LayoutDirection.Ltr) {
        MaterialTheme(colorScheme=colors,content=content)
    }
}

@Composable fun RewardsHome(c: SessionController) {
    val locale = Locale.forLanguageTag(LocalUiLanguage.current)
    val r=c.rewards
    if(!r.has("xp")) return
    Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp), verticalArrangement=Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            Text(tr("${r.optJSONObject("streak")?.optInt("days") ?: 0}-day streak"),fontWeight=FontWeight.Bold)
            Text(tr("${r.optInt("xp")} XP"),color=MaterialTheme.colorScheme.primary,fontWeight=FontWeight.Bold)
        }
        Row(Modifier.fillMaxWidth(),horizontalArrangement=Arrangement.SpaceBetween) {
            r.optJSONObject("streak")?.optJSONArray("calendar")?.items()?.forEach { day ->
                val done=day.optString("status")=="practised"
                Column(horizontalAlignment=Alignment.CenterHorizontally) {
                    Text(tr(if(done) "✓" else if(day.optString("status")=="protected") "◇" else "·"),
                        Modifier.background(if(done) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer,RoundedCornerShape(20.dp)).padding(horizontal=10.dp,vertical=4.dp),
                        color=if(done) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSecondaryContainer)
                    Text(tr(runCatching { LocalDate.parse(day.getString("day")).dayOfWeek.getDisplayName(TextStyle.NARROW,locale) }.getOrDefault("")),style=MaterialTheme.typography.labelSmall)
                }
            }
        }
        Text(tr(if(r.optBoolean("daily_complete")) "Daily goal complete. Nice work!" else "${r.optInt("today_replies").coerceAtMost(3)} of 3 replies for today's goal"),style=MaterialTheme.typography.bodySmall)
        if((r.optJSONObject("streak")?.optJSONArray("protected_days")?.length()?:0)>0) Text(tr("◇ Protected rest day · no points earned"),style=MaterialTheme.typography.bodySmall)
    } }
}

@Composable fun RewardCelebration(c: SessionController) {
    if(c.celebration.isBlank()) return
    val reduced=c.rewards.optJSONObject("profile")?.optBoolean("reduce_motion") == true
    var visible by remember(c.celebration) { mutableStateOf(false) }
    LaunchedEffect(c.celebration) { visible=true }
    val scale by animateFloatAsState(if(visible) 1f else .9f,animationSpec=tween(if(reduced) 0 else 450),label="Practice celebration")
    Card(Modifier.fillMaxWidth().scale(scale),colors=CardDefaults.cardColors(containerColor=MaterialTheme.colorScheme.secondaryContainer)) {
        Column(Modifier.fillMaxWidth().padding(20.dp),horizontalAlignment=Alignment.CenterHorizontally,verticalArrangement=Arrangement.spacedBy(8.dp)) {
            Text(tr(if(c.rewards.optBoolean("daily_complete")) "Daily goal complete!" else "A little more practice."),style=MaterialTheme.typography.titleLarge)
            Text(tr(c.celebration),color=MaterialTheme.colorScheme.primary,fontWeight=FontWeight.Bold)
            InstructorCelebration(c)
        }
    }
}

@Composable fun RewardsScreen(c: SessionController) {
    Text(tr("Make Fala yours."),style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.SemiBold)
    Text(tr("${c.rewards.optInt("xp")} lifetime XP · ${c.rewards.optInt("today_xp")} today"))
    Text(tr("Themes and skins unlock permanently. Your speaking level follows your independent answers."))
    InstructorCollection(c)
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    listOf("themes" to "theme", "skins" to "skin").forEach { (list,field) ->
        Text(tr(if(field=="theme") "Themes" else "Microphone skins"),style=MaterialTheme.typography.titleLarge)
        c.rewards.optJSONArray(list)?.items()?.forEach { item ->
            val chosen=c.rewards.optJSONObject("profile")?.optString(field)==item.getString("id")
            Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Text(tr(item.getString("name")),fontWeight=FontWeight.Bold)
                Text(tr(if(item.optBoolean("unlocked")) "Unlocked" else "Unlocks at ${item.optInt("xp")} XP"),style=MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement=Arrangement.spacedBy(8.dp)) {
                    if(field=="theme") TextButton(onClick={preview=item}) { Text(tr("Preview")) }
                    OutlinedButton(onClick={c.saveRewardPreferences(JSONObject().put(field,item.getString("id")))},enabled=!c.busy && item.optBoolean("unlocked") && !chosen) { Text(tr(if(chosen) "Selected" else "Use ${if(field=="theme") "theme" else "skin"}")) }
                }
            } }
        }
    }
    Text(tr("Your milestones"),style=MaterialTheme.typography.titleLarge)
    c.rewards.optJSONArray("badges")?.items()?.forEach { Text(tr("${if(it.optBoolean("earned")) "✓" else "○"} ${it.getString("name")}")) }
    Text(tr("1 XP per Portuguese reply, plus 1 XP when you speak it. Up to 20 XP per ten-answer lesson and 40 XP per day. Mistakes and answer ideas still count. Daily goals and weekly milestones celebrate practice without extra points."),style=MaterialTheme.typography.bodySmall)
    Text(tr("One missed day per Monday-based week can protect your streak. Protected days are marked ◇ and earn no points."),style=MaterialTheme.typography.bodySmall)
    preview?.let { item ->
        val color=when(item.getString("id")) {"beach"->Color(0xFF006B80);"roda"->Color(0xFF815214);"sunset"->Color(0xFF963F40);else->Color(0xFF12664F)}
        AlertDialog(onDismissRequest={preview=null},title={Text(tr("${item.getString("name")} preview"))},text={Column(verticalArrangement=Arrangement.spacedBy(12.dp)) {
            Text(tr("Olá! Vamos conversar?"),style=MaterialTheme.typography.titleLarge)
            Text(tr("Fala"),Modifier.fillMaxWidth().background(color,RoundedCornerShape(16.dp)).padding(24.dp),color=Color.White)
            Text(tr(if(item.optBoolean("unlocked")) "This look is ready to use." else "${(item.optInt("xp")-c.rewards.optInt("xp")).coerceAtLeast(0)} XP to unlock."))
        }},confirmButton={TextButton(onClick={preview=null}){Text(tr("Close"))}})
    }
}

@Composable fun RewardPreferences(c: SessionController) {
    val profile=c.rewards.optJSONObject("profile") ?: return
    val context=LocalContext.current
    var name by remember(profile.toString()) { mutableStateOf(profile.optString("nickname","Learner")) }
    var time by remember(profile.toString()) { mutableStateOf("%02d:%02d".format(Locale.ROOT,profile.optInt("reminder_minute",1020)/60,profile.optInt("reminder_minute",1020)%60)) }
    var zone by remember(profile.toString()) { mutableStateOf(profile.optString("timezone","UTC")) }
    val launcher=rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if(granted) c.saveRewardPreferences(JSONObject().put("reminder_enabled",true)) else c.report("Reminders stay off on this device. You can allow notifications in Android settings.")
    }
    Text(tr("Practice reminders and appearance"),style=MaterialTheme.typography.titleLarge)
    OutlinedTextField(name,{if(it.length<=30)name=it},label={Text(tr("Nickname for friends"))},modifier=Modifier.fillMaxWidth(),singleLine=true)
    OutlinedTextField(time,{time=it.take(5)},label={Text(tr("Reminder time · HH:mm"))},modifier=Modifier.fillMaxWidth(),singleLine=true)
    OutlinedTextField(zone,{zone=it.take(80)},label={Text(tr("Time zone"))},modifier=Modifier.fillMaxWidth(),singleLine=true)
    Text(tr("Around 17:00 in your time zone by default. Use 15-minute steps. Only if you haven’t practised today: even one Portuguese reply on any device cancels today’s reminder."),style=MaterialTheme.typography.bodySmall)
    Button(onClick={
        val match=Regex("([01][0-9]|2[0-3]):([0-5][0-9])").matchEntire(time)
        if(match==null || match.groupValues[2].toInt()%15!=0)c.report("Choose a time such as 17:00, 17:15, 17:30 or 17:45.")
        else c.saveRewardPreferences(JSONObject().put("nickname",name.trim()).put("timezone",zone.trim()).put("reminder_minute",match.groupValues[1].toInt()*60+match.groupValues[2].toInt()))
    },enabled=!c.busy){Text(tr("Save preferences"))}
    Row(verticalAlignment=Alignment.CenterVertically) {
        Switch(profile.optBoolean("reminder_enabled"),{ enabled ->
            if(enabled && Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
            else c.saveRewardPreferences(JSONObject().put("reminder_enabled",enabled))
        },enabled=!c.busy);Text(tr("Daily practice reminder"),Modifier.padding(start=10.dp))
    }
    if (profile.optBoolean("reminder_enabled") && Build.VERSION.SDK_INT>=33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
        OutlinedButton(onClick={launcher.launch(Manifest.permission.POST_NOTIFICATIONS)}) { Text(tr("Enable on this phone")) }
    }
    Text(tr("Android may delay delivery to save battery. Your chosen time is approximate."),style=MaterialTheme.typography.bodySmall)
    Row(horizontalArrangement=Arrangement.spacedBy(6.dp)) {listOf("system","light","dark").forEach { mode -> FilterChip(profile.optString("appearance","system")==mode,{c.saveRewardPreferences(JSONObject().put("appearance",mode))},enabled=!c.busy,label={Text(tr(mode.replaceFirstChar(Char::uppercase)))})}}
    Row(verticalAlignment=Alignment.CenterVertically) {Switch(profile.optBoolean("reduce_motion"),{c.saveRewardPreferences(JSONObject().put("reduce_motion",it))},enabled=!c.busy);Text(tr("Reduce celebration animations"),Modifier.padding(start=10.dp))}
    HorizontalDivider()
}

@Composable fun FriendsScreen(c: SessionController) {
    val data=c.friends
    Text(tr("Your circle."),style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.SemiBold)
    Text(tr("Practise with up to 12 friends. Share nicknames and points; your conversations stay private."))
    val circle=data.optJSONObject("circle")
    var name by remember {mutableStateOf("")};var invitation by remember {mutableStateOf("")};var confirmLeave by remember {mutableStateOf(false)}
    if(circle==null) {
        OutlinedTextField(name,{name=it.take(50)},label={Text(tr("New circle name"))},modifier=Modifier.fillMaxWidth(),singleLine=true)
        Button(onClick={c.circleAction("create",name.trim())},enabled=!c.busy && name.isNotBlank()){Text(tr("Create my circle"))}
        OutlinedTextField(invitation,{invitation=it.take(200)},label={Text(tr("Invitation code or link"))},modifier=Modifier.fillMaxWidth(),singleLine=true)
        Button(onClick={val code=invitation.trim().substringAfterLast("#join=");c.circleAction("join",code)},enabled=!c.busy && invitation.isNotBlank()){Text(tr("Join a circle"))}
    } else {
        Text(tr(circle.getString("name")),style=MaterialTheme.typography.titleLarge)
        Text(tr("This week · resets Monday · ${circle.getString("timezone")}"),style=MaterialTheme.typography.bodySmall)
        data.optJSONObject("challenge")?.let { challenge ->
            Card(Modifier.fillMaxWidth()) {Column(Modifier.padding(16.dp),verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Text(tr(challenge.getString("title")),fontWeight=FontWeight.Bold)
                LinearProgressIndicator(progress={(challenge.optInt("progress")/12f).coerceIn(0f,1f)},modifier=Modifier.fillMaxWidth())
                Text(tr("${challenge.optInt("progress")} / 12 conversations"))
            }}
        }
        data.optJSONArray("members")?.items()?.forEachIndexed { index, member ->
            Row(Modifier.fillMaxWidth().padding(vertical=12.dp),horizontalArrangement=Arrangement.SpaceBetween) {
                Text(tr("${index+1}. ${member.getString("name")}${if(member.optBoolean("self")) " (you)" else ""}"),Modifier.weight(1f))
                Text(tr("${member.optInt("xp")} XP"),fontWeight=FontWeight.Bold)
            };HorizontalDivider()
        }
        val clipboard=LocalClipboardManager.current
        val link=BuildConfig.API_BASE_URL+"/app/#join="+circle.getString("invite_code")
        Text(tr("Invitation: ${circle.getString("invite_code")}"),style=MaterialTheme.typography.bodySmall)
        OutlinedButton(onClick={clipboard.setText(AnnotatedString(link))}){Text(tr("Copy invitation link"))}
        if(circle.optBoolean("owner")) TextButton(onClick={c.circleAction("rotate")},enabled=!c.busy){Text(tr("Replace invitation"))}
        TextButton(onClick={confirmLeave=true},enabled=!c.busy){Text(tr(if(circle.optBoolean("owner")) "Close this circle" else "Leave this circle"))}
    }
    c.rewards.optJSONObject("weekly_mission")?.let { m ->Text(tr("Weekly mission"),style=MaterialTheme.typography.titleLarge);Text(tr(m.getString("title")));Text(tr("${m.optInt("progress")}/${m.optInt("target")}" + if(m.optInt("xp")>0) " · +${m.optInt("xp")} XP" else " · Practice milestone"))}
    if(confirmLeave) AlertDialog(onDismissRequest={confirmLeave=false},title={Text(tr(if(circle?.optBoolean("owner")==true) "Close the circle for everyone?" else "Leave this circle?"))},text={Text(tr("Everyone keeps their own points and rewards."))},confirmButton={TextButton(onClick={confirmLeave=false;c.circleAction("leave")}){Text(tr("Confirm"))}},dismissButton={TextButton(onClick={confirmLeave=false}){Text(tr("Cancel"))}})
}

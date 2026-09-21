package com.fala.app

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import org.json.JSONObject

internal fun instructorItems(rewards: JSONObject): List<JSONObject> {
    val items = rewards.optJSONArray("instructors") ?: return emptyList()
    return (0 until items.length()).map { items.getJSONObject(it) }
}
internal fun selectedInstructor(rewards: JSONObject) = instructorItems(rewards).firstOrNull {
    it.optString("id") == rewards.optJSONObject("profile")?.optString("instructor") && it.optBoolean("unlocked")
}
internal fun newlyUnlockedInstructors(before: JSONObject, after: JSONObject): List<String> {
    if (!before.has("instructors")) return emptyList()
    val known = instructorItems(before).filter { it.optBoolean("unlocked") }.map { it.optString("id") }.toSet()
    return instructorItems(after).filter { it.optBoolean("unlocked") && it.optInt("xp") > 0 && it.optString("id") !in known }.map { it.getString("id") }
}
internal fun capoeiraSession(session: JSONObject) = session.optBoolean("capoeira", session.optString("topic").contains("capoeira", ignoreCase = true))

@Composable private fun InstructorArt(id: String, modifier: Modifier = Modifier, portrait: Boolean = false) {
    val resource = when (id) {
        "bananera" -> R.drawable.instructor_bananera
        "bateba" -> R.drawable.instructor_bateba
        "vesoura" -> R.drawable.instructor_vesoura
        else -> return
    }
    if (portrait) Box(modifier.size(48.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondaryContainer)) {
        Image(painterResource(resource), null, Modifier.width(48.dp).wrapContentHeight(unbounded = true, align = Alignment.Top), contentScale = ContentScale.FillWidth, alignment = Alignment.TopCenter)
    } else Image(painterResource(resource), null, modifier, contentScale = ContentScale.Fit)
}

@Composable fun InstructorHome(c: SessionController) {
    if (c.practiceTopic != "capoeira class" || instructorItems(c.rewards).isEmpty()) return
    val selected = selectedInstructor(c.rewards)
    OutlinedCard(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            selected?.let { InstructorArt(it.getString("id"), portrait = true) }
            Column(Modifier.weight(1f)) {
                Text("YOUR CAPOEIRA PARTNER", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                Text(selected?.getString("name") ?: "Fala only", fontWeight = FontWeight.SemiBold)
            }
            TextButton(onClick = { c.navigate("rewards") }, enabled = !c.busy) { Text("Change") }
        }
    }
}

@Composable fun InstructorIdentity(c: SessionController) {
    val selected = if (capoeiraSession(c.session)) selectedInstructor(c.rewards) else null
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        selected?.let { InstructorArt(it.getString("id"), portrait = true) }
        Column {
            Text(if (c.phase == "Speaking") "FALA · SPEAKING" else if (selected != null) "FALA · CAPOEIRA" else "YOUR CONVERSATION PARTNER", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            selected?.let { Text(it.getString("name"), style = MaterialTheme.typography.titleMedium) }
        }
    }
}

@Composable fun InstructorCollection(c: SessionController) {
    val items = instructorItems(c.rewards)
    if (items.isEmpty()) return
    val chosen = c.rewards.optJSONObject("profile")?.optString("instructor")
    var preview by remember { mutableStateOf<JSONObject?>(null) }
    Text("Choose your capoeira partner.", style = MaterialTheme.typography.titleLarge)
    Text("Unlock a familiar face through practice, at any speaking level.")
    items.forEach { item ->
        val id = item.getString("id")
        val selected = chosen == id
        val unlocked = item.optBoolean("unlocked")
        val remaining = (item.optInt("xp") - c.rewards.optInt("xp")).coerceAtLeast(0)
        OutlinedCard(Modifier.fillMaxWidth(), border = androidx.compose.foundation.BorderStroke(if (selected) 2.dp else 1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant)) {
            Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Box(Modifier.width(96.dp).height(172.dp).semantics { contentDescription = "Preview ${item.getString("name")}" }.clickable(enabled = !c.busy) { preview = item }) {
                    InstructorArt(id, Modifier.fillMaxSize())
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(item.getString("name"), style = MaterialTheme.typography.titleLarge)
                    Text(item.optString("color"), style = MaterialTheme.typography.bodySmall)
                    Text(if (!unlocked) "${item.optInt("xp")} XP · $remaining to go" else if (item.optInt("xp") == 0) "Ready from day one" else "Unlocked through practice", style = MaterialTheme.typography.bodySmall)
                    OutlinedButton(onClick = { if (unlocked) c.saveRewardPreferences(JSONObject().put("instructor", id)) else preview = item }, enabled = !c.busy && !selected) {
                        Text(if (selected) "Selected" else if (unlocked) "Use ${item.getString("name")}" else "Preview")
                    }
                }
            }
        }
    }
    TextButton(onClick = { c.saveRewardPreferences(JSONObject().put("instructor", "none")) }, enabled = !c.busy && chosen != "none") {
        Text(if (chosen == "none") "Fala only selected" else "Use Fala without a character")
    }
    Text("Character skins share Fala’s voice and coaching. Your speaking level and lessons stay yours.", style = MaterialTheme.typography.bodySmall)
    preview?.let { item ->
        AlertDialog(onDismissRequest = { preview = null }, title = { Text(item.getString("name")) }, text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                InstructorArt(item.getString("id"), Modifier.fillMaxWidth().height(220.dp))
                Text(if (item.optBoolean("unlocked")) "Ready for your next capoeira conversation." else "${(item.optInt("xp") - c.rewards.optInt("xp")).coerceAtLeast(0)} more XP to unlock. Keep practising at your own pace.")
            }
        }, confirmButton = {
            TextButton(onClick = { preview = null; c.saveRewardPreferences(JSONObject().put("instructor", item.getString("id"))) }, enabled = !c.busy && item.optBoolean("unlocked") && chosen != item.getString("id")) { Text("Use ${item.getString("name")}") }
        }, dismissButton = { TextButton(onClick = { preview = null }) { Text("Close") } })
    }
}

@Composable fun InstructorCelebration(c: SessionController) {
    val unlocked = instructorItems(c.rewards).filter { it.optString("id") in c.unlockedInstructors }
    val selected = unlocked.lastOrNull() ?: if (capoeiraSession(c.session)) selectedInstructor(c.rewards) else null
    if (selected == null) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        InstructorArt(selected.getString("id"), Modifier.width(76.dp).height(140.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(if (unlocked.isNotEmpty()) "${unlocked.joinToString(" & ") { it.getString("name") }} unlocked" else "Boa! One conversation further.", style = MaterialTheme.typography.titleMedium)
            Text(if (unlocked.isNotEmpty()) "A new look for your next capoeira conversation." else "${selected.getString("name")} will be here for your next capoeira practice.", style = MaterialTheme.typography.bodySmall)
            if (unlocked.isNotEmpty()) TextButton(onClick = { c.navigate("rewards") }, enabled = !c.busy) { Text("Choose a partner") }
        }
    }
}

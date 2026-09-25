package com.fala.app

import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf

internal val LocalUiLanguage = staticCompositionLocalOf { "en-US" }
private val uiPatterns = hebrewUi.entries.filter { Regex("\\{\\d+\\}").containsMatchIn(it.key) }
    .sortedByDescending { it.key.replace(Regex("\\{\\d+\\}"), "").length }
    .map { (key, value) -> Regex("^" + key.split(Regex("\\{\\d+\\}")).joinToString("(.*?)") { Regex.escape(it) } + "$", RegexOption.DOT_MATCHES_ALL) to value }

internal fun uiText(value: String, language: String, depth: Int = 0): String {
    if (language != "he-IL" || value.isEmpty() || depth > 4) return value
    hebrewUi[value]?.let { return it }
    for ((pattern, translated) in uiPatterns) {
        val match = pattern.matchEntire(value) ?: continue
        return Regex("\\{(\\d+)\\}").replace(translated) { slot ->
            uiText(match.groupValues[slot.groupValues[1].toInt() + 1], language, depth + 1)
        }
    }
    if ('\n' in value) return value.split('\n').joinToString("\n") { uiText(it, language, depth + 1) }
    if (" · " in value) return value.split(" · ").joinToString(" · ") { uiText(it, language, depth + 1) }
    Regex("^(\\d+[. ]+)\\s*(.+)$", RegexOption.DOT_MATCHES_ALL).matchEntire(value)?.let {
        return it.groupValues[1] + uiText(it.groupValues[2], language, depth + 1)
    }
    Regex("^([✓○] )(.+)$", RegexOption.DOT_MATCHES_ALL).matchEntire(value)?.let {
        return it.groupValues[1] + uiText(it.groupValues[2], language, depth + 1)
    }
    return value
}

@Composable internal fun tr(value: String): String = uiText(value, LocalUiLanguage.current)

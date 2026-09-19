package com.fala.app

// Read one corrected phrase before the next question, without reading the translation.
internal fun replySpeech(text: String, feedbackKind: String, natural: String): String {
    fun words(value: String) = Regex("[\\p{L}\\p{N}]+").findAll(value.lowercase(java.util.Locale.ROOT)).map { it.value }.joinToString(" ")
    if (feedbackKind != "correction" || natural.isBlank() || (" " + words(text) + " ").contains(" " + words(natural) + " ")) return text
    return natural.trim().trimEnd('.', '!', '?') + ". " + text
}

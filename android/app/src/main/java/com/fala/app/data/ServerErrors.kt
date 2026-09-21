package com.fala.app.data

internal fun serverErrorMessage(status: Int, path: String, detail: String, code: String): String = when {
    status >= 500 -> when (code) {
        "ai_timeout" -> "The reply took too long. Tap Retry to continue your conversation."
        "ai_invalid_reply" -> "Fala couldn't prepare this reply. Tap Retry to try again."
        "ai_unavailable" -> "The conversation service is busy. Please retry shortly."
        else -> "Fala is temporarily unavailable. Please try again shortly."
    }
    status == 404 && path.startsWith("/auth/") -> "Fala sign-in is being updated. Please try again shortly."
    else -> detail.ifBlank { "Fala could not complete this request. Please retry." }.take(350)
}

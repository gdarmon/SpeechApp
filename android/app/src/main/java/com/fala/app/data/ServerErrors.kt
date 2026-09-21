package com.fala.app.data

internal fun providerRetryDelaySeconds(status: Int, code: String, seconds: Int, attempt: Int, elapsedMs: Long,
                                      path: String, method: String, hasRequestId: Boolean): Int? {
    val replaySafe = method == "POST" && ((hasRequestId && (path == "/sessions" || Regex("/sessions/[^/]+/turns").matches(path)))
        || Regex("/sessions/[^/]+/finish").matches(path))
    return seconds.takeIf { replaySafe && status == 429 && code == "ai_rate_limited" && attempt == 0
        && it in 1..30 && elapsedMs + it * 1000L < 60000 }
}

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

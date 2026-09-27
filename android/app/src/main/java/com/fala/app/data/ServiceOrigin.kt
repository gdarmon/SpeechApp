package com.fala.app.data

internal fun approvedServiceMove(saved: String, target: String): Boolean =
    (target == "https://fala-api.vercel.app" && saved in setOf(
        "https://falachatapp.netlify.app", "https://legendary-florentine-6b3c1f.netlify.app")) ||
    (target == "https://falachatapp.netlify.app" && saved == "https://legendary-florentine-6b3c1f.netlify.app")

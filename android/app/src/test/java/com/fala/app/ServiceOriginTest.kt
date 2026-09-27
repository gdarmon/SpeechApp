package com.fala.app

import com.fala.app.data.approvedServiceMove
import org.junit.Assert.*
import org.junit.Test

class ServiceOriginTest {
    @Test fun preservesOnlyApprovedAccountServiceMoves() {
        val target = "https://fala-api.vercel.app"
        assertTrue(approvedServiceMove("https://falachatapp.netlify.app", target))
        assertTrue(approvedServiceMove("https://legendary-florentine-6b3c1f.netlify.app", target))
        assertFalse(approvedServiceMove("https://foreign.invalid", target))
        assertFalse(approvedServiceMove("https://falachatapp.netlify.app", "https://foreign.invalid"))
        assertFalse(approvedServiceMove(target, "https://falachatapp.netlify.app"))
    }
}

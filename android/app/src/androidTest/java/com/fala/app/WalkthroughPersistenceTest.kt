package com.fala.app

import androidx.compose.runtime.MutableState
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class WalkthroughPersistenceTest {
    private fun account(settings: ConnectionSettings, email: String) {
        // Expired fixture: exercise account preferences without making authenticated API calls.
        settings.saveSession(JSONObject().put("token", "fala_" + "s".repeat(43))
            .put("expires_at", "2000-01-01T00:00:00Z").put("email", email))
    }
    @Suppress("UNCHECKED_CAST")
    private fun talk(c: SessionController) {
        val field = SessionController::class.java.getDeclaredField("screen\$delegate").apply { isAccessible = true }
        (field.get(c) as MutableState<String>).value = "talk"
    }
    private fun profile(c: SessionController, seen: Boolean) {
        SessionController::class.java.getDeclaredMethod("updateRewards", JSONObject::class.java).apply { isAccessible = true }
            .invoke(c, JSONObject().put("profile", JSONObject().put("walkthrough_seen", seen)))
    }
    @Test fun returningAccountRestoresMissingLocalFlagAndKeepsItAcrossRecreationAndSignOut() {
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                account(c.settings, "returning-guide@example.invalid")
                c.settings.walkthroughSeen = false
                talk(c); profile(c, true)
                assertFalse(c.openWalkthrough())
                assertTrue(ConnectionSettings(activity).walkthroughSeen)
                profile(c, false) // A stale/older response must not forget local completion.
                assertFalse(c.openWalkthrough())
            }
            scenario.recreate()
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                talk(c); assertFalse(c.openWalkthrough())
                c.settings.clearSession()
                account(c.settings, "returning-guide@example.invalid")
                assertFalse(c.openWalkthrough())
                account(c.settings, "new-guide@example.invalid")
                c.settings.walkthroughSeen = false; profile(c, false)
                assertTrue(c.openWalkthrough())
                c.closeWalkthrough(); c.settings.clearSession()
            }
        }
    }
    @Test fun manualReplayDoesNotEraseCompletionOrGetCancelledByRestoringTheAccountPreference() {
        ConnectionSettings(InstrumentationRegistry.getInstrumentation().targetContext).clearSession()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                account(c.settings, "manual-guide@example.invalid")
                talk(c); profile(c, true)
                c.requestWalkthrough()
                assertTrue(c.settings.walkthroughSeen)
                profile(c, true)
                assertTrue(c.openWalkthrough())
                c.closeWalkthrough()
                assertFalse(c.openWalkthrough())
                assertTrue(ConnectionSettings(activity).walkthroughSeen)
                c.settings.clearSession()
            }
        }
    }
}

package com.fala.app

import android.graphics.Bitmap
import android.view.accessibility.AccessibilityNodeInfo
import androidx.compose.runtime.MutableState
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Exercise the shipping dialog and per-account preference without contacting the teaching service. */
@RunWith(AndroidJUnit4::class)
class WalkthroughTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    @Suppress("UNCHECKED_CAST")
    private fun state(c: SessionController, name: String, value: Any) {
        val field = SessionController::class.java.getDeclaredField("${name}\$delegate").apply { isAccessible = true }
        (field.get(c) as MutableState<Any>).value = value
    }
    private fun find(label: String, node: AccessibilityNodeInfo? = instrumentation.uiAutomation.rootInActiveWindow): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.text?.toString() == label) return node
        for (i in 0 until node.childCount) find(label, node.getChild(i))?.let { return it }
        return null
    }
    private fun settle() { instrumentation.waitForIdleSync(); Thread.sleep(600) }
    private fun scrollForward(node: AccessibilityNodeInfo? = instrumentation.uiAutomation.rootInActiveWindow): Boolean {
        if (node == null) return false
        if (node.isScrollable && node.performAction(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD)) return true
        for (i in 0 until node.childCount) if (scrollForward(node.getChild(i))) return true
        return false
    }
    private fun reveal(label: String) {
        repeat(8) {
            if (find(label)?.isVisibleToUser == true) return
            if (!scrollForward()) return
            settle()
        }
    }
    private fun waitForLabel(label: String): AccessibilityNodeInfo {
        repeat(30) { find(label)?.let { return it }; Thread.sleep(100) }
        fun dump(node: AccessibilityNodeInfo?, depth: Int = 0) {
            if (node == null) return
            println("Tour node $depth text=${node.text} description=${node.contentDescription} class=${node.className}")
            for (i in 0 until node.childCount) dump(node.getChild(i), depth + 1)
        }
        dump(instrumentation.uiAutomation.rootInActiveWindow)
        error("Missing tutorial control: $label")
    }
    private fun click(label: String) {
        settle()
        reveal(label)
        var node = waitForLabel(label)
        while (!node.isClickable) node = requireNotNull(node.parent)
        assertTrue(node.performAction(AccessibilityNodeInfo.ACTION_CLICK))
        settle()
    }
    private fun capture(name: String) {
        settle()
        val dir = File(instrumentation.targetContext.getExternalFilesDir(null), "store-screenshots/walkthrough").apply { mkdirs() }
        val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
    }
    @Test fun guideOnlyOnceAndReplayInBothLanguages() {
        ConnectionSettings(instrumentation.targetContext).clearSession()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val reply = JSONObject("""{"text":"Você conhece a ginga?","translation":"Do you know the ginga?","suggested_replies":[{"text":"Sim, conheço.","translation":"Yes, I do."},{"text":"Ainda não.","translation":"Not yet."}]}""")
            val session = JSONObject().put("id", "tour-fixture").put("topic", "Everyday life").put("support_language", "en-US")
                .put("opening", reply).put("turns", JSONArray()).put("target_turns", 10)
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                c.settings.saveSession(JSONObject().put("token", "fala_" + "s".repeat(43)).put("expires_at", "2099-01-01T00:00:00Z").put("email", "tour@example.invalid"))
                c.settings.walkthroughSeen = false
                c.chooseNetworkRecognition(false)
                state(c, "screen", "talk"); state(c, "session", session); state(c, "reply", reply)
                assertTrue(c.openWalkthrough())
                assertTrue(ConnectionSettings(activity).walkthroughSeen)
            }
            for (step in 0..4) {
                capture("en-step-${step + 1}")
                waitForLabel("${step + 1} / 5")
                if (step == 1) { click("Back"); waitForLabel("1 / 5"); click("Next") }
                if (step == 2) {
                    scenario.onActivity { activity ->
                        assertFalse(ViewModelProvider(activity)[SessionController::class.java].networkRecognition)
                    }
                    click("Use online speech recognition")
                    scenario.onActivity { activity ->
                        val c = ViewModelProvider(activity)[SessionController::class.java]
                        assertTrue(c.networkRecognition)
                        assertTrue(ConnectionSettings(activity).networkRecognition)
                        assertFalse(c.recording) // An opt-in changes the setting; it must not begin capture.
                    }
                    capture("en-online-recognition-enabled")
                    click("Microphone help & settings")
                    waitForLabel("Microphone help")
                    capture("en-microphone-help")
                    scenario.onActivity { activity ->
                        val c = ViewModelProvider(activity)[SessionController::class.java]
                        assertFalse(c.recording) // Opening help must never open the microphone.
                        assertEquals(2, c.walkthroughStep)
                    }
                    click("Back")
                    waitForLabel("3 / 5")
                }
                click(if (step == 4) "Let’s try it" else "Next")
            }
            scenario.recreate()
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                assertNull(c.walkthroughStep)
                assertFalse(c.openWalkthrough())
                assertTrue(c.networkRecognition)
                assertEquals("", c.draft.text); assertEquals(0, c.completedTurns); assertFalse(c.recording)
                state(c, "session", JSONObject(session.toString()).put("support_language", "he-IL"))
                state(c, "reply", JSONObject(reply.toString()).put("translation", "מכירים את הג׳ינגה?")
                    .put("suggested_replies", JSONArray("""[{"text":"Sim, conheço.","translation":"כן, אני מכיר."},{"text":"Ainda não.","translation":"עדיין לא."}]""")))
                assertTrue(c.openWalkthrough(true))
            }
            for (step in 0..4) {
                capture("he-step-${step + 1}")
                if (step == 2) {
                    click("זיהוי דיבור דרך האינטרנט")
                    scenario.onActivity { activity ->
                        val c = ViewModelProvider(activity)[SessionController::class.java]
                        assertFalse(c.networkRecognition)
                        assertFalse(ConnectionSettings(activity).networkRecognition)
                        assertFalse(c.recording)
                    }
                    capture("he-online-recognition-disabled")
                }
                if (step < 4) click("הבא") else click("דלגו על ההדרכה")
            }
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                assertNull(c.walkthroughStep); assertFalse(c.openWalkthrough())
                // Signing out must retain this account's choice; another account gets its own guide.
                val settings = c.settings
                settings.clearSession()
                fun signIn(email: String) = settings.saveSession(JSONObject().put("token", "fala_" + "s".repeat(43)).put("expires_at", "2099-01-01T00:00:00Z").put("email", email))
                signIn("other@example.invalid"); assertFalse(settings.walkthroughSeen)
                signIn("tour@example.invalid"); assertTrue(settings.walkthroughSeen)
                settings.clearSession()
            }
        }
    }
}

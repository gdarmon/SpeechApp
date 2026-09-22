package com.fala.app

import android.graphics.Bitmap
import androidx.compose.runtime.MutableState
import androidx.lifecycle.ViewModelProvider
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.fala.app.data.ConnectionSettings
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Capture the shipping Compose UI with synthetic examples, never real learner records. */
@RunWith(AndroidJUnit4::class)
class StoreScreenshots {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    @Suppress("UNCHECKED_CAST")
    private fun state(controller: SessionController, name: String, value: Any) {
        val field = SessionController::class.java.getDeclaredField("${name}\$delegate")
        field.isAccessible = true
        (field.get(controller) as MutableState<Any>).value = value
    }
    private fun capture(name: String) {
        instrumentation.waitForIdleSync()
        Thread.sleep(1100) // Allow Compose layout and fonts to settle on the emulator.
        val directory = File(instrumentation.targetContext.getExternalFilesDir(null), "store-screenshots")
        directory.mkdirs()
        val bitmap = requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        File(directory, "$name.jpg").outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 95, it) }
        bitmap.recycle()
    }
    private fun scrollToHeading(label: String) {
        fun find(node: android.view.accessibility.AccessibilityNodeInfo?): android.graphics.Rect? {
            if (node == null) return null
            if (node.text?.toString() == label) return android.graphics.Rect().also { node.getBoundsInScreen(it) }
            for (i in 0 until node.childCount) find(node.getChild(i))?.let { return it }
            return null
        }
        var found=false
        repeat(6) {
            instrumentation.waitForIdleSync(); Thread.sleep(300)
            val bitmap=requireNotNull(instrumentation.uiAutomation.takeScreenshot())
            val width=bitmap.width;val height=bitmap.height;bitmap.recycle()
            val heading=find(instrumentation.uiAutomation.rootInActiveWindow)
            found = found || heading != null
            val delta=heading?.let { it.top-(height*.10).toInt() } ?: (height*.38).toInt()
            if (kotlin.math.abs(delta)<35) return
            val start=(height*.78).toInt()
            val end=(start-delta).coerceIn((height*.12).toInt(),(height*.88).toInt())
            android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand("input swipe ${width/2} $start ${width/2} $end 1400")).use { it.readBytes() }
            Thread.sleep(300)
        }
        check(found) { "Could not frame store screenshot heading: $label" }
    }
    private fun scrollReview() {
        instrumentation.waitForIdleSync(); Thread.sleep(400)
        val bitmap=requireNotNull(instrumentation.uiAutomation.takeScreenshot())
        val x=bitmap.width/2;val start=(bitmap.height*.76).toInt();val end=(bitmap.height*.28).toInt();bitmap.recycle()
        android.os.ParcelFileDescriptor.AutoCloseInputStream(instrumentation.uiAutomation.executeShellCommand("input swipe $x $start $x $end 450")).use { it.readBytes() }
        Thread.sleep(800)
    }
    @Test fun captureNativeScreens() {
        ConnectionSettings(instrumentation.targetContext).clearSession()
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            val rewards = JSONObject(instrumentation.context.assets.open("rewards.json").bufferedReader().readText())
            val opening = JSONObject("""{"text":"Você conhece a ginga?","translation":"Do you know the ginga?","suggested_replies":[{"text":"Sim, conheço a ginga.","translation":"Yes, I know the ginga."},{"text":"Ainda estou aprendendo. Pode repetir mais devagar?","translation":"I am still learning. Can you repeat more slowly?"}]}""")
            val session = JSONObject().put("id","store-sample").put("topic","Capoeira class").put("kind","conversation").put("capoeira",true).put("support_language","en-US").put("target_turns",10).put("opening",opening).put("turns",JSONArray()).put("practice",JSONObject().put("level",1))
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                // This non-server credential only unlocks UI rendering inside the instrumentation APK.
                // It is never accepted by the real backend; no release sign-in path is changed.
                c.settings.saveSession(JSONObject().put("token","fala_"+"s".repeat(43)).put("expires_at","2099-01-01T00:00:00Z").put("email","learner@example.invalid"))
                c.settings.consent=true;c.settings.supportLanguage="en-US"
                state(c,"supportLanguage","en-US");state(c,"rewards",rewards);state(c,"session",session);state(c,"reply",opening)
                state(c,"progress",JSONObject("""{"practice":{"level":1,"title":"First phrases","goal":"Answer one short question at a time."}}"""))
                state(c,"screen","talk");state(c,"phase","Your turn")
            }
            capture("01-capoeira-conversation")
            scenario.onActivity { activity ->
                val c=ViewModelProvider(activity)[SessionController::class.java]
                val reply=JSONObject("""{"text":"Qual movimento da aula você prefere?","translation":"איזו תנועה מהשיעור אתה מעדיף?","suggested_replies":[{"text":"Rasteira","translation":"רסטיירה"},{"text":"Banda","translation":"באנדה"}]}""")
                state(c,"session",JSONObject(session.toString()).put("support_language","he-IL").put("topic","Capoeira class").put("capoeira",false).put("opening",reply));state(c,"reply",reply)
            }
            capture("02-hebrew-support")
            scenario.onActivity { activity ->
                val c = ViewModelProvider(activity)[SessionController::class.java]
                val dark = JSONObject(c.rewards.toString())
                dark.getJSONObject("profile").put("appearance", "dark")
                state(c, "rewards", dark)
            }
            capture("02b-dark-reply-and-playback")
            scenario.onActivity { activity -> state(ViewModelProvider(activity)[SessionController::class.java], "rewards", rewards) }
            scenario.onActivity { activity -> state(ViewModelProvider(activity)[SessionController::class.java],"screen","home") }
            capture("03-practice-at-your-level")
            scenario.onActivity { activity -> state(ViewModelProvider(activity)[SessionController::class.java],"screen","rewards") }
            scrollToHeading("Choose your capoeira partner.")
            capture("04-unlock-partners")
            scenario.onActivity { activity ->
                val c=ViewModelProvider(activity)[SessionController::class.java]
                state(c,"session",session)
                state(c,"feedback",JSONObject("""{"summary":"You asked about the ginga and followed a simple class instruction.","pointers":["Next time, try one answer without reading the suggestion."],"corrections":[],"vocabulary":[{"word":"ginga","translation":"capoeira's basic movement","occurrences":3},{"word":"devagar","translation":"slowly","occurrences":2},{"word":"aprender","translation":"to learn","occurrences":1},{"word":"de novo","translation":"again","occurrences":2}]}"""))
                state(c,"screen","feedback")
            }
            scrollReview()
            capture("05-words-to-keep")
            File(instrumentation.targetContext.getExternalFilesDir(null), "store-screenshots/capture.json").writeText(JSONObject()
                .put("version",BuildConfig.VERSION_NAME).put("source","Native Android Compose UI on emulator")
                .put("data","Fictional demonstration examples, not a real learner account").toString(2))
            scenario.onActivity { activity -> ViewModelProvider(activity)[SessionController::class.java].settings.clearSession() }
        }
    }
}

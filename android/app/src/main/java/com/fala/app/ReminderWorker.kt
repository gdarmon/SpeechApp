package com.fala.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.*
import com.fala.app.data.ConnectionSettings
import com.fala.app.data.SessionApi
import com.fala.app.data.ServerFailure
import org.json.JSONObject
import java.time.Duration
import java.time.ZonedDateTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

internal fun reminderDelay(now: ZonedDateTime, minute: Int, tomorrow: Boolean): Long {
    var target = now.toLocalDate().atStartOfDay(now.zone).withHour(minute / 60).withMinute(minute % 60)
    if (tomorrow || now >= target.plusMinutes(60)) target = now.toLocalDate().plusDays(1).atStartOfDay(now.zone).withHour(minute / 60).withMinute(minute % 60)
    return Duration.between(now, target).toMillis().coerceAtLeast(30_000)
}

object ReminderScheduler {
    private const val NAME = "fala-daily-practice"
    fun cancel(context: Context) { WorkManager.getInstance(context).cancelUniqueWork(NAME) }
    fun schedule(context: Context, profile: JSONObject, following: Boolean = false) {
        if (!profile.optBoolean("reminder_enabled")) { if (!following) cancel(context); return }
        val zone = runCatching { ZoneId.of(profile.optString("timezone", "UTC")) }.getOrDefault(ZoneId.of("UTC"))
        val delay = reminderDelay(ZonedDateTime.now(zone), profile.optInt("reminder_minute", 1020).coerceIn(0,1439), following)
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES).build()
        WorkManager.getInstance(context).enqueueUniqueWork(NAME,
            if (following) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.REPLACE, request)
    }
}

class ReminderWorker(context: Context, parameters: WorkerParameters) : CoroutineWorker(context, parameters) {
    override suspend fun doWork(): Result {
        val settings = ConnectionSettings(applicationContext)
        if (!settings.signedIn) return Result.success()
        val api = SessionApi(settings)
        return try {
            val profile = api.get("/rewards").getJSONObject("profile")
            if (profile.optBoolean("reminder_enabled") && NotificationManagerCompat.from(applicationContext).areNotificationsEnabled()) {
                val reminder = api.post("/rewards/reminder")
                if (reminder.optBoolean("notify")) {
                    val manager = applicationContext.getSystemService(NotificationManager::class.java)
                    manager.createNotificationChannel(NotificationChannel("practice", "Practice reminders", NotificationManager.IMPORTANCE_DEFAULT))
                    val intent = PendingIntent.getActivity(applicationContext, 0,
                        Intent(applicationContext, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    val notification = NotificationCompat.Builder(applicationContext, "practice")
                        .setSmallIcon(R.drawable.ic_mic).setContentTitle(reminder.getString("title"))
                        .setContentText(reminder.getString("body")).setStyle(NotificationCompat.BigTextStyle().bigText(reminder.getString("body")))
                        .setContentIntent(intent).setAutoCancel(true).setOnlyAlertOnce(true).build()
                    try { manager.notify(1700, notification) } catch (_: SecurityException) { /* Permission may change during the request. */ }
                }
            }
            ReminderScheduler.schedule(applicationContext, profile, following = true)
            Result.success()
        } catch (error: Exception) {
            if (error is kotlinx.coroutines.CancellationException) throw error
            if (error is ServerFailure && error.status == 401) Result.success()
            else if (runAttemptCount < 3) Result.retry()
            else { runCatching { ReminderScheduler.schedule(applicationContext, JSONObject(settings.rewardProfile), following = true) }; Result.success() }
        }
    }
}

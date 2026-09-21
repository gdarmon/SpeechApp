package com.fala.app.data

import com.fala.app.BuildConfig
import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.URI
import java.util.concurrent.TimeUnit

class ServerFailure(val status: Int, message: String) : Exception(message)

class SessionApi(private val settings: ConnectionSettings, private val onWait: (Int) -> Unit = {}) {
    private val client = OkHttpClient.Builder()
        .callTimeout(55, TimeUnit.SECONDS).connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build()

    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        val uri = runCatching { URI(settings.url) }.getOrNull()
        require(uri?.host != null && (uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http"))) {
            "Fala cannot connect right now. Please try again later."
        }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "Fala cannot connect right now. Please try again later." }
        val payload = if (method == "POST") (body ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()) else null
        val request = Request.Builder().url(settings.url + path)
            .apply { if (settings.token.isNotBlank()) header("Authorization", "Bearer ${settings.token}") }.method(method, payload).build()
        try {
            val started = SystemClock.elapsedRealtime()
            for (attempt in 0..1) {
                var waitSeconds = 0
                val call = client.newCall(request)
                call.timeout().timeout((90000L - (SystemClock.elapsedRealtime() - started)).coerceIn(1, 55000), TimeUnit.MILLISECONDS)
                call.execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    if (response.isSuccessful) return@withContext raw
                    val error = runCatching { JSONObject(raw) }.getOrNull()
                    val retry = providerRetryDelaySeconds(response.code, error?.optString("code").orEmpty(),
                        error?.optInt("retry_after_seconds", -1) ?: -1, attempt, SystemClock.elapsedRealtime() - started,
                        path, method, !body?.optString("request_id").isNullOrBlank())
                    if (retry != null) waitSeconds = retry else {
                        val message = serverErrorMessage(response.code, path, error?.optString("detail").orEmpty(), error?.optString("code").orEmpty())
                        throw ServerFailure(response.code, message)
                    }
                }
                withContext(Dispatchers.Main) { onWait(waitSeconds) }
                delay(waitSeconds * 1000L + 250)
                withContext(Dispatchers.Main) { onWait(0) }
            }
            throw IOException("Request interrupted")
        } catch (_: IOException) {
            throw IOException("Connection interrupted. Check your internet connection and retry.")
        }
    }

    suspend fun get(path: String) = JSONObject(request(path))
    suspend fun list(path: String) = JSONArray(request(path))
    suspend fun post(path: String, body: JSONObject = JSONObject()) = JSONObject(request(path, "POST", body))
    suspend fun delete(path: String) { request(path, "DELETE") }
}

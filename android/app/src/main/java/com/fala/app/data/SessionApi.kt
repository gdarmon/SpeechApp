package com.fala.app.data

import com.fala.app.BuildConfig
import kotlinx.coroutines.Dispatchers
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

class SessionApi(private val settings: ConnectionSettings) {
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
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val detail = runCatching { JSONObject(raw).optString("detail") }.getOrDefault("")
                    val message = when {
                        response.code >= 500 -> "Fala is temporarily unavailable. Please try again shortly."
                        response.code == 404 && path.startsWith("/auth/") -> "Fala sign-in is being updated. Please try again shortly."
                        else -> detail.ifBlank { "Fala could not complete this request. Please retry." }.take(350)
                    }
                    throw ServerFailure(response.code, message)
                }
                raw
            }
        } catch (_: IOException) {
            throw IOException("Connection interrupted. Check your internet connection and retry.")
        }
    }

    suspend fun get(path: String) = JSONObject(request(path))
    suspend fun list(path: String) = JSONArray(request(path))
    suspend fun post(path: String, body: JSONObject = JSONObject()) = JSONObject(request(path, "POST", body))
    suspend fun delete(path: String) { request(path, "DELETE") }
}

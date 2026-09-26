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
        .callTimeout(20, TimeUnit.SECONDS).connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS).retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build()

    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): String {
        // Bind a background preference sync to the account that started it.
        val token = settings.token
        return withContext(Dispatchers.IO) {
        val uri = runCatching { URI(settings.url) }.getOrNull()
        require(uri?.host != null && (uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http"))) {
            "Fala cannot connect right now. Please try again later."
        }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "Fala cannot connect right now. Please try again later." }
        val payload = if (method == "POST") (body ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()) else null
        val request = Request.Builder().url(settings.url + path)
            .apply { if (token.isNotBlank()) header("Authorization", "Bearer $token") }.method(method, payload).build()
        try {
            // Failover is server-owned. An explicit Retry reuses the pending
            // request ID; this transport never adds a quota countdown.
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (response.isSuccessful) return@withContext raw
                val error = runCatching { JSONObject(raw) }.getOrNull()
                throw ServerFailure(response.code, serverErrorMessage(response.code, path,
                    error?.optString("detail").orEmpty(), error?.optString("code").orEmpty()))
            }
        } catch (_: IOException) {
            throw IOException("Connection interrupted. Check your internet connection and retry.")
        }
        }
    }

    suspend fun get(path: String) = JSONObject(request(path))
    suspend fun list(path: String) = JSONArray(request(path))
    suspend fun post(path: String, body: JSONObject = JSONObject()) = JSONObject(request(path, "POST", body))
    suspend fun delete(path: String) { request(path, "DELETE") }
}

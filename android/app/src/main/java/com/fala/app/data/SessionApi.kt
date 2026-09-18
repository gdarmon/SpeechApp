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

class ServerFailure(message: String) : Exception(message)

class SessionApi(private val settings: ConnectionSettings) {
    private val client = OkHttpClient.Builder()
        .callTimeout(55, TimeUnit.SECONDS).connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS).retryOnConnectionFailure(false).build()

    suspend fun request(path: String, method: String = "GET", body: JSONObject? = null): String = withContext(Dispatchers.IO) {
        val uri = runCatching { URI(settings.url) }.getOrNull()
        require(uri?.host != null && (uri.scheme == "https" || (BuildConfig.DEBUG && uri.scheme == "http"))) {
            "Enter a valid HTTPS server address. Local HTTP is available in debug builds."
        }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "Use a plain server address without credentials or a query." }
        val payload = if (method == "POST") (body ?: JSONObject()).toString().toRequestBody("application/json".toMediaType()) else null
        val request = Request.Builder().url(settings.url + path)
            .header("Authorization", "Bearer ${settings.token}").method(method, payload).build()
        try {
            client.newCall(request).execute().use { response ->
                val raw = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val detail = runCatching { JSONObject(raw).optString("detail") }.getOrDefault("")
                    throw ServerFailure(detail.ifBlank { "Server request failed (${response.code}). Please retry." }.take(350))
                }
                raw
            }
        } catch (_: IOException) {
            throw IOException("Connection interrupted. Check your server connection and retry.")
        }
    }

    suspend fun get(path: String) = JSONObject(request(path))
    suspend fun list(path: String) = JSONArray(request(path))
    suspend fun post(path: String, body: JSONObject = JSONObject()) = JSONObject(request(path, "POST", body))
    suspend fun delete(path: String) { request(path, "DELETE") }
}

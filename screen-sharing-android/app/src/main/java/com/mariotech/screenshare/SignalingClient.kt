package com.mariotech.screenshare

import android.util.Log
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.sse.EventSource
import okhttp3.sse.EventSourceListener
import okhttp3.sse.EventSources
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * SSE (receive) + POST (send) signaling, mirroring the web client so the same
 * Vercel endpoints work for the Android host. WebRTC signaling is a short
 * handshake, so polling-style SSE is plenty.
 */
class SignalingClient(
    private val baseUrl: String,
    private val code: String,
    private val role: String, // "host"
    val onReady: () -> Unit,
    val onMessage: (type: String, from: String?, data: JSONObject?) -> Unit,
) {
    val peerId: String = UUID.randomUUID().toString()

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS) // SSE stays open
        .build()

    private var source: EventSource? = null
    @Volatile private var closed = false

    fun connect() {
        closed = false
        openStream()
    }

    private fun openStream() {
        if (closed) return
        val url = "${baseUrl.trimEnd('/')}/api/signal/$code?peerId=$peerId&role=$role"
        val request = Request.Builder().url(url).build()

        source = EventSources.createFactory(client).newEventSource(
            request,
            object : EventSourceListener() {
                override fun onEvent(
                    eventSource: EventSource,
                    id: String?,
                    type: String?,
                    data: String,
                ) {
                    if (type == "ready") {
                        send("${role}:join")
                        onReady()
                        return
                    }
                    try {
                        val obj = JSONObject(data)
                        val msgType = obj.optString("type")
                        val from = if (obj.isNull("from")) null else obj.optString("from")
                        val payload = obj.optJSONObject("data")
                        onMessage(msgType, from, payload)
                    } catch (e: Exception) {
                        Log.w(TAG, "bad SSE frame", e)
                    }
                }

                override fun onFailure(
                    eventSource: EventSource,
                    t: Throwable?,
                    response: okhttp3.Response?,
                ) {
                    eventSource.cancel()
                    if (!closed) {
                        // Vercel closes the function after ~25s; reopen like the web client.
                        Thread.sleep(1000)
                        openStream()
                    }
                }
            },
        )
    }

    /** Send a signaling message; `data` may be null. */
    fun send(type: String, to: String? = null, data: JSONObject? = null) {
        if (closed && type != "leave") return
        val body = JSONObject().apply {
            put("type", type)
            put("from", peerId)
            put("role", role)
            if (to != null) put("to", to)
            if (data != null) put("data", data)
        }
        val request = Request.Builder()
            .url("${baseUrl.trimEnd('/')}/api/signal/$code")
            .post(body.toString().toRequestBody(JSON))
            .build()
        client.newCall(request).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                Log.w(TAG, "send $type failed", e)
            }
            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                response.close()
            }
        })
    }

    fun close() {
        if (closed) return
        closed = true
        send("leave")
        source?.cancel()
        source = null
    }

    companion object {
        private const val TAG = "SignalingClient"
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

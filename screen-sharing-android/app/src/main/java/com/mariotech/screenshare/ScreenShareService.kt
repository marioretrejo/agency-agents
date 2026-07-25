package com.mariotech.screenshare

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import org.json.JSONObject

/**
 * Foreground service that owns the screen capture + WebRTC streaming for the
 * whole session. Runs as a mediaProjection foreground service (required on
 * Android 10+, and must be started before MediaProjection is acquired on 14+).
 */
class ScreenShareService : Service() {

    private var signaling: SignalingClient? = null
    private var host: WebRtcHost? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) return START_NOT_STICKY

        when (intent.action) {
            ACTION_STOP -> {
                stopEverything()
                return START_NOT_STICKY
            }
        }

        val resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        val permissionData = intent.getParcelableExtra<Intent>(EXTRA_RESULT_DATA)
        val code = intent.getStringExtra(EXTRA_CODE)
        if (resultCode == 0 || permissionData == null || code.isNullOrBlank()) {
            Log.e(TAG, "missing start extras")
            stopSelf()
            return START_NOT_STICKY
        }

        startAsForeground()
        startSession(code, permissionData)
        return START_NOT_STICKY
    }

    private fun startAsForeground() {
        val channelId = "screen_share"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Screen sharing", NotificationManager.IMPORTANCE_LOW),
            )
        }
        val notification: Notification = Notification.Builder(this, channelId)
            .setContentTitle("Sharing your screen")
            .setContentText("Your screen is being shared. Tap Stop in the app to end.")
            .setSmallIcon(android.R.drawable.ic_menu_share)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startSession(code: String, permissionData: Intent) {
        val (w, h) = screenSize()

        val webrtc = WebRtcHost(
            appContext = applicationContext,
            screenWidth = w,
            screenHeight = h,
            onViewerCountChanged = { count -> Log.i(TAG, "viewers: $count") },
        )

        val client = SignalingClient(
            baseUrl = BuildConfig.SIGNALING_SERVER,
            code = code,
            role = "host",
            onReady = { Log.i(TAG, "signaling ready, hosting room $code") },
            onMessage = { type, from, data -> dispatch(webrtc, type, from, data) },
        )
        webrtc.attachSignaling(client)

        this.signaling = client
        this.host = webrtc

        webrtc.start(permissionData)
        client.connect()
    }

    private fun dispatch(webrtc: WebRtcHost, type: String, from: String?, data: JSONObject?) {
        when (type) {
            "viewer:connected" -> from?.let { webrtc.onViewerConnected(it) }
            "viewer:disconnected" -> from?.let { webrtc.onViewerDisconnected(it) }
            "webrtc:answer" -> if (from != null && data != null) {
                webrtc.onAnswer(from, data.optString("sdp"))
            }
            "webrtc:ice-candidate" -> if (from != null && data != null) {
                webrtc.onRemoteIce(from, data)
            }
        }
    }

    private fun screenSize(): Pair<Int, Int> {
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        return metrics.widthPixels to metrics.heightPixels
    }

    private fun stopEverything() {
        host?.stop()
        signaling?.close()
        host = null
        signaling = null
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        stopSelf()
    }

    override fun onDestroy() {
        stopEverything()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "ScreenShareService"
        private const val NOTIFICATION_ID = 1001
        const val ACTION_STOP = "com.mariotech.screenshare.STOP"
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val EXTRA_CODE = "room_code"
    }
}

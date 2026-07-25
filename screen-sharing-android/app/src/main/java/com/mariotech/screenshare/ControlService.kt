package com.mariotech.screenshare

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import kotlin.math.max

/**
 * Injects remote-control input as accessibility gestures. This is the only
 * supported way for a non-privileged app to drive touch input on stock Android,
 * and it requires the user to enable the service once in Settings.
 *
 * Coordinates arrive normalized [0,1] from the viewer and are scaled to pixels.
 * Taps and scroll (swipe) are supported; arbitrary keyboard input is not
 * available through stock accessibility.
 */
class ControlService : AccessibilityService() {

    private var screenW = 1080
    private var screenH = 1920

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        refreshMetrics()
        Log.i(TAG, "accessibility control service connected")
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {}
    override fun onInterrupt() {}

    private fun refreshMetrics() {
        try {
            val wm = getSystemService(WINDOW_SERVICE) as WindowManager
            val metrics = DisplayMetrics()
            @Suppress("DEPRECATION")
            wm.defaultDisplay.getRealMetrics(metrics)
            screenW = max(1, metrics.widthPixels)
            screenH = max(1, metrics.heightPixels)
        } catch (e: Exception) {
            Log.w(TAG, "metrics failed", e)
        }
    }

    private fun px(nx: Double, ny: Double): Pair<Float, Float> {
        val x = (nx.coerceIn(0.0, 1.0) * screenW).toFloat()
        val y = (ny.coerceIn(0.0, 1.0) * screenH).toFloat()
        return x to y
    }

    fun tap(nx: Double, ny: Double) {
        val (x, y) = px(nx, ny)
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
            .build()
        dispatchGesture(gesture, null, null)
    }

    /** Wheel deltas (pixels) → a short swipe from screen center. */
    fun scroll(dx: Double, dy: Double) {
        val cx = screenW / 2f
        val cy = screenH / 2f
        // Content scrolls opposite to the finger, matching wheel direction.
        val endX = (cx - dx).toFloat().coerceIn(0f, screenW.toFloat())
        val endY = (cy - dy).toFloat().coerceIn(0f, screenH.toFloat())
        val path = Path().apply {
            moveTo(cx, cy)
            lineTo(endX, endY)
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 120))
            .build()
        dispatchGesture(gesture, null, null)
    }

    companion object {
        private const val TAG = "ControlService"

        /** Set while the accessibility service is enabled; null otherwise. */
        @Volatile
        var instance: ControlService? = null
            private set
    }
}

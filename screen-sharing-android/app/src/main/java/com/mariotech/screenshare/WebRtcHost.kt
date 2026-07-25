package com.mariotech.screenshare

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import android.util.Log
import org.json.JSONObject
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoSource
import org.webrtc.VideoTrack
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap

/**
 * WebRTC "host" for Android: captures the screen via MediaProjection and sends
 * it to each connected viewer, and receives control messages over a data
 * channel which it forwards to the ControlService for injection.
 *
 * Mirrors the desktop host's protocol so it interoperates with the same viewer.
 */
class WebRtcHost(
    private val appContext: Context,
    private val screenWidth: Int,
    private val screenHeight: Int,
    private val onViewerCountChanged: (Int) -> Unit,
) {
    // Set once, immediately after construction, to break the host<->signaling
    // construction cycle (signaling's message callback needs the host).
    private lateinit var signaling: SignalingClient
    fun attachSignaling(client: SignalingClient) {
        signaling = client
    }

    private val eglBase: EglBase = EglBase.create()
    private lateinit var factory: PeerConnectionFactory
    private var capturer: ScreenCapturerAndroid? = null
    private var videoSource: VideoSource? = null
    private var videoTrack: VideoTrack? = null

    private val peers = ConcurrentHashMap<String, PeerHolder>()

    private class PeerHolder(
        val pc: PeerConnection,
        var channel: DataChannel?,
        @Volatile var granted: Boolean = false,
    )

    private val iceServers = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
    )

    fun start(permissionData: Intent) {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext)
                .createInitializationOptions(),
        )
        val encoder = DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true)
        val decoder = DefaultVideoDecoderFactory(eglBase.eglBaseContext)
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(encoder)
            .setVideoDecoderFactory(decoder)
            .createPeerConnectionFactory()

        val helper = SurfaceTextureHelper.create("CaptureThread", eglBase.eglBaseContext)
        // ScreenCapturerAndroid takes the raw permission Intent and drives the
        // provided MediaProjection.Callback on stop.
        capturer = ScreenCapturerAndroid(permissionData, object : MediaProjection.Callback() {
            override fun onStop() {
                Log.i(TAG, "MediaProjection stopped by system/user")
            }
        })
        videoSource = factory.createVideoSource(true /* isScreencast */)
        capturer!!.initialize(helper, appContext, videoSource!!.capturerObserver)
        capturer!!.startCapture(screenWidth, screenHeight, 30)
        videoTrack = factory.createVideoTrack("screen0", videoSource)

        Log.i(TAG, "capture started ${screenWidth}x$screenHeight")
    }

    // --- signaling entry points (called from the service) ---

    fun onViewerConnected(viewerId: String) {
        if (peers.containsKey(viewerId)) {
            val state = peers[viewerId]?.pc?.connectionState()
            if (state != PeerConnection.PeerConnectionState.FAILED &&
                state != PeerConnection.PeerConnectionState.CLOSED
            ) return
        }
        connectViewer(viewerId)
    }

    fun onViewerDisconnected(viewerId: String) = closePeer(viewerId)

    fun onAnswer(from: String, sdp: String) {
        val holder = peers[from] ?: return
        holder.pc.setRemoteDescription(
            SimpleSdpObserver("setRemote[$from]"),
            SessionDescription(SessionDescription.Type.ANSWER, sdp),
        )
    }

    fun onRemoteIce(from: String, data: JSONObject) {
        val holder = peers[from] ?: return
        val candidate = IceCandidate(
            data.optString("sdpMid"),
            data.optInt("sdpMLineIndex"),
            data.optString("candidate"),
        )
        holder.pc.addIceCandidate(candidate)
    }

    private fun connectViewer(viewerId: String) {
        closePeer(viewerId)
        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }

        val observer = object : PcObserverAdapter() {
            override fun onIceCandidate(candidate: IceCandidate) {
                val data = JSONObject().apply {
                    put("candidate", candidate.sdp)
                    put("sdpMid", candidate.sdpMid)
                    put("sdpMLineIndex", candidate.sdpMLineIndex)
                }
                signaling.send("webrtc:ice-candidate", viewerId, data)
            }

            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                Log.i(TAG, "peer $viewerId: $newState")
                if (newState == PeerConnection.PeerConnectionState.FAILED ||
                    newState == PeerConnection.PeerConnectionState.CLOSED
                ) closePeer(viewerId)
            }
        }

        val pc = factory.createPeerConnection(config, observer) ?: return
        val holder = PeerHolder(pc, null)
        peers[viewerId] = holder
        onViewerCountChanged(peers.size)

        // Host creates the control channel; the viewer receives it.
        val channel = pc.createDataChannel("control", DataChannel.Init())
        holder.channel = channel
        channel.registerObserver(ControlChannelObserver(holder))

        videoTrack?.let { pc.addTrack(it, listOf("stream0")) }

        val constraints = MediaConstraints()
        pc.createOffer(object : SimpleSdpObserver("createOffer[$viewerId]") {
            override fun onCreateSuccess(desc: SessionDescription) {
                pc.setLocalDescription(SimpleSdpObserver("setLocal[$viewerId]"), desc)
                val data = JSONObject().apply {
                    put("type", "offer")
                    put("sdp", desc.description)
                }
                signaling.send("webrtc:offer", viewerId, data)
            }
        }, constraints)
    }

    private inner class ControlChannelObserver(private val holder: PeerHolder) :
        DataChannel.Observer {
        override fun onBufferedAmountChange(previousAmount: Long) {}
        override fun onStateChange() {}
        override fun onMessage(buffer: DataChannel.Buffer) {
            val bytes = ByteArray(buffer.data.remaining())
            buffer.data.get(bytes)
            val text = String(bytes, StandardCharsets.UTF_8)
            val msg = try { JSONObject(text) } catch (e: Exception) { return }
            handleControl(holder, msg)
        }
    }

    private fun handleControl(holder: PeerHolder, msg: JSONObject) {
        when (msg.optString("t")) {
            "request" -> {
                val control = ControlService.instance
                if (control != null) {
                    holder.granted = true
                    sendControl(holder, JSONObject().put("t", "granted"))
                } else {
                    sendControl(
                        holder,
                        JSONObject().put("t", "denied")
                            .put("reason", "Enable the accessibility service on the phone to allow control"),
                    )
                }
            }
            "mouse-button" -> {
                if (holder.granted && msg.optBoolean("down")) {
                    ControlService.instance?.tap(msg.optDouble("x"), msg.optDouble("y"))
                }
            }
            "scroll" -> {
                if (holder.granted) {
                    ControlService.instance?.scroll(msg.optDouble("dx"), msg.optDouble("dy"))
                }
            }
            // mouse-move / key / text: not injected on Android in this MVP.
        }
    }

    private fun sendControl(holder: PeerHolder, msg: JSONObject) {
        val ch = holder.channel ?: return
        if (ch.state() == DataChannel.State.OPEN) {
            val bytes = msg.toString().toByteArray(StandardCharsets.UTF_8)
            ch.send(DataChannel.Buffer(ByteBuffer.wrap(bytes), false))
        }
    }

    private fun closePeer(viewerId: String) {
        peers.remove(viewerId)?.let {
            it.channel?.close()
            it.pc.close()
            onViewerCountChanged(peers.size)
        }
    }

    fun stop() {
        peers.keys.toList().forEach { closePeer(it) }
        try { capturer?.stopCapture() } catch (e: Exception) { /* ignore */ }
        capturer?.dispose()
        videoSource?.dispose()
        videoTrack?.dispose()
        eglBase.release()
    }

    companion object {
        private const val TAG = "WebRtcHost"
    }
}

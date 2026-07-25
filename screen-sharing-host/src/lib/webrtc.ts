/**
 * Host-side WebRTC session: one RTCPeerConnection per connected viewer,
 * signaled through the Socket.io server. Each peer also carries a "control"
 * DataChannel that the viewer uses to request and drive remote control.
 *
 * Consent model (deliberate — this is assistance software, not a RAT):
 *   - A viewer cannot control anything until the host grants it.
 *   - Grant happens either interactively (host clicks Allow) or, if the host
 *     has set an access password, automatically when the viewer supplies it.
 *   - Input is injected only while `granted` is true for that viewer, and the
 *     UI shows a persistent "being controlled" banner the whole time.
 *
 * Runs in the renderer process, where the native RTCPeerConnection lives and
 * where `window.electronAPI` bridges to OS input injection in main.
 */
import { io, type Socket } from 'socket.io-client';
import type { HostToViewerMsg, ViewerToHostMsg } from '../control-types';

export type HostStatus = 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'error';

export interface HostSessionEvents {
  onStatus: (status: HostStatus, detail?: string) => void;
  onViewersChanged: (viewerIds: string[]) => void;
  /** A viewer asked for control and needs interactive approval. */
  onControlRequest: (viewerId: string) => void;
  /** The set of viewers currently allowed to control this machine changed. */
  onControlledByChanged: (viewerIds: string[]) => void;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  granted: boolean;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
  // Add a TURN relay here for restrictive NATs (later).
];

function log(message: string, ...rest: unknown[]): void {
  console.log(`[Host] ${message}`, ...rest);
}

/** Prefer VP8 (universally supported), then H264, then VP9. */
function applyCodecPreferences(pc: RTCPeerConnection): void {
  try {
    const transceiver = pc.getTransceivers().find((t) => t.sender.track?.kind === 'video');
    const capabilities = RTCRtpSender.getCapabilities('video');
    if (!transceiver || !capabilities) return;
    const order = ['video/VP8', 'video/H264', 'video/VP9'];
    const sorted = [...capabilities.codecs].sort((a, b) => {
      const ai = order.indexOf(a.mimeType);
      const bi = order.indexOf(b.mimeType);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    });
    transceiver.setCodecPreferences(sorted);
  } catch (err) {
    log('setCodecPreferences unsupported, using browser defaults', err);
  }
}

export class HostSession {
  private socket: Socket | null = null;
  private peers = new Map<string, PeerEntry>();
  private stream: MediaStream | null = null;
  private roomCode = '';
  private accessPassword = '';

  constructor(
    private readonly serverUrl: string,
    private readonly events: HostSessionEvents,
  ) {}

  /** Set an unattended-access password. Empty string disables it (approval only). */
  setAccessPassword(password: string): void {
    this.accessPassword = password.trim();
    log(this.accessPassword ? 'unattended access enabled' : 'unattended access disabled');
  }

  async createRoom(): Promise<string> {
    const res = await fetch(`${this.serverUrl}/api/rooms/create`, { method: 'POST' });
    if (!res.ok) throw new Error(`Room creation failed: HTTP ${res.status}`);
    const room = (await res.json()) as { code: string };
    this.roomCode = room.code;
    log(`room created: ${room.code}`);
    return room.code;
  }

  startStreaming(stream: MediaStream): void {
    this.stream = stream;
    this.events.onStatus('connecting');

    this.socket = io(this.serverUrl, {
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    const socket = this.socket;

    socket.on('connect', () => {
      log(`signaling connected as ${socket.id}`);
      socket.emit('host:join', { code: this.roomCode });
    });

    socket.on('room:joined', () => this.events.onStatus('streaming'));

    socket.on('room:error', (message: string) => {
      log(`room error: ${message}`);
      this.events.onStatus('error', message);
    });

    socket.on('viewer:connected', (viewerId: string) => {
      log(`viewer connected: ${viewerId}`);
      void this.connectViewer(viewerId);
    });

    socket.on('viewer:disconnected', (viewerId: string) => {
      log(`viewer disconnected: ${viewerId}`);
      this.closePeer(viewerId);
    });

    socket.on('webrtc:answer', (from: string, data: unknown) => {
      void this.handleAnswer(from, data as RTCSessionDescriptionInit);
    });

    socket.on('webrtc:ice-candidate', (from: string, data: unknown) => {
      const entry = this.peers.get(from);
      if (entry && data) {
        entry.pc
          .addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit))
          .catch((err) => log('addIceCandidate failed', err));
      }
    });

    socket.on('disconnect', (reason) => {
      log(`signaling disconnected: ${reason}`);
      this.events.onStatus('disconnected', reason);
    });

    socket.io.on('reconnect', () => {
      log('signaling reconnected, re-joining room');
      socket.emit('host:join', { code: this.roomCode });
    });
  }

  private async connectViewer(viewerId: string): Promise<void> {
    if (!this.stream || !this.socket) return;
    try {
      this.closePeer(viewerId); // drop any stale connection for this viewer

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = { pc, channel: null, granted: false };
      this.peers.set(viewerId, entry);
      this.emitViewers();

      // Host creates the control channel; viewer receives it via ondatachannel.
      const channel = pc.createDataChannel('control', { ordered: true });
      entry.channel = channel;
      channel.onmessage = (event) => this.handleControlMessage(viewerId, event.data);
      channel.onopen = () => log(`control channel open for ${viewerId}`);

      for (const track of this.stream.getTracks()) {
        pc.addTrack(track, this.stream);
      }
      applyCodecPreferences(pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.socket?.emit('webrtc:ice-candidate', { to: viewerId, data: event.candidate });
        }
      };

      pc.onconnectionstatechange = () => {
        log(`peer ${viewerId}: ${pc.connectionState}`);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.closePeer(viewerId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.socket.emit('webrtc:offer', { to: viewerId, data: offer });
      log(`offer sent to ${viewerId}`);
    } catch (err) {
      log(`failed to connect viewer ${viewerId}`, err);
      this.closePeer(viewerId);
    }
  }

  private handleControlMessage(viewerId: string, raw: unknown): void {
    let msg: ViewerToHostMsg;
    try {
      msg = JSON.parse(String(raw)) as ViewerToHostMsg;
    } catch {
      return;
    }
    const entry = this.peers.get(viewerId);
    if (!entry) return;

    switch (msg.t) {
      case 'request':
        if (this.accessPassword && msg.password === this.accessPassword) {
          this.grantControl(viewerId);
        } else if (this.accessPassword && msg.password) {
          this.send(entry, { t: 'denied', reason: 'Incorrect access password' });
        } else {
          // No password path: ask the human at the host to approve.
          this.events.onControlRequest(viewerId);
        }
        return;
      case 'clipboard':
        void window.electronAPI.copyToClipboard(msg.value);
        return;
      default:
        break;
    }

    // Everything below is input injection — only if this viewer was granted.
    if (!entry.granted) return;

    switch (msg.t) {
      case 'mouse-move':
        window.electronAPI.inputMouseMove(msg.x, msg.y);
        break;
      case 'mouse-button':
        window.electronAPI.inputMouseButton(msg.button, msg.down, msg.x, msg.y);
        break;
      case 'scroll':
        window.electronAPI.inputScroll(msg.dx, msg.dy);
        break;
      case 'key':
        window.electronAPI.inputKey(msg.code, msg.down, msg.modifiers);
        break;
      case 'text':
        window.electronAPI.inputText(msg.value);
        break;
      default:
        break;
    }
  }

  grantControl(viewerId: string): void {
    const entry = this.peers.get(viewerId);
    if (!entry) return;
    entry.granted = true;
    this.send(entry, { t: 'granted' });
    log(`control GRANTED to ${viewerId}`);
    this.emitControlledBy();
    // Seed the viewer with the host's current clipboard.
    void window.electronAPI.readClipboard().then((text) => {
      if (text) this.send(entry, { t: 'clipboard', value: text });
    });
  }

  denyControl(viewerId: string): void {
    const entry = this.peers.get(viewerId);
    if (!entry) return;
    this.send(entry, { t: 'denied', reason: 'Host declined the control request' });
    log(`control DENIED for ${viewerId}`);
  }

  revokeControl(viewerId: string): void {
    const entry = this.peers.get(viewerId);
    if (!entry) return;
    entry.granted = false;
    this.send(entry, { t: 'revoked' });
    log(`control REVOKED for ${viewerId}`);
    this.emitControlledBy();
  }

  private send(entry: PeerEntry, msg: HostToViewerMsg): void {
    if (entry.channel && entry.channel.readyState === 'open') {
      entry.channel.send(JSON.stringify(msg));
    }
  }

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.peers.get(from);
    if (!entry) return;
    try {
      await entry.pc.setRemoteDescription(new RTCSessionDescription(answer));
      log(`answer applied from ${from}`);
    } catch (err) {
      log(`setRemoteDescription failed for ${from}`, err);
    }
  }

  private closePeer(viewerId: string): void {
    const entry = this.peers.get(viewerId);
    if (entry) {
      entry.channel?.close();
      entry.pc.close();
      this.peers.delete(viewerId);
      this.emitViewers();
      this.emitControlledBy();
    }
  }

  private emitViewers(): void {
    this.events.onViewersChanged([...this.peers.keys()]);
  }

  private emitControlledBy(): void {
    const controlling = [...this.peers.entries()]
      .filter(([, entry]) => entry.granted)
      .map(([id]) => id);
    this.events.onControlledByChanged(controlling);
  }

  stopStreaming(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.socket?.disconnect();
    this.socket = null;
    this.stream = null;
    this.roomCode = '';
    this.events.onStatus('idle');
    log('streaming stopped');
  }
}

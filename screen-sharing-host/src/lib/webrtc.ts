/**
 * Host-side WebRTC session: one RTCPeerConnection per connected viewer,
 * signaled through the Socket.io server. Runs in the renderer process,
 * where the native (plugin-free) RTCPeerConnection lives.
 */
import { io, type Socket } from 'socket.io-client';

export type HostStatus = 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'error';

export interface HostSessionEvents {
  onStatus: (status: HostStatus, detail?: string) => void;
  onViewersChanged: (viewerIds: string[]) => void;
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
  private peers = new Map<string, RTCPeerConnection>();
  private stream: MediaStream | null = null;
  private roomCode = '';

  constructor(
    private readonly serverUrl: string,
    private readonly events: HostSessionEvents,
  ) {}

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

    socket.on('room:joined', () => {
      this.events.onStatus('streaming');
    });

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
      const pc = this.peers.get(from);
      if (pc && data) {
        pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)).catch((err) =>
          log('addIceCandidate failed', err),
        );
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
      this.peers.set(viewerId, pc);
      this.emitViewers();

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

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peers.get(from);
    if (!pc) return;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      log(`answer applied from ${from}`);
    } catch (err) {
      log(`setRemoteDescription failed for ${from}`, err);
    }
  }

  private closePeer(viewerId: string): void {
    const pc = this.peers.get(viewerId);
    if (pc) {
      pc.close();
      this.peers.delete(viewerId);
      this.emitViewers();
    }
  }

  private emitViewers(): void {
    this.events.onViewersChanged([...this.peers.keys()]);
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

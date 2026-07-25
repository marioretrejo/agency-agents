/**
 * Browser-based "host": lets an invited guest share their screen straight from
 * the browser (getDisplayMedia), with no install. View-only — browsers cannot
 * grant OS-level control, so control requests are politely denied with a note
 * pointing to the desktop app.
 *
 * Mirrors the Electron host's WebRTC logic (one RTCPeerConnection per viewer,
 * VP8-preferred), minus input injection. Reuses the SSE/POST signaling.
 */
import { SignalingClient, type IncomingMessage } from './signaling-client';
import type { HostToViewerMsg, ViewerToHostMsg } from './control-types';

export type ShareStatus = 'idle' | 'connecting' | 'sharing' | 'disconnected' | 'error';

export interface BrowserHostEvents {
  onStatus: (status: ShareStatus, detail?: string) => void;
  onViewersChanged: (count: number) => void;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
];

function log(message: string, ...rest: unknown[]): void {
  console.log(`[BrowserHost] ${message}`, ...rest);
}

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
    log('setCodecPreferences unsupported, using defaults', err);
  }
}

export class BrowserHostSession {
  private client: SignalingClient | null = null;
  private peers = new Map<string, PeerEntry>();
  private stream: MediaStream | null = null;

  constructor(
    private readonly serverUrl: string,
    private readonly roomCode: string,
    private readonly events: BrowserHostEvents,
  ) {}

  /** Prompt the guest to pick a screen/window, then start hosting the room. */
  async start(): Promise<void> {
    this.events.onStatus('connecting');
    this.stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { max: 30 } },
      audio: false,
    });

    // If the guest stops sharing via the browser's own UI, tear down.
    this.stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop());

    const client = new SignalingClient(this.serverUrl, this.roomCode, 'host');
    this.client = client;
    client.onReady(() => this.events.onStatus('sharing'));
    client.onMessage((msg: IncomingMessage) => this.handleSignal(msg));
    client.connect();
  }

  private handleSignal(msg: IncomingMessage): void {
    switch (msg.type) {
      case 'viewer:connected': {
        if (!msg.from) break;
        const existing = this.peers.get(msg.from);
        const stale =
          !existing ||
          existing.pc.connectionState === 'failed' ||
          existing.pc.connectionState === 'closed';
        if (stale) void this.connectViewer(msg.from);
        break;
      }
      case 'viewer:disconnected':
        if (msg.from) this.closePeer(msg.from);
        break;
      case 'webrtc:answer':
        if (msg.from) void this.handleAnswer(msg.from, msg.data as RTCSessionDescriptionInit);
        break;
      case 'webrtc:ice-candidate': {
        const entry = msg.from ? this.peers.get(msg.from) : undefined;
        if (entry && msg.data) {
          entry.pc
            .addIceCandidate(new RTCIceCandidate(msg.data as RTCIceCandidateInit))
            .catch((err) => log('addIceCandidate failed', err));
        }
        break;
      }
      default:
        break;
    }
  }

  private async connectViewer(viewerId: string): Promise<void> {
    if (!this.stream || !this.client) return;
    try {
      this.closePeer(viewerId);
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = { pc, channel: null };
      this.peers.set(viewerId, entry);
      this.events.onViewersChanged(this.peers.size);

      // Control channel exists only to answer requests with a clear "no".
      const channel = pc.createDataChannel('control', { ordered: true });
      entry.channel = channel;
      channel.onmessage = (event) => this.handleControlMessage(entry, event.data);

      for (const track of this.stream.getTracks()) {
        pc.addTrack(track, this.stream);
      }
      applyCodecPreferences(pc);

      pc.onicecandidate = (event) => {
        if (event.candidate) void this.client?.send('webrtc:ice-candidate', viewerId, event.candidate);
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          this.closePeer(viewerId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.client.send('webrtc:offer', viewerId, offer);
      log(`offer sent to ${viewerId}`);
    } catch (err) {
      log(`failed to connect viewer ${viewerId}`, err);
      this.closePeer(viewerId);
    }
  }

  private handleControlMessage(entry: PeerEntry, raw: unknown): void {
    let msg: ViewerToHostMsg;
    try {
      msg = JSON.parse(String(raw)) as ViewerToHostMsg;
    } catch {
      return;
    }
    if (msg.t === 'request') {
      this.send(entry, {
        t: 'denied',
        reason: 'Control needs the desktop host app — browser sharing is view-only',
      });
    }
    // All input events are ignored: the browser cannot inject OS input.
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
      this.events.onViewersChanged(this.peers.size);
    }
  }

  stop(): void {
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.client?.close();
    this.client = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.events.onStatus('idle');
    log('sharing stopped');
  }
}

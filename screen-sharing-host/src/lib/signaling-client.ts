/**
 * Client-side signaling over SSE (receive) + fetch POST (send), replacing the
 * Socket.io transport so the whole system can run on Vercel serverless.
 *
 * The same file lives in the viewer project (lib/signaling-client.ts); keep
 * them in sync. It works in browsers and in the Electron renderer, both of
 * which provide EventSource, fetch, and crypto.randomUUID.
 */

export type SignalRole = 'host' | 'viewer';

export interface IncomingMessage {
  type: string;
  from?: string;
  data?: unknown;
}

type Handler = (msg: IncomingMessage) => void;

export class SignalingClient {
  readonly peerId: string;
  private source: EventSource | null = null;
  private handlers = new Set<Handler>();
  private readyHandlers = new Set<() => void>();
  private reconnectHandlers = new Set<() => void>();
  private closed = false;
  private hasConnectedOnce = false;

  constructor(
    private readonly baseUrl: string,
    private readonly code: string,
    private readonly role: SignalRole,
    peerId?: string,
  ) {
    this.peerId = peerId ?? crypto.randomUUID();
  }

  /** URL join that tolerates an empty baseUrl (same-origin) or a trailing slash. */
  private url(path: string): string {
    if (!this.baseUrl) return path;
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  onMessage(handler: Handler): void {
    this.handlers.add(handler);
  }
  onReady(handler: () => void): void {
    this.readyHandlers.add(handler);
  }
  onReconnect(handler: () => void): void {
    this.reconnectHandlers.add(handler);
  }

  /** Open the SSE stream and announce presence (host:join / viewer:join). */
  connect(): void {
    this.closed = false;
    this.openStream();
  }

  private openStream(): void {
    if (this.closed) return;
    const streamUrl = this.url(
      `/api/signal/${this.code}?peerId=${encodeURIComponent(this.peerId)}&role=${this.role}`,
    );
    const es = new EventSource(streamUrl);
    this.source = es;

    es.addEventListener('ready', () => {
      if (this.hasConnectedOnce) {
        this.reconnectHandlers.forEach((h) => h());
      } else {
        this.hasConnectedOnce = true;
      }
      // Announce (or re-announce) presence every time the stream (re)opens.
      void this.send(this.role === 'host' ? 'host:join' : 'viewer:join');
      this.readyHandlers.forEach((h) => h());
    });

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as IncomingMessage;
        this.handlers.forEach((h) => h(msg));
      } catch {
        /* ignore malformed frame */
      }
    };

    es.onerror = () => {
      // EventSource reconnects on its own, but Vercel may hard-close the
      // function; recycle the connection so a fresh function picks it up.
      es.close();
      if (!this.closed) setTimeout(() => this.openStream(), 1000);
    };
  }

  /** Send a message to the server, optionally addressed to a specific peer. */
  async send(type: string, to?: string, data?: unknown): Promise<void> {
    if (this.closed && type !== 'leave') return;
    try {
      await fetch(this.url(`/api/signal/${this.code}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, from: this.peerId, to, data, role: this.role }),
        keepalive: type === 'leave', // let the 'leave' beacon finish on unload
      });
    } catch (err) {
      console.error(`[Signaling] send ${type} failed`, err);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.send('leave');
    this.source?.close();
    this.source = null;
  }
}

/** Measure signaling round-trip latency in ms via the /api/ping route. */
export async function measureLatency(baseUrl: string): Promise<number> {
  const url = baseUrl ? `${baseUrl.replace(/\/$/, '')}/api/ping` : '/api/ping';
  const start =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    await fetch(url, { cache: 'no-store' });
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return Math.round(now - start);
  } catch {
    return -1;
  }
}

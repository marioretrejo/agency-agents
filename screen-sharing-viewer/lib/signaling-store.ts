/**
 * Serverless-friendly signaling state.
 *
 * WebRTC signaling is a brief handshake (offer/answer/ICE) after which media
 * flows peer-to-peer. That lets us run it on Vercel functions instead of a
 * persistent Socket.io server: clients POST messages and receive them over an
 * SSE stream that polls a per-peer queue.
 *
 * Two backends:
 *  - Upstash Redis (production on Vercel) — shared across serverless invocations.
 *  - In-memory (local `next dev`) — a single Node process, so module state
 *    persists across requests. NOT usable in production (functions are isolated).
 */

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TTL_SECONDS = Number(process.env.ROOM_TTL_SECONDS ?? 3600);

export interface RoomData {
  hostId: string | null;
  createdAt: string;
}

export interface SignalMessage {
  type: string;
  from?: string;
  to?: string;
  data?: unknown;
}

export interface RoomInfo {
  code: string;
  hostConnected: boolean;
  viewerCount: number;
  createdAt: string;
}

interface Backend {
  createRoom(code: string, data: RoomData): Promise<void>;
  getRoom(code: string): Promise<RoomData | null>;
  setHost(code: string, hostId: string | null): Promise<void>;
  addViewer(code: string, id: string): Promise<void>;
  removeViewer(code: string, id: string): Promise<void>;
  getViewers(code: string): Promise<string[]>;
  push(code: string, peerId: string, msg: SignalMessage): Promise<void>;
  pop(code: string, peerId: string): Promise<SignalMessage[]>;
}

// ---------------------------------------------------------------------------
// Upstash Redis backend (production)
// ---------------------------------------------------------------------------

type UpstashRedis = import('@upstash/redis').Redis;

class RedisBackend implements Backend {
  constructor(private readonly redis: UpstashRedis) {}

  private roomKey = (c: string) => `ss:room:${c}`;
  private viewersKey = (c: string) => `ss:room:${c}:viewers`;
  private queueKey = (c: string, p: string) => `ss:q:${c}:${p}`;

  async createRoom(code: string, data: RoomData): Promise<void> {
    await this.redis.set(this.roomKey(code), data, { ex: TTL_SECONDS });
  }
  async getRoom(code: string): Promise<RoomData | null> {
    return (await this.redis.get<RoomData>(this.roomKey(code))) ?? null;
  }
  async setHost(code: string, hostId: string | null): Promise<void> {
    const room = await this.getRoom(code);
    if (!room) return;
    room.hostId = hostId;
    await this.redis.set(this.roomKey(code), room, { ex: TTL_SECONDS });
  }
  async addViewer(code: string, id: string): Promise<void> {
    await this.redis.sadd(this.viewersKey(code), id);
    await this.redis.expire(this.viewersKey(code), TTL_SECONDS);
  }
  async removeViewer(code: string, id: string): Promise<void> {
    await this.redis.srem(this.viewersKey(code), id);
  }
  async getViewers(code: string): Promise<string[]> {
    return (await this.redis.smembers(this.viewersKey(code))) ?? [];
  }
  async push(code: string, peerId: string, msg: SignalMessage): Promise<void> {
    const key = this.queueKey(code, peerId);
    await this.redis.rpush(key, JSON.stringify(msg));
    await this.redis.expire(key, TTL_SECONDS);
  }
  async pop(code: string, peerId: string): Promise<SignalMessage[]> {
    const key = this.queueKey(code, peerId);
    // Atomically drain up to 100 queued messages.
    const raw = (await this.redis.lpop<string[]>(key, 100)) ?? [];
    const items = Array.isArray(raw) ? raw : [raw];
    return items
      .filter(Boolean)
      .map((s) => (typeof s === 'string' ? (JSON.parse(s) as SignalMessage) : (s as SignalMessage)));
  }
}

// ---------------------------------------------------------------------------
// In-memory backend (local dev only)
// ---------------------------------------------------------------------------

class MemoryBackend implements Backend {
  private rooms = new Map<string, RoomData>();
  private viewers = new Map<string, Set<string>>();
  private queues = new Map<string, SignalMessage[]>();
  private qk = (c: string, p: string) => `${c}:${p}`;

  async createRoom(code: string, data: RoomData): Promise<void> {
    this.rooms.set(code, data);
  }
  async getRoom(code: string): Promise<RoomData | null> {
    return this.rooms.get(code) ?? null;
  }
  async setHost(code: string, hostId: string | null): Promise<void> {
    const room = this.rooms.get(code);
    if (room) room.hostId = hostId;
  }
  async addViewer(code: string, id: string): Promise<void> {
    if (!this.viewers.has(code)) this.viewers.set(code, new Set());
    this.viewers.get(code)!.add(id);
  }
  async removeViewer(code: string, id: string): Promise<void> {
    this.viewers.get(code)?.delete(id);
  }
  async getViewers(code: string): Promise<string[]> {
    return [...(this.viewers.get(code) ?? [])];
  }
  async push(code: string, peerId: string, msg: SignalMessage): Promise<void> {
    const key = this.qk(code, peerId);
    if (!this.queues.has(key)) this.queues.set(key, []);
    this.queues.get(key)!.push(msg);
  }
  async pop(code: string, peerId: string): Promise<SignalMessage[]> {
    const key = this.qk(code, peerId);
    const msgs = this.queues.get(key) ?? [];
    this.queues.set(key, []);
    return msgs;
  }
}

// ---------------------------------------------------------------------------
// Backend selection (singleton)
// ---------------------------------------------------------------------------

let backend: Backend | null = null;

function resolveBackend(): Backend {
  if (backend) return backend;

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url && token) {
    // Loaded lazily so local dev doesn't need the package resolved at boot.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Redis } = require('@upstash/redis') as typeof import('@upstash/redis');
    backend = new RedisBackend(new Redis({ url, token }));
    console.log('[Signaling] using Upstash Redis backend');
  } else {
    backend = new MemoryBackend();
    console.warn(
      '[Signaling] no Upstash/KV env found — using in-memory backend (local dev only, not for production)',
    );
  }
  return backend;
}

// ---------------------------------------------------------------------------
// High-level operations
// ---------------------------------------------------------------------------

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(raw: string): boolean {
  return /^[A-Z0-9]{6}$/.test(normalizeCode(raw));
}

export async function createRoom(): Promise<RoomInfo> {
  const b = resolveBackend();
  let code = generateRoomCode();
  // Extremely unlikely to collide; one retry is plenty.
  if (await b.getRoom(code)) code = generateRoomCode();
  const data: RoomData = { hostId: null, createdAt: new Date().toISOString() };
  await b.createRoom(code, data);
  return { code, hostConnected: false, viewerCount: 0, createdAt: data.createdAt };
}

export async function getRoomInfo(code: string): Promise<RoomInfo | null> {
  const b = resolveBackend();
  const room = await b.getRoom(code);
  if (!room) return null;
  const viewers = await b.getViewers(code);
  return {
    code,
    hostConnected: room.hostId !== null,
    viewerCount: viewers.length,
    createdAt: room.createdAt,
  };
}

export async function popMessages(code: string, peerId: string): Promise<SignalMessage[]> {
  return resolveBackend().pop(code, peerId);
}

/** Route an incoming client message to the right peer's queue. */
export async function routeMessage(
  code: string,
  body: SignalMessage & { role?: string },
): Promise<{ ok: boolean; error?: string }> {
  const b = resolveBackend();
  const room = await b.getRoom(code);
  if (!room) return { ok: false, error: 'Room not found' };

  switch (body.type) {
    case 'host:join':
      if (body.from) await b.setHost(code, body.from);
      return { ok: true };

    case 'viewer:join':
      if (body.from) {
        await b.addViewer(code, body.from);
        if (room.hostId) {
          await b.push(code, room.hostId, { type: 'viewer:connected', from: body.from });
        }
      }
      return { ok: true };

    case 'webrtc:offer':
    case 'webrtc:answer':
    case 'webrtc:ice-candidate':
      if (body.to) {
        await b.push(code, body.to, { type: body.type, from: body.from, data: body.data });
      }
      return { ok: true };

    case 'leave':
      if (body.role === 'host') {
        await b.setHost(code, null);
        for (const v of await b.getViewers(code)) {
          await b.push(code, v, { type: 'host:disconnected' });
        }
      } else if (body.from) {
        await b.removeViewer(code, body.from);
        if (room.hostId) {
          await b.push(code, room.hostId, { type: 'viewer:disconnected', from: body.from });
        }
      }
      return { ok: true };

    default:
      return { ok: false, error: `Unknown message type: ${body.type}` };
  }
}

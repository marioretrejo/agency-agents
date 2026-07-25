import { io, type Socket } from 'socket.io-client';

const DEFAULT_SERVER = 'http://localhost:5000';

export function getSignalingServerUrl(): string {
  return process.env.NEXT_PUBLIC_SIGNALING_SERVER ?? DEFAULT_SERVER;
}

export function createSocket(): Socket {
  const url = getSignalingServerUrl();
  console.log(`[Viewer] connecting to signaling server ${url}`);
  return io(url, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
  });
}

/** Measure signaling round-trip time in milliseconds. */
export function measureLatency(socket: Socket): Promise<number> {
  return new Promise((resolve) => {
    const sentAt = performance.now();
    const timer = setTimeout(() => resolve(-1), 5000);
    socket.emit('latency:ping', Date.now(), () => {
      clearTimeout(timer);
      resolve(Math.round(performance.now() - sentAt));
    });
  });
}

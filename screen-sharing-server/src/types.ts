export interface Room {
  id: string;
  code: string;
  hostId: string | null;
  viewers: string[];
  createdAt: Date;
}

export interface User {
  id: string;
  type: 'host' | 'viewer';
  roomId: string;
}

export interface JoinPayload {
  code: string;
}

export interface SignalPayload {
  /** Socket id of the peer this signal is addressed to. */
  to: string;
  /** SDP offer/answer or ICE candidate, passed through opaquely. */
  data: unknown;
}

export interface RoomInfo {
  code: string;
  hostConnected: boolean;
  viewerCount: number;
  createdAt: string;
}

export interface ServerToClientEvents {
  'room:joined': (info: RoomInfo & { role: 'host' | 'viewer'; selfId: string }) => void;
  'room:error': (message: string) => void;
  'room:closed': () => void;
  'viewer:connected': (viewerId: string) => void;
  'viewer:disconnected': (viewerId: string) => void;
  'host:connected': () => void;
  'host:disconnected': () => void;
  'webrtc:offer': (from: string, data: unknown) => void;
  'webrtc:answer': (from: string, data: unknown) => void;
  'webrtc:ice-candidate': (from: string, data: unknown) => void;
}

export interface ClientToServerEvents {
  'host:join': (payload: JoinPayload) => void;
  'viewer:join': (payload: JoinPayload) => void;
  'webrtc:offer': (payload: SignalPayload) => void;
  'webrtc:answer': (payload: SignalPayload) => void;
  'webrtc:ice-candidate': (payload: SignalPayload) => void;
  'latency:ping': (sentAt: number, ack: (sentAt: number) => void) => void;
}

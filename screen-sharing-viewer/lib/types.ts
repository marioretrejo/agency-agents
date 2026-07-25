export interface ViewerState {
  status: 'idle' | 'loading' | 'connecting' | 'connected' | 'disconnected' | 'error';
  roomCode: string;
  latency: number;
  hostId: string | null;
}

export interface RoomJoinedInfo {
  code: string;
  hostConnected: boolean;
  viewerCount: number;
  createdAt: string;
  role: 'host' | 'viewer';
  selfId: string;
}

export interface SignalPayload {
  to: string;
  data: unknown;
}

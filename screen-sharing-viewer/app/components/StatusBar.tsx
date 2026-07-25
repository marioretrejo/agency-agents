'use client';

import type { ViewerState } from '@/lib/types';

const LABEL: Record<ViewerState['status'], string> = {
  loading: 'Loading…',
  connecting: 'Connecting…',
  connected: 'Live',
  disconnected: 'Reconnecting…',
  error: 'Error',
};

export default function StatusBar({ state }: { state: ViewerState }) {
  return (
    <div className="status-bar" role="status">
      <span className={`dot dot--${state.status}`} />
      <span>{LABEL[state.status]}</span>
      {state.roomCode && <span className="code">Room {state.roomCode}</span>}
      {state.status === 'connected' && (
        <span className="latency">
          {state.latency >= 0 ? `${state.latency} ms` : 'latency —'}
        </span>
      )}
    </div>
  );
}

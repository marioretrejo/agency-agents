'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import ConnectionUI from './components/ConnectionUI';
import StatusBar from './components/StatusBar';
import Viewer from './components/Viewer';
import { createSocket, measureLatency } from '@/lib/socket-client';
import { answerOffer, setupPeerConnection } from '@/lib/webrtc';
import type { RoomJoinedInfo, ViewerState } from '@/lib/types';

function ViewerPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomFromUrl = (searchParams.get('room') ?? '').trim().toUpperCase();

  const [state, setState] = useState<ViewerState>({
    status: 'loading',
    roomCode: roomFromUrl,
    latency: -1,
    hostId: null,
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [stream, setStream] = useState<MediaStream | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const patchState = useCallback((patch: Partial<ViewerState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const teardownPeer = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => {
    if (!roomFromUrl) {
      patchState({ status: 'error' });
      return;
    }

    patchState({ status: 'connecting', roomCode: roomFromUrl });
    const socket = createSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[Viewer] signaling connected as ${socket.id}`);
      socket.emit('viewer:join', { code: roomFromUrl });
    });

    socket.on('room:joined', (info: RoomJoinedInfo) => {
      console.log('[Viewer] joined room', info);
      if (!info.hostConnected) {
        patchState({ status: 'connecting' });
        console.log('[Viewer] waiting for host to connect');
      }
    });

    socket.on('room:error', (message: string) => {
      console.error(`[Viewer] room error: ${message}`);
      setErrorMessage(message);
      patchState({ status: 'error' });
    });

    socket.on('webrtc:offer', (from: string, data: unknown) => {
      void (async () => {
        try {
          console.log(`[Viewer] offer received from host ${from}`);
          teardownPeer(); // host restarted or renegotiated: start clean

          const pc = await setupPeerConnection();
          pcRef.current = pc;
          patchState({ hostId: from });

          pc.ontrack = (event) => {
            console.log('[Viewer] remote track received');
            setStream(event.streams[0] ?? new MediaStream([event.track]));
            patchState({ status: 'connected' });
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              socket.emit('webrtc:ice-candidate', { to: from, data: event.candidate });
            }
          };

          pc.onconnectionstatechange = () => {
            console.log(`[Viewer] peer state: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
              patchState({ status: 'disconnected' });
            }
          };

          const answer = await answerOffer(pc, data as RTCSessionDescriptionInit);
          socket.emit('webrtc:answer', { to: from, data: answer });
          console.log('[Viewer] answer sent');
        } catch (err) {
          console.error('[Viewer] failed to handle offer', err);
          setErrorMessage('Failed to establish the video connection');
          patchState({ status: 'error' });
        }
      })();
    });

    socket.on('webrtc:ice-candidate', (_from: string, data: unknown) => {
      const pc = pcRef.current;
      if (pc && data) {
        pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit)).catch((err) =>
          console.error('[Viewer] addIceCandidate failed', err),
        );
      }
    });

    socket.on('host:disconnected', () => {
      console.log('[Viewer] host disconnected');
      teardownPeer();
      patchState({ status: 'disconnected', hostId: null });
    });

    socket.on('room:closed', () => {
      setErrorMessage('The room was closed');
      teardownPeer();
      patchState({ status: 'error' });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Viewer] signaling disconnected: ${reason}`);
      patchState({ status: 'disconnected' });
    });

    // Socket.io auto-reconnects; re-join the room when it does.
    socket.io.on('reconnect', () => {
      console.log('[Viewer] signaling reconnected, re-joining');
      socket.emit('viewer:join', { code: roomFromUrl });
    });

    const latencyTimer = setInterval(() => {
      if (socket.connected) {
        void measureLatency(socket).then((latency) => patchState({ latency }));
      }
    }, 2000);

    return () => {
      clearInterval(latencyTimer);
      teardownPeer();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomFromUrl, patchState, teardownPeer]);

  const handleJoin = useCallback(
    (code: string) => {
      router.push(`/?room=${encodeURIComponent(code)}`);
    },
    [router],
  );

  return (
    <main className="viewer-page">
      {stream && state.status === 'connected' ? (
        <Viewer stream={stream} />
      ) : (
        <ConnectionUI
          status={
            !roomFromUrl
              ? 'error'
              : state.status === 'connected' || state.status === 'loading'
                ? 'loading'
                : state.status
          }
          errorMessage={roomFromUrl ? errorMessage : undefined}
          onJoin={handleJoin}
        />
      )}
      <StatusBar state={state} />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="viewer-page">
          <div className="connection-ui">
            <div className="spinner" aria-label="Loading" />
          </div>
        </main>
      }
    >
      <ViewerPage />
    </Suspense>
  );
}

'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Socket } from 'socket.io-client';
import ConnectionUI from './components/ConnectionUI';
import ControlBar, { type ControlStatus } from './components/ControlBar';
import StatusBar from './components/StatusBar';
import Viewer from './components/Viewer';
import { createSocket, measureLatency } from '@/lib/socket-client';
import { answerOffer, setupPeerConnection } from '@/lib/webrtc';
import type { HostToViewerMsg, ViewerToHostMsg } from '@/lib/control-types';
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
  const [controlStatus, setControlStatus] = useState<ControlStatus>('none');
  const [deniedReason, setDeniedReason] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const controlChannelRef = useRef<RTCDataChannel | null>(null);

  const patchState = useCallback((patch: Partial<ViewerState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const teardownPeer = useCallback(() => {
    controlChannelRef.current?.close();
    controlChannelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setStream(null);
    setControlStatus('none');
  }, []);

  const sendControl = useCallback((msg: ViewerToHostMsg) => {
    const channel = controlChannelRef.current;
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(msg));
    }
  }, []);

  const handleHostControlMessage = useCallback((raw: unknown) => {
    let msg: HostToViewerMsg;
    try {
      msg = JSON.parse(String(raw)) as HostToViewerMsg;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'granted':
        console.log('[Viewer] control granted');
        setControlStatus('active');
        setDeniedReason('');
        break;
      case 'denied':
        console.log('[Viewer] control denied:', msg.reason);
        setControlStatus('denied');
        setDeniedReason(msg.reason);
        break;
      case 'revoked':
        console.log('[Viewer] control revoked by host');
        setControlStatus('none');
        break;
      case 'clipboard':
        navigator.clipboard?.writeText(msg.value).catch(() => {
          /* clipboard permission may be denied; ignore */
        });
        break;
      default:
        break;
    }
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

          // The host creates the "control" DataChannel; we receive it here.
          pc.ondatachannel = (event) => {
            const channel = event.channel;
            if (channel.label !== 'control') return;
            controlChannelRef.current = channel;
            channel.onopen = () => console.log('[Viewer] control channel open');
            channel.onmessage = (e) => handleHostControlMessage(e.data);
            channel.onclose = () => setControlStatus('none');
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
  }, [roomFromUrl, patchState, teardownPeer, handleHostControlMessage]);

  const handleJoin = useCallback(
    (code: string) => {
      router.push(`/?room=${encodeURIComponent(code)}`);
    },
    [router],
  );

  const requestControl = useCallback(
    (password: string) => {
      setControlStatus('requested');
      setDeniedReason('');
      sendControl({ t: 'request', password: password || undefined });
    },
    [sendControl],
  );

  const releaseControl = useCallback(() => {
    setControlStatus('none');
  }, []);

  const isLive = stream && state.status === 'connected';

  return (
    <main className="viewer-page">
      {isLive ? (
        <Viewer stream={stream} controlActive={controlStatus === 'active'} onInput={sendControl} />
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

      {isLive && (
        <ControlBar
          status={controlStatus}
          deniedReason={deniedReason}
          onRequest={requestControl}
          onRelease={releaseControl}
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

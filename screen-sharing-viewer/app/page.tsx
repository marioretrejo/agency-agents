'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ConnectionUI from './components/ConnectionUI';
import ControlBar, { type ControlStatus } from './components/ControlBar';
import StatusBar from './components/StatusBar';
import Viewer from './components/Viewer';
import { SignalingClient, measureLatency, type IncomingMessage } from '@/lib/signaling-client';
import { answerOffer, setupPeerConnection } from '@/lib/webrtc';
import type { HostToViewerMsg, ViewerToHostMsg } from '@/lib/control-types';
import type { ViewerState } from '@/lib/types';

// Same-origin by default: the viewer's own /api routes are the signaling server.
// Override only to point at an external signaling deployment.
const SIGNAL_BASE = process.env.NEXT_PUBLIC_SIGNALING_SERVER ?? '';

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

  const clientRef = useRef<SignalingClient | null>(null);
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
        setControlStatus('active');
        setDeniedReason('');
        break;
      case 'denied':
        setControlStatus('denied');
        setDeniedReason(msg.reason);
        break;
      case 'revoked':
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
      // No room code in the URL yet — show the join form, not an error.
      patchState({ status: 'idle' });
      return;
    }

    let disposed = false;
    let client: SignalingClient | null = null;
    let latencyTimer: ReturnType<typeof setInterval> | null = null;

    const handleOffer = async (from: string, data: unknown) => {
      try {
        teardownPeer(); // host restarted or renegotiated: start clean
        const pc = await setupPeerConnection();
        pcRef.current = pc;
        patchState({ hostId: from });

        pc.ontrack = (event) => {
          setStream(event.streams[0] ?? new MediaStream([event.track]));
          patchState({ status: 'connected' });
        };

        // The host creates the "control" DataChannel; we receive it here.
        pc.ondatachannel = (event) => {
          const channel = event.channel;
          if (channel.label !== 'control') return;
          controlChannelRef.current = channel;
          channel.onmessage = (e) => handleHostControlMessage(e.data);
          channel.onclose = () => setControlStatus('none');
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            void client?.send('webrtc:ice-candidate', from, event.candidate);
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
            patchState({ status: 'disconnected' });
          }
        };

        const answer = await answerOffer(pc, data as RTCSessionDescriptionInit);
        await client?.send('webrtc:answer', from, answer);
      } catch (err) {
        console.error('[Viewer] failed to handle offer', err);
        setErrorMessage('Failed to establish the video connection');
        patchState({ status: 'error' });
      }
    };

    const onMessage = (msg: IncomingMessage) => {
      switch (msg.type) {
        case 'webrtc:offer':
          if (msg.from) void handleOffer(msg.from, msg.data);
          break;
        case 'webrtc:ice-candidate': {
          const pc = pcRef.current;
          if (pc && msg.data) {
            pc.addIceCandidate(new RTCIceCandidate(msg.data as RTCIceCandidateInit)).catch((err) =>
              console.error('[Viewer] addIceCandidate failed', err),
            );
          }
          break;
        }
        case 'host:disconnected':
          teardownPeer();
          patchState({ status: 'disconnected', hostId: null });
          break;
        default:
          break;
      }
    };

    // Verify the room exists, then open signaling.
    void (async () => {
      patchState({ status: 'connecting', roomCode: roomFromUrl });
      try {
        const base = SIGNAL_BASE ? SIGNAL_BASE.replace(/\/$/, '') : '';
        const res = await fetch(`${base}/api/rooms/${roomFromUrl}`, { cache: 'no-store' });
        if (res.status === 404) {
          setErrorMessage(`Room ${roomFromUrl} not found`);
          patchState({ status: 'error' });
          return;
        }
      } catch {
        // Non-fatal: try to connect anyway.
      }
      if (disposed) return;

      client = new SignalingClient(SIGNAL_BASE, roomFromUrl, 'viewer');
      clientRef.current = client;
      client.onMessage(onMessage);
      client.connect();

      latencyTimer = setInterval(() => {
        void measureLatency(SIGNAL_BASE).then((latency) => patchState({ latency }));
      }, 3000);
    })();

    const onPageHide = () => client?.close();
    window.addEventListener('pagehide', onPageHide);

    return () => {
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      if (latencyTimer) clearInterval(latencyTimer);
      teardownPeer();
      client?.close();
      clientRef.current = null;
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
              ? 'idle'
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

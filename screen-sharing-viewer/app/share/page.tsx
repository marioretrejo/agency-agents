'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { BrowserHostSession, type ShareStatus } from '@/lib/browser-host';

const SIGNAL_BASE = process.env.NEXT_PUBLIC_SIGNALING_SERVER ?? '';

const STATUS_LABEL: Record<ShareStatus, string> = {
  idle: 'Not sharing',
  connecting: 'Starting…',
  sharing: 'Sharing your screen',
  disconnected: 'Disconnected',
  error: 'Error',
};

function SharePage() {
  const searchParams = useSearchParams();
  const roomFromUrl = (searchParams.get('room') ?? '').trim().toUpperCase();

  const [code, setCode] = useState(roomFromUrl);
  const [status, setStatus] = useState<ShareStatus>('idle');
  const [detail, setDetail] = useState('');
  const [viewers, setViewers] = useState(0);
  const sessionRef = useRef<BrowserHostSession | null>(null);

  useEffect(() => {
    setCode(roomFromUrl);
  }, [roomFromUrl]);

  useEffect(() => {
    return () => sessionRef.current?.stop();
  }, []);

  const startShare = useCallback(async () => {
    const room = code.trim().toUpperCase();
    if (room.length !== 6) {
      setDetail('Enter the 6-character code from the person who invited you');
      return;
    }
    try {
      setDetail('');
      // Verify the room exists before prompting for screen access.
      const base = SIGNAL_BASE ? SIGNAL_BASE.replace(/\/$/, '') : '';
      const res = await fetch(`${base}/api/rooms/${room}`, { cache: 'no-store' });
      if (res.status === 404) {
        setStatus('error');
        setDetail(`Room ${room} not found — check the code`);
        return;
      }

      const session = new BrowserHostSession(SIGNAL_BASE, room, {
        onStatus: (s, d) => {
          setStatus(s);
          setDetail(d ?? '');
        },
        onViewersChanged: setViewers,
      });
      sessionRef.current = session;
      await session.start();
    } catch (err) {
      console.error('[Share] failed to start', err);
      setStatus('error');
      // getDisplayMedia throws if the user cancels the picker.
      setDetail(err instanceof DOMException ? 'Screen share was cancelled' : 'Could not start sharing');
    }
  }, [code]);

  const stopShare = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setViewers(0);
  }, []);

  const isSharing = status === 'sharing' || status === 'connecting';

  return (
    <main className="share-page">
      <div className="share-card">
        <h1>Share your screen</h1>
        <p className="muted">
          Someone invited you. Sharing lets them <strong>view</strong> your screen live. For full
          remote control they'll need you to run the desktop app instead.
        </p>

        {!isSharing ? (
          <>
            <label className="field">
              <span>Invitation code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                aria-label="Invitation code"
              />
            </label>
            <button className="primary" onClick={startShare}>
              Share my screen
            </button>
            {detail && <p className="error">{detail}</p>}
          </>
        ) : (
          <>
            <div className={`share-status share-status--${status}`}>
              <span className="dot" /> {STATUS_LABEL[status]}
              {detail && <span className="muted"> — {detail}</span>}
            </div>
            <p className="muted">
              {viewers > 0
                ? `${viewers} ${viewers === 1 ? 'person is' : 'people are'} watching`
                : 'Waiting for the other person to connect…'}
            </p>
            <button className="danger" onClick={stopShare}>
              Stop sharing
            </button>
          </>
        )}

        <div className="control-note">
          Want them to control your machine too?{' '}
          <a href="https://github.com/marioretrejo/agency-agents/tree/main/screen-sharing-host">
            Get the desktop app
          </a>{' '}
          and enter the same code.
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <main className="share-page">
          <div className="share-card">
            <div className="spinner" aria-label="Loading" />
          </div>
        </main>
      }
    >
      <SharePage />
    </Suspense>
  );
}

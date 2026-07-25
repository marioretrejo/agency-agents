'use client';

import { useState } from 'react';
import Link from 'next/link';

interface ConnectionUIProps {
  status: 'loading' | 'connecting' | 'disconnected' | 'error';
  roomCode?: string;
  errorMessage?: string;
}

export default function ConnectionUI({ status, roomCode, errorMessage }: ConnectionUIProps) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const inviteLink =
    roomCode && typeof window !== 'undefined'
      ? `${window.location.origin}/share?room=${roomCode}`
      : '';

  const copy = async (what: 'code' | 'link', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard may be blocked; value is visible anyway */
    }
  };

  if (status === 'error') {
    return (
      <div className="connection-ui">
        <h1>Something went wrong</h1>
        <p className="error">{errorMessage ?? 'Connection error'}</p>
        <Link className="back-link" href="/">
          ← Back
        </Link>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="connection-ui">
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  // connecting / disconnected — waiting for the guest to start sharing.
  return (
    <div className="connection-ui">
      <div className="spinner" aria-label="Waiting" />
      <p>
        {status === 'connecting'
          ? 'Waiting for the other person to start sharing…'
          : 'Connection lost. Reconnecting…'}
      </p>
      {roomCode && (
        <div className="share-code">
          <div className="big-code" aria-label="Room code">
            {roomCode}
          </div>
          <div className="copy-row">
            <button onClick={() => copy('link', inviteLink)}>
              {copied === 'link' ? 'Copied!' : 'Copy invite link'}
            </button>
            <button className="ghost" onClick={() => copy('code', roomCode)}>
              {copied === 'code' ? 'Copied!' : 'Copy code'}
            </button>
          </div>
          <p className="hint">
            Send the invite link to the other person. They open it and share their screen — or, for
            full control, run the desktop app and enter this code. Their screen will appear here
            automatically.
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, type FormEvent } from 'react';

interface ConnectionUIProps {
  status: 'idle' | 'loading' | 'connecting' | 'disconnected' | 'error';
  roomCode?: string;
  errorMessage?: string;
  onJoin: (code: string) => void;
  onCreate: () => void;
}

export default function ConnectionUI({
  status,
  roomCode,
  errorMessage,
  onJoin,
  onCreate,
}: ConnectionUIProps) {
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 6) onJoin(trimmed);
  };

  const copyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the code is visible anyway */
    }
  };

  // Waiting for the host to join the room the user created / opened.
  if (status === 'connecting' || status === 'disconnected') {
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
            <button onClick={copyCode}>{copied ? 'Copied!' : 'Copy code'}</button>
            <p className="hint">
              Send this code to the other person. They open the desktop host app,
              enter it, and share their screen. Then you can view and request control.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="connection-ui">
      <h1>Screen Sharing Viewer</h1>
      <p>Enter the 6-character room code shown on the host, or open the link the host shared with you.</p>
      <form onSubmit={handleSubmit}>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Room code"
        />
        <button type="submit" disabled={code.trim().length !== 6}>
          Join
        </button>
      </form>
      {status === 'error' && errorMessage && <p className="error">{errorMessage}</p>}

      <div className="divider">or</div>
      <button className="create" onClick={onCreate}>
        Create a session to share
      </button>
      <p className="hint">
        Generates a code you send to someone. When they open the host app and enter
        it, their screen appears here.
      </p>
    </div>
  );
}

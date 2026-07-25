'use client';

import { useState, type FormEvent } from 'react';

interface ConnectionUIProps {
  status: 'idle' | 'loading' | 'connecting' | 'disconnected' | 'error';
  errorMessage?: string;
  onJoin: (code: string) => void;
}

export default function ConnectionUI({ status, errorMessage, onJoin }: ConnectionUIProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 6) onJoin(trimmed);
  };

  if (status === 'connecting' || status === 'disconnected') {
    return (
      <div className="connection-ui">
        <div className="spinner" aria-label="Connecting" />
        <p>{status === 'connecting' ? 'Connecting to the host…' : 'Connection lost. Reconnecting…'}</p>
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
    </div>
  );
}

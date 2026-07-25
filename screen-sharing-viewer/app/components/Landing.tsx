'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface LandingProps {
  /** Create a session (inviter): generates a code and becomes the viewer. */
  onCreate: () => void;
  /** Join an existing room as a viewer/watcher by code. */
  onWatch: (code: string) => void;
}

export default function Landing({ onCreate, onWatch }: LandingProps) {
  const router = useRouter();
  const [watchCode, setWatchCode] = useState('');

  const submitWatch = (e: FormEvent) => {
    e.preventDefault();
    const code = watchCode.trim().toUpperCase();
    if (code.length === 6) onWatch(code);
  };

  return (
    <div className="landing">
      <h1>Screen Sharing</h1>
      <p className="landing-sub">Choose what you want to do.</p>

      <div className="panels">
        {/* Inviter: generates the link, will view & control */}
        <section className="panel panel--invite">
          <div className="panel-icon" aria-hidden>
            🔗
          </div>
          <h2>Generate a link</h2>
          <p>
            You want to <strong>view and control</strong> someone else's screen. Create a session,
            send them the link, and their screen appears here.
          </p>
          <button className="primary" onClick={onCreate}>
            Generate invite link
          </button>
        </section>

        {/* Guest: accepts the invitation, shares their screen */}
        <section className="panel panel--accept">
          <div className="panel-icon" aria-hidden>
            🖥️
          </div>
          <h2>Accept an invitation</h2>
          <p>
            Someone invited you and you want to <strong>share your screen</strong>. Enter the code
            they sent to start sharing.
          </p>
          <button className="secondary" onClick={() => router.push('/share')}>
            Share my screen
          </button>
        </section>
      </div>

      <form className="watch-row" onSubmit={submitWatch}>
        <span className="muted">Have a code to just watch a screen?</span>
        <input
          value={watchCode}
          onChange={(e) => setWatchCode(e.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          aria-label="Code to watch"
        />
        <button type="submit" disabled={watchCode.trim().length !== 6}>
          Watch
        </button>
      </form>
    </div>
  );
}

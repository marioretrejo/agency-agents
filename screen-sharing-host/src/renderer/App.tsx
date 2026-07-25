import { useCallback, useEffect, useRef, useState } from 'react';
import { captureScreen, stopStream } from '../lib/screen-capturer';
import { HostSession, type HostStatus } from '../lib/webrtc';
import type { HostConfig } from '../shared';
import './App.css';

const STATUS_LABEL: Record<HostStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting…',
  streaming: 'Streaming',
  disconnected: 'Disconnected — reconnecting…',
  error: 'Error',
};

export default function App() {
  const [config, setConfig] = useState<HostConfig | null>(null);
  const [status, setStatus] = useState<HostStatus>('idle');
  const [statusDetail, setStatusDetail] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [viewers, setViewers] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const sessionRef = useRef<HostSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    window.electronAPI
      .getConfig()
      .then(setConfig)
      .catch((err) => {
        console.error('[Host] failed to load config', err);
        setStatus('error');
        setStatusDetail('Could not load app configuration');
      });
    return () => {
      sessionRef.current?.stopStreaming();
      stopStream(streamRef.current);
    };
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!config) return;
    try {
      setStatus('connecting');
      setStatusDetail('');

      const session = new HostSession(config.signalingServer, {
        onStatus: (s, detail) => {
          setStatus(s);
          setStatusDetail(detail ?? '');
        },
        onViewersChanged: setViewers,
      });
      sessionRef.current = session;

      const code = await session.createRoom();
      setRoomCode(code);

      const stream = await captureScreen();
      streamRef.current = stream;
      session.startStreaming(stream);
    } catch (err) {
      console.error('[Host] failed to start session', err);
      setStatus('error');
      setStatusDetail(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [config]);

  const handleStop = useCallback(() => {
    sessionRef.current?.stopStreaming();
    stopStream(streamRef.current);
    streamRef.current = null;
    setRoomCode('');
    setViewers([]);
  }, []);

  const shareLink = config && roomCode ? `${config.viewerUrl}/?room=${roomCode}` : '';

  const handleCopy = useCallback(async () => {
    if (!shareLink) return;
    await window.electronAPI.copyToClipboard(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  return (
    <div className="app">
      <header>
        <h1>Screen Sharing Host</h1>
        {config && (
          <span className="platform">
            {config.platform} / {config.arch}
          </span>
        )}
      </header>

      <div className={`status status--${status}`}>
        <span className="status-dot" />
        {STATUS_LABEL[status]}
        {statusDetail && <span className="status-detail"> — {statusDetail}</span>}
      </div>

      {!roomCode ? (
        <button className="primary" onClick={handleCreateRoom} disabled={!config || status === 'connecting'}>
          Create Room
        </button>
      ) : (
        <>
          <div className="room-code" aria-label="Room code">
            {roomCode}
          </div>

          <div className="share-row">
            <input readOnly value={shareLink} aria-label="Share link" />
            <button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy link'}</button>
          </div>

          <section className="viewers">
            <h2>Viewers ({viewers.length})</h2>
            {viewers.length === 0 ? (
              <p className="muted">Waiting for viewers to join…</p>
            ) : (
              <ul>
                {viewers.map((id) => (
                  <li key={id}>{id.slice(0, 8)}…</li>
                ))}
              </ul>
            )}
          </section>

          <button className="danger" onClick={handleStop}>
            Stop sharing
          </button>
        </>
      )}
    </div>
  );
}

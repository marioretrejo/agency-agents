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
  const [pendingRequests, setPendingRequests] = useState<string[]>([]);
  const [controlledBy, setControlledBy] = useState<string[]>([]);
  const [controlAvailable, setControlAvailable] = useState(true);
  const [accessPassword, setAccessPassword] = useState('');
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
    window.electronAPI
      .isControlAvailable()
      .then(setControlAvailable)
      .catch(() => setControlAvailable(false));
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
        onControlRequest: (viewerId) =>
          setPendingRequests((prev) => (prev.includes(viewerId) ? prev : [...prev, viewerId])),
        onControlledByChanged: setControlledBy,
      });
      session.setAccessPassword(accessPassword);
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
  }, [config, accessPassword]);

  const handleStop = useCallback(() => {
    sessionRef.current?.stopStreaming();
    stopStream(streamRef.current);
    streamRef.current = null;
    setRoomCode('');
    setViewers([]);
    setPendingRequests([]);
    setControlledBy([]);
  }, []);

  const approve = useCallback((viewerId: string) => {
    sessionRef.current?.grantControl(viewerId);
    setPendingRequests((prev) => prev.filter((id) => id !== viewerId));
  }, []);

  const deny = useCallback((viewerId: string) => {
    sessionRef.current?.denyControl(viewerId);
    setPendingRequests((prev) => prev.filter((id) => id !== viewerId));
  }, []);

  const revoke = useCallback((viewerId: string) => {
    sessionRef.current?.revokeControl(viewerId);
  }, []);

  const shareLink = config && roomCode ? `${config.viewerUrl}/?room=${roomCode}` : '';

  const handleCopy = useCallback(async () => {
    if (!shareLink) return;
    await window.electronAPI.copyToClipboard(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareLink]);

  const short = (id: string) => `${id.slice(0, 8)}…`;

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

      {controlledBy.length > 0 && (
        <div className="control-banner" role="alert">
          🔴 Your screen is being controlled by {controlledBy.map(short).join(', ')}
          <button className="link" onClick={() => controlledBy.forEach(revoke)}>
            Revoke all
          </button>
        </div>
      )}

      <div className={`status status--${status}`}>
        <span className="status-dot" />
        {STATUS_LABEL[status]}
        {statusDetail && <span className="status-detail"> — {statusDetail}</span>}
      </div>

      {!controlAvailable && (
        <p className="warn">
          Remote control module not available on this machine — running in view-only mode.
          Install native dependencies and grant OS accessibility permission to enable control.
        </p>
      )}

      {!roomCode ? (
        <>
          <label className="field">
            <span>Unattended access password (optional)</span>
            <input
              type="password"
              value={accessPassword}
              onChange={(e) => setAccessPassword(e.target.value)}
              placeholder="Leave empty to approve each request manually"
            />
          </label>
          <button
            className="primary"
            onClick={handleCreateRoom}
            disabled={!config || status === 'connecting'}
          >
            Create Room
          </button>
        </>
      ) : (
        <>
          <div className="room-code" aria-label="Room code">
            {roomCode}
          </div>

          <div className="share-row">
            <input readOnly value={shareLink} aria-label="Share link" />
            <button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy link'}</button>
          </div>

          {pendingRequests.length > 0 && (
            <section className="requests">
              <h2>Control requests</h2>
              {pendingRequests.map((id) => (
                <div key={id} className="request-row">
                  <span>{short(id)} wants to control your screen</span>
                  <div className="request-actions">
                    <button className="approve" onClick={() => approve(id)}>
                      Allow
                    </button>
                    <button className="deny" onClick={() => deny(id)}>
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="viewers">
            <h2>Viewers ({viewers.length})</h2>
            {viewers.length === 0 ? (
              <p className="muted">Waiting for viewers to join…</p>
            ) : (
              <ul>
                {viewers.map((id) => (
                  <li key={id}>
                    <span>{short(id)}</span>
                    {controlledBy.includes(id) ? (
                      <button className="link" onClick={() => revoke(id)}>
                        controlling — revoke
                      </button>
                    ) : (
                      <span className="muted">viewing</span>
                    )}
                  </li>
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

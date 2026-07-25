'use client';

import { useState } from 'react';

export type ControlStatus = 'none' | 'requested' | 'active' | 'denied';

interface ControlBarProps {
  status: ControlStatus;
  deniedReason?: string;
  onRequest: (password: string) => void;
  onRelease: () => void;
}

export default function ControlBar({
  status,
  deniedReason,
  onRequest,
  onRelease,
}: ControlBarProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (status === 'active') {
    return (
      <div className="control-bar control-bar--active">
        <span>🟢 You are controlling this screen</span>
        <button onClick={onRelease}>Release control</button>
      </div>
    );
  }

  if (status === 'requested') {
    return (
      <div className="control-bar">
        <span>Waiting for the host to approve…</span>
      </div>
    );
  }

  return (
    <div className="control-bar">
      {showPassword ? (
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access password"
          aria-label="Access password"
        />
      ) : (
        <button className="ghost" onClick={() => setShowPassword(true)}>
          Have a password?
        </button>
      )}
      <button className="request" onClick={() => onRequest(password)}>
        Request control
      </button>
      {status === 'denied' && (
        <span className="denied">{deniedReason ?? 'Control request denied'}</span>
      )}
    </div>
  );
}

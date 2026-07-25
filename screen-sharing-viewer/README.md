# screen-sharing-viewer

Browser-based viewer and **remote-control client** for the cross-platform screen sharing MVP. Open a link like `https://viewer.example.com/?room=ABC123`, watch the host's screen live over WebRTC, and — once the host approves — drive its mouse and keyboard. No install, no plugins.

## Remote control

Click **Request control** to ask the host for mouse + keyboard access (optionally supplying an access password for unattended hosts). The host must approve; while control is active a green border and status bar appear, and every pointer/scroll/key event over the canvas is normalized and sent to the host over a WebRTC DataChannel. Click **Release control** to stop. The host can revoke at any time. Clipboard text is synced when control is granted.

## Compatibility

| Browser | Supported |
|---------|-----------|
| Chrome / Edge (desktop & Android) | ✅ |
| Firefox | ✅ |
| Safari (macOS & iOS) | ✅ (canvas rendering avoids iOS `<video>` quirks) |

Responsive from 320px phones up to 4K desktops. Video is drawn to a `<canvas>` from a hidden muted `playsInline` element, which keeps iOS Safari from hijacking playback.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000/?room=CODE` (get a code from the host app), or open the root page and type the code.

## Features

- Reads `?room=CODE` from the URL, or shows a code-entry form
- Socket.io signaling with automatic reconnect + room re-join
- Receives the host's WebRTC offer, answers, exchanges ICE candidates
- Remote control: request/release, normalized pointer + keyboard + scroll input over a DataChannel, clipboard sync
- Status bar with connection state, room code, and signaling latency
- Auto-recovers when the host restarts (new offer replaces the old peer connection)

## Production

### Vercel

Import the repo, set `NEXT_PUBLIC_SIGNALING_SERVER` to your deployed server URL, deploy. No other configuration needed.

### Self-hosted

```bash
npm run build
npm start
```

## Environment variables

See [.env.example](.env.example) — no URLs are hardcoded.

## License

MIT — see [LICENSE](LICENSE).

# screen-sharing-viewer

Browser-based viewer and **remote-control client** for the cross-platform screen sharing MVP. Open a link like `https://viewer.example.com/?room=ABC123`, watch the host's screen live over WebRTC, and — once the host approves — drive its mouse and keyboard. No install, no plugins.

This app **also contains the signaling server** as Next.js API routes
(`app/api/*`), so the viewer and signaling deploy as a single Vercel project —
no separate server needed. Signaling uses SSE + POST (serverless-friendly) with
state in Upstash Redis; media itself is peer-to-peer.

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
- **Built-in signaling** over SSE + POST (`app/api/*`) — serverless-friendly, no Socket.io server
- Automatic SSE reconnect with room re-announce
- Receives the host's WebRTC offer, answers, exchanges ICE candidates
- Remote control: request/release, normalized pointer + keyboard + scroll input over a DataChannel, clipboard sync
- Status bar with connection state, room code, and signaling latency
- Auto-recovers when the host restarts (new offer replaces the old peer connection)

## Signaling API (same app)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/rooms/create` | Create a room, returns a 6-char code |
| `GET` | `/api/rooms/:code` | Room status |
| `GET` | `/api/signal/:code?peerId=&role=` | SSE stream of messages for this peer |
| `POST` | `/api/signal/:code` | Send a signal (`host:join`, `viewer:join`, `webrtc:*`, `leave`) |
| `GET` | `/api/ping` | Latency probe |

State lives in Upstash Redis in production, or an in-memory backend for `next dev`.

## Production

**Everything deploys to Vercel as one project** (viewer + signaling). Add the
Upstash Redis integration for shared state. Full step-by-step — including the
monorepo Root Directory setting — in **[DEPLOY.md](DEPLOY.md)**.

## Environment variables

See [.env.example](.env.example) — no URLs are hardcoded.

## License

MIT — see [LICENSE](LICENSE).

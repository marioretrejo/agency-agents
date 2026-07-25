# screen-sharing-server

WebRTC signaling server for the cross-platform screen sharing MVP. Manages rooms with 6-character codes and relays WebRTC offers/answers/ICE candidates between a host (Electron app) and viewers (web browsers) over Socket.io.

## Compatibility

| Platform | Supported |
|----------|-----------|
| Linux (amd64 / arm64) | ✅ Docker multi-arch |
| macOS (Intel / Apple Silicon) | ✅ Node 20+ |
| Windows | ✅ Node 20+ |

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Server listens on `http://localhost:5000`.

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/rooms/create` | Create a room, returns `{ code, hostConnected, viewerCount, createdAt }` |
| `GET` | `/api/rooms/:code` | Room status |
| `GET` | `/health` | Health check |

### Socket.io events

- Client → server: `host:join`, `viewer:join`, `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`, `latency:ping`
- Server → client: `room:joined`, `room:error`, `room:closed`, `viewer:connected`, `viewer:disconnected`, `host:connected`, `host:disconnected`, `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate`

Signals carry `{ to, data }` where `to` is the target socket id; the server relays them as `(fromSocketId, data)`.

## Production

### Docker

```bash
docker compose up --build          # local testing
npm run docker:build               # multi-arch image (linux/amd64 + linux/arm64)
```

### Railway / Render / Fly.io

Deploy the Dockerfile directly. Set `PORT` (provided by most platforms) and `CORS_ORIGIN` to your viewer's URL — do **not** leave `*` in production.

## Environment variables

See [.env.example](.env.example). No URLs are hardcoded.

## License

MIT — see [LICENSE](LICENSE).

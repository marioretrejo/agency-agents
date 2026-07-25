# screen-sharing-host

Cross-platform Electron desktop app that captures your screen and streams it to web viewers over WebRTC (VP8 preferred). Pairs with [`screen-sharing-server`](../screen-sharing-server) (signaling) and [`screen-sharing-viewer`](../screen-sharing-viewer) (browser client).

## Compatibility

| Platform | Capture path | Packages |
|----------|-------------|----------|
| Windows 7+/10/11 | `desktopCapturer` | NSIS installer, portable |
| macOS 10.13+ (Intel & Apple Silicon) | `desktopCapturer` | dmg, zip (x64 + arm64) |
| Linux (Ubuntu/Debian/Fedora, X11) | `desktopCapturer` | AppImage, deb |
| Linux (Wayland) | `getDisplayMedia()` fallback | AppImage, deb |

OS detection uses `process.platform`; capture falls back to `getDisplayMedia()` automatically if `desktopCapturer` returns no sources.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Requires the signaling server running (see `SIGNALING_SERVER` in `.env`).

## Usage

1. Click **Create Room** — the app requests a room code from the server and starts capturing the primary display.
2. Share the 6-character code or the copy-to-clipboard link.
3. Watch connected viewers appear in the list. Click **Stop sharing** to end.

## Packaging

```bash
npm run package       # current platform
npm run package:all   # Windows + macOS + Linux, x64 + arm64
```

Code signing/notarization is disabled by default (`identity: null`, `certificateFile: null` in `electron-builder.yml`); add credentials before public distribution.

## Architecture

- `src/main.ts` — Electron main process: window, OS detection, `desktopCapturer` IPC, crash recovery, `setDisplayMediaRequestHandler` fallback.
- `src/preload.ts` — context-isolated bridge (`window.electronAPI`).
- `src/lib/screen-capturer.ts` — multi-platform capture with fallback.
- `src/lib/webrtc.ts` — one `RTCPeerConnection` per viewer, Socket.io signaling, auto-reconnect.
- `src/renderer/App.tsx` — React UI (room code, viewer list, status).

## License

MIT — see [LICENSE](LICENSE).

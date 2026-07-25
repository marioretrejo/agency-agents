# screen-sharing-host

Cross-platform Electron desktop app that shares this machine's screen **and grants remote control** to web viewers over WebRTC (VP8 preferred) — remote-assistance software in the style of AnyDesk/TeamViewer. Pairs with [`screen-sharing-server`](../screen-sharing-server) (signaling) and [`screen-sharing-viewer`](../screen-sharing-viewer) (browser client).

## Remote control & consent model

This app can hand full mouse + keyboard control of the host machine to a remote viewer. That only ever happens with the host's consent — this is assistance software, not stealth access:

- **A viewer cannot control anything until the host grants it.** By default every control request pops up an **Allow / Deny** prompt on the host.
- **Unattended access** is opt-in: the host can set an access password before sharing; a viewer who supplies the correct password is granted automatically. Leave the password empty to require manual approval every time.
- **A persistent red banner** is shown on the host the entire time it's being controlled, and the host can **revoke** control at any moment.

Input injection uses [`@nut-tree-fork/nut-js`](https://github.com/nut-tree/nut.js) (an `optionalDependency`). If the native module isn't installed/built, the app runs in **view-only mode** and says so. On macOS the host must grant **Accessibility** and **Screen Recording** permission; on Linux Wayland input injection may be restricted by the compositor.

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

1. (Optional) Set an **unattended access password** to allow control without a per-session prompt.
2. Click **Create Room** — the app requests a room code from the server and starts capturing the primary display.
3. Share the 6-character code or the copy-to-clipboard link.
4. When a viewer clicks **Request control**, approve it with **Allow** (skipped if the correct password was supplied). A red banner shows while you're being controlled; **Revoke** ends control without ending the session.
5. Click **Stop sharing** to end.

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
- `src/lib/webrtc.ts` — one `RTCPeerConnection` + control `DataChannel` per viewer, Socket.io signaling, auto-reconnect, control grant/deny/revoke, input routing to main.
- `src/input.ts` — OS input injection (mouse/keyboard/scroll) via nut.js, main process.
- `src/control-types.ts` — control-channel wire protocol (shared with the viewer).
- `src/renderer/App.tsx` — React UI (room code, viewer list, control approval, being-controlled banner).

## License

MIT — see [LICENSE](LICENSE).

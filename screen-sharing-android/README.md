# screen-sharing-android

Native Android **host** app: shares this phone's screen and (optionally) lets an
approved remote viewer control it — the Android counterpart of the desktop host,
using the same signaling and viewer.

> ⚠️ **Status: builds successfully; not yet runtime-tested on a device.**
> The project **compiles cleanly** (`./gradlew assembleDebug`, AGP 8.5 / SDK 34)
> and produces installable APKs. It has **not** been run on a real device yet,
> so on-device behaviour (capture prompt, WebRTC connect, gesture injection)
> still needs verification. The web viewer + signaling it talks to *are*
> deployed and tested end-to-end.
>
> Build output: `app-arm64-v8a-debug.apk` (~18 MB, most phones),
> `app-armeabi-v7a-debug.apk` (older 32-bit), `app-x86_64-debug.apk` (emulators),
> and a universal `app-universal-debug.apk` (~48 MB).

## Why a native app (and not just a link)

Chrome on Android cannot capture the device screen from a web page
(`getDisplayMedia` is unsupported on Android), and no browser can grant OS-level
control. Both require a native app: `MediaProjection` for capture and an
`AccessibilityService` for input injection. This is the same reason AnyDesk /
TeamViewer ship an Android app.

## Consent model (this is assistance software, not spyware)

There is **no zero-touch capture** on modern Android — by OS design. This app
requires explicit, visible consent:

- **Screen capture:** Android shows its own "Start recording/casting?" dialog
  every session. One tap.
- **Remote control:** the user must enable the accessibility service once in
  Settings, and control is only injected after the viewer's request is granted.
- A persistent notification shows while sharing.

Truly unattended (zero-touch) access is only possible on devices you own and
enrol in an MDM as device owner — out of scope here.

## What works / what's partial

| Capability | State |
|-----------|-------|
| Join a room by code / invite deep link | ✅ implemented |
| Screen capture via MediaProjection | ✅ implemented |
| Stream to viewer over WebRTC (VP8) | ✅ implemented (same protocol as desktop) |
| Remote **tap** and **scroll** via accessibility | ✅ implemented |
| Remote **keyboard / arbitrary text** | ⚠️ not implemented — stock Android accessibility can't inject arbitrary keystrokes |
| Drag / multi-touch gestures | ⚠️ basic taps/swipes only |

## Build

Requires Android Studio (Giraffe+) or the Android SDK (compileSdk 34).

```bash
# from this folder, once the Android SDK is installed and local.properties
# points at it (Android Studio does this for you):
gradle wrapper            # generate the wrapper if missing
./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
```

The signaling endpoint defaults to the deployed viewer
(`https://screen-sharing-viewer.vercel.app`). Override at build time:

```bash
./gradlew assembleDebug -PsignalingServer=https://your-deployment.example.com
```

## Use

1. Install the APK on the phone to be shared/controlled.
2. The controller creates a session in the web viewer and sends the 6-char code
   (or the `/share?room=CODE` invite link, which can open this app directly).
3. Open the app, enter the code, tap **Share my screen**, accept Android's
   capture prompt.
4. For control, tap **Enable remote control** once and turn on the accessibility
   service. When the viewer clicks *Request control*, it's granted and taps/
   scrolls are injected.

## Architecture

- `MainActivity` — code entry, deep-link prefill, permission flow.
- `ScreenShareService` — mediaProjection foreground service owning the session.
- `WebRtcHost` — one peer connection per viewer, screen video track, control
  data channel (grants/denies, routes input).
- `SignalingClient` — SSE + POST client for the same `/api/signal` protocol.
- `ControlService` — AccessibilityService injecting taps/scroll from normalized
  coordinates.

## License

MIT.

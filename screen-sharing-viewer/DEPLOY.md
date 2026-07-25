# Deployment — everything on Vercel

The signaling server is built into this Next.js app as API routes (`app/api/*`),
so the **web viewer and the signaling both run as one Vercel project**. There is
no separate server to deploy. Media still flows peer-to-peer over WebRTC; the
API is only used for the brief offer/answer/ICE handshake.

| Part | Where |
|------|-------|
| Viewer **+ signaling** | **Vercel** (this app) |
| Signaling state store | **Upstash Redis** (Vercel Marketplace integration) |
| Host | Desktop app, points at the Vercel URL |

---

## Step 1 — Import to Vercel

1. <https://vercel.com/new> → import this GitHub repo.
2. **Set Root Directory to `screen-sharing-viewer`.** It's a monorepo — this is the step people miss.
3. Framework preset: **Next.js** (auto-detected). Don't deploy yet — add storage first (Step 2).

## Step 2 — Add Upstash Redis (required)

On Vercel, an SSE request and a POST can land on **different** serverless
instances, so signaling state must live in a shared store, not in memory.

1. In your Vercel project → **Storage** → **Marketplace** → add **Upstash for Redis** (free tier is fine).
2. Connect it to the project. Vercel injects `UPSTASH_REDIS_REST_URL` and
   `UPSTASH_REDIS_REST_TOKEN` automatically — the app picks them up with no code changes.

> Skipping this "works" only by luck when requests reuse one warm instance; it will drop signals in production. Add the store.

## Step 3 — Deploy

Deploy. You get a URL like `https://screen-sharing-viewer.vercel.app`. That single
URL is both the viewer and the signaling server.

- Sanity checks: `https://<url>/api/ping` returns `{"t":...}`, and
  `POST https://<url>/api/rooms/create` returns a room code.
- The viewer needs **no** `NEXT_PUBLIC_SIGNALING_SERVER` — it calls its own `/api` same-origin.

## Step 4 — (Optional) lock down CORS

The viewer is same-origin, but the desktop host calls the API cross-origin. By
default any origin is allowed. To restrict it, set `SIGNALING_CORS_ORIGIN` to the
host's origin and redeploy. (For the packaged Electron app the origin is
`file://`, which sends `Origin: null`; leave CORS open or handle that explicitly
if you lock it down.)

---

## Step 5 — Run the host against production

On the machine you want to share/control:

```bash
cd screen-sharing-host
npm install
SIGNALING_SERVER=https://screen-sharing-viewer.vercel.app \
VIEWER_URL=https://screen-sharing-viewer.vercel.app \
npm run dev
```

Click **Create Room** → the copy-to-clipboard link points at your live viewer,
e.g. `https://screen-sharing-viewer.vercel.app/?room=ABC123`. Open it on any
device, click **Request control**, approve on the host.

For a real installer instead of `npm run dev`, set the same two env vars at build
time and run `npm run package` (see the host README).

---

## Local development (no Vercel, no Redis)

`npm run dev` uses an in-memory backend that works because `next dev` is a single
process. Run the host with `SIGNALING_SERVER=http://localhost:3000`.

---

## Known limitation: cross-network NAT

STUN (already configured) covers most cases, but two devices on **different
restrictive networks** may fail to connect peer-to-peer without a **TURN relay**.
If video never appears across networks, add a TURN server to `iceServers` in both
`screen-sharing-viewer/lib/webrtc.ts` and `screen-sharing-host/src/lib/webrtc.ts`
(e.g. a free [Metered](https://www.metered.ca/tools/openrelay/) or self-hosted
coturn). Same-network / same-machine testing does not need TURN.

## Notes on serverless signaling

- The SSE stream closes after ~25s and the client reconnects automatically;
  queued messages wait in Redis, so a reconnect gap doesn't lose signals.
- First connection after idle may cold-start (~1–2s).
- The standalone `screen-sharing-server` (Socket.io) is **legacy** and is no
  longer used by these clients — they speak the SSE/POST protocol above.

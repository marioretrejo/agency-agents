# Deployment walkthrough (Vercel + Render)

The system has three parts. Two get deployed; one is a desktop app.

| Part | Where | Why |
|------|-------|-----|
| `screen-sharing-viewer` | **Vercel** | Static/SSR Next.js — Vercel's sweet spot |
| `screen-sharing-server` | **Render** (free) | Socket.io needs a persistent WebSocket server, which Vercel serverless can't hold |
| `screen-sharing-host` | Desktop app | Runs on the machine being shared/controlled |

> ⚠️ This is a **monorepo**. On both platforms you must set the **Root Directory** to the subfolder, or the build will fail.

---

## Step 1 — Deploy the signaling server to Render

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect this GitHub repo. Render detects [`screen-sharing-server/render.yaml`](../screen-sharing-server/render.yaml).
   - If you deploy the service manually instead of via blueprint: **New → Web Service**, set **Root Directory** = `screen-sharing-server`, **Runtime** = Docker, **Health Check Path** = `/health`.
3. Deploy. You'll get a URL like `https://screen-sharing-server-xxxx.onrender.com`.
4. Verify it's up: open `https://<that-url>/health` — you should see `{"status":"ok",...}`.

> Render's free tier sleeps after inactivity; the first request may take ~30s to wake.

---

## Step 2 — Deploy the viewer to Vercel

1. Go to <https://vercel.com/new> and import this GitHub repo.
2. **Set Root Directory to `screen-sharing-viewer`** (Vercel shows an "Edit" button next to Root Directory during import). This is the step people miss.
3. Framework preset: **Next.js** (auto-detected).
4. Add an **Environment Variable**:
   - `NEXT_PUBLIC_SIGNALING_SERVER` = the Render URL from Step 1 (e.g. `https://screen-sharing-server-xxxx.onrender.com`)
   - Must be `https://` — a browser on an `https` Vercel page cannot talk to an `http` server (mixed content).
5. Deploy. You'll get a URL like `https://screen-sharing-viewer.vercel.app`.

---

## Step 3 — Lock down CORS (recommended)

Back in Render, set the service's `CORS_ORIGIN` env var to your exact Vercel URL
(`https://screen-sharing-viewer.vercel.app`) instead of `*`, then redeploy.

---

## Step 4 — Run the host and point it at production

On the machine you want to share:

```bash
cd screen-sharing-host
npm install
SIGNALING_SERVER=https://screen-sharing-server-xxxx.onrender.com \
VIEWER_URL=https://screen-sharing-viewer.vercel.app \
npm run dev
```

Click **Create Room** → the copy-to-clipboard link now points at your live Vercel
viewer, e.g. `https://screen-sharing-viewer.vercel.app/?room=ABC123`. Open that on
any other device, click **Request control**, approve it on the host.

To ship a real installer instead of `npm run dev`, set the same two env vars at
build time and run `npm run package` (see the host README).

---

## Known limitation: cross-network NAT

STUN (already configured) covers most cases, but two devices on **different
restrictive networks** may fail to connect peer-to-peer without a **TURN relay**.
If video never appears across networks, add a TURN server to `iceServers` in both
`screen-sharing-viewer/lib/webrtc.ts` and `screen-sharing-host/src/lib/webrtc.ts`
(e.g. a free [Metered](https://www.metered.ca/tools/openrelay/) or self-hosted
coturn). Same network / same-machine testing does not need TURN.

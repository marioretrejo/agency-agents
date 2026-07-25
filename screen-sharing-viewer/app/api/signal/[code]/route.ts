import { corsHeaders, json, preflight } from '@/lib/cors';
import {
  isValidCode,
  normalizeCode,
  popMessages,
  routeMessage,
  type SignalMessage,
} from '@/lib/signaling-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Keep the SSE function alive up to a minute; the client's EventSource
// auto-reconnects when it ends, and queued messages wait in the store.
export const maxDuration = 60;

const STREAM_MS = 25_000; // close before the platform limit; client reconnects
const POLL_MS = 400; // signaling-handshake latency, acceptable for a one-time setup
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function OPTIONS(): Response {
  return preflight();
}

/** SSE stream: drains this peer's message queue and pushes events to the client. */
export function GET(req: Request, { params }: { params: { code: string } }): Response {
  const code = normalizeCode(params.code);
  const url = new URL(req.url);
  const peerId = url.searchParams.get('peerId');

  if (!isValidCode(code) || !peerId) {
    return json({ error: 'Missing or invalid code/peerId' }, 400);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const end = () => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      req.signal.addEventListener('abort', end);

      // Tell the client how soon to reconnect, then signal readiness.
      controller.enqueue(encoder.encode('retry: 1000\n\n'));
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ peerId })}\n\n`));

      const startedAt = Date.now();
      try {
        while (!closed && Date.now() - startedAt < STREAM_MS) {
          const msgs = await popMessages(code, peerId);
          for (const m of msgs) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
          }
          controller.enqueue(encoder.encode(': ping\n\n')); // heartbeat comment
          await sleep(POLL_MS);
        }
      } catch (err) {
        console.error('[Signaling] stream error', err);
      } finally {
        end();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/** Client -> server: route a signaling message to the target peer's queue. */
export async function POST(
  req: Request,
  { params }: { params: { code: string } },
): Promise<Response> {
  const code = normalizeCode(params.code);
  if (!isValidCode(code)) {
    return json({ error: 'Invalid room code' }, 400);
  }
  let body: SignalMessage & { role?: string };
  try {
    body = (await req.json()) as SignalMessage & { role?: string };
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  const result = await routeMessage(code, body);
  return json(result, result.ok ? 200 : 404);
}

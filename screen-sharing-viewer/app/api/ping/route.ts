import { json, preflight } from '@/lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

/** Trivial endpoint for the viewer to measure signaling round-trip latency. */
export function GET(): Response {
  return json({ t: Date.now() });
}

import { corsHeaders, json, preflight } from '@/lib/cors';
import { createRoom } from '@/lib/signaling-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function POST(): Promise<Response> {
  try {
    const room = await createRoom();
    return json(room, 201);
  } catch (err) {
    console.error('[Signaling] create room failed', err);
    return json({ error: 'Failed to create room' }, 500);
  }
}

// Also allow GET for convenience/health of the route.
export function GET(): Response {
  return new Response('Use POST to create a room', { status: 405, headers: corsHeaders });
}

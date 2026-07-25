/**
 * The web viewer calls these API routes same-origin (no CORS needed), but the
 * Electron host is a different origin, so the signaling routes must allow
 * cross-origin requests. Set SIGNALING_CORS_ORIGIN to lock this down to your
 * host's origin in production; defaults to "*".
 */
const ORIGIN = process.env.SIGNALING_CORS_ORIGIN ?? '*';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

import { json, preflight } from '@/lib/cors';
import { getRoomInfo, isValidCode, normalizeCode } from '@/lib/signaling-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return preflight();
}

export async function GET(
  _req: Request,
  { params }: { params: { code: string } },
): Promise<Response> {
  const code = normalizeCode(params.code);
  if (!isValidCode(code)) {
    return json({ error: 'Invalid room code format' }, 400);
  }
  const info = await getRoomInfo(code);
  if (!info) {
    return json({ error: 'Room not found' }, 404);
  }
  return json(info);
}

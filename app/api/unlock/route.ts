/**
 * POST /api/unlock — exchange the site access code for a gate cookie.
 * Body: { code: string }. On success sets an httpOnly cookie holding the
 * SHA-256 digest of the code (see lib/ai/access.ts). Added 2026-11-01.
 */
import { ACCESS_COOKIE, accessTokenFor, configuredAccessCode } from '@/lib/ai/access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const expected = configuredAccessCode();
  if (!expected) {
    return Response.json({ ok: true, gate: 'off' });
  }
  let code = '';
  try {
    const body = (await req.json()) as { code?: string };
    code = (body.code ?? '').trim();
  } catch { /* fall through to 401 */ }
  if (!code || code !== expected) {
    return Response.json({ ok: false, error: 'invalid_code' }, { status: 401 });
  }
  const token = await accessTokenFor(expected);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': `${ACCESS_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`,
    },
  });
}

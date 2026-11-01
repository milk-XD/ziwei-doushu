/**
 * Access code gate (added 2026-11-01 for Muse). Active only when
 * SITE_ACCESS_CODE is set; see lib/ai/access.ts. Pages redirect to
 * /access, API routes answer 401 so the shipped panels show their
 * generic failure message instead of spending AI tokens.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, configuredAccessCode, isAccessAuthorized } from '@/lib/ai/access';

export const config = {
  matcher: ['/chart', '/heming', '/api/interpret', '/api/heming'],
};

export async function middleware(req: NextRequest) {
  if (!configuredAccessCode()) return NextResponse.next();
  const authorized = await isAccessAuthorized(req.cookies.get(ACCESS_COOKIE)?.value);
  if (authorized) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return Response.json(
      { error: 'access_denied', message: '需要访问口令：请先在 /access 输入口令。' },
      { status: 401 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/access';
  url.search = `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

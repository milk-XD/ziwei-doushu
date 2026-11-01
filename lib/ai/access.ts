/**
 * Optional site access code gate (added 2026-11-01 for Muse).
 *
 * When the SITE_ACCESS_CODE environment variable is set, the chart and
 * synastry pages plus the AI API routes require a cookie that proves the
 * visitor entered the code on /access. When the variable is empty or
 * unset, the gate is fully off (local development default).
 *
 * The cookie never stores the code itself, only its SHA-256 hex digest.
 */

export const ACCESS_COOKIE = 'ziwei_access';

export function configuredAccessCode(): string {
  return (process.env.SITE_ACCESS_CODE ?? '').trim();
}

export async function accessTokenFor(code: string): Promise<string> {
  const data = new TextEncoder().encode(`ziwei-access:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function isAccessAuthorized(cookieValue: string | undefined): Promise<boolean> {
  const code = configuredAccessCode();
  if (!code) return true;
  if (!cookieValue) return false;
  return cookieValue === (await accessTokenFor(code));
}

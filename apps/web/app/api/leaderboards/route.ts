import { boardPage } from '@/server/boards/page';
import { safeDecode } from '@/server/decode';
import { allow, fail, json } from '@/server/game/http';

export const dynamic = 'force-dynamic';

/**
 * One board as JSON, for the public leaderboard page's server side (`pages/leaderboards.tsx`
 * reads this, because a pages-router page can not use the server's own modules). Answers what the
 * page draws and nothing more: the same rows anyone may see, as the caller (a visitor, or the
 * signed-in player whose cookie came with the request). With no database keys or the leaderboards
 * switch off: the plain 404.
 */
export async function GET(req: Request): Promise<Response> {
  if (!allow('leaderboards-all', 1200, 60_000)) {
    return fail(429, 'That was a lot of tries. Wait a minute and try again.', {
      'Retry-After': '60',
    });
  }
  const url = new URL(req.url);
  const cookies: Record<string, string> = {};
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at <= 0) continue;
    // A cookie with a broken escape is skipped, never a 500.
    const value = safeDecode(part.slice(at + 1).trim());
    if (value !== null) cookies[part.slice(0, at).trim()] = value;
  }
  const query: Record<string, string> = {};
  for (const [k, v] of url.searchParams) if (!(k in query)) query[k] = v.slice(0, 64);
  const props = await boardPage(cookies, query);
  if (!props) return fail(404, 'Not found.');
  return json(props, 200, { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' });
}

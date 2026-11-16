import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthDeps } from './auth/deps';
import { resetRateLimits } from './game/http';
import { safeDecode } from './decode';

/*
 * A cookie or a path with a broken escape (security review, m5.5). `decodeURIComponent` throws on
 * a lone `%` or half a UTF-8 sequence, and a route that called it bare answered 500 to anyone who
 * sent one. A bad cookie is skipped and a bad path is a plain 404.
 */

type Handler = (req: Request, ctx?: unknown) => Promise<Response>;
const HOST = 'http://localhost:3000';
const BAD = '%E0%A4%A';

beforeAll(() => setAuthDeps(null));
afterAll(() => setAuthDeps(undefined));
beforeEach(() => resetRateLimits());

describe('broken escapes', () => {
  it('safeDecode gives null for a broken escape and the text for a good one', () => {
    expect(safeDecode(BAD)).toBeNull();
    expect(safeDecode('%')).toBeNull();
    expect(safeDecode('a%20b')).toBe('a b');
  });

  it('the leaderboards route skips a malformed cookie instead of answering 500', async () => {
    const { GET } = (await import('@/app/api/leaderboards/route')) as { GET: Handler };
    const res = await GET(
      new Request(`${HOST}/api/leaderboards?board=grazier`, {
        headers: { host: 'localhost:3000', cookie: `gg_theme=dark; sb-x-auth-token=${BAD}` },
      }),
    );
    expect(res.status).toBeLessThan(500);
  });

  it('the ad click and ad media routes answer a broken path with a 404', async () => {
    const click = (await import('@/app/api/ads/click/[id]/route')) as { GET: Handler };
    const media = (await import('@/app/api/ads/media/[id]/route')) as { GET: Handler };
    for (const [handler, path] of [
      [click.GET, `/api/ads/click/${BAD}`],
      [media.GET, `/api/ads/media/${BAD}`],
    ] as const) {
      const res = await handler(
        new Request(`${HOST}${path}`, { headers: { host: 'localhost:3000' } }),
        { params: Promise.resolve({ id: BAD }) },
      );
      expect(res.status, path).toBe(404);
    }
  });
});

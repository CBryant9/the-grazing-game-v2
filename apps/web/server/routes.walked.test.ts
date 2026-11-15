import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setAuthDeps } from './auth/deps';
import { resetRateLimits } from './game/http';

/*
 * Every route file that exists after the m6 join, walked with no keys (no database, no sign-in,
 * no Stripe, no push, no secret): each method each file exports answers, and none answers 5xx.
 * The families' own suites walk them again with keys and fakes (admin, billing, ads, notify,
 * daily, community); this one makes sure a route file nobody listed can not slip through.
 */

type Handler = (req: Request, ctx?: unknown) => Promise<Response>;
const modules = import.meta.glob('../app/api/**/route.{ts,tsx}');
const HOST = 'http://localhost:3000';

beforeAll(() => {
  // No keys: the accounts' dependencies are absent, as in a fresh copy with no environment.
  setAuthDeps(null);
});
afterAll(() => setAuthDeps(undefined));

const pathOf = (file: string): string =>
  file
    .replace('../app', '')
    .replace(/\/route\.tsx?$/, '')
    .replace(/\[([a-z]+)\]/g, '00000000-0000-4000-8000-000000000001');

describe('every route, walked with no keys', () => {
  const files = Object.keys(modules).sort();

  it('finds the route files of every family', () => {
    for (const family of [
      'admin',
      'ads',
      'auth',
      'billing',
      'community',
      'daily',
      'game',
      'notify',
      'leaderboards',
      'ticker',
      'client-error',
    ]) {
      expect(
        files.some((f) => f.startsWith(`../app/api/${family}/`)),
        family,
      ).toBe(true);
    }
  });

  for (const file of Object.keys(modules).sort()) {
    it(`${pathOf(file)} answers without a 5xx`, async () => {
      resetRateLimits();
      const mod = (await modules[file]!()) as Record<string, unknown>;
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter(
        (m) => typeof mod[m] === 'function',
      );
      expect(methods.length, file).toBeGreaterThan(0);
      for (const m of methods) {
        const req = new Request(`${HOST}${pathOf(file)}`, {
          method: m,
          headers: {
            host: 'localhost:3000',
            origin: HOST,
            ...(m === 'GET' ? {} : { 'content-type': 'application/json' }),
          },
          body: m === 'GET' ? undefined : '{}',
        });
        const params = Promise.resolve({ id: '00000000-0000-4000-8000-000000000001' });
        const res = await (mod[m] as Handler)(req, { params });
        expect(res.status, `${m} ${pathOf(file)}`).toBeLessThan(500);
      }
    }, 60_000);
  }
});

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import type { AuthDeps } from './accounts';
import { setAuthDeps } from './deps';
import type { AuthProvider, AuthUser, CookieJar } from './provider';
import { authRoute } from './route';
import { isSessionCookie, sessionCookieName } from './supabase';

/*
 * Security review, m5.5 (finding 3). A `session` limit was keyed on the text of every `sb-*`
 * cookie, so a caller who sent a new made-up cookie each time got a fresh count each time. Now the
 * key is the account id the provider verified, and anything else is counted with its address.
 */

const HOST = 'http://localhost:3000';

/** A provider that knows two tokens, and nothing else. */
const provider = {
  async session(jar: CookieJar): Promise<AuthUser | null> {
    const token = jar.getAll().find((c) => c.name === 'test_session')?.value;
    if (token === 'token-a')
      return { id: 'user-a', email: null, method: 'email', anonymous: false };
    if (token === 'token-b')
      return { id: 'user-b', email: null, method: 'email', anonymous: false };
    return null;
  },
} as unknown as AuthProvider;

const handler = authRoute({ name: 'ratekey-test', max: 2, by: 'session' }, async () => ({
  ok: true,
}));

const call = (cookie?: string, address = '10.9.9.9') =>
  handler(
    new Request(`${HOST}/api/test`, {
      headers: {
        host: 'localhost:3000',
        'x-real-ip': address,
        ...(cookie ? { cookie } : {}),
      },
    }),
  );

beforeEach(() => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  resetRateLimits();
  setAuthDeps({ provider, sql: null as never, pepper: 'x' } as unknown as AuthDeps);
});
afterAll(() => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
});

describe('the limit on signed-in routes', () => {
  it('gives a made-up sign-in cookie no fresh count', async () => {
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(429);
    // A new junk cookie each time is the same caller at the same address.
    expect((await call('sb-abc-auth-token=junk1')).status).toBe(429);
    expect((await call('sb-other-auth-token=junk2; sb-x=1')).status).toBe(429);
    expect((await call('test_session=forged')).status).toBe(429);
  });

  it('counts each verified account on its own, whatever else it sends', async () => {
    expect((await call('test_session=token-a')).status).toBe(200);
    expect((await call('test_session=token-a; sb-junk=1')).status).toBe(200);
    expect((await call('test_session=token-a; sb-junk=2')).status).toBe(429);
    // Another player behind the same address has an allowance of their own.
    expect((await call('test_session=token-b')).status).toBe(200);
    // And so does the address itself.
    expect((await call()).status).toBe(200);
  });

  it('keys on the account, not the address, for a verified player', async () => {
    expect((await call('test_session=token-a', '10.0.0.1')).status).toBe(200);
    expect((await call('test_session=token-a', '10.0.0.2')).status).toBe(200);
    expect((await call('test_session=token-a', '10.0.0.3')).status).toBe(429);
  });
});

describe("the project's sign-in cookie", () => {
  it('is named from the project address, chunks included, and nothing else', () => {
    const base = sessionCookieName('https://abcdefgh.supabase.co');
    expect(base).toBe('sb-abcdefgh-auth-token');
    expect(isSessionCookie('sb-abcdefgh-auth-token', base)).toBe(true);
    expect(isSessionCookie('sb-abcdefgh-auth-token.0', base)).toBe(true);
    expect(isSessionCookie('sb-abcdefgh-auth-token.12', base)).toBe(true);
    expect(isSessionCookie('sb-other-auth-token', base)).toBe(false);
    expect(isSessionCookie('sb-abcdefgh-auth-token.x', base)).toBe(false);
    expect(isSessionCookie('sb-abcdefgh-auth-token-code-verifier', base)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAuthDeps } from '../auth/deps';
import { firstSetup } from './firstScreen';
import { DAILY_NO_DATABASE } from './setup';

/*
 * The /play speed fix (m8): a request with none of the game's cookies can have no farm, so the
 * page draws setup in its HTML with the same choices the setup route sends. Any cookie that could
 * lead to a farm, and the page loads as before.
 */

beforeEach(() => {
  setAuthDeps(null);
  vi.stubEnv('SUPABASE_DB_POOLER_URL', '');
});
afterEach(() => {
  vi.unstubAllEnvs();
  setAuthDeps(undefined);
});

describe('the first screen of /play', () => {
  it('with no cookies, the setup choices, with what Daily Farm needs', async () => {
    const setup = await firstSetup([]);
    expect(setup).not.toBeNull();
    expect(setup!.districts.length).toBeGreaterThan(0);
    expect(setup!.daily).toEqual({ state: 'off', text: DAILY_NO_DATABASE, limit: 0, going: 0 });
  });

  it('cookies that are not the game’s do not count', async () => {
    expect(await firstSetup([{ name: 'gg_theme' }, { name: 'other' }])).not.toBeNull();
  });

  it('a guest session, an open farm or a sign-in: null, so the page asks for the farm as before', async () => {
    for (const name of [
      'gg_session',
      'gg_farm',
      'sb-abcdefgh-auth-token',
      'sb-abcdefgh-auth-token.0',
    ]) {
      expect(await firstSetup([{ name }]), name).toBeNull();
    }
  });
});

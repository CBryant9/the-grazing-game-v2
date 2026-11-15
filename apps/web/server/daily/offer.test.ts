import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAuthDeps } from '../auth/deps';
import { GameServer } from '../game/game';
import { DAILY_NO_DATABASE } from '../game/setup';
import { MemoryFarmStore } from '../game/store';
import type { Player } from '../player';
import { DailyData } from './data';
import { DAILY_DEV_LOCAL, DAILY_NO_SIGN_IN, dailyOffer } from './offer';
import { DEV_LOCAL_DAILY_ENV, devLocalDaily, dailyRuntime } from './runtime';
import { at, choices } from './testrig';

/*
 * Daily Farm with no database (m8). Setup says what Daily Farm needs, never "coming". In
 * development, GG_DEV_LOCAL_DAILY=1 lets a guest try it on farm files.
 */

const GUEST = { user: null, signedUp: false } as unknown as Player;
const DB_ENV = 'SUPABASE_DB_POOLER_URL';

beforeEach(() => {
  setAuthDeps(null);
  vi.stubEnv(DB_ENV, '');
  vi.stubEnv(DEV_LOCAL_DAILY_ENV, '');
  globalThis.__ggDaily = undefined;
});
afterEach(() => {
  vi.unstubAllEnvs();
  setAuthDeps(undefined);
  globalThis.__ggDaily = undefined;
  // A stubbed connection string makes a client that never connects. Drop it.
  globalThis.__ggSql = undefined;
});

describe('setup with no database', () => {
  it('says Daily Farm needs the database, in plain words', async () => {
    const offer = await dailyOffer(GUEST);
    expect(offer).toEqual({ state: 'off', text: DAILY_NO_DATABASE, limit: 0, going: 0 });
    expect(offer.text).toContain('needs the game database');
    expect(offer.text.toLowerCase()).not.toContain('coming');
  });

  it('with a database but no sign-in set up, says it needs an account', async () => {
    vi.stubEnv(DB_ENV, 'postgres://user:pass@127.0.0.1:5/none');
    const offer = await dailyOffer(GUEST);
    expect(offer).toMatchObject({ state: 'off', text: DAILY_NO_SIGN_IN });
  });

  it('the development setting is ignored outside development', async () => {
    vi.stubEnv(DEV_LOCAL_DAILY_ENV, '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(devLocalDaily()).toBe(false);
    expect(dailyRuntime()).toBeUndefined();
    expect((await dailyOffer(GUEST)).state).toBe('off');
  });

  it('the development setting is ignored when a database is set', () => {
    vi.stubEnv(DEV_LOCAL_DAILY_ENV, '1');
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv(DB_ENV, 'postgres://user:pass@127.0.0.1:5/none');
    expect(devLocalDaily()).toBe(false);
  });

  it('in development with GG_DEV_LOCAL_DAILY=1, a guest is offered Daily Farm on farm files', async () => {
    vi.stubEnv(DEV_LOCAL_DAILY_ENV, '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(await dailyOffer(GUEST)).toEqual({
      state: 'open',
      text: DAILY_DEV_LOCAL,
      limit: 1,
      going: 0,
    });
    expect(dailyRuntime()?.local).toBe(true);
  });
});

describe('a local Daily Farm (development only)', () => {
  it('a guest starts one, and the night is run when the farm is next opened', async () => {
    const clock = { now: at('2026-11-13', '10:00:00') };
    const game = new GameServer({
      store: new MemoryFarmStore(),
      seed: () => 5,
      saveRetryMs: [0, 0],
      now: () => clock.now,
      daily: {
        data: new DailyData(null, () => clock.now, 0),
        enabled: async () => true,
        local: true,
      },
    });
    const session = 'c'.repeat(32);
    const start = await game.create(session, choices({ name: 'Local Daily' }));
    expect(start.day).toBe(0);
    expect(start.date).toMatchObject({ year: 2026, month: 10, date: 13 });
    expect(start.daily).toMatchObject({ timezone: 'Australia/Sydney' });

    clock.now = at('2026-11-14', '07:00:00');
    const morning = (await game.snapshot(session))!;
    expect(morning.day).toBe(1);
    expect(morning.date).toMatchObject({ year: 2026, month: 10, date: 14 });
    expect(morning.daily!.waiting).toBeNull();
  }, 240_000);

  it('without the local setting, a guest is still turned away', async () => {
    const game = new GameServer({
      store: new MemoryFarmStore(),
      seed: () => 5,
      daily: { data: new DailyData(null), enabled: async () => true },
    });
    await expect(game.create('d'.repeat(32), choices())).rejects.toMatchObject({
      status: 403,
      code: 'daily_needs_account',
    });
  }, 60_000);
});

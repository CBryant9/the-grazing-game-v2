import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// The migrations on PGlite, as packages/db's own tests use them.
import { freshDb } from '../../../../packages/db/src/harness';
import type { SetupChoices } from '../../lib/game/types';
import { GameServer, NO_ROOM_MESSAGE, SAVE_FAILED_MESSAGE, farmKey } from '../game/game';
import { DIARY_DAYS } from '../game/diary';
import {
  BrokenFarmError,
  SaveConflictError,
  pastKept,
  type Owner,
  type StoredFarm,
} from '../game/store';
import { pgliteSql } from '../test-support/pgliteSql';
import { DbFarmStore, fromUuid, mapDbError, sessionHash, toUuid } from './dbstore';
import type { SqlClient } from './sql';

const choices: SetupChoices = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'scratch',
  difficulty: 'medium',
  name: 'Db Test',
};
const session = (n: number): string => n.toString(16).padStart(32, '0');
const hex = (n: number): string => `ab${n.toString(16).padStart(30, '0')}`;
const USER = '00000000-0000-4000-8000-0000000000a1';
const USER2 = '00000000-0000-4000-8000-0000000000a2';

let db: PGlite;
let sql: SqlClient;
let store: DbFarmStore;
let game: GameServer;

beforeAll(async () => {
  db = await freshDb({ seed: false });
  for (const [id, email] of [
    [USER, 'a@example.test'],
    [USER2, 'b@example.test'],
  ]) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  }
}, 120_000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    'delete from public.farms; delete from public.guest_sessions; delete from public.farm_saves_aside;',
  );
  sql = pgliteSql(db);
  store = new DbFarmStore(sql);
  game = new GameServer({ store, seed: () => 3, saveRetryMs: [0, 0] });
});

const user = (id: string): Owner => ({ kind: 'user', id });
const count = async (table: string, where = 'true'): Promise<number> =>
  Number(
    (await db.query<{ n: number }>(`select count(*)::int as n from public.${table} where ${where}`))
      .rows[0]!.n,
  );

describe('ids', () => {
  it('turns the game id into a uuid and back', () => {
    const id = hex(5);
    expect(toUuid(id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(fromUuid(toUuid(id))).toBe(id);
    expect(() => toUuid('nope')).toThrow();
  });
});

describe('the database store: a guest farm', () => {
  it('keeps the farm, the guest session as a hash, and brings the same snapshot back', async () => {
    const made = await game.create(session(1), choices);
    expect(made.farm.name).toBe('Db Test');
    const farms = await db.query<{
      owner_id: string | null;
      guest_session_id: string | null;
      mode: string;
      district: string;
    }>('select owner_id, guest_session_id, mode, district from public.farms');
    expect(farms.rows).toHaveLength(1);
    expect(farms.rows[0]).toMatchObject({ owner_id: null, mode: 'fast', district: 'wv' });
    expect(farms.rows[0]!.guest_session_id).not.toBeNull();
    // Only the hash of the secret is kept, never the secret.
    const g = await db.query<{ token_hash: string }>(
      'select token_hash from public.guest_sessions',
    );
    expect(g.rows[0]!.token_hash).toBe(sessionHash(session(1)));
    expect(
      JSON.stringify((await db.query('select * from public.guest_sessions')).rows),
    ).not.toContain(session(1));
    // A fresh server (no cache) reads the same farm from the database.
    const again = new GameServer({ store, saveRetryMs: [0, 0] });
    const snap = await again.snapshot(session(1));
    expect(snap?.farmVersion).toBe(made.farmVersion);
    expect(snap?.day).toBe(0);
  });

  it('a guest has one farm: a second is refused', async () => {
    await game.create(session(1), choices);
    await expect(game.create(session(1), choices)).rejects.toMatchObject({ status: 409 });
  });

  it('writes the diary, the daily picture and the action log, and the picture comes back', async () => {
    await game.create(session(2), choices);
    await game.endDay(session(2));
    await game.endDay(session(2));
    expect(await count('farm_actions')).toBe(2);
    expect(await game.pastDays(session(2))).toEqual([2, 1]);
    const past = await game.pastDay(session(2), 1);
    expect(past).toMatchObject({ version: 1, day: 1 });
    expect(past.view.paddocks.length).toBeGreaterThan(0);
    expect(past.paddocks.length).toBe(past.view.paddocks.length);
    const f = await db.query<{ current_day: number }>('select current_day from public.farms');
    expect(f.rows[0]!.current_day).toBe(2);
    await expect(game.pastDay(session(2), 99)).rejects.toMatchObject({ status: 404 });
    // The diary a fresh server reads is the one written.
    const fresh = new GameServer({ store, saveRetryMs: [0, 0] });
    const rec = await fresh.record(session(2));
    expect(Array.isArray(rec.diary)).toBe(true);
  });

  it('keeps every day for 90 days, then one a week, and nothing past 400', () => {
    expect(pastKept(10, 10)).toBe(true);
    expect(pastKept(11, 10)).toBe(false);
    expect(pastKept(100, 150)).toBe(true);
    expect(pastKept(55, 150)).toBe(false); // 95 days old, not a week day
    expect(pastKept(56, 150)).toBe(true); // 94 days old, day 56 is a multiple of 7
    expect(pastKept(7, 500)).toBe(false); // past 400 days
    expect(pastKept(7, 350, 'db')).toBe(true);
    expect(pastKept(8, 14, 'file')).toBe(true);
    expect(pastKept(0, 14, 'file')).toBe(false);
  });

  it('prunes the pictures in the database by that rule as days go by', async () => {
    await game.create(session(3), choices);
    const id = (await db.query<{ id: string }>('select id from public.farms')).rows[0]!.id;
    const put = async (day: number): Promise<void> => {
      const raw = (await store.get(fromUuid(id))) as StoredFarm;
      await store.put(fromUuid(id), raw, {
        past: {
          version: 1,
          day,
          date: { year: 2026, month: 8, date: 1 },
          season: 's',
          view: { paddocks: [] } as never,
          paddocks: [],
        },
      });
    };
    for (const d of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) await put(d);
    await put(120);
    const days = await store.pastDays(fromUuid(id));
    // 120 is newest; day 0..10 are 110+ days old: only the weekly ones (0 and 7) stay.
    expect(days).toEqual([120, 7, 0]);
    // The view rows went with the pictures.
    expect(await count('farm_snapshot_views')).toBe(3);
  });
});

describe('the database store: old and broken saves', () => {
  it('upgrades an older stored format when it is read, with an empty diary', async () => {
    await game.create(session(4), choices);
    await db.exec(`update public.farm_saves set stored_format = 1`);
    await db.exec('delete from public.farm_days');
    const fresh = new GameServer({ store, saveRetryMs: [0, 0] });
    expect((await fresh.snapshot(session(4)))?.farm.name).toBe('Db Test');
    // Saved again, it is written in the current format.
    await fresh.endDay(session(4));
    const f = await db.query<{ stored_format: number }>(
      'select stored_format from public.farm_saves',
    );
    expect(f.rows[0]!.stored_format).toBe(3);
  });

  it('a save from a newer game, or one that is not a farm, is "broken": kept aside, never deleted', async () => {
    await game.create(session(5), choices);
    await db.exec(`update public.farm_saves set stored_format = 40`);
    const fresh = new GameServer({ store, saveRetryMs: [0, 0] });
    expect(await fresh.snapshot(session(5), true)).toBe('broken');
    await expect(fresh.snapshot(session(5))).rejects.toMatchObject({ status: 409 });
    // "Try again" gives the same answer: nothing was changed.
    expect(await fresh.snapshot(session(5), true)).toBe('broken');
    expect(await count('farms')).toBe(1);
    // "Start a new farm": the bad save is kept aside, and a new farm can be made.
    await fresh.remove(session(5));
    expect(await count('farms')).toBe(0);
    expect(await count('farm_saves_aside')).toBe(1);
    const again = await fresh.create(session(5), choices);
    expect(again.day).toBe(0);
  });

  it('a save that is not an object is broken too', async () => {
    await game.create(session(6), choices);
    await db.exec(`update public.farm_saves set save = '"garbage"'::jsonb`);
    const fresh = new GameServer({ store, saveRetryMs: [0, 0] });
    expect(await fresh.snapshot(session(6), true)).toBe('broken');
    await expect(store.get(hex(0))).resolves.toBeNull();
    void BrokenFarmError;
  });
});

describe('the database store: the diary cap', () => {
  it('keeps the newest 400 days, as the file does', async () => {
    await game.create(session(7), choices);
    const id = (await db.query<{ id: string }>('select id from public.farms')).rows[0]!.id;
    await db.query(
      `insert into public.farm_days (farm_id, day, game_date, lines)
       select $1, d, date '2026-09-01' + d, array['x'] from generate_series(0, 402) d`,
      [id],
    );
    const before = await count('farm_days');
    expect(before).toBe(403);
    // A day ends: its lines are filed, and the oldest go.
    const fresh = new GameServer({ store, saveRetryMs: [0, 0] });
    await fresh.endDay(session(7));
    const after = await count('farm_days');
    expect(after).toBeLessThanOrEqual(DIARY_DAYS);
    const oldest = await db.query<{ d: number }>('select min(day) as d from public.farm_days');
    expect(oldest.rows[0]!.d).toBeGreaterThanOrEqual(3);
  });
});

describe('the database store: accounts, limits and slots', () => {
  it('an account has two Fast Farm slots; a third is refused with a plain message', async () => {
    const a = await game.create(farmKey(hex(1)), { ...choices, name: 'One' }, user(USER));
    const b = await game.create(farmKey(hex(2)), { ...choices, name: 'Two' }, user(USER));
    expect([a.farm.name, b.farm.name]).toEqual(['One', 'Two']);
    await expect(
      game.create(farmKey(hex(3)), { ...choices, name: 'Three' }, user(USER)),
    ).rejects.toMatchObject({ status: 409, message: NO_ROOM_MESSAGE });
    expect(await count('farms', `owner_id = '${USER}'`)).toBe(2);
    // Another account has its own room.
    await game.create(farmKey(hex(4)), choices, user(USER2));
    const list = await game.farms(user(USER), null);
    expect(list.map((f) => f.name).sort()).toEqual(['One', 'Two']);
    expect(list[0]).toMatchObject({ districtName: expect.stringContaining('') as string });
    // Deleting one makes room.
    await game.remove(farmKey(hex(1)));
    await game.create(farmKey(hex(5)), { ...choices, name: 'Three' }, user(USER));
    expect((await game.farms(user(USER), null)).length).toBe(2);
  });

  it('an ended farm no longer counts against the slots', async () => {
    await game.create(farmKey(hex(6)), choices, user(USER));
    await game.create(farmKey(hex(7)), choices, user(USER));
    await db.exec(
      `update public.farms set status = 'ended', ended_at = now() where id = '${toUuid(hex(6))}'`,
    );
    await game.create(farmKey(hex(8)), choices, user(USER));
  });

  it('knows who owns a farm, so a route can check it is theirs', async () => {
    await game.create(farmKey(hex(9)), choices, user(USER));
    expect(await game.ownerOf(hex(9))).toEqual({ kind: 'user', id: USER });
    expect(await game.ownerOf(hex(10))).toBeNull();
    await game.create(session(8), choices);
    expect(
      (
        await game.ownerOf(
          fromUuid(
            (
              await db.query<{ id: string }>(
                `select id from public.farms where guest_session_id is not null`,
              )
            ).rows[0]!.id,
          ),
        )
      )?.kind,
    ).toBe('guest');
  });
});

describe('the database store: clean-ups', () => {
  it('removes a guest not seen for 30 days with their farm, and leaves accounts and newer guests', async () => {
    await game.create(session(10), choices);
    await game.create(session(11), choices);
    await game.create(farmKey(hex(11)), choices, user(USER));
    await db.query(
      `update public.guest_sessions set last_seen_at = now() - interval '31 days' where token_hash = $1`,
      [sessionHash(session(10))],
    );
    const gone = await store.prune();
    expect(gone).toBe(1);
    expect(await count('farms')).toBe(2);
    expect(await count('farms', 'guest_session_id is not null')).toBe(1);
  });

  it('removes a save kept aside after 30 days', async () => {
    await game.create(session(12), choices);
    await db.exec(`update public.farm_saves set stored_format = 40`);
    await game.remove(session(12));
    expect(await count('farm_saves_aside')).toBe(1);
    await db.exec(`update public.farm_saves_aside set aside_at = now() - interval '31 days'`);
    await store.prune();
    expect(await count('farm_saves_aside')).toBe(0);
  });

  it('playing keeps a guest from being removed: the session is seen again', async () => {
    await game.create(session(13), choices);
    await db.query(`update public.guest_sessions set last_seen_at = now() - interval '29 days'`);
    await game.endDay(session(13));
    const r = await db.query<{ fresh: boolean }>(
      `select last_seen_at > now() - interval '1 day' as fresh from public.guest_sessions`,
    );
    expect(r.rows[0]!.fresh).toBe(true);
  });
});

describe('stale versions, one-use request ids and two tabs', () => {
  it('refuses a job shown on an older farm, with the latest snapshot', async () => {
    const made = await game.create(session(20), choices);
    await game.endDay(session(20));
    const res = await game.act(
      session(20),
      { action: { type: 'sell', mob: 1 } as never },
      { version: made.farmVersion, requestId: 'req-old-1' },
    );
    expect(res).toMatchObject({ ok: false, reason: 'stale' });
  });

  it('two servers and one version: only one Next day wins, the other is told the farm changed', async () => {
    const made = await game.create(session(21), choices);
    const other = new GameServer({ store, saveRetryMs: [0, 0] });
    const [a, b] = await Promise.all([
      game.endDay(session(21), made.farmVersion),
      other.endDay(session(21), made.farmVersion),
    ]);
    const oks = [a, b].filter((r) => r.ok).length;
    expect(oks).toBe(1);
    const lost = [a, b].find((r) => !r.ok)!;
    expect(lost).toMatchObject({ ok: false, reason: 'stale' });
    // The farm moved on one day only, not two.
    const f = await db.query<{ current_day: number }>('select current_day from public.farms');
    expect(f.rows[0]!.current_day).toBe(1);
  });

  it('a save made on a version that is no longer the farm is refused by the database write', async () => {
    await game.create(session(22), choices);
    const id = fromUuid(
      (await db.query<{ id: string }>('select id from public.farms')).rows[0]!.id,
    );
    const farm = (await store.get(id)) as StoredFarm;
    await expect(
      store.put(id, { ...farm, version: 'new1' }, { expect: 'not-the-version' }),
    ).rejects.toBeInstanceOf(SaveConflictError);
    await store.put(id, { ...farm, version: 'new2' }, { expect: farm.version });
    // A second write on the same old version loses.
    await expect(
      store.put(id, { ...farm, version: 'new3' }, { expect: farm.version }),
    ).rejects.toBeInstanceOf(SaveConflictError);
    expect(await store.version(id)).toBe('new2');
  });

  it('a request id is used once: a repeat gets the same answer, is logged once, and does nothing twice', async () => {
    const made = await game.create(session(23), choices);
    const req = { action: { type: 'markCalves', mob: 9999 } } as const;
    const meta = { version: made.farmVersion, requestId: 'req-once-0001' };
    const first = await game.act(session(23), req, meta);
    expect(first).toMatchObject({ ok: false });
    expect('repeat' in first).toBe(false);
    const again = await game.act(session(23), req, meta);
    expect(again).toMatchObject({ ok: false, repeat: true });
    expect(await count('farm_actions', `request_id = 'req-once-0001'`)).toBe(1);
  });

  it('a retry on another server, after a reply was lost, is answered from what was stored', async () => {
    const made = await game.create(session(24), choices);
    const req = { action: { type: 'markCalves', mob: 9999 } } as const;
    const meta = { version: made.farmVersion, requestId: 'req-lost-0001' };
    const cold = new GameServer({ store, saveRetryMs: [0, 0] });
    await game.act(session(24), req, meta); // the first try: stored, reply lost
    const retry = await cold.act(session(24), req, meta);
    expect(retry).toMatchObject({ repeat: true });
  });
});

/** The database going away for a while: every transaction fails like a lost connection. */
function flaky(inner: SqlClient, state: { fail: number }): SqlClient {
  return {
    query: (t, p) => inner.query(t, p),
    transaction: async (fn) => {
      if (state.fail > 0) {
        state.fail--;
        throw new Error('Connection terminated unexpectedly');
      }
      return inner.transaction(fn);
    },
  };
}

describe('saving that never loses a job silently', () => {
  it('a save that fails is tried again and then goes through', async () => {
    const state = { fail: 0 };
    const g = new GameServer({
      store: new DbFarmStore(flaky(sql, state)),
      seed: () => 3,
      saveRetryMs: [0, 0],
    });
    await g.create(session(30), choices);
    state.fail = 2; // two lost connections, then it works
    const day = await g.endDay(session(30));
    expect(day.ok).toBe(true);
    expect(
      (await db.query<{ current_day: number }>('select current_day from public.farms')).rows[0]!
        .current_day,
    ).toBe(1);
  });

  it('a save that keeps failing says plainly it was not saved, and nothing was changed', async () => {
    const state = { fail: 0 };
    const g = new GameServer({
      store: new DbFarmStore(flaky(sql, state)),
      seed: () => 3,
      saveRetryMs: [0, 0],
    });
    const made = await g.create(session(31), choices);
    state.fail = 10;
    await expect(g.endDay(session(31), made.farmVersion)).rejects.toMatchObject({
      status: 503,
      code: 'save_failed',
      message: SAVE_FAILED_MESSAGE,
    });
    // Nothing pretends: the stored farm is still day 0 at the same version.
    expect(
      (await db.query<{ current_day: number }>('select current_day from public.farms')).rows[0]!
        .current_day,
    ).toBe(0);
    expect(
      await store.version(
        fromUuid((await db.query<{ id: string }>('select id from public.farms')).rows[0]!.id),
      ),
    ).toBe(made.farmVersion);
    // The database comes back: the same request works, from the farm as it really is.
    state.fail = 0;
    const day = await g.endDay(session(31), made.farmVersion);
    expect(day.ok).toBe(true);
  });
});

describe('what the browser roles can read', () => {
  const asRole = async (role: 'anon' | 'authenticated', sqlText: string): Promise<string> => {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query(sqlText);
      return 'allowed';
    } catch (e) {
      return (e as Error).message;
    } finally {
      await db.exec('rollback');
    }
  };

  it('neither a visitor nor a signed-in player can read a save, the action log, the pictures or an aside copy', async () => {
    await game.create(farmKey(hex(40)), choices, user(USER));
    await game.endDay(farmKey(hex(40)));
    for (const role of ['anon', 'authenticated'] as const) {
      for (const table of [
        'farm_saves',
        'farm_actions',
        'farm_snapshot_views',
        'farm_saves_aside',
      ]) {
        expect(await asRole(role, `select * from public.${table}`)).toMatch(/permission denied/);
      }
    }
    // Even as the owner, with a token for the owner's id.
    await db.exec('begin');
    await db.exec(`set local role authenticated`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: USER, role: 'authenticated' }),
    ]);
    await expect(db.query('select save from public.farm_saves')).rejects.toThrow(
      /permission denied/,
    );
    await db.exec('rollback');
  });
});

describe('errors from the driver', () => {
  it('turns the farm limit into a plain refusal, a refusal by a rule into itself, and anything else into "try again"', () => {
    expect(mapDbError({ code: 'P0001', hint: 'farm_limit' }).constructor.name).toBe(
      'FarmLimitError',
    );
    expect(mapDbError({ code: '23505', message: 'dup' }).message).toBe('dup');
    expect(mapDbError({ message: 'socket hang up' }).constructor.name).toBe(
      'StoreUnavailableError',
    );
    expect(mapDbError({ code: '57P01', message: 'terminating' }).constructor.name).toBe(
      'StoreUnavailableError',
    );
  });
});

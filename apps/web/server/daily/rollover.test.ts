import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../../lib/game/types';
import { GameError, type GameServer } from '../game/game';
import { newFarm } from '../player';
import { parseActionRequest } from '../game/request';
import { addDays, daysBetween, localDate, nextMidnight } from './clock';
import { seriesFor, type DailyFeed } from './data';
import { runRollover } from './rollover';
import { MIDNIGHT_TEXT, WAITING_TEXT } from './wire';
import { OWNER, USER2, at, choices, database, keepThrough, rig, type Rig } from './testrig';

afterAll(async () => {
  await (await database()).close();
});

let n = 0;
async function aJob(game: GameServer, key: string, snap: Snapshot, version = snap.farmVersion) {
  const mob = snap.mobs.find((m) => m.where === 'paddock')!;
  const here = snap.paddocks.find((p) => p.mobs.includes(mob.id));
  const there = snap.paddocks.find((p) => p !== here && p.water !== 'none' && p.mobs.length === 0)!;
  return game.act(
    key,
    { action: { type: 'moveMob', mob: mob.id, cell: there.cell } },
    { version, requestId: `roll-job-${++n}` },
  );
}

const saveOf = async (r: Rig): Promise<unknown> =>
  (await r.db.query<{ save: unknown }>('select save from public.farm_saves')).rows[0]!.save;
const simThrough = async (r: Rig): Promise<string> =>
  (
    await r.db.query<{ s: string }>(
      "select to_char(sim_through,'YYYY-MM-DD') as s from public.farms",
    )
  ).rows[0]!.s;
const counter = async (r: Rig, metric: string): Promise<number> =>
  Number(
    (
      await r.db.query<{ c: string }>(
        'select coalesce(sum(count), 0) as c from public.daily_counts where metric = $1',
        [metric],
      )
    ).rows[0]!.c,
  );

async function started(date = '2026-11-13', time = '10:00:00') {
  const r = await rig({ date, time });
  const farm = newFarm();
  return { r, farm, make: () => r.game.create(farm.key, choices(), OWNER) };
}

describe('the midnight rollover job', () => {
  it('does nothing extra when it runs twice, and records what it did', async () => {
    const { r, make } = await started();
    await keepThrough(r, '2026-11-16');
    await make();
    r.clock.now = at('2026-11-15', '00:10:00');
    const a = await r.roll({ feed: false });
    expect(a).toMatchObject({ claimed: 1, farmsAdvanced: 1, daysAdvanced: 2, failed: 0, more: false });
    const b = await r.roll({ feed: false });
    expect(b).toMatchObject({ claimed: 0, farmsAdvanced: 0, daysAdvanced: 0 });
    expect(await simThrough(r)).toBe('2026-11-14');
    expect(await counter(r, 'rollover_runs')).toBe(2);
    expect(await counter(r, 'rollover_days')).toBe(2);
    expect(await counter(r, 'rollover_farms')).toBe(1);
  }, 180_000);

  it('run three days late brings the farm up night by night to the same farm as running every night', async () => {
    const { r, make } = await started();
    await keepThrough(r, '2026-11-17');
    await make();
    for (const d of ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']) {
      r.clock.now = at(d, '00:20:00');
      await r.roll({ feed: false });
    }
    const onTime = await saveOf(r);
    expect(await simThrough(r)).toBe('2026-11-16');

    const late = await started();
    await keepThrough(late.r, '2026-11-17');
    await late.make();
    late.r.clock.now = at('2026-11-17', '00:20:00');
    const report = await late.r.roll({ feed: false });
    expect(report.daysAdvanced).toBe(4);
    expect(await saveOf(late.r)).toEqual(onTime);
  }, 240_000);

  it('picks up after a failure halfway: the nights already run stay, and the next run finishes the rest', async () => {
    const reference = await started();
    await keepThrough(reference.r, '2026-11-16');
    await reference.make();
    reference.r.clock.now = at('2026-11-16', '00:20:00');
    await reference.r.roll({ feed: false });
    const whole = await saveOf(reference.r);

    const { r, make } = await started();
    await keepThrough(r, '2026-11-16');
    await make();
    r.clock.now = at('2026-11-16', '00:20:00');
    const real = r.store.put.bind(r.store);
    let calls = 0;
    const spy = vi.spyOn(r.store, 'put').mockImplementation(async (id, farm, options) => {
      if (options.dailyThrough && ++calls >= 2) throw new Error('the database went away');
      return real(id, farm, options);
    });
    const first = await r.roll({ feed: false });
    expect(first.failed).toBeGreaterThanOrEqual(1);
    // The first night was saved before the failure.
    expect(await simThrough(r)).toBe('2026-11-13');
    spy.mockRestore();
    const second = await r.roll({ feed: false });
    expect(second).toMatchObject({ failed: 0, farmsAdvanced: 1, daysAdvanced: 2 });
    expect(await simThrough(r)).toBe('2026-11-15');
    expect(await saveOf(r)).toEqual(whole);
  }, 240_000);

  it('stops when its time is used and says so, and the next run does the rest', async () => {
    const { r, make } = await started();
    await keepThrough(r, '2026-11-16');
    await make();
    r.clock.now = at('2026-11-16', '00:20:00');
    // One clock for the whole server that moves 20 seconds each time it is read, so the budget runs out in the first night or two.
    let t = r.clock.now;
    Object.defineProperty(r.clock, 'now', {
      get: () => (t += 20_000),
      set: (v: number) => {
        t = v;
      },
    });
    const stepping = await r.roll({ feed: false, budgetMs: 100_000 });
    expect(stepping.daysAdvanced).toBeLessThan(3);
    expect(stepping.more).toBe(true);
    Object.defineProperty(r.clock, 'now', { value: t, writable: true });
    const rest = await r.roll({ feed: false });
    expect(stepping.daysAdvanced + rest.daysAdvanced).toBe(3);
    expect(await simThrough(r)).toBe('2026-11-15');
  }, 240_000);

  it('when yesterday’s weather is late the farm waits, says so, refuses jobs, and carries on once it is in', async () => {
    const { r, farm, make } = await started();
    const snap = await make();
    r.clock.now = at('2026-11-14', '00:30:00');
    const waiting = await r.roll();
    expect(waiting.dataWaiting).toContain('cq 2026-11-13');
    expect(waiting.farmsWaiting).toBe(1);
    const looked = (await r.game.snapshot(farm.key))!;
    expect(looked.daily!.waiting).toBe(WAITING_TEXT);
    expect(looked.date.date).toBe(13);
    await expect(aJob(r.game, farm.key, looked)).rejects.toMatchObject({ status: 409, code: 'day_not_ready' });
    await expect(r.game.preview(farm.key, { action: { type: 'markCalves', mob: 1 } })).rejects.toMatchObject({
      code: 'day_not_ready',
    });
    expect(snap.date.date).toBe(13);
    // The weather comes in.
    r.serveDay('2026-11-13');
    r.clock.now = at('2026-11-14', '07:00:00');
    const done = await r.roll();
    expect(done.fetched).toHaveLength(4);
    expect(done.daysAdvanced).toBe(1);
    const next = (await r.game.snapshot(farm.key))!;
    expect(next.date.date).toBe(14);
    expect(next.daily!.waiting).toBeNull();
    expect((await aJob(r.game, farm.key, next)).ok).toBe(true);
  }, 240_000);

  it('does not keep a day whose prices could not be fetched, so the day is all in or not in', async () => {
    const { r, make } = await started();
    await make();
    r.clock.now = at('2026-11-14', '00:30:00');
    r.serveDay('2026-11-13');
    const feed: DailyFeed = {
      weather: async (d, date) => r.feedRows.weather[`${d} ${date}`] ?? null,
      prices: async () => {
        throw new Error('MLA did not answer');
      },
    };
    const report = await runRollover({
      game: r.game,
      store: r.store,
      data: r.data,
      feed,
      sql: r.sql,
      now: () => r.clock.now,
    });
    expect(report.fetched).toEqual([]);
    expect(report.dataWaiting.length).toBeGreaterThan(0);
    const rows = await r.db.query('select 1 from public.weather_daily');
    expect(rows.rowCount).toBe(0);
    expect(report.daysAdvanced).toBe(0);
    expect(seriesFor('cq')).toHaveLength(12);
  }, 180_000);

  it('a day already kept is not changed by a later fetch, whatever the source says now', async () => {
    const { r, make } = await started();
    await make();
    r.serveDay('2026-11-13');
    r.clock.now = at('2026-11-14', '00:30:00');
    await r.roll();
    const before = await r.db.query('select rain_mm, et0_mm from public.weather_daily order by district');
    r.feedRows.weather['cq 2026-11-13'] = { ...r.feedRows.weather['cq 2026-11-13']!, rain: 99, et0: 1 };
    await r.sql.transaction((tx) =>
      r.data.keepDay(tx, 'cq', '2026-11-13', r.feedRows.weather['cq 2026-11-13']!, []),
    );
    const after = await r.db.query('select rain_mm, et0_mm from public.weather_daily order by district');
    expect(after.rows).toEqual(before.rows);
  }, 180_000);
});

describe('the day ends at local midnight and no sooner or later', () => {
  it('a job at 23:59:59 is on the day, and one sent for that day at 00:00:01 is refused with the fresh farm', async () => {
    const { r, farm, make } = await started();
    await keepThrough(r, '2026-11-13');
    const first = await make();
    r.clock.now = at('2026-11-13', '23:59:59');
    const worked = await aJob(r.game, farm.key, first);
    expect(worked.ok).toBe(true);
    const shown = worked.snapshot!;
    expect(shown.date.date).toBe(13);
    expect(shown.daily!.work).toBe('started');
    r.clock.now = at('2026-11-14', '00:00:01');
    const late = await aJob(r.game, farm.key, shown);
    expect(late).toMatchObject({ ok: false, reason: 'stale', message: MIDNIGHT_TEXT });
    expect(late.snapshot!.date.date).toBe(14);
    expect(late.snapshot!.daily!.work).toBe('not-started');
    // A job from the new card is a job for the 14th.
    const fresh = await aJob(r.game, farm.key, late.snapshot!);
    expect(fresh.ok).toBe(true);
    expect(fresh.snapshot!.daily!.work).toBe('started');
    const log = await r.db.query<{ action: { on?: string } }>(
      "select action from public.farm_actions where action #>> '{action,type}' = 'moveMob' order by seq",
    );
    expect(log.rows.map((x) => x.action.on)).toEqual(['2026-11-13', '2026-11-14']);
  }, 240_000);

  it('local midnight is the moment the date changes in the farm’s zone, with a 25 hour day where the clocks go back', () => {
    // Sydney clocks go back at 3 am on 4 April 2027 and forward at 2 am on 3 October 2027.
    const back = nextMidnight(at('2027-04-04', '00:30:00'), 'Australia/Sydney');
    expect((back - at('2027-04-04', '00:30:00')) / 3_600_000).toBe(24.5);
    const forward = nextMidnight(at('2027-10-03', '00:30:00'), 'Australia/Sydney');
    expect((forward - at('2027-10-03', '00:30:00')) / 3_600_000).toBe(22.5);
    for (const zone of ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne']) {
      const t = at('2027-04-03', '12:00:00', zone);
      const m = nextMidnight(t, zone);
      expect(localDate(m - 1000, zone)).toBe('2027-04-03');
      expect(localDate(m, zone)).toBe('2027-04-04');
    }
    expect(daysBetween('2026-11-13', addDays('2026-11-13', 30))).toBe(30);
  });

  it('gives one night for each local midnight across the daylight saving change in each launch district’s zone', async () => {
    const { r } = await started('2027-04-02', '10:00:00');
    await keepThrough(r, '2027-04-08', true);
    const zones = ['Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne'];
    const ids: string[] = [];
    for (const [i, zone] of zones.entries()) {
      const farm = newFarm();
      // Two Daily Farms an account: the third is another player's.
      const who = i < 2 ? OWNER : { kind: 'user' as const, id: USER2 };
      await r.game.create(farm.key, choices({ timezone: zone, name: zone.slice(10) }), who);
      ids.push(farm.id);
    }
    const uuid = (id: string): string => id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    const start = at('2027-04-02', '12:00:00');
    for (let h = 0; h <= 96; h++) {
      const t = start + h * 3_600_000;
      for (let i = 0; i < zones.length; i++) {
        const owed = await r.db.query<{ n: number }>(
          'select public.daily_days_owed($1, $2::timestamptz) as n',
          [uuid(ids[i]!), new Date(t).toISOString()],
        );
        const rows = await r.db.query<{ s: string }>(
          "select to_char(sim_through,'YYYY-MM-DD') as s from public.farms where id = $1",
          [uuid(ids[i]!)],
        );
        const expected = Math.max(0, daysBetween(rows.rows[0]!.s, localDate(t, zones[i]!)) - 1);
        expect(owed.rows[0]!.n).toBe(expected);
      }
    }
    // And the sim itself runs each night once across the change in Sydney.
    r.clock.now = at('2027-04-05', '00:05:00', 'Australia/Sydney');
    const report = await r.roll({ feed: false });
    expect(report.failed).toBe(0);
    expect(report.daysAdvanced).toBeGreaterThanOrEqual(3);
    expect(await r.db.query("select 1 from public.farms where sim_through > '2027-04-04'")).toMatchObject({ rowCount: 0 });
  }, 400_000);
});

describe('nothing the device sends can give a farm an extra day or take one back', () => {
  it('reads only the job, the version and the one-use id from a request: no date, clock or time zone', () => {
    const body = {
      action: { type: 'markCalves', mob: 1 },
      version: 'abc',
      requestId: 'abcdefgh1',
      now: Date.parse('2030-01-01'),
      date: '2030-01-01',
      timezone: 'Pacific/Kiritimati',
      clock: 'wound forward',
    };
    expect(parseActionRequest(body)).toEqual({ action: { type: 'markCalves', mob: 1 } });
  });

  it('the database refuses a day that is not over, and a farm never goes back', async () => {
    const { r, farm, make } = await started();
    await make();
    const id = farm.id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
    // Today is the 13th in Sydney: the 13th is not over, so it can not be simulated.
    await expect(
      r.db.query("select public.daily_finish($1, '2026-11-13', $2::timestamptz)", [
        id,
        new Date(r.clock.now).toISOString(),
      ]),
    ).rejects.toMatchObject({ message: expect.stringContaining('no_extra_days') });
    await expect(
      r.db.query("select public.daily_finish($1, '2026-11-11', $2::timestamptz)", [
        id,
        new Date(r.clock.now).toISOString(),
      ]),
    ).rejects.toThrow(/never goes back/);
  }, 120_000);

});

describe('two tabs', () => {
  it('two tabs doing a job from the same card: one does it, the other is told the farm changed', async () => {
    const { r, farm, make } = await started();
    const snap = await make();
    const tabB = r.another();
    const [x, y] = await Promise.all([aJob(r.game, farm.key, snap), aJob(tabB, farm.key, snap)]);
    expect([x, y].filter((z) => z.ok)).toHaveLength(1);
    expect([x, y].find((z) => !z.ok)).toMatchObject({ reason: 'stale' });
  }, 240_000);

  it('two tabs opening the farm after midnight run the night once', async () => {
    const { r, farm, make } = await started();
    await keepThrough(r, '2026-11-13');
    await make();
    const tabB = r.another();
    r.clock.now = at('2026-11-14', '06:00:00');
    const [a, b] = await Promise.all([r.game.snapshot(farm.key), tabB.snapshot(farm.key)]);
    expect(a!.date.date).toBe(14);
    expect(b!.date.date).toBe(14);
    const nights = await r.db.query("select 1 from public.farm_actions where action ->> 'type' = 'rollover'");
    expect(nights.rowCount).toBe(1);
  }, 240_000);
});

describe('with the switch off, or no database', () => {
  it('switched off: no new farm, the rollover leaves farms alone, and an open farm says it is paused', async () => {
    const { r, farm, make } = await started();
    await keepThrough(r, '2026-11-13');
    await make();
    r.switchOn.value = false;
    await expect(r.game.create(newFarm().key, choices({ name: 'Second' }), OWNER)).rejects.toMatchObject({
      code: 'daily_off',
    });
    r.clock.now = at('2026-11-14', '06:00:00');
    const snap = (await r.game.snapshot(farm.key))!;
    expect(snap.date.date).toBe(13);
    expect(snap.daily!.waiting).toMatch(/paused/);
    expect(await simThrough(r)).toBe('2026-11-12');
    r.switchOn.value = true;
    expect(((await r.game.snapshot(farm.key))!).date.date).toBe(14);
  }, 240_000);

  it('with no database keys, Daily Farm answers with the plain coming state and Fast Farm is untouched', async () => {
    const { GameServer } = await import('../game/game');
    const { MemoryFarmStore } = await import('../game/store');
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 3 });
    await expect(game.create('a'.repeat(32), choices())).rejects.toBeInstanceOf(GameError);
    await expect(game.create('b'.repeat(32), choices(), OWNER)).rejects.toMatchObject({ status: 403, code: 'daily_off' });
    const fast = await game.create('c'.repeat(32), choices({ mode: 'fast', years: 'random', timezone: undefined }));
    expect(fast.daily).toBeNull();
  }, 120_000);
});

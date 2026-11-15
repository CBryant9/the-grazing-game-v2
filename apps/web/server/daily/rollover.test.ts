import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Snapshot } from '../../lib/game/types';
import { GameError, type GameServer } from '../game/game';
import { newFarm } from '../player';
import { parseActionRequest } from '../game/request';
import { addDays, daysBetween, localDate, nextMidnight } from './clock';
import { type DailyFeed, type Dated, type PriceRow, type WeatherRow } from './data';
import { MAX_FARM_FAILS_A_DAY, runRollover } from './rollover';
import { MIDNIGHT_TEXT } from './wire';
import {
  OWNER,
  USER2,
  at,
  choices,
  database,
  keepThrough,
  rig,
  weatherFor,
  type Rig,
} from './testrig';

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
    expect(a).toMatchObject({
      claimed: 1,
      farmsAdvanced: 1,
      daysAdvanced: 2,
      failed: 0,
      more: false,
    });
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

  it('late data never stops a farm: the night runs on the long-term average, says so, and is never rewritten', async () => {
    // Game date 18 November runs on the real 13th, which is not kept: the feed is off.
    const { r, farm, make } = await started('2026-11-17', '10:00:00');
    await make();
    r.clock.now = at('2026-11-19', '00:30:00');
    const run = await r.roll({ feed: false });
    expect(run).toMatchObject({ daysAdvanced: 2, farmsWaiting: 0, failed: 0 });
    const looked = (await r.game.snapshot(farm.key))!;
    expect(looked.daily!.waiting).toBeNull();
    expect(looked.date.date).toBe(19);
    // No job is refused because data is late.
    expect((await aJob(r.game, farm.key, looked)).ok).toBe(true);
    // The diary states the fact for the night that needed it, and only that one.
    const lines = (await r.game.record(farm.key)).diary.flatMap((d) => d.lines);
    const said =
      'Weather data was not available for 18 November. The long-term average for the day was used.';
    expect(lines.filter((l) => l === said)).toHaveLength(1);
    expect(lines.some((l) => l.includes('17 November'))).toBe(false);
    // It is counted where an admin can see it.
    const counted = await r.db.query<{ dims: string; count: string }>(
      "select dims, count from public.daily_counts where metric = 'night_weather_fallback'",
    );
    expect(counted.rows).toEqual([{ dims: 'district=cq', count: 1 }]);
    // The real day arrives later. The night already run is not rewritten.
    const before = await saveOf(r);
    await keepThrough(r, '2026-11-14');
    await r.roll({ feed: false });
    expect(await saveOf(r)).toEqual(before);
    expect((await r.game.record(farm.key)).diary.flatMap((d) => d.lines)).toContain(said);
  }, 240_000);

  it('weather and prices are asked for apart: MLA answers nothing and then a value, and the weather is not asked for again', async () => {
    const { r, make } = await started('2026-11-16', '10:00:00');
    await make();
    const weatherAsks: string[] = [];
    let mla: Dated<PriceRow>[] = [];
    const feed: DailyFeed = {
      weather: async (district, from, to) => {
        weatherAsks.push(`${district} ${from} ${to}`);
        const out: Dated<WeatherRow>[] = [];
        for (let d = from; d <= to; d = addDays(d, 1)) out.push({ date: d, row: weatherFor(d) });
        return out;
      },
      prices: async () => mla,
      yardings: async () => [],
    };
    const run = (): ReturnType<typeof runRollover> =>
      runRollover({
        game: r.game,
        store: r.store,
        data: r.data,
        feed,
        sql: r.sql,
        now: () => r.clock.now,
      });
    const first = await run();
    // Weather came in; MLA had nothing yet.
    expect(first.fetched.some((f) => f.startsWith('weather cq'))).toBe(true);
    expect(first.fetched.some((f) => f.startsWith('prices'))).toBe(false);
    expect((await r.db.query('select 1 from public.weather_daily')).rowCount).toBe(12);
    expect((await r.db.query('select 1 from public.price_daily')).rowCount).toBe(0);
    // MLA answers at the next run: the prices are kept, and the weather already kept is not asked for again.
    mla = [{ date: '2026-11-15', row: { value: 612, head: 4000 } }];
    const asked = weatherAsks.length;
    const second = await run();
    expect(
      second.fetched.some((f) => f.startsWith('prices national/restocker-yearling-steer')),
    ).toBe(true);
    expect(
      (
        await r.db.query(
          "select 1 from public.price_daily where indicator = 'restocker-yearling-steer'",
        )
      ).rowCount,
    ).toBeGreaterThan(0);
    expect(weatherAsks.length).toBe(asked);
  }, 240_000);

  it('a month with no prices and no weather does not stop a farm loading: the last price carries forward and the diary says so', async () => {
    const { r, farm, make } = await started('2026-12-20', '10:00:00');
    await make();
    r.clock.now = at('2026-12-21', '00:30:00');
    const run = await r.roll({ feed: false });
    expect(run).toMatchObject({ failed: 0, daysAdvanced: 1 });
    const snap = (await r.game.snapshot(farm.key))!;
    expect(snap.date.date).toBe(21);
    expect(snap.market.prices.every((p) => Number.isFinite(p.cKg) && p.cKg > 0)).toBe(true);
    const lines = (await r.game.record(farm.key)).diary.flatMap((d) => d.lines);
    expect(lines).toContain(
      'Weather data was not available for 20 December. The long-term average for the day was used.',
    );
    expect(lines).toContain(
      'Cattle prices were not available for 20 December. The last published prices were used.',
    );
  }, 240_000);

  it('asks the data services side by side with a cap, and starts no request once the time is used', async () => {
    const { r, make } = await started('2026-11-16', '10:00:00');
    await make();
    let inFlight = 0;
    let most = 0;
    let asks = 0;
    const slow = async <T>(rows: T[]): Promise<T[]> => {
      asks++;
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((res) => setTimeout(res, 15));
      inFlight--;
      return rows;
    };
    const feed: DailyFeed = {
      weather: () => slow<Dated<WeatherRow>>([]),
      prices: () => slow<Dated<PriceRow>>([]),
      yardings: () => slow([]),
    };
    const run = (budgetMs: number): ReturnType<typeof runRollover> =>
      runRollover({
        game: r.game,
        store: r.store,
        data: r.data,
        feed,
        sql: r.sql,
        now: () => r.clock.now,
        budgetMs,
        concurrency: 4,
      });
    await run(0);
    // No time at all: nothing is asked.
    expect(asks).toBe(0);
    await run(45_000);
    // Four weather, the national and four yards' indicators and four yards' sale days, all asked.
    expect(asks).toBeGreaterThan(20);
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(4);
  }, 180_000);

  it('a day already kept is not changed by a later fetch, whatever the source says now', async () => {
    const { r, make } = await started();
    await make();
    r.serveDay('2026-11-13');
    r.clock.now = at('2026-11-14', '00:30:00');
    await r.roll();
    const before = await r.db.query(
      'select rain_mm, et0_mm from public.weather_daily order by district',
    );
    await r.sql.transaction((tx) =>
      r.data.keepWeather(tx, 'cq', [
        {
          date: '2026-11-13',
          row: { rain: 99, tmax: null, tmin: null, rad: null, evap: null, et0: 1 },
        },
      ]),
    );
    const after = await r.db.query(
      'select rain_mm, et0_mm from public.weather_daily order by district',
    );
    expect(after.rows).toEqual(before.rows);
  }, 180_000);

  it('a farm that fails is found by its id, counted, tried again, and left alone for the day after too many tries', async () => {
    const { r, farm, make } = await started();
    await keepThrough(r, '2026-11-16');
    await make();
    r.clock.now = at('2026-11-15', '00:20:00');
    const real = r.store.put.bind(r.store);
    const spy = vi.spyOn(r.store, 'put').mockImplementation(async (id, f, o) => {
      if (o.dailyThrough) throw new Error('this farm is broken');
      return real(id, f, o);
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const first = await r.roll({ feed: false });
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(first.failedFarms).toContain(farm.id);
    // The log line names the farm by its id and the reason, never the message.
    const logged = errors.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain(`farm=${farm.id}`);
    expect(logged).not.toContain('this farm is broken');
    errors.mockRestore();
    const listed = await r.db.query<{ dims: string; count: string }>(
      "select dims, count from public.daily_counts where metric = 'rollover_farm_failed'",
    );
    expect(listed.rows.map((x) => x.dims)).toEqual([`farm=${farm.id}`]);
    // Run after run it is tried, up to the cap, and then left alone without being loaded.
    let skipped = 0;
    for (let i = 0; i < 8; i++) skipped += (await r.roll({ feed: false })).skipped;
    expect(skipped).toBeGreaterThan(0);
    const total = Number(
      (
        await r.db.query<{ c: string }>(
          "select sum(count) as c from public.daily_counts where metric = 'rollover_farm_failed'",
        )
      ).rows[0]!.c,
    );
    expect(total).toBeLessThanOrEqual(MAX_FARM_FAILS_A_DAY + 1);
    // It is not stuck for good: mended, and the next day, it is run.
    spy.mockRestore();
    r.clock.now = at('2026-11-16', '00:20:00');
    const mended = await r.roll({ feed: false });
    expect(mended.failed).toBe(0);
    expect(mended.daysAdvanced).toBeGreaterThan(0);
  }, 300_000);
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
    const uuid = (id: string): string =>
      id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
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
    expect(
      await r.db.query("select 1 from public.farms where sim_through > '2027-04-04'"),
    ).toMatchObject({ rowCount: 0 });
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
    const nights = await r.db.query(
      "select 1 from public.farm_actions where action ->> 'type' = 'rollover'",
    );
    expect(nights.rowCount).toBe(1);
  }, 240_000);
});

describe('with the switch off, or no database', () => {
  it('switched off: no new farm, the rollover leaves farms alone, and an open farm says it is paused', async () => {
    const { r, farm, make } = await started();
    await keepThrough(r, '2026-11-13');
    await make();
    r.switchOn.value = false;
    await expect(
      r.game.create(newFarm().key, choices({ name: 'Second' }), OWNER),
    ).rejects.toMatchObject({
      code: 'daily_off',
    });
    r.clock.now = at('2026-11-14', '06:00:00');
    const snap = (await r.game.snapshot(farm.key))!;
    expect(snap.date.date).toBe(13);
    expect(snap.daily!.waiting).toMatch(/paused/);
    expect(await simThrough(r)).toBe('2026-11-12');
    r.switchOn.value = true;
    expect((await r.game.snapshot(farm.key))!.date.date).toBe(14);
  }, 240_000);

  it('with no database keys, Daily Farm says it needs the database and Fast Farm is untouched', async () => {
    const { GameServer } = await import('../game/game');
    const { MemoryFarmStore } = await import('../game/store');
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 3 });
    await expect(game.create('a'.repeat(32), choices())).rejects.toBeInstanceOf(GameError);
    await expect(game.create('b'.repeat(32), choices(), OWNER)).rejects.toMatchObject({
      status: 403,
      code: 'daily_off',
      message: expect.stringContaining('Daily Farm needs the game database'),
    });
    const fast = await game.create(
      'c'.repeat(32),
      choices({ mode: 'fast', years: 'random', timezone: undefined }),
    );
    expect(fast.daily).toBeNull();
  }, 120_000);
});

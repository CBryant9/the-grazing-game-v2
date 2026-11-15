import 'server-only';
import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import type { SqlClient } from '../db/sql';
import type { GameServer } from '../game/game';
import type { FarmStore } from '../game/store';
import { logFailure } from '../logging';
import { recordRollover } from '../analytics/health';
import { addDays, localDate } from './clock';
import { seriesFor, yardOf, type DailyData, type DailyFeed } from './data';

/*
 * The midnight rollover (PRD 14.3). A scheduled call every 15 minutes:
 *
 *   1. ask for the days of weather, prices and sale days that are missing, a range at a time,
 *      side by side with a cap, each request with a short timeout, until each row arrives;
 *   2. claim Daily Farms with days owed, a batch at a time, and bring each up to today.
 *
 * A night never waits for data: the lag (server/daily/data.ts) means the data is there, and if it
 * is not, the night runs on the fallbacks and says so. Running it twice does nothing extra: a farm
 * on today is not claimed, and a row already kept is not changed. A run that dies halfway leaves
 * each farm saved night by night, and its claim runs out after 10 minutes, so the next run carries
 * on. A run that did not happen for days brings each farm up night by night, in order. It stops when
 * its time budget is used and says so, and the next run picks up the rest. A farm that fails is
 * counted (`daily_counts`, by farm id) and tried again at the next run, up to a cap a day, so one
 * broken farm can not loop forever.
 */

export interface RolloverOptions {
  game: GameServer;
  store: FarmStore;
  data: DailyData;
  /** Where missing days come from. Null: nothing is fetched. */
  feed: DailyFeed | null;
  sql: SqlClient | null;
  now: () => number;
  /** How long a run may work, ms. */
  budgetMs?: number;
  /** Farms claimed at a time. */
  batch?: number;
  /** Requests to the data services at once. */
  concurrency?: number;
}

export interface RolloverReport {
  ranAt: string;
  /** Rows kept this run, as `what where`. */
  fetched: string[];
  /** Weather still not in, as `district`. Not a stop: the nights run on the long-term average. */
  dataWaiting: string[];
  claimed: number;
  farmsAdvanced: number;
  daysAdvanced: number;
  /** Farms that could not be brought up to today because Daily Farm is paused or unavailable. */
  farmsWaiting: number;
  failed: number;
  /** Farms left alone this run because they had failed too often today. */
  skipped: number;
  /** The ids of the farms that failed this run. An id is not personal data. */
  failedFarms: string[];
  /** True when the time budget ran out with farms still to do. */
  more: boolean;
}

export const ROLLOVER_BUDGET_MS = 45_000;
/** A farm that has failed this many times in a day is left until tomorrow. About an hour and a half of runs. */
export const MAX_FARM_FAILS_A_DAY = 6;
/** Requests to the data services at once. */
export const FETCH_AT_ONCE = 4;
/** How far back a run asks for rows still missing, days. */
const FETCH_WINDOW_DAYS = 14;

const FAIL_METRIC = 'rollover_farm_failed';

/** Add to a day's counter (the admin dashboard reads `daily_counts`). */
async function count(
  sql: SqlClient | null,
  day: string,
  metric: string,
  n: number,
  dims = '',
): Promise<void> {
  if (!sql || n <= 0) return;
  await sql.query(
    `insert into public.daily_counts (day, metric, dims, count) values ($1::date, $2, $3, $4)
     on conflict (day, metric, dims) do update set count = public.daily_counts.count + excluded.count`,
    [day, metric, dims, n],
  );
}

async function failuresToday(sql: SqlClient | null, day: string, farm: string): Promise<number> {
  if (!sql) return 0;
  const r = await sql.query<{ c: string }>(
    `select coalesce(sum(count), 0) as c from public.daily_counts
      where day = $1::date and metric = $2 and dims = $3`,
    [day, FAIL_METRIC, `farm=${farm}`],
  );
  return Number(r.rows[0]?.c ?? 0);
}

/** Run tasks `cap` at a time, starting no new one once the deadline has passed. */
async function pool(
  tasks: readonly (() => Promise<void>)[],
  cap: number,
  now: () => number,
  deadline: number,
): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < tasks.length && now() < deadline) {
      const task = tasks[next++]!;
      await task();
    }
  };
  await Promise.all(Array.from({ length: Math.min(cap, tasks.length) }, worker));
}

/**
 * Ask for the rows that are missing. Weather and prices are asked for apart, and a series that
 * has fallen behind is asked for again at every run until its rows arrive. A failed request, or one
 * that brings nothing, is not an error: the nights run on the fallbacks until it does.
 */
async function fetchMissing(
  o: RolloverOptions,
  deadline: number,
  report: RolloverReport,
): Promise<void> {
  if (!o.feed || !o.sql) return;
  const feed = o.feed;
  const sql = o.sql;
  // The data is for dates in the district's own country, so "yesterday" is Sydney's.
  const yesterday = addDays(localDate(o.now(), 'Australia/Sydney'), -1);
  const window = addDays(yesterday, -FETCH_WINDOW_DAYS);
  await o.data.extras(true);
  const tasks: (() => Promise<void>)[] = [];
  const asked = new Set<string>();
  const task = (tag: string, run: () => Promise<number>): void => {
    tasks.push(async () => {
      try {
        const kept = await run();
        if (kept > 0) report.fetched.push(`${tag} ${kept}`);
      } catch (e) {
        logFailure({ route: 'daily-fetch', reason: 'fetch_failed' }, e);
      }
    });
  };
  for (const district of DISTRICT_IDS as readonly DistrictId[]) {
    const last = await o.data.weatherLast(district, false);
    const from = last < window ? window : addDays(last, 1);
    if (from <= yesterday) {
      task(`weather ${district}`, async () => {
        const rows = await feed.weather(district, from, yesterday);
        // The tables hold every day once, in order: only the days that follow the last one kept.
        const next: typeof rows = [];
        let want = from;
        for (const r of rows) {
          if (r.date !== want) break;
          next.push(r);
          want = addDays(want, 1);
        }
        if (next.length === 0) report.dataWaiting.push(district);
        await sql.transaction((tx) => o.data.keepWeather(tx, district, next));
        o.data.forget();
        return next.length;
      });
    }
    for (const series of seriesFor(district)) {
      const key = `${series.saleyard}/${series.indicator}`;
      if (asked.has(key)) continue;
      asked.add(key);
      const last = await o.data.priceLast(key, false);
      const start = last < window ? window : addDays(last, 1);
      if (start > yesterday) continue;
      task(`prices ${key}`, async () => {
        const rows = await feed.prices(series, start, yesterday);
        await sql.transaction((tx) => o.data.keepPrices(tx, series, rows));
        return rows.length;
      });
    }
    const yard = yardOf(district);
    if (!asked.has(`yardings/${yard}`)) {
      asked.add(`yardings/${yard}`);
      const last = await o.data.priceLast(`${yard}/yardings-prime`, false);
      const start = last < window ? window : addDays(last, 1);
      if (start <= yesterday) {
        task(`yardings ${yard}`, async () => {
          const rows = await feed.yardings(yard, start, yesterday);
          await sql.transaction((tx) => o.data.keepYardings(tx, yard, rows));
          return rows.length;
        });
      }
    }
  }
  await pool(tasks, o.concurrency ?? FETCH_AT_ONCE, o.now, deadline);
  o.data.forget();
}

/** One rollover run. Never throws for one farm's trouble: that is counted in `failed`. */
export async function runRollover(o: RolloverOptions): Promise<RolloverReport> {
  const started = o.now();
  const deadline = started + (o.budgetMs ?? ROLLOVER_BUDGET_MS);
  const day = localDate(started, 'Australia/Sydney');
  const report: RolloverReport = {
    ranAt: new Date(started).toISOString(),
    fetched: [],
    dataWaiting: [],
    claimed: 0,
    farmsAdvanced: 0,
    daysAdvanced: 0,
    farmsWaiting: 0,
    failed: 0,
    skipped: 0,
    failedFarms: [],
    more: false,
  };
  await fetchMissing(o, deadline, report);

  const claim = o.store.dailyClaim?.bind(o.store);
  if (claim) {
    const held: string[] = [];
    while (o.now() < deadline) {
      const claims = await claim(o.batch ?? 25, o.now());
      if (claims.length === 0) break;
      report.claimed += claims.length;
      for (const c of claims) {
        held.push(c.farmId);
        if (o.now() >= deadline) {
          report.more = true;
          continue;
        }
        try {
          // A farm that has failed too often today is left alone, and is not even loaded.
          if ((await failuresToday(o.sql, day, c.farmId)) >= MAX_FARM_FAILS_A_DAY) {
            report.skipped++;
            continue;
          }
        } catch {
          // Not being able to count is not a reason to leave a farm.
        }
        try {
          const r = await o.game.catchUpFarm(c.farmId, deadline);
          if (r.days > 0) {
            report.farmsAdvanced++;
            report.daysAdvanced += r.days;
          }
          if (r.waiting) report.farmsWaiting++;
          if (r.days < c.daysOwed && !r.waiting && !r.over) report.more = true;
        } catch (e) {
          report.failed++;
          report.failedFarms.push(c.farmId);
          logFailure({ route: 'daily-rollover', reason: 'farm_failed', farm: c.farmId }, e);
          await count(o.sql, day, FAIL_METRIC, 1, `farm=${c.farmId}`).catch(() => undefined);
        }
      }
    }
    // A farm still owed days (paused, out of time, or failed) is free for the next run at once.
    for (const id of held) await o.store.dailyRelease?.(id).catch(() => undefined);
  }

  try {
    await count(o.sql, day, 'rollover_runs', 1);
    await count(o.sql, day, 'rollover_farms', report.farmsAdvanced);
    await count(o.sql, day, 'rollover_days', report.daysAdvanced);
    await count(o.sql, day, 'rollover_waiting', report.farmsWaiting);
    await count(o.sql, day, 'rollover_failed', report.failed);
    await count(o.sql, day, 'rollover_skipped', report.skipped);
    await count(o.sql, day, 'data_rows_fetched', report.fetched.length);
  } catch (e) {
    logFailure({ route: 'daily-rollover', reason: 'count_failed' }, e);
  }
  // Game health (m5.3): the run and how long it took.
  await recordRollover(o.sql, o.now() - started, report.failed > 0).catch((e) =>
    logFailure({ route: 'daily-rollover', reason: 'health_failed' }, e),
  );
  return report;
}

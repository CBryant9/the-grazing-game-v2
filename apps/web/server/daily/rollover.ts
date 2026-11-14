import 'server-only';
import { DISTRICT_IDS } from '@gg/shared';
import type { SqlClient } from '../db/sql';
import type { GameServer } from '../game/game';
import type { FarmStore } from '../game/store';
import { logFailure } from '../logging';
import { addDays, localDate } from './clock';
import { seriesFor, type DailyData, type DailyFeed, type PriceRow, type PriceSeries } from './data';

/*
 * The midnight rollover (PRD 14.3). A scheduled call every 15 minutes:
 *
 *   1. fetch the days of weather and prices that are missing, once for each district and day;
 *   2. claim Daily Farms with days owed, a batch at a time, and bring each up to today.
 *
 * Running it twice does nothing extra: a farm on today is not claimed, and a day already kept
 * is not fetched. A run that dies halfway leaves each farm saved night by night, and its claim
 * runs out after 10 minutes, so the next run carries on. A run that did not happen for days
 * brings each farm up night by night, in order, on the data of each night. It stops when its
 * time budget is used and says so, and the next run picks up the rest.
 */

export interface RolloverOptions {
  game: GameServer;
  store: FarmStore;
  data: DailyData;
  /** Where missing days come from. Null: nothing is fetched, and only the days already kept are used. */
  feed: DailyFeed | null;
  sql: SqlClient | null;
  now: () => number;
  /** How long a run may work, ms. */
  budgetMs?: number;
  /** Farms claimed at a time. */
  batch?: number;
  /** Most days fetched for one district in one run. */
  maxFetchDays?: number;
}

export interface RolloverReport {
  ranAt: string;
  /** Days of data kept this run, as `district date`. */
  fetched: string[];
  /** Days whose data is not in yet, as `district date`. */
  dataWaiting: string[];
  claimed: number;
  farmsAdvanced: number;
  daysAdvanced: number;
  /** Farms that could not be brought up to today because the day's data is not in. */
  farmsWaiting: number;
  failed: number;
  /** True when the time budget ran out with farms still to do. */
  more: boolean;
}

export const ROLLOVER_BUDGET_MS = 45_000;

/** Add to a day's counter (the admin dashboard reads `daily_counts`). */
async function count(
  sql: SqlClient | null,
  day: string,
  metric: string,
  n: number,
): Promise<void> {
  if (!sql || n <= 0) return;
  await sql.query(
    `insert into public.daily_counts (day, metric, dims, count) values ($1::date, $2, '', $3)
     on conflict (day, metric, dims) do update set count = public.daily_counts.count + excluded.count`,
    [day, metric, n],
  );
}

/** Keep the days of weather and prices that are missing, from the feed. One bad day or district does not stop the others. */
async function fetchMissing(o: RolloverOptions, deadline: number, report: RolloverReport): Promise<void> {
  if (!o.feed || !o.sql) return;
  const sql = o.sql;
  // The data is for dates in the district's own country, so "yesterday" is Sydney's.
  const yesterday = addDays(localDate(o.now(), 'Australia/Sydney'), -1);
  for (const district of DISTRICT_IDS) {
    let through = await o.data.through(district, true);
    for (
      let n = 0;
      through < yesterday && n < (o.maxFetchDays ?? 14) && o.now() < deadline;
      n++
    ) {
      const date = addDays(through, 1);
      const tag = `${district} ${date}`;
      try {
        const weather = await o.feed.weather(district, date);
        if (!weather) {
          report.dataWaiting.push(tag);
          break;
        }
        const prices: { series: PriceSeries; row: PriceRow }[] = [];
        for (const series of seriesFor(district)) {
          const row = await o.feed.prices(series, date);
          if (row) prices.push({ series, row });
        }
        await sql.transaction((tx) => o.data.keepDay(tx, district, date, weather, prices));
        o.data.forget();
        report.fetched.push(tag);
        through = await o.data.through(district, true);
      } catch (e) {
        logFailure({ route: 'daily-fetch', reason: 'fetch_failed' }, e);
        report.dataWaiting.push(tag);
        break;
      }
    }
  }
}

/** One rollover run. Never throws for one farm's trouble: that is counted in `failed`. */
export async function runRollover(o: RolloverOptions): Promise<RolloverReport> {
  const started = o.now();
  const deadline = started + (o.budgetMs ?? ROLLOVER_BUDGET_MS);
  const report: RolloverReport = {
    ranAt: new Date(started).toISOString(),
    fetched: [],
    dataWaiting: [],
    claimed: 0,
    farmsAdvanced: 0,
    daysAdvanced: 0,
    farmsWaiting: 0,
    failed: 0,
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
          const r = await o.game.catchUpFarm(c.farmId, deadline);
          if (r.days > 0) {
            report.farmsAdvanced++;
            report.daysAdvanced += r.days;
          }
          if (r.waiting) report.farmsWaiting++;
          if (r.days < c.daysOwed && !r.waiting && !r.over) report.more = true;
        } catch (e) {
          report.failed++;
          logFailure({ route: 'daily-rollover', reason: 'farm_failed' }, e);
        }
      }
    }
    // A farm still owed days (waiting for data, out of time, or failed) is free for the next run at once.
    for (const id of held) await o.store.dailyRelease?.(id).catch(() => undefined);
  }

  const day = localDate(started, 'Australia/Sydney');
  try {
    await count(o.sql, day, 'rollover_runs', 1);
    await count(o.sql, day, 'rollover_farms', report.farmsAdvanced);
    await count(o.sql, day, 'rollover_days', report.daysAdvanced);
    await count(o.sql, day, 'rollover_waiting', report.farmsWaiting);
    await count(o.sql, day, 'rollover_failed', report.failed);
    await count(o.sql, day, 'data_days_fetched', report.fetched.length);
  } catch (e) {
    logFailure({ route: 'daily-rollover', reason: 'count_failed' }, e);
  }
  return report;
}

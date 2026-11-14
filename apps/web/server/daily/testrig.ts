import type { PGlite } from '@electric-sql/pglite';
import { freshDb } from '../../../../packages/db/src/harness';
import type { SetupChoices } from '../../lib/game/types';
import { DbFarmStore } from '../db/dbstore';
import type { SqlClient } from '../db/sql';
import { GameServer, farmKey } from '../game/game';
import { pgliteSql } from '../test-support/pgliteSql';
import { addDays } from './clock';
import { DailyData, bakedThrough, seriesFor, type WeatherRow } from './data';
import { fixtureFeed } from './feed';
import { runRollover } from './rollover';
import { DISTRICT_IDS } from '@gg/shared';

/*
 * The Daily Farm test rig: the real migrations on PGlite, a fake clock the tests move, and the
 * game server, store and data wired to it. Nothing here touches the network.
 */

export const USER = '00000000-0000-4000-8000-0000000000d1';
export const USER2 = '00000000-0000-4000-8000-0000000000d2';
export const SYDNEY = 'Australia/Sydney';

/** The instant of a local wall-clock time in a zone, as ms since 1970. Found by trial, so DST is the zone's own. */
export function at(date: string, time: string, zone = SYDNEY): number {
  const want = `${date} ${time}`;
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const show = (ms: number): string => {
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
  };
  let guess = Date.parse(`${date}T${time}Z`);
  for (let i = 0; i < 4; i++) {
    const shown = show(guess);
    if (shown === want) return guess;
    guess += Date.parse(`${want.replace(' ', 'T')}Z`) - Date.parse(`${shown.replace(' ', 'T')}Z`);
  }
  return guess;
}

export const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'cq',
  size: 'small',
  enterprise: 'grazing',
  years: 'real-in-order',
  startType: 'running',
  difficulty: 'medium',
  name: 'Daily Test',
  mode: 'daily',
  timezone: SYDNEY,
  ...over,
});

/** A plain day of weather, a little different each day so the rows are not all the same. */
export function weatherFor(date: string): WeatherRow {
  const n = Number(date.slice(8, 10));
  return { rain: n % 4 === 0 ? 6.5 : 0, tmax: 31, tmin: 18, rad: 24, evap: 7, et0: 5 + (n % 3) * 0.5 };
}

export interface Rig {
  db: PGlite;
  sql: SqlClient;
  store: DbFarmStore;
  data: DailyData;
  game: GameServer;
  clock: { now: number };
  switchOn: { value: boolean };
  /** Weather and prices the feed will serve, by `district date` and `yard/indicator date`. */
  feedRows: { weather: Record<string, WeatherRow>; prices: Record<string, { value: number; head: number }> };
  /** A new game server on the same database and clock, as another server or tab would be. */
  another(): GameServer;
  /** Serve a day's weather (and a price row for each series) for every district. */
  serveDay(date: string): void;
  /** One rollover run on the fixture feed. */
  roll(options?: { budgetMs?: number; batch?: number; feed?: boolean }): ReturnType<typeof runRollover>;
  key: string;
}

let shared: PGlite | undefined;
export async function database(): Promise<PGlite> {
  if (!shared) {
    shared = await freshDb({ seed: false });
    for (const [id, email] of [
      [USER, 'd1@example.test'],
      [USER2, 'd2@example.test'],
    ]) {
      await shared.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
    }
  }
  return shared;
}

export async function rig(start: { date: string; time: string; zone?: string }): Promise<Rig> {
  const db = await database();
  await db.exec(
    'delete from public.farms; delete from public.weather_daily; delete from public.price_daily; delete from public.daily_counts;',
  );
  const clock = { now: at(start.date, start.time, start.zone ?? SYDNEY) };
  const sql = pgliteSql(db);
  const store = new DbFarmStore(sql, () => clock.now);
  const data = new DailyData(sql, () => clock.now, 0);
  const switchOn = { value: true };
  const runtime = { data, enabled: async () => switchOn.value };
  const make = (): GameServer =>
    new GameServer({ store, seed: () => 5, saveRetryMs: [0, 0], now: () => clock.now, daily: runtime });
  const feedRows: Rig['feedRows'] = { weather: {}, prices: {} };
  const serveDay = (date: string): void => {
    for (const d of DISTRICT_IDS) {
      feedRows.weather[`${d} ${date}`] = weatherFor(date);
      for (const s of seriesFor(d)) {
        // One price series moves a little each day; the rest have no row that day.
        if (s.indicator === 'restocker-yearling-steer') {
          feedRows.prices[`${s.saleyard}/${s.indicator} ${date}`] = {
            value: 600 + Number(date.slice(8, 10)),
            head: 4000,
          };
        }
      }
    }
  };
  const game = make();
  return {
    db,
    sql,
    store,
    data,
    game,
    clock,
    switchOn,
    feedRows,
    another: make,
    serveDay,
    key: farmKey('ab'.padEnd(32, '0')),
    roll: (o = {}) =>
      runRollover({
        game,
        store,
        data,
        feed: o.feed === false ? null : fixtureFeed(feedRows),
        sql,
        now: () => clock.now,
        budgetMs: o.budgetMs,
        batch: o.batch,
      }),
  };
}

/** Serve every day from the day after the baked tables up to `through`, so a farm can run to there. */
export function serveThrough(r: Rig, through: string): void {
  const from = DISTRICT_IDS.map(bakedThrough).sort()[0]!;
  for (let d = addDays(from, 1); d <= through; d = addDays(d, 1)) r.serveDay(d);
}

/** The farm keys for the account, in order made. */
export const OWNER = { kind: 'user' as const, id: USER };

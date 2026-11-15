import 'server-only';
import { featureSwitches } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { notifyDepsFor } from '../notify/deps';
import { sqlFromEnv } from '../db/sql';
import type { DailyRuntime } from '../game/game';
import { DailyData, type DailyFeed } from './data';
import { liveFeed } from './feed';
import { dailyNotifier } from './notices';

/*
 * What Daily Farm runs on in the real site, from the environment (docs/DATABASE.md, milestone 3.3).
 *
 *   SUPABASE_DB_POOLER_URL   the database. Without it there is no Daily Farm at all.
 *   CRON_SECRET              the secret the rollover route checks (Vercel's cron sends it as a bearer token).
 *   GG_DAILY_FEED=live       fetch each day's weather and prices from SILO and MLA. Left out, nothing is fetched.
 *   SILO_CONTACT_EMAIL       the address SILO asks for, only with GG_DAILY_FEED=live. Never kept in the repo.
 */

/** The environment variable holding the rollover route's secret. Server only. */
export const CRON_SECRET_ENV = 'CRON_SECRET';
export const FEED_ENV = 'GG_DAILY_FEED';

declare global {
  var __ggDaily: { data: DailyData; runtime: DailyRuntime } | undefined;
}

/** The data and switch for Daily Farm, or undefined when there is no database. */
export function dailyRuntime(): DailyRuntime | undefined {
  const sql = sqlFromEnv();
  if (!sql) return undefined;
  globalThis.__ggDaily ??= {
    data: new DailyData(sql),
    runtime: {
      get data() {
        return globalThis.__ggDaily!.data;
      },
      async enabled() {
        return (await featureSwitches(sql)).daily_farm;
      },
      // A night's news goes to the notifications queue (m6). With no accounts set up, nothing.
      notify: dailyNotifier(() => {
        const auth = authDeps();
        return auth ? notifyDepsFor(auth) : null;
      }),
    },
  };
  return globalThis.__ggDaily.runtime;
}

/** The live feed when asked for in the environment, else none. */
export function dailyFeed(): DailyFeed | null {
  if (process.env[FEED_ENV]?.trim() !== 'live') return null;
  return liveFeed({ siloUser: process.env.SILO_CONTACT_EMAIL?.trim() || undefined });
}

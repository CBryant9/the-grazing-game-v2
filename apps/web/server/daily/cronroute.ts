import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { DbFarmStore } from '../db/dbstore';
import { sqlFromEnv } from '../db/sql';
import { gameServer } from '../game/game';
import { json, fail } from '../game/http';
import { logFailure } from '../logging';
import { runRollover, type RolloverReport } from './rollover';
import { CRON_SECRET_ENV, dailyFeed, dailyRuntime } from './runtime';

/** What a run answered when it did nothing, and why. */
export interface Skipped {
  skipped: 'no_database' | 'daily_farm_off';
}

export interface RolloverDeps {
  /** The secret the caller must send as a bearer token. Unset: the route is not set up and answers 503. */
  secret: string | undefined;
  run(): Promise<RolloverReport | Skipped>;
}

/** The real run: the database, the switch, the feed from the environment. */
export function realRolloverDeps(): RolloverDeps {
  return {
    secret: process.env[CRON_SECRET_ENV]?.trim() || undefined,
    async run() {
      const sql = sqlFromEnv();
      const runtime = dailyRuntime();
      if (!sql || !runtime) return { skipped: 'no_database' };
      if (!(await runtime.enabled())) return { skipped: 'daily_farm_off' };
      return runRollover({
        game: gameServer(),
        store: new DbFarmStore(sql),
        data: runtime.data,
        feed: dailyFeed(),
        sql,
        now: Date.now,
      });
    },
  };
}

/** The same length and the same bytes, in time that does not tell how much matched. */
function sameSecret(sent: string, secret: string): boolean {
  const a = createHash('sha256').update(sent).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}

/**
 * The rollover route (PRD 14.3). Called every 15 minutes by Vercel's cron, which sends the
 * secret in CRON_SECRET as `Authorization: Bearer <secret>`, or by pg_cron the same way. With no
 * secret set the route is shut. A wrong or missing one gets 401 and nothing else: no detail.
 */
export async function handleRollover(req: Request, deps: RolloverDeps): Promise<Response> {
  if (!deps.secret) return fail(503, 'The daily rollover is not set up.');
  const header = req.headers.get('authorization') ?? '';
  const sent = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!sent || !sameSecret(sent, deps.secret)) return fail(401, 'Not allowed.');
  try {
    return json({ ok: true, ...(await deps.run()) });
  } catch (e) {
    logFailure({ route: 'daily-rollover', reason: 'run_failed' }, e);
    return fail(500, 'The rollover run failed. It will be tried again at the next run.');
  }
}

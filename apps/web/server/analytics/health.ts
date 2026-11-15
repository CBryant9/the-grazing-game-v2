import 'server-only';
import type { SqlClient } from '../db/sql';
import { sqlFromEnv } from '../db/sql';
import { authDeps } from '../auth/deps';
import { onFailure } from '../logging';

/**
 * Game health (PRD 11.1, milestone 5.3): how long the server's routes take, how many fail and why
 * (the fixed reason codes from `logging.ts`), save conflicts and rollover runs.
 *
 * Kept as small aggregate rows in `health_daily` (a day, a kind, a route, a reason, a count, a
 * total and a longest time), never one row per request. Each server adds up in memory and writes
 * its sums at most every 30 seconds, in one statement. A server that stops between writes loses
 * at most those 30 seconds of timings: the figures are for spotting trouble, not for billing.
 * A rollover run is written at once (`recordRollover`), as it happens once in 15 minutes.
 */

export type HealthKind = 'route' | 'failure' | 'save_conflict' | 'rollover';

interface Sum {
  kind: HealthKind;
  route: string;
  reason: string;
  count: number;
  total: number;
  max: number;
}

const FLUSH_MS = 30_000;
const FLUSH_AT_ROWS = 200;

const buffer = new Map<string, Sum>();
let lastFlush = Date.now();
let flushing: Promise<void> | null = null;
// The test runner writes only when a test asks (`flushHealth`), so a background write never
// lands in another test's database.
let autoFlush = !process.env.VITEST;

/** A route name the table accepts: lower case, letters, digits, `_` and `-`, starting with a letter. */
export function cleanRoute(route: string): string {
  const r = route
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 61);
  return /^[a-z]/.test(r) ? r : `r${r}`.slice(0, 61);
}

/** A reason code the table accepts, or `other`. */
export function cleanReason(reason: string): string {
  return /^[a-z0-9_]{0,48}$/.test(reason) ? reason : 'other';
}

/** Add one to the sums. Never throws and never waits. */
export function noteHealth(kind: HealthKind, route: string, reason = '', ms = 0): void {
  try {
    const r = cleanRoute(route);
    const c = cleanReason(reason);
    const key = `${kind}|${r}|${c}`;
    const t = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
    const s = buffer.get(key);
    if (s) {
      s.count++;
      s.total += t;
      s.max = Math.max(s.max, t);
    } else {
      buffer.set(key, { kind, route: r, reason: c, count: 1, total: t, max: t });
    }
    if (autoFlush && (Date.now() - lastFlush >= FLUSH_MS || buffer.size >= FLUSH_AT_ROWS)) {
      void flushHealth().catch(() => undefined);
    }
  } catch {
    // Health figures must never break a request.
  }
}

/** For tests: turn the background write on or off, and empty the sums. */
export function resetHealth(auto = false): void {
  buffer.clear();
  autoFlush = auto;
  lastFlush = Date.now();
}

/** What is waiting to be written (tests). */
export function pendingHealth(): Sum[] {
  return [...buffer.values()].map((s) => ({ ...s }));
}

const healthSql = (): SqlClient | null => authDeps()?.sql ?? sqlFromEnv();

const UPSERT = `
  insert into public.health_daily (day, kind, route, reason, count, total_ms, max_ms)
  select app.today_sydney(), x.kind, x.route, x.reason, x.count, x.total, x.max
    from jsonb_to_recordset($1::jsonb)
      as x(kind text, route text, reason text, count bigint, total bigint, max int)
  on conflict (day, kind, route, reason) do update
     set count = public.health_daily.count + excluded.count,
         total_ms = public.health_daily.total_ms + excluded.total_ms,
         max_ms = greatest(public.health_daily.max_ms, excluded.max_ms)`;

/** Write the sums now. With no database they are dropped. */
export async function flushHealth(sql: SqlClient | null = healthSql()): Promise<void> {
  if (flushing) return flushing;
  lastFlush = Date.now();
  if (buffer.size === 0) return;
  const rows = [...buffer.values()];
  buffer.clear();
  if (!sql) return;
  flushing = (async () => {
    try {
      await sql.query(UPSERT, [JSON.stringify(rows)]);
    } catch {
      // Not written: dropped, so a broken database does not grow the sums without end. Not
      // logged through logFailure, which would count itself here.
      console.error('failed route=health reason=flush_failed');
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** One rollover run, written at once with how long it took. */
export async function recordRollover(
  sql: SqlClient | null,
  ms: number,
  failed: boolean,
): Promise<void> {
  if (!sql) return;
  const t = Math.max(0, Math.round(ms));
  await sql.query(UPSERT, [
    JSON.stringify([
      {
        kind: 'rollover',
        route: 'daily-rollover',
        reason: failed ? 'farm_failed' : '',
        count: 1,
        total: t,
        max: t,
      },
    ]),
  ]);
}

/**
 * Time a route: how long it took, kept under its name. A 5xx answer is also kept as a failure
 * with the reason `status_5xx` (the route's own reason code is kept by `logFailure`).
 */
export function timed<A extends unknown[]>(
  name: string,
  handler: (req: Request, ...rest: A) => Promise<Response>,
): (req: Request, ...rest: A) => Promise<Response> {
  return async (req, ...rest) => {
    const t0 = performance.now();
    try {
      const res = await handler(req, ...rest);
      if (res.status >= 500) noteHealth('failure', name, 'status_5xx');
      return res;
    } finally {
      noteHealth('route', name, '', performance.now() - t0);
    }
  };
}

// Every failure the server logs is counted by route and reason code.
onFailure((f) => noteHealth('failure', f.route, f.reason));

import 'server-only';
import { createHmac } from 'node:crypto';
import type { WebVital } from '@gg/shared/analytics';
import type { SqlClient } from '../db/sql';
import { featureSwitches } from '../auth/accounts';
import { logFailure } from '../logging';
import { propsKey, type CheckedEvent } from './events';
import { bucketOf } from './vitals';

/**
 * Keeping events: counted in our own tables (always, once allowed), and sent on to PostHog only
 * when `POSTHOG_KEY` and `POSTHOG_HOST` are set. With no key nothing leaves the server.
 *
 * Who an event is for is a random per-install id the browser made (a guest), or the account id
 * hashed with a server secret (signed in). Never an email, a username or an address. Our own
 * tables keep no id at all: only counts by day.
 */

export const POSTHOG_KEY_ENV = 'POSTHOG_KEY';
export const POSTHOG_HOST_ENV = 'POSTHOG_HOST';

/** The account id, hashed with the server's pepper under its own label. Not reversible. */
export function hashedUserId(pepper: string, userId: string): string {
  return createHmac('sha256', pepper).update(`analytics:${userId}`).digest('hex').slice(0, 32);
}

/** Is collection switched on? Off with no database, and while the admin switch is off. */
export async function collectionOn(sql: SqlClient | null): Promise<boolean> {
  if (!sql) return false;
  return (await featureSwitches(sql)).analytics;
}

/** Add the events to the day's counts, and Web Vitals to their histogram, in one transaction. */
export async function countEvents(sql: SqlClient, events: readonly CheckedEvent[]): Promise<void> {
  const counts = new Map<string, { event: string; props: string; count: number }>();
  const vitals = new Map<string, { page: string; metric: string; bucket: number; count: number }>();
  for (const e of events) {
    if (e.name === 'web_vital') {
      const metric = e.props.metric as WebVital;
      const bucket = bucketOf(metric, e.props.value as number);
      const key = `${e.props.page}|${metric}|${bucket}`;
      const v = vitals.get(key);
      if (v) v.count++;
      else vitals.set(key, { page: String(e.props.page), metric, bucket, count: 1 });
      continue;
    }
    const props = propsKey(e);
    const key = `${e.name}|${props}`;
    const c = counts.get(key);
    if (c) c.count++;
    else counts.set(key, { event: e.name, props, count: 1 });
  }
  await sql.transaction(async (tx) => {
    if (counts.size > 0) {
      await tx.query(
        `insert into public.analytics_daily (day, event, props, count)
         select app.today_sydney(), x.event, x.props, x.count
           from jsonb_to_recordset($1::jsonb) as x(event text, props text, count bigint)
         on conflict (day, event, props) do update
            set count = public.analytics_daily.count + excluded.count`,
        [JSON.stringify([...counts.values()])],
      );
    }
    if (vitals.size > 0) {
      await tx.query(
        `insert into public.web_vitals_daily (day, page, metric, bucket, count)
         select app.today_sydney(), x.page, x.metric, x.bucket, x.count
           from jsonb_to_recordset($1::jsonb) as x(page text, metric text, bucket int, count bigint)
         on conflict (day, page, metric, bucket) do update
            set count = public.web_vitals_daily.count + excluded.count`,
        [JSON.stringify([...vitals.values()])],
      );
    }
  });
}

export interface PostHogConfig {
  key: string;
  host: string;
}

/** PostHog's key and host from the environment, or null (then nothing is sent). */
export function posthogConfig(
  env: Record<string, string | undefined> = process.env,
): PostHogConfig | null {
  const key = env[POSTHOG_KEY_ENV]?.trim();
  const host = env[POSTHOG_HOST_ENV]?.trim().replace(/\/+$/, '');
  if (!key || !host || !/^https:\/\/[^/\s]+$/.test(host)) return null;
  return { key, host };
}

/**
 * Send the events to PostHog's capture API (its batch endpoint). Never throws: a failure is
 * logged by a fixed reason code and the events stay counted in our own table.
 *
 * Each event is marked so PostHog makes no person profile and looks up no location, and the
 * request comes from this server, so PostHog never sees the player's address.
 */
export async function sendToPostHog(
  config: PostHogConfig | null,
  distinctId: string,
  events: readonly CheckedEvent[],
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<boolean> {
  if (!config || events.length === 0) return false;
  const timestamp = new Date(now).toISOString();
  try {
    const res = await fetchImpl(`${config.host}/batch/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.key,
        batch: events.map((e) => ({
          event: e.name,
          distinct_id: distinctId,
          timestamp,
          properties: { ...e.props, $process_person_profile: false, $geoip_disable: true },
        })),
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      logFailure({ route: 'analytics-collect', reason: 'posthog_refused' });
      return false;
    }
    return true;
  } catch (e) {
    logFailure({ route: 'analytics-collect', reason: 'posthog_failed' }, e);
    return false;
  }
}

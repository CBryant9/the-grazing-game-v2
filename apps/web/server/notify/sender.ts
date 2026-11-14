import 'server-only';
import { createHash } from 'node:crypto';
import { KIND_INFO, type NotifyKind } from '../../lib/notify/kinds';
import { logFailure } from '../logging';
import type { SqlRunner } from '../db/sql';
import { DEFAULT_ZONE, quietFrom, safeZone } from './clock';
import type { NotifyDeps } from './deps';
import { emailFor } from './mail';
import { STALE_MS, schedule } from './queue';
import { makeUnsubToken } from './token';
import type { PushMessage } from './webpush';

/**
 * Sends what the queue holds. Run by the sender route on a schedule (and callable twice at once).
 *
 * Reliable and bounded:
 *  - a send row is claimed in one statement with `for update skip locked`, so two runs at the same
 *    moment never take the same row, and a row stuck in `sending` for 5 minutes (a crashed run)
 *    is taken again;
 *  - at most `batch` rows at a time, and nothing new is started after the time budget;
 *  - one row failing never stops the rest: each row is in its own try block;
 *  - retries with backoff (1 minute, 5, 30, 2 hours, or the service's Retry-After, up to 2 hours),
 *    at most 5 attempts, then `failed` with the code `retries_exhausted`;
 *  - a sent row is never sent again. Push carries a Topic and the device a tag (the notification's
 *    id), so a repeat to a device that was already reached replaces the first and never doubles;
 *    email carries an Idempotency-Key (the send's id) that Resend honours for 24 hours;
 *  - at most DAILY_CAP notifications per account in 24 hours reach push or email (the inbox
 *    always has them), and one stale for 12 hours is dropped;
 *  - the player's switches and quiet hours are checked again at the moment of sending, so a
 *    switch turned off a minute ago is respected;
 *  - a subscription the push service calls gone (404 or 410) is deleted;
 *  - what is recorded for a failure is a fixed reason code. No name, address or text.
 */

export const MAX_ATTEMPTS = 5;
export const BACKOFF_SEC = [60, 300, 1800, 7200] as const;
export const DAILY_CAP = 6;
export const CLAIM_STALE_SEC = 300;
export const PAUSE_SETTING = 'notify_paused';

export interface SenderOptions {
  /** Stop starting new work after this many milliseconds. */
  budgetMs?: number;
  batch?: number;
  /** A clock for the budget, in milliseconds. Tests give their own. */
  clock?: () => number;
}

export interface SenderReport {
  skipped: 'switch_off' | 'paused' | null;
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  held: number;
  dropped: number;
  devicesRemoved: number;
  /** True when the time budget ran out with work still due. */
  outOfTime: boolean;
}

export async function isPaused(sql: SqlRunner): Promise<boolean> {
  const r = await sql.query<{ paused: boolean | null }>(
    `select (value->>'paused')::boolean as paused from public.site_settings where key = $1`,
    [PAUSE_SETTING],
  );
  return r.rows[0]?.paused === true;
}

interface Claimed {
  id: string;
  notification_id: string;
  user_id: string;
  channel: 'push' | 'email';
  attempts: number;
}

interface RowContext {
  kind: NotifyKind;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  timezone: string | null;
  quiet_start: string | null;
  quiet_end: string | null;
  pref_push: boolean | null;
  pref_email: boolean | null;
  farm_tz: string | null;
  restricted: boolean;
}

type Outcome =
  | { state: 'sent' }
  | { state: 'retry'; afterSec: number; reason: string }
  | { state: 'failed'; reason: string }
  | { state: 'held'; until: number; reason: string }
  | { state: 'dropped'; reason: string };

const topicOf = (id: string): string => id.replace(/-/g, '').slice(0, 32);

interface HostRule {
  host: string;
  include_subdomains: boolean;
}

/** The database's allow-list, applied again before a send (a host removed from it stops at once). */
export function hostAllowed(endpoint: string, hosts: HostRule[]): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.port !== '' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  return hosts.some((r) => h === r.host || (r.include_subdomains && h.endsWith(`.${r.host}`)));
}

export async function runSender(
  nd: NotifyDeps,
  options: SenderOptions = {},
): Promise<SenderReport> {
  const report: SenderReport = {
    skipped: null,
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    held: 0,
    dropped: 0,
    devicesRemoved: 0,
    outOfTime: false,
  };
  if (!(await nd.switchOn())) return { ...report, skipped: 'switch_off' };
  if (await isPaused(nd.sql)) return { ...report, skipped: 'paused' };

  const clock = options.clock ?? Date.now;
  const started = clock();
  const budget = options.budgetMs ?? 20_000;
  const batch = options.batch ?? 20;
  const hosts = (
    await nd.sql.query<HostRule>('select host, include_subdomains from public.push_service_hosts')
  ).rows;

  for (;;) {
    if (clock() - started >= budget) {
      report.outOfTime = true;
      break;
    }
    const nowIso = new Date(nd.integrations.now()).toISOString();
    const rows = (
      await nd.sql.query<Claimed>(
        `with due as (
           select id from public.notification_sends
            where (state in ('pending', 'held') and not_before <= $1::timestamptz)
               or (state = 'sending' and claimed_at < $1::timestamptz - make_interval(secs => $3))
            order by not_before, created_at
            limit $2
            for update skip locked)
         update public.notification_sends s
            set state = 'sending', claimed_at = $1::timestamptz, attempts = s.attempts + 1
           from due where s.id = due.id
         returning s.id, s.notification_id, s.user_id, s.channel, s.attempts`,
        [nowIso, batch, CLAIM_STALE_SEC],
      )
    ).rows;
    if (rows.length === 0) break;
    report.claimed += rows.length;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      if (clock() - started >= budget) {
        // Give back what was taken and not started, without counting an attempt.
        const rest = rows.slice(i).map((r) => r.id);
        await nd.sql.query(
          `update public.notification_sends set state = 'pending', claimed_at = null,
                  attempts = greatest(attempts - 1, 0)
            where id = any($1::uuid[]) and state = 'sending'`,
          [rest],
        );
        report.outOfTime = true;
        break;
      }
      let outcome: Outcome;
      try {
        outcome = await processRow(nd, row, hosts, report);
      } catch (e) {
        // One failing row never blocks the others. It tries again later, up to the limit.
        logFailure({ route: 'notify-send', reason: 'send_row_failed' }, e);
        outcome = { state: 'retry', afterSec: BACKOFF_SEC[Math.min(row.attempts, 4) - 1] ?? 7200, reason: 'send_error' };
      }
      await record(nd, row, outcome, report);
    }
    if (report.outOfTime) break;
    if (rows.length < batch) break;
  }
  return report;
}

/** Write what happened, and settle the email that waits on a push. */
async function record(
  nd: NotifyDeps,
  row: Claimed,
  outcome: Outcome,
  report: SenderReport,
): Promise<void> {
  const now = nd.integrations.now();
  let o = outcome;
  if (o.state === 'retry' && row.attempts >= MAX_ATTEMPTS) {
    o = { state: 'failed', reason: 'retries_exhausted' };
  }
  await nd.sql.transaction(async (tx) => {
    switch (o.state) {
      case 'sent':
        report.sent++;
        await tx.query(
          `update public.notification_sends set state = 'sent', sent_at = $2, reason = null, claimed_at = null where id = $1`,
          [row.id, new Date(now).toISOString()],
        );
        break;
      case 'retry':
        report.retried++;
        await tx.query(
          `update public.notification_sends set state = 'pending', claimed_at = null, reason = $2, not_before = $3 where id = $1`,
          [row.id, o.reason, new Date(now + o.afterSec * 1000).toISOString()],
        );
        break;
      case 'failed':
        report.failed++;
        logFailure({ route: 'notify-send', reason: o.reason });
        await tx.query(
          `update public.notification_sends set state = 'failed', claimed_at = null, reason = $2 where id = $1`,
          [row.id, o.reason],
        );
        break;
      case 'held':
        report.held++;
        // A hold for quiet hours is not a failed attempt.
        await tx.query(
          `update public.notification_sends set state = 'held', claimed_at = null, reason = $2,
                  not_before = $3, attempts = greatest(attempts - 1, 0) where id = $1`,
          [row.id, o.reason, new Date(o.until).toISOString()],
        );
        break;
      case 'dropped':
        report.dropped++;
        await tx.query(
          `update public.notification_sends set state = 'dropped', claimed_at = null, reason = $2 where id = $1`,
          [row.id, o.reason],
        );
        break;
    }
    if (row.channel === 'push' && (o.state === 'sent' || o.state === 'failed' || o.state === 'dropped')) {
      await settleEmail(tx, row, o, now);
    }
  });
}

/** Push is settled: an email that was waiting on it now goes, or is dropped. */
async function settleEmail(tx: SqlRunner, row: Claimed, o: Outcome, now: number): Promise<void> {
  const waiting = await tx.query<{ id: string }>(
    `select id from public.notification_sends
      where notification_id = $1 and channel = 'email' and state = 'held' and reason = 'push_first'
        for update`,
    [row.notification_id],
  );
  if (!waiting.rows[0]) return;
  const fallback =
    o.state === 'failed' ||
    (o.state === 'dropped' && (o.reason === 'type_off' || o.reason === 'push_not_set_up'));
  if (!fallback) {
    await tx.query(
      `update public.notification_sends set state = 'dropped', reason = $2 where id = $1`,
      [waiting.rows[0].id, o.state === 'sent' ? 'push_sent' : o.state === 'dropped' ? o.reason : 'push_sent'],
    );
    return;
  }
  // Push did not work: the email goes now (or at the end of quiet hours, or not at all for a reminder).
  const ctx = await tx.query<
    Pick<RowContext, 'kind' | 'timezone' | 'quiet_start' | 'quiet_end' | 'farm_tz'>
  >(
    `select n.kind, ns.timezone, ns.quiet_start::text, ns.quiet_end::text, f.timezone as farm_tz
       from public.notifications n
       left join public.notification_settings ns on ns.user_id = n.user_id
       left join public.farms f on f.id = n.farm_id
      where n.id = $1`,
    [row.notification_id],
  );
  const c = ctx.rows[0];
  if (!c) return;
  const when = schedule(
    c.kind,
    now,
    safeZone(c.farm_tz ?? c.timezone ?? DEFAULT_ZONE),
    quietFrom(c.quiet_start, c.quiet_end),
  );
  await tx.query(
    `update public.notification_sends set state = $2, not_before = $3, reason = $4 where id = $1`,
    [waiting.rows[0].id, when.state, new Date(when.notBefore).toISOString(), when.reason ?? 'push_failed'],
  );
}

async function processRow(
  nd: NotifyDeps,
  row: Claimed,
  hosts: HostRule[],
  report: SenderReport,
): Promise<Outcome> {
  const now = nd.integrations.now();
  const ctxRes = await nd.sql.query<RowContext>(
    `select n.kind, n.title, n.body, n.link, n.created_at,
            ns.timezone, ns.quiet_start::text, ns.quiet_end::text,
            p.push as pref_push, p.email as pref_email, f.timezone as farm_tz,
            app.is_restricted(n.user_id) as restricted
       from public.notifications n
       left join public.notification_settings ns on ns.user_id = n.user_id
       left join public.notification_prefs p on p.user_id = n.user_id and p.kind = n.kind
       left join public.farms f on f.id = n.farm_id
      where n.id = $1`,
    [row.notification_id],
  );
  const c = ctxRes.rows[0];
  if (!c) return { state: 'dropped', reason: 'notification_gone' };
  const info = KIND_INFO[c.kind];
  if (c.restricted) return { state: 'dropped', reason: 'account_restricted' };
  const wanted = row.channel === 'push' ? (c.pref_push ?? info.push) : (c.pref_email ?? info.email);
  if (!wanted) return { state: 'dropped', reason: 'type_off' };
  if (now - new Date(c.created_at).getTime() > STALE_MS) {
    return { state: 'dropped', reason: 'expired' };
  }
  const zone = safeZone(c.farm_tz ?? c.timezone ?? DEFAULT_ZONE);
  const when = schedule(c.kind, now, zone, quietFrom(c.quiet_start, c.quiet_end));
  if (when.state === 'dropped') return { state: 'dropped', reason: 'quiet_hours' };
  if (when.state === 'held') return { state: 'held', until: when.notBefore, reason: 'quiet_hours' };

  const cap = await nd.sql.query<{ n: string }>(
    `select count(distinct notification_id)::text as n from public.notification_sends
      where user_id = $1 and state = 'sent' and sent_at > $2`,
    [row.user_id, new Date(now - 24 * 3600 * 1000).toISOString()],
  );
  if (Number(cap.rows[0]!.n) >= DAILY_CAP) return { state: 'dropped', reason: 'daily_cap' };

  return row.channel === 'push'
    ? sendPush(nd, row, c, hosts, report)
    : sendEmail(nd, row, c);
}

async function sendPush(
  nd: NotifyDeps,
  row: Claimed,
  c: RowContext,
  hosts: HostRule[],
  report: SenderReport,
): Promise<Outcome> {
  const sender = nd.integrations.push;
  if (!sender) return { state: 'dropped', reason: 'push_not_set_up' };
  const subs = (
    await nd.sql.query<{ id: string; endpoint: string; p256dh: string; auth_secret: string }>(
      `select id, endpoint, p256dh, auth_secret from public.push_subscriptions
        where user_id = $1 order by created_at limit 10`,
      [row.user_id],
    )
  ).rows;
  if (subs.length === 0) return { state: 'failed', reason: 'no_device' };
  const message: PushMessage = {
    id: row.notification_id,
    title: c.title,
    body: c.body,
    link: c.link,
  };
  let anyOk = false;
  let retry = null as { afterSec: number; reason: string } | null;
  let lastReason = 'push_rejected';
  let gone = 0;
  for (const s of subs) {
    if (!hostAllowed(s.endpoint, hosts)) {
      // Not a push service we allow, whatever the database let in once.
      await removeDevice(nd.sql, s.id);
      report.devicesRemoved++;
      gone++;
      lastReason = 'push_host_not_allowed';
      continue;
    }
    const res = await sender.send(
      { endpoint: s.endpoint, p256dh: s.p256dh, authSecret: s.auth_secret },
      message,
      { ttlSec: 6 * 3600, topic: topicOf(row.notification_id) },
    );
    if (res.ok) {
      anyOk = true;
      await nd.sql.query('update public.push_subscriptions set last_used_at = $2 where id = $1', [
        s.id,
        new Date(nd.integrations.now()).toISOString(),
      ]);
    } else if (res.gone) {
      await removeDevice(nd.sql, s.id);
      report.devicesRemoved++;
      gone++;
      lastReason = res.reason;
    } else if (res.retry) {
      const after = res.retryAfterSec ?? BACKOFF_SEC[Math.min(row.attempts, 4) - 1] ?? 7200;
      retry = { afterSec: Math.max(retry?.afterSec ?? 0, after), reason: res.reason };
    } else {
      lastReason = res.reason;
    }
  }
  if (anyOk) return { state: 'sent' };
  if (retry) return { state: 'retry', ...retry };
  return { state: 'failed', reason: gone === subs.length ? 'push_gone' : lastReason };
}

async function removeDevice(sql: SqlRunner, id: string): Promise<void> {
  await sql.query('delete from public.push_subscriptions where id = $1', [id]);
}

async function sendEmail(nd: NotifyDeps, row: Claimed, c: RowContext): Promise<Outcome> {
  const i = nd.integrations;
  if (!i.mail || !i.from || !i.site || !i.tokenSecret) {
    return { state: 'dropped', reason: 'email_not_set_up' };
  }
  const to = await nd.emailOf(row.user_id);
  if (!to) return { state: 'failed', reason: 'no_email' };
  const token = makeUnsubToken(i.tokenSecret, {
    userId: row.user_id,
    kind: c.kind,
    issuedAt: i.now(),
  });
  const content = emailFor(
    c.kind,
    c.title,
    c.body,
    c.link ? `${i.site}${c.link}` : null,
    `${i.site}/api/notify/u?t=${token}`,
  );
  const res = await i.mail.send({
    to,
    from: i.from,
    subject: content.subject,
    text: content.text,
    html: content.html,
    headers: content.headers,
    // The same for every try of this send, so a retry is never a second email.
    idempotencyKey: createHash('sha256').update(`gg-notify:${row.id}`).digest('hex').slice(0, 64),
  });
  if (res.ok) return { state: 'sent' };
  if (res.retry) {
    return {
      state: 'retry',
      afterSec: res.retryAfterSec ?? BACKOFF_SEC[Math.min(row.attempts, 4) - 1] ?? 7200,
      reason: res.reason,
    };
  }
  return { state: 'failed', reason: res.reason };
}

/** Remove finished send rows older than 30 days. Run by the sender route. */
export async function housekeep(nd: NotifyDeps): Promise<number> {
  const r = await nd.sql.query(
    `delete from public.notification_sends
      where state in ('sent', 'failed', 'dropped') and updated_at < $1`,
    [new Date(nd.integrations.now() - 30 * 24 * 3600 * 1000).toISOString()],
  );
  return r.rowCount;
}

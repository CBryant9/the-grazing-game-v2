import 'server-only';
import { KIND_INFO, isNotifyKind, isSafeLink, type NotifyKind } from '../../lib/notify/kinds';
import type { SqlRunner } from '../db/sql';
import {
  DEFAULT_ZONE,
  inQuiet,
  localDate,
  minutesOfDay,
  quietEndsAt,
  quietFrom,
  safeZone,
  type Quiet,
} from './clock';
import { capabilities, type NotifyDeps } from './deps';
import { describeEvent, wordingProblems, type NotifyEvent } from './wording';

/**
 * The one way anything makes a notification: `queueNotification`.
 *
 * THE CONTRACT (for the Daily Farm rollover, the community code and the purchase code):
 *
 *   await queueNotification(nd, {
 *     userId,                // the account
 *     kind,                  // one of NOTIFY_KINDS (lib/notify/kinds.ts)
 *     title,                 // the fact line, 1 to 120 characters, plain text
 *     body,                  // optional second line, up to 300 characters
 *     link,                  // optional path on this site, such as '/play'
 *     farmId,                // optional: the farm it is about (its time zone sets quiet hours)
 *     dedupeKey,             // optional: the same key for the same account is made once
 *   });
 *
 * or, for the events in wording.ts, `queueEvent(nd, userId, event, { farmId, dedupeKey })`, which
 * writes the words for you. It never throws for something expected: it answers with a status.
 *
 *   queued     the inbox row is made, and the push and email sends it needs (each pending, held
 *              for the end of quiet hours, or dropped, with a fixed reason code)
 *   duplicate  the same dedupeKey was already made for this account: nothing was added
 *   skipped    nothing was made, and `reason` says why
 *
 * What it decides, so the callers do not have to:
 *  - the wording rule (no exclamation marks, guilt, streaks, countdowns, praise or money) and the
 *    database's link rule are checked first;
 *  - community types are never made for an account under 16, for a banned or suspended account,
 *    or while the community switch is off (PRD 8.3);
 *  - an evening warning is skipped when the farm was already opened that day, and there is at most
 *    one per farm per day;
 *  - the player's own switches: push and email per type (a type turned off sends nothing, and a
 *    morning or later reminder leaves no inbox row either);
 *  - quiet hours, in the farm's own time zone when a farm is named: a reminder or evening warning
 *    is DROPPED inside quiet hours (it is no use later), everything else is HELD until they end;
 *  - email only as the fallback: sent when the player has no working device, or when push failed.
 * Nothing is sent from here. The sender route (sender.ts) does the sending.
 */

export interface QueueInput {
  userId: string;
  kind: NotifyKind;
  title: string;
  body?: string | null;
  link?: string | null;
  farmId?: string | null;
  dedupeKey?: string | null;
}

export type SkipReason =
  | 'invalid_kind'
  | 'invalid_text'
  | 'invalid_wording'
  | 'invalid_link'
  | 'invalid_farm'
  | 'no_account'
  | 'community_closed'
  | 'type_off'
  | 'no_channel'
  | 'opened_today';

export type QueueResult =
  | { status: 'queued'; id: string; push: SendState | null; email: SendState | null }
  | { status: 'duplicate' }
  | { status: 'skipped'; reason: SkipReason };

export type SendState = 'pending' | 'held' | 'dropped';

export const TITLE_MAX = 120;
export const BODY_MAX = 300;

/** How long a held or waiting notification stays worth sending (milliseconds). */
export const STALE_MS = 12 * 3600 * 1000;

interface Context {
  timezone: string | null;
  quiet_start: string | null;
  quiet_end: string | null;
  pref_push: boolean | null;
  pref_email: boolean | null;
  member: boolean;
  community_ok: boolean;
  restricted: boolean;
  devices: string;
  has_profile: boolean;
}

/** The schedule for one send: now, held until quiet hours end, or dropped. */
export function schedule(
  kind: NotifyKind,
  now: number,
  zone: string,
  quiet: Quiet | null,
): { state: SendState; notBefore: number; reason: string | null } {
  if (inQuiet(minutesOfDay(now, zone), quiet)) {
    if (KIND_INFO[kind].expires) return { state: 'dropped', notBefore: now, reason: 'quiet_hours' };
    return {
      state: 'held',
      notBefore: quietEndsAt(now, zone, quiet) ?? now,
      reason: 'quiet_hours',
    };
  }
  return { state: 'pending', notBefore: now, reason: null };
}

export async function queueNotification(nd: NotifyDeps, input: QueueInput): Promise<QueueResult> {
  const skip = (reason: SkipReason): QueueResult => ({ status: 'skipped', reason });
  if (!isNotifyKind(input.kind)) return skip('invalid_kind');
  const info = KIND_INFO[input.kind];
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const body = typeof input.body === 'string' && input.body.trim() ? input.body.trim() : null;
  const bad = /[\u0000-\u001f\u007f]/;
  if (!title || title.length > TITLE_MAX || bad.test(title)) return skip('invalid_text');
  if (body && (body.length > BODY_MAX || bad.test(body))) return skip('invalid_text');
  if (wordingProblems(title).length > 0 || (body && wordingProblems(body).length > 0)) {
    return skip('invalid_wording');
  }
  const link = input.link ?? null;
  if (link !== null && !isSafeLink(link)) return skip('invalid_link');
  const userId = input.userId;
  const now = nd.integrations.now();

  const caps = await capabilities(nd);

  return nd.sql.transaction(async (tx) => {
    const r = await tx.query<Context>(
      `select ns.timezone, ns.quiet_start::text, ns.quiet_end::text,
              p.push as pref_push, p.email as pref_email,
              app.member_raw($1) as member, app.community_ok($1) as community_ok,
              app.is_restricted($1) as restricted,
              (select count(*) from public.push_subscriptions where user_id = $1)::text as devices,
              exists (select 1 from public.profiles where user_id = $1) as has_profile
         from (select 1) x
         left join public.notification_settings ns on ns.user_id = $1
         left join public.notification_prefs p on p.user_id = $1 and p.kind = $2`,
      [userId, input.kind],
    );
    const c = r.rows[0]!;
    if (!c.has_profile) return skip('no_account');
    if (info.community && !c.community_ok) return skip('community_closed');

    let zone = safeZone(c.timezone ?? DEFAULT_ZONE);
    let dedupeKey = input.dedupeKey ?? null;
    if (input.farmId) {
      const f = await tx.query<{ timezone: string | null; last_opened_at: string | null }>(
        'select timezone, last_opened_at from public.farms where id = $1 and owner_id = $2',
        [input.farmId, userId],
      );
      const farm = f.rows[0];
      if (!farm) return skip('invalid_farm');
      if (farm.timezone) zone = safeZone(farm.timezone);
      if (input.kind === 'evening_warning') {
        const today = localDate(now, zone);
        if (farm.last_opened_at && localDate(new Date(farm.last_opened_at), zone) === today) {
          return skip('opened_today');
        }
        // At most one evening warning per farm per day.
        dedupeKey ??= `evening:${input.farmId}:${today}`;
      }
    }

    const pushPref = c.pref_push ?? info.push;
    const emailPref = c.pref_email ?? info.email;
    if (info.pingOnly && !pushPref && !emailPref) return skip('type_off');
    const pushWanted = pushPref && caps.push && Number(c.devices) > 0 && !c.restricted;
    const emailWanted = emailPref && caps.email && !c.restricted;
    if (info.pingOnly && !pushWanted && !emailWanted) return skip('no_channel');

    const quiet = quietFrom(c.quiet_start, c.quiet_end);
    const when = schedule(input.kind, now, zone, quiet);
    const hidden = info.pingOnly && when.state === 'dropped';

    const made = await tx.query<{ id: string }>(
      `insert into public.notifications (user_id, kind, title, body, link, farm_id, dedupe_key, show_in_inbox, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
       on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing
       returning id`,
      [
        userId,
        input.kind,
        title,
        body,
        link,
        input.farmId ?? null,
        dedupeKey,
        !hidden,
        new Date(now).toISOString(),
      ],
    );
    const id = made.rows[0]?.id;
    if (!id) return { status: 'duplicate' } satisfies QueueResult;

    let push: SendState | null = null;
    let email: SendState | null = null;
    if (pushWanted) {
      push = when.state;
      await addSend(tx, id, userId, 'push', when.state, when.notBefore, when.reason);
    }
    if (emailWanted) {
      if (pushWanted && push !== 'dropped') {
        // The email waits for what happens to the push. It is sent only if push does not work.
        email = 'held';
        await addSend(tx, id, userId, 'email', 'held', Infinity, 'push_first');
      } else {
        email = when.state;
        await addSend(tx, id, userId, 'email', when.state, when.notBefore, when.reason);
      }
    }
    return { status: 'queued', id, push, email } satisfies QueueResult;
  });
}

async function addSend(
  tx: SqlRunner,
  notificationId: string,
  userId: string,
  channel: 'push' | 'email',
  state: SendState,
  notBefore: number,
  reason: string | null,
): Promise<void> {
  await tx.query(
    `insert into public.notification_sends (notification_id, user_id, channel, state, not_before, reason)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (notification_id, channel) do nothing`,
    [
      notificationId,
      userId,
      channel,
      state,
      Number.isFinite(notBefore) ? new Date(notBefore).toISOString() : 'infinity',
      reason,
    ],
  );
}

/** Queue one of the events in wording.ts: the words are written for you. */
export function queueEvent(
  nd: NotifyDeps,
  userId: string,
  event: NotifyEvent,
  extra: { farmId?: string | null; dedupeKey?: string | null } = {},
): Promise<QueueResult> {
  const d = describeEvent(event);
  return queueNotification(nd, {
    userId,
    kind: d.kind,
    title: d.title,
    body: d.body,
    link: d.link,
    farmId: extra.farmId ?? null,
    dedupeKey: extra.dedupeKey ?? null,
  });
}

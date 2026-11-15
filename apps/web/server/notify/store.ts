import 'server-only';
import { createHash } from 'node:crypto';
import {
  KIND_INFO,
  MAX_DEVICES,
  NOTIFY_KINDS,
  isNotifyKind,
  type NotifyKind,
} from '../../lib/notify/kinds';
import type { SqlRunner } from '../db/sql';
import { GameError } from '../game/game';
import { DEFAULT_ZONE, parseClock, safeZone } from './clock';

/**
 * What the settings page and the inbox read and change, for one signed-in account. Every
 * statement names the account from the verified session, never from the request.
 */

export interface PrefView {
  kind: NotifyKind;
  push: boolean;
  email: boolean;
}

export interface SettingsView {
  reminderTime: string;
  laterNudge: boolean;
  /** Both null, or both set. */
  quietStart: string | null;
  quietEnd: string | null;
  timezone: string;
}

export interface DeviceView {
  id: string;
  /** A short code the browser can match against its own endpoint to find "this device". */
  ref: string;
  label: string;
  addedAt: string;
  lastUsedAt: string | null;
}

export const endpointRef = (endpoint: string): string =>
  createHash('sha256').update(endpoint).digest('hex').slice(0, 12);

const hm = (t: string | null): string | null => (t ? t.slice(0, 5) : null);

export async function readState(
  sql: SqlRunner,
  userId: string,
): Promise<{ settings: SettingsView; prefs: PrefView[]; devices: DeviceView[]; unread: number }> {
  const s = await sql.query<{
    reminder_time: string;
    later_nudge: boolean;
    quiet_start: string | null;
    quiet_end: string | null;
    timezone: string;
  }>(
    `select reminder_time::text, later_nudge, quiet_start::text, quiet_end::text, timezone
       from public.notification_settings where user_id = $1`,
    [userId],
  );
  const row = s.rows[0];
  const p = await sql.query<{ kind: NotifyKind; push: boolean; email: boolean }>(
    'select kind, push, email from public.notification_prefs where user_id = $1',
    [userId],
  );
  const have = new Map(p.rows.map((r) => [r.kind, r]));
  const d = await sql.query<{
    id: string;
    endpoint: string;
    device: string | null;
    created_at: string;
    last_used_at: string | null;
  }>(
    `select id, endpoint, device, created_at, last_used_at from public.push_subscriptions
      where user_id = $1 order by created_at`,
    [userId],
  );
  const u = await sql.query<{ n: string }>(
    `select count(*)::text as n from public.notifications
      where user_id = $1 and read_at is null and show_in_inbox`,
    [userId],
  );
  return {
    settings: {
      reminderTime: hm(row?.reminder_time ?? '07:00')!,
      laterNudge: row?.later_nudge ?? true,
      quietStart: hm(row?.quiet_start ?? null),
      quietEnd: hm(row?.quiet_end ?? null),
      timezone: row?.timezone ?? DEFAULT_ZONE,
    },
    prefs: NOTIFY_KINDS.map((kind) => ({
      kind,
      push: have.get(kind)?.push ?? KIND_INFO[kind].push,
      email: have.get(kind)?.email ?? KIND_INFO[kind].email,
    })),
    devices: d.rows.map((x) => ({
      id: x.id,
      ref: endpointRef(x.endpoint),
      label: x.device ?? 'A device',
      addedAt: new Date(x.created_at).toISOString(),
      lastUsedAt: x.last_used_at ? new Date(x.last_used_at).toISOString() : null,
    })),
    unread: Number(u.rows[0]!.n),
  };
}

const bool = (v: unknown, what: string): boolean | undefined => {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw new GameError(400, `${what} must be on or off.`);
  return v;
};

export async function setPref(
  sql: SqlRunner,
  userId: string,
  body: Record<string, unknown>,
  emailAvailable: boolean,
): Promise<void> {
  if (!isNotifyKind(body.kind)) throw new GameError(400, 'That is not a notification type.');
  const kind = body.kind;
  const push = bool(body.push, 'Push');
  const email = bool(body.email, 'Email');
  if (push === undefined && email === undefined) {
    throw new GameError(400, 'Say what to change.');
  }
  if (email === true && !emailAvailable) {
    throw new GameError(409, 'Email notifications are not set up yet.');
  }
  const info = KIND_INFO[kind];
  await sql.query(
    `insert into public.notification_prefs (user_id, kind, push, email)
     values ($1, $2, coalesce($3::boolean, $5::boolean), coalesce($4::boolean, $6::boolean))
     on conflict (user_id, kind) do update
       set push = coalesce($3::boolean, notification_prefs.push),
           email = coalesce($4::boolean, notification_prefs.email)`,
    [userId, kind, push ?? null, email ?? null, info.push, info.email],
  );
  // The later reminder has one more switch, on the settings row. Keep the two together.
  if (kind === 'later_nudge') {
    const on = push === true || email === true;
    const off = push === false && email === false;
    if (on || off) await ensureSettings(sql, userId, { laterNudge: on });
  }
}

async function ensureSettings(
  sql: SqlRunner,
  userId: string,
  set: { laterNudge: boolean },
): Promise<void> {
  await sql.query(
    `insert into public.notification_settings (user_id, later_nudge) values ($1, $2)
     on conflict (user_id) do update set later_nudge = excluded.later_nudge`,
    [userId, set.laterNudge],
  );
}

export async function setSettings(
  sql: SqlRunner,
  userId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const cur = await sql.query<{
    reminder_time: string;
    quiet_start: string | null;
    quiet_end: string | null;
    timezone: string;
    later_nudge: boolean;
  }>(
    `select reminder_time::text, quiet_start::text, quiet_end::text, timezone, later_nudge
       from public.notification_settings where user_id = $1`,
    [userId],
  );
  const c = cur.rows[0];
  const time = (v: unknown, what: string): string => {
    const m = parseClock(typeof v === 'string' ? v : null);
    if (m === null) throw new GameError(400, `${what} must be a time such as 07:00.`);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const reminder =
    body.reminderTime === undefined
      ? (c?.reminder_time ?? '07:00')
      : time(body.reminderTime, 'The reminder time');
  let qs = c?.quiet_start ?? null;
  let qe = c?.quiet_end ?? null;
  if (body.quietStart !== undefined || body.quietEnd !== undefined) {
    const s = body.quietStart ?? null;
    const e = body.quietEnd ?? null;
    if ((s === null) !== (e === null)) {
      throw new GameError(400, 'Set both the start and the end of quiet hours, or neither.');
    }
    qs = s === null ? null : time(s, 'Quiet hours start');
    qe = e === null ? null : time(e, 'Quiet hours end');
  }
  let tz = c?.timezone ?? DEFAULT_ZONE;
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string' || safeZone(body.timezone) !== body.timezone) {
      throw new GameError(400, 'That is not a time zone.');
    }
    tz = body.timezone;
  }
  const later = bool(body.laterNudge, 'The later reminder') ?? c?.later_nudge ?? true;
  await sql.query(
    `insert into public.notification_settings (user_id, reminder_time, later_nudge, quiet_start, quiet_end, timezone)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do update set reminder_time = excluded.reminder_time,
       later_nudge = excluded.later_nudge, quiet_start = excluded.quiet_start,
       quiet_end = excluded.quiet_end, timezone = excluded.timezone`,
    [userId, reminder, later, qs, qe, tz],
  );
}

/** One tap: every type off for push and email, and the later reminder off. Inbox rows stay. */
export async function turnEverythingOff(sql: SqlRunner, userId: string): Promise<void> {
  for (const kind of NOTIFY_KINDS) {
    await sql.query(
      `insert into public.notification_prefs (user_id, kind, push, email) values ($1, $2, false, false)
       on conflict (user_id, kind) do update set push = false, email = false`,
      [userId, kind],
    );
  }
  await ensureSettings(sql, userId, { laterNudge: false });
}

// ---------------------------------------------------------------- devices

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface DeviceInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  label: string;
}

/** Check what a browser sent for a subscription. Plain messages. */
export function parseDevice(body: Record<string, unknown>): DeviceInput {
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const endpoint = body.endpoint;
  const p256dh = keys.p256dh;
  const auth = keys.auth;
  if (
    typeof endpoint !== 'string' ||
    typeof p256dh !== 'string' ||
    typeof auth !== 'string' ||
    endpoint.length > 1000 ||
    !/^https:\/\//.test(endpoint)
  ) {
    throw new GameError(400, 'This browser did not send what a device needs.');
  }
  const p = Buffer.from(p256dh, 'base64url');
  const a = Buffer.from(auth, 'base64url');
  if (
    !B64URL.test(p256dh) ||
    !B64URL.test(auth) ||
    p.length !== 65 ||
    p[0] !== 4 ||
    a.length < 16
  ) {
    throw new GameError(400, 'This browser did not send what a device needs.');
  }
  const raw = typeof body.device === 'string' ? body.device : '';
  const label =
    raw
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, 60) || 'A device';
  return { endpoint, p256dh, auth, label };
}

export const HOST_REFUSED = "Notifications aren't available in this browser yet.";

export async function addDevice(
  sql: SqlRunner,
  userId: string,
  d: DeviceInput,
): Promise<{ id: string; ref: string }> {
  const count = await sql.query<{ n: string; mine: boolean }>(
    `select count(*)::text as n, bool_or(endpoint = $2) as mine
       from public.push_subscriptions where user_id = $1`,
    [userId, d.endpoint],
  );
  if (Number(count.rows[0]!.n) >= MAX_DEVICES && !count.rows[0]!.mine) {
    throw new GameError(409, `You can keep up to ${MAX_DEVICES} devices. Remove one first.`);
  }
  try {
    // The same browser signing in as someone else takes the device over: the old account stops getting it.
    const r = await sql.query<{ id: string }>(
      `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret, device)
       values ($1, $2, $3, $4, $5)
       on conflict (endpoint) do update
         set user_id = excluded.user_id, p256dh = excluded.p256dh,
             auth_secret = excluded.auth_secret, device = excluded.device
       returning id`,
      [userId, d.endpoint, d.p256dh, d.auth, d.label],
    );
    return { id: r.rows[0]!.id, ref: endpointRef(d.endpoint) };
  } catch (e) {
    const hint = (e as { hint?: unknown }).hint;
    const message = (e as { message?: unknown }).message;
    if (
      hint === 'push_host_not_allowed' ||
      (typeof message === 'string' && message.startsWith('push_host_not_allowed'))
    ) {
      throw new GameError(400, HOST_REFUSED, 'push_host_not_allowed');
    }
    throw e;
  }
}

export async function removeMyDevice(
  sql: SqlRunner,
  userId: string,
  by: { id?: unknown; ref?: unknown },
): Promise<number> {
  if (typeof by.id === 'string') {
    const r = await sql.query(
      'delete from public.push_subscriptions where user_id = $1 and id::text = $2',
      [userId, by.id],
    );
    return r.rowCount;
  }
  if (typeof by.ref === 'string' && /^[0-9a-f]{12}$/.test(by.ref)) {
    const all = await sql.query<{ id: string; endpoint: string }>(
      'select id, endpoint from public.push_subscriptions where user_id = $1',
      [userId],
    );
    const hit = all.rows.filter((x) => endpointRef(x.endpoint) === by.ref);
    for (const h of hit) {
      await sql.query('delete from public.push_subscriptions where id = $1', [h.id]);
    }
    return hit.length;
  }
  throw new GameError(400, 'Say which device.');
}

/** Every device of the account (sign out everywhere). */
export async function removeAllDevices(sql: SqlRunner, userId: string): Promise<void> {
  await sql.query('delete from public.push_subscriptions where user_id = $1', [userId]);
}

// ---------------------------------------------------------------- the inbox

export interface InboxItem {
  id: string;
  kind: NotifyKind;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  at: string;
}

export const INBOX_PAGE = 20;

export async function readInbox(
  sql: SqlRunner,
  userId: string,
  before: unknown,
): Promise<{ items: InboxItem[]; next: string | null; unread: number }> {
  let cursorAt: string | null = null;
  let cursorId: string | null = null;
  if (typeof before === 'string' && before) {
    const m = /^(\d{4}-\d{2}-\d{2}T[0-9:.]+Z)\|([0-9a-f-]{36})$/.exec(before);
    if (!m) throw new GameError(400, 'That page marker is not right.');
    cursorAt = m[1]!;
    cursorId = m[2]!;
  }
  const r = await sql.query<{
    id: string;
    kind: NotifyKind;
    title: string;
    body: string | null;
    link: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    `select id, kind, title, body, link, read_at, created_at from public.notifications
      where user_id = $1 and show_in_inbox
        and ($2::timestamptz is null or (created_at, id) < ($2::timestamptz, $3::uuid))
      order by created_at desc, id desc
      limit $4`,
    [userId, cursorAt, cursorId, INBOX_PAGE + 1],
  );
  const page = r.rows.slice(0, INBOX_PAGE);
  const last = page[page.length - 1];
  const u = await sql.query<{ n: string }>(
    `select count(*)::text as n from public.notifications
      where user_id = $1 and read_at is null and show_in_inbox`,
    [userId],
  );
  return {
    items: page.map((x) => ({
      id: x.id,
      kind: x.kind,
      title: x.title,
      body: x.body,
      link: x.link,
      read: x.read_at !== null,
      at: new Date(x.created_at).toISOString(),
    })),
    next:
      r.rows.length > INBOX_PAGE && last
        ? `${new Date(last.created_at).toISOString()}|${last.id}`
        : null,
    unread: Number(u.rows[0]!.n),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function markRead(
  sql: SqlRunner,
  userId: string,
  body: Record<string, unknown>,
): Promise<number> {
  if (body.all === true) {
    const r = await sql.query(
      'update public.notifications set read_at = now() where user_id = $1 and read_at is null',
      [userId],
    );
    return r.rowCount;
  }
  const ids = body.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 50 ||
    !ids.every((i) => typeof i === 'string' && UUID.test(i))
  ) {
    throw new GameError(400, 'Say which messages.');
  }
  const r = await sql.query(
    `update public.notifications set read_at = now()
      where user_id = $1 and read_at is null and id = any($2::uuid[])`,
    [userId, ids],
  );
  return r.rowCount;
}

// ---------------------------------------------------------------- unsubscribe by email link

export type UnsubOutcome = 'done' | 'already';

/**
 * Turn one type's email off for an account, from an email link. It changes only that one setting,
 * and only if the player has not touched it since the email was made: a later change in the
 * settings stands, and an old link can not undo it.
 */
export async function applyUnsubscribe(
  sql: SqlRunner,
  userId: string,
  kind: NotifyKind,
  issuedAt: number,
): Promise<UnsubOutcome> {
  const info = KIND_INFO[kind];
  try {
    const r = await sql.query(
      `insert into public.notification_prefs (user_id, kind, push, email)
       values ($1, $2, $3, false)
       on conflict (user_id, kind) do update set email = false
        where notification_prefs.updated_at <= $4::timestamptz and notification_prefs.email`,
      [userId, kind, info.push, new Date(issuedAt).toISOString()],
    );
    return r.rowCount > 0 ? 'done' : 'already';
  } catch (e) {
    // The account is gone (the foreign key says so): nothing to change.
    if ((e as { code?: unknown }).code === '23503') return 'already';
    throw e;
  }
}

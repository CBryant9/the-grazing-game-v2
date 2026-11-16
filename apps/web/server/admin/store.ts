import 'server-only';
import { FEATURE_SWITCHES, type FeatureSwitchKey } from '@gg/shared';
import { resetSwitchCache } from '../auth/accounts';
import { banHash } from '../auth/email';
import type { SqlClient, SqlRunner } from '../db/sql';
import { activeAdmin } from './gate';
import { AdminError } from './errors';
import { SUSPEND_DAYS } from './info';
import { SETTINGS, parseSetting, settingDef, type SettingKey } from './settings';

/**
 * Everything the admin screens read and change. Reads are plain selects. Every change is ONE
 * transaction that makes the change and writes its row in `admin_audit_log` (a fixed shape, no free text: see
 * docs/DATABASE.md). If the audit row fails to write the change is rolled back with it. The
 * server runs as `service_role` (server/db/sql.ts).
 *
 * What an admin can NOT read here, by design: a date of birth (only a yes or no for under 16
 * is worked out inside the query) and an email address (never read for display; the ban
 * hash is made from it and only the hash is stored).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

type Details = Record<string, string | number | boolean | string[]>;

/** Write one audit row inside the caller's transaction. */
export async function audit(
  tx: SqlRunner,
  adminId: string,
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Details = {},
): Promise<void> {
  await tx.query(
    `insert into public.admin_audit_log (admin_id, action, target_type, target_id, details)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, action, targetType, targetId, JSON.stringify(details)],
  );
}

// ---------------------------------------------------------------- feature switches

export interface SwitchRow {
  key: FeatureSwitchKey;
  enabled: boolean;
  /** True when the database has no row and the shared default applies. */
  isDefault: boolean;
  changedBy: string | null;
  changedAt: string | null;
}

/** Exactly the shared keys, in the shared order, with the database's state for each. */
export async function listSwitches(sql: SqlClient): Promise<SwitchRow[]> {
  const r = await sql.query<{
    key: string;
    enabled: boolean;
    updated_at: string | null;
    username: string | null;
    updated_by: string | null;
  }>(
    `select f.key, f.enabled, f.updated_at, f.updated_by, p.username
       from public.feature_switches f
       left join public.profiles p on p.user_id = f.updated_by`,
  );
  const byKey = new Map(r.rows.map((x) => [x.key, x]));
  return (Object.keys(FEATURE_SWITCHES) as FeatureSwitchKey[]).map((key) => {
    const row = byKey.get(key);
    return {
      key,
      enabled: row ? row.enabled : FEATURE_SWITCHES[key],
      isDefault: !row,
      // Set only when an admin changed it. A row made by the migration has no `updated_by`.
      changedBy: row?.updated_by ? (row.username ?? 'a removed account') : null,
      changedAt: row?.updated_by && row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  });
}

export async function setSwitch(
  sql: SqlClient,
  adminId: string,
  key: unknown,
  enabled: unknown,
): Promise<{ changed: boolean }> {
  if (typeof key !== 'string' || !(key in FEATURE_SWITCHES)) {
    throw new AdminError(400, 'That is not a feature switch.');
  }
  if (typeof enabled !== 'boolean') throw new AdminError(400, 'Say whether it is on or off.');
  const changed = await sql.transaction(async (tx) => {
    const now = await tx.query<{ enabled: boolean }>(
      'select enabled from public.feature_switches where key = $1 for update',
      [key],
    );
    const current = now.rows[0]?.enabled ?? FEATURE_SWITCHES[key as FeatureSwitchKey];
    if (now.rows[0] && current === enabled) return false;
    await tx.query(
      `insert into public.feature_switches (key, enabled, updated_by) values ($1, $2, $3)
       on conflict (key) do update set enabled = excluded.enabled, updated_by = excluded.updated_by`,
      [key, enabled, adminId],
    );
    await audit(tx, adminId, 'switch_set', 'feature_switch', key, { switch_key: key, enabled });
    return true;
  });
  // This server reads the new state at once. Others read it within the cache time (30 seconds).
  resetSwitchCache();
  return { changed };
}

// ---------------------------------------------------------------- site settings

export interface SettingRow {
  key: SettingKey;
  label: string;
  help: string;
  value: unknown;
  changedBy: string | null;
  changedAt: string | null;
}

export async function listSettings(sql: SqlClient): Promise<SettingRow[]> {
  const r = await sql.query<{
    key: string;
    value: unknown;
    updated_at: string;
    updated_by: string | null;
    username: string | null;
  }>(
    `select s.key, s.value, s.updated_at, s.updated_by, p.username
       from public.site_settings s
       left join public.profiles p on p.user_id = s.updated_by`,
  );
  const byKey = new Map(r.rows.map((x) => [x.key, x]));
  return SETTINGS.map((def) => {
    const row = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      help: def.help,
      value: row ? row.value : def.initial,
      changedBy: row?.updated_by ? (row.username ?? 'a removed account') : null,
      changedAt: row?.updated_by ? new Date(row.updated_at).toISOString() : null,
    };
  });
}

export async function setSetting(
  sql: SqlClient,
  adminId: string,
  key: unknown,
  input: unknown,
): Promise<void> {
  const def = settingDef(key);
  if (!def) throw new AdminError(400, 'That is not a site setting.');
  const parsed = parseSetting(def.key, input);
  if (!parsed.ok) throw new AdminError(400, parsed.message);
  await sql.transaction(async (tx) => {
    await tx.query(
      `insert into public.site_settings (key, value, is_public, updated_by) values ($1, $2::jsonb, $3, $4)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
      [def.key, JSON.stringify(parsed.value), def.isPublic, adminId],
    );
    await audit(tx, adminId, 'setting_set', 'site_setting', def.key, parsed.audit);
  });
}

// ---------------------------------------------------------------- users

export type AccountState = 'active' | 'suspended' | 'banned';

export interface UserRow {
  id: string;
  username: string;
  role: string;
  state: AccountState;
  joined: string;
}

const LIKE_ESCAPE = /[\\%_]/g;

/**
 * Find accounts by id (exact) or username (exact or prefix, any case). Never by email. A prefix
 * needs two characters so one letter does not list everybody. At most 25 rows.
 */
export async function searchUsers(sql: SqlClient, query: string): Promise<UserRow[]> {
  const q = query.trim();
  if (q.length < 2 || q.length > 64) return [];
  const byId = UUID.test(q.toLowerCase());
  const r = await sql.query<{
    user_id: string;
    username: string;
    role: string;
    banned_at: string | null;
    suspended_until: string | null;
    created_at: string;
  }>(
    byId
      ? `select p.user_id, p.username, s.role, s.banned_at, s.suspended_until, p.created_at
           from public.profiles p join public.account_status s on s.user_id = p.user_id
          where p.user_id = $1`
      : `select p.user_id, p.username, s.role, s.banned_at, s.suspended_until, p.created_at
           from public.profiles p join public.account_status s on s.user_id = p.user_id
          where lower(p.username) like lower($1) || '%' escape '\\'
          order by lower(p.username) limit 25`,
    [byId ? q.toLowerCase() : q.replace(LIKE_ESCAPE, '\\$&')],
  );
  return r.rows.map((x) => ({
    id: x.user_id,
    username: x.username,
    role: x.role,
    state: stateOf(x.banned_at, x.suspended_until),
    joined: new Date(x.created_at).toISOString(),
  }));
}

function stateOf(banned: string | null, until: string | null): AccountState {
  if (banned) return 'banned';
  if (until && new Date(until).getTime() > Date.now()) return 'suspended';
  return 'active';
}

export interface UserDetail {
  id: string;
  /** Null: an account with no profile (sign-up not finished, or refused). */
  username: string | null;
  role: string | null;
  state: AccountState;
  suspendedUntil: string | null;
  joined: string | null;
  farms: { daily: number; fast: number };
  lastSeen: string | null;
  underSixteen: boolean | null;
  refusedUnder14: boolean;
  history: { action: string; until: string | null; at: string; by: string | null }[];
}

export async function userDetail(sql: SqlClient, id: string): Promise<UserDetail | null> {
  if (!isUuid(id)) return null;
  const r = await sql.query<{
    username: string | null;
    role: string | null;
    banned_at: string | null;
    suspended_until: string | null;
    created_at: string | null;
    under: boolean | null;
    refused: boolean;
    daily: number;
    fast: number;
    last_seen: string | null;
  }>(
    `select p.username, s.role, s.banned_at, s.suspended_until, p.created_at,
            (app.age_on(a.date_of_birth, app.today_sydney()) < 16) as under,
            exists (select 1 from public.signup_refusals x where x.user_id = $1) as refused,
            (select count(*)::int from public.farms f where f.owner_id = $1 and f.mode = 'daily') as daily,
            (select count(*)::int from public.farms f where f.owner_id = $1 and f.mode = 'fast') as fast,
            (select max(f.last_opened_at) from public.farms f where f.owner_id = $1) as last_seen
       from (select $1::uuid as id) u
       left join public.profiles p on p.user_id = u.id
       left join public.account_status s on s.user_id = u.id
       left join public.account_private a on a.user_id = u.id`,
    [id],
  );
  const row = r.rows[0];
  if (!row || (!row.username && !row.role && !row.refused)) return null;
  const hist = await sql.query<{
    action: string;
    until: string | null;
    created_at: string;
    username: string | null;
  }>(
    `select m.action, m.until, m.created_at, p.username
       from public.moderation_actions m
       left join public.profiles p on p.user_id = m.moderator_id
      where m.user_id = $1 order by m.created_at desc limit 50`,
    [id],
  );
  return {
    id,
    username: row.username,
    role: row.role,
    state: stateOf(row.banned_at, row.suspended_until),
    suspendedUntil:
      row.suspended_until && new Date(row.suspended_until).getTime() > Date.now()
        ? new Date(row.suspended_until).toISOString()
        : null,
    joined: row.created_at ? new Date(row.created_at).toISOString() : null,
    farms: { daily: row.daily, fast: row.fast },
    lastSeen: row.last_seen ? new Date(row.last_seen).toISOString() : null,
    underSixteen: row.under,
    refusedUnder14: row.refused,
    history: hist.rows.map((h) => ({
      action: h.action,
      until: h.until ? new Date(h.until).toISOString() : null,
      at: new Date(h.created_at).toISOString(),
      by: h.username,
    })),
  };
}

export type UserAction =
  | { action: 'suspend'; days: number }
  | { action: 'ban' }
  | { action: 'lift' }
  | { action: 'set_role'; role: 'player' | 'moderator' | 'admin' }
  | { action: 'clear_refusal' }
  | { action: 'sign_out_all' };

export const ROLES = ['player', 'moderator', 'admin'] as const;

export function parseUserAction(body: Record<string, unknown>): UserAction {
  switch (body.action) {
    case 'suspend':
      if (!SUSPEND_DAYS.some((d) => d === body.days)) {
        throw new AdminError(400, 'Choose one of the suspension lengths on the list.');
      }
      return { action: 'suspend', days: body.days as number };
    case 'ban':
    case 'lift':
    case 'clear_refusal':
    case 'sign_out_all':
      return { action: body.action };
    case 'set_role':
      if (!ROLES.some((r) => r === body.role)) throw new AdminError(400, 'That is not a role.');
      return { action: 'set_role', role: body.role as (typeof ROLES)[number] };
    default:
      throw new AdminError(400, 'That is not something an admin can do here.');
  }
}

export interface UserActionDeps {
  /** The sign-in email of an account, for the ban hash only. Never shown, never stored. */
  emailOf?: (userId: string) => Promise<string | null>;
  pepper?: string;
}

/** Another admin in good standing besides `userId`, with their rows locked so two changes can not both pass. */
async function otherAdminLeft(tx: SqlRunner, userId: string): Promise<boolean> {
  await tx.query(`select 1 from public.account_status where role = 'admin' for update`);
  const r = await tx.query(
    `select 1 from public.account_status s
      where s.role = 'admin' and s.user_id <> $1 and s.banned_at is null
        and (s.suspended_until is null or s.suspended_until <= now()) limit 1`,
    [userId],
  );
  return r.rowCount > 0;
}

const NOT_ALLOWED_SELF = 'You can not do that to your own account.';
const LAST_ADMIN = 'There must always be one admin in good standing. Make another admin first.';

/**
 * One admin action on one account. Rules, all checked on the server inside the transaction:
 * - An admin can not suspend, ban or change the role of their own account.
 * - The last admin in good standing can not lose the role, be suspended or be banned.
 * - Every action writes its audit row in the same transaction. If that fails nothing changes.
 */
export async function userAction(
  sql: SqlClient,
  adminId: string,
  userId: unknown,
  act: UserAction,
  deps: UserActionDeps = {},
): Promise<{ note?: string }> {
  if (!isUuid(userId)) throw new AdminError(400, 'That is not an account id.');
  const self = userId === adminId;
  if (self && (act.action === 'suspend' || act.action === 'ban' || act.action === 'set_role')) {
    throw new AdminError(409, NOT_ALLOWED_SELF);
  }
  // The ban hash is worked out before the transaction (it asks the sign-in provider).
  let hash: string | null = null;
  if ((act.action === 'ban' || act.action === 'lift') && deps.emailOf && deps.pepper) {
    const email = await deps.emailOf(userId).catch(() => null);
    hash = email ? banHash(email, deps.pepper) : null;
  }
  const notes: string[] = [];
  await sql.transaction(async (tx) => {
    // The acting admin's row is locked for the length of the action: an admin banned a moment ago
    // can not finish what they started, because the ban waits for this transaction or comes first.
    if (!(await activeAdmin(tx, adminId, true))) {
      throw new AdminError(403, 'You can not do that now.');
    }
    if (act.action === 'clear_refusal') {
      const found = await tx.query('select 1 from public.signup_refusals where user_id = $1', [
        userId,
      ]);
      if (found.rowCount === 0) throw new AdminError(404, 'That sign-in has no refusal to clear.');
      // The function checks the admin again and writes its own audit row.
      await tx.query('select public.clear_signup_refusal($1, $2)', [adminId, userId]);
      return;
    }
    const target = await tx.query<{ role: string; banned_at: string | null }>(
      'select role, banned_at from public.account_status where user_id = $1 for update',
      [userId],
    );
    const role = target.rows[0]?.role;
    if (!role) throw new AdminError(404, 'There is no account with that id.');
    const takesAdminAway =
      role === 'admin' &&
      (act.action === 'suspend' ||
        act.action === 'ban' ||
        (act.action === 'set_role' && act.role !== 'admin'));
    if (takesAdminAway && !(await otherAdminLeft(tx, userId))) {
      throw new AdminError(409, LAST_ADMIN);
    }
    switch (act.action) {
      case 'suspend': {
        const banned = await tx.query(
          'select 1 from public.account_status where user_id = $1 and banned_at is not null',
          [userId],
        );
        if (banned.rowCount > 0) {
          throw new AdminError(409, 'That account is banned already. Lift the ban first.');
        }
        const until = new Date(Date.now() + act.days * 86_400_000).toISOString();
        await tx.query(
          'update public.account_status set suspended_until = $2::timestamptz where user_id = $1',
          [userId, until],
        );
        await tx.query(
          `insert into public.moderation_actions (user_id, moderator_id, action, until) values ($1, $2, 'suspended', $3::timestamptz)`,
          [userId, adminId, until],
        );
        const ended = await endSessions(tx, userId);
        if (ended === null) notes.push(SESSIONS_NOTE);
        await audit(tx, adminId, 'user_suspend', 'account', userId, { until, count: ended ?? 0 });
        return;
      }
      case 'ban': {
        await tx.query(
          'update public.account_status set banned_at = coalesce(banned_at, now()), suspended_until = null where user_id = $1',
          [userId],
        );
        if (hash) {
          await tx.query(
            'delete from public.ban_records where email_hash = $1 and banned_until is null',
            [hash],
          );
          await tx.query(
            'insert into public.ban_records (email_hash, banned_until) values ($1, null)',
            [hash],
          );
        }
        await tx.query(
          `insert into public.moderation_actions (user_id, moderator_id, action) values ($1, $2, 'banned')`,
          [userId, adminId],
        );
        const ended = await endSessions(tx, userId);
        if (ended === null) notes.push(SESSIONS_NOTE);
        if (!hash) notes.push(NO_HASH_NOTE);
        // `value` says whether a hashed record was written; `count` how many sessions were ended.
        await audit(tx, adminId, 'user_ban', 'account', userId, {
          value: hash !== null,
          count: ended ?? 0,
        });
        return;
      }
      case 'lift': {
        // A ban may have a kept hashed record. Lifting without being able to find it would leave
        // it behind for ever, refusing the player if they ever delete and sign up again.
        if (target.rows[0]?.banned_at && !hash) {
          throw new AdminError(
            409,
            'The ban record kept for this account can not be removed right now, because the sign-in email could not be found. Nothing was changed. Try again in a moment.',
          );
        }
        await tx.query(
          'update public.account_status set banned_at = null, suspended_until = null where user_id = $1',
          [userId],
        );
        if (hash) await tx.query('delete from public.ban_records where email_hash = $1', [hash]);
        await tx.query(
          `insert into public.moderation_actions (user_id, moderator_id, action) values ($1, $2, 'unbanned')`,
          [userId, adminId],
        );
        await audit(tx, adminId, 'user_lift', 'account', userId);
        return;
      }
      case 'set_role': {
        await tx.query('update public.account_status set role = $2 where user_id = $1', [
          userId,
          act.role,
        ]);
        await audit(tx, adminId, 'user_set_role', 'account', userId, { role: act.role });
        return;
      }
      case 'sign_out_all': {
        // The function checks the admin again, writes its own audit row and ends the sessions.
        try {
          await tx.query('select public.admin_sign_out_everywhere($1, $2)', [adminId, userId]);
        } catch {
          throw new AdminError(
            503,
            'Could not end their sessions here. Do it in the Supabase dashboard.',
          );
        }
        return;
      }
    }
  });
  return notes.length ? { note: notes.join(' ') } : {};
}

const SESSIONS_NOTE = 'Their sessions could not be ended here. End them in the Supabase dashboard.';
const NO_HASH_NOTE =
  'Banned. The sign-in email could not be found, so no hashed record was kept: this ban will not survive the player deleting their account and signing up again.';

/**
 * End every session of an account inside the action's transaction, with a savepoint so a refusal
 * (the database may not allow it on every project) does not undo the ban or suspension. The count,
 * or null when it could not be done.
 */
async function endSessions(tx: SqlRunner, userId: string): Promise<number | null> {
  await tx.query('savepoint sp_sessions');
  try {
    const r = await tx.query<{ n: number }>('select app.end_sessions($1) as n', [userId]);
    await tx.query('release savepoint sp_sessions');
    return r.rows[0]?.n ?? 0;
  } catch {
    await tx.query('rollback to savepoint sp_sessions');
    return null;
  }
}

// ---------------------------------------------------------------- audit log

export const AUDIT_PAGE = 25;

export interface AuditRow {
  id: number;
  at: string;
  admin: string | null;
  adminId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  details: Record<string, unknown>;
}

export interface AuditPage {
  rows: AuditRow[];
  page: number;
  hasNext: boolean;
}

export interface AuditFilter {
  action?: string;
  /** A username or an account id. */
  admin?: string;
  page?: number;
}

const ACTION_NAME = /^[a-z][a-z0-9_]{0,79}$/;

/** Newest first. Filters: the action name, and the admin (by username or id). 25 a page. */
export async function listAudit(sql: SqlClient, f: AuditFilter = {}): Promise<AuditPage> {
  const page = Math.max(1, Math.min(10_000, Math.trunc(f.page ?? 1)));
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.action) {
    if (!ACTION_NAME.test(f.action)) return { rows: [], page, hasNext: false };
    params.push(f.action);
    where.push(`l.action = $${params.length}`);
  }
  if (f.admin) {
    const a = f.admin.trim().toLowerCase();
    params.push(a);
    where.push(
      UUID.test(a)
        ? `l.admin_id = $${params.length}::uuid`
        : `l.admin_id in (select user_id from public.profiles where lower(username) = $${params.length})`,
    );
  }
  params.push(AUDIT_PAGE + 1, (page - 1) * AUDIT_PAGE);
  const r = await sql.query<{
    id: string;
    created_at: string;
    admin_id: string | null;
    username: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    details: Record<string, unknown>;
  }>(
    `select l.id, l.created_at, l.admin_id, p.username, l.action, l.target_type, l.target_id, l.details
       from public.admin_audit_log l
       left join public.profiles p on p.user_id = l.admin_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by l.created_at desc, l.id desc
      limit $${params.length - 1} offset $${params.length}`,
    params,
  );
  return {
    rows: r.rows.slice(0, AUDIT_PAGE).map((x) => ({
      id: Number(x.id),
      at: new Date(x.created_at).toISOString(),
      admin: x.username,
      adminId: x.admin_id,
      action: x.action,
      targetType: x.target_type,
      targetId: x.target_id,
      details: x.details,
    })),
    page,
    hasNext: r.rows.length > AUDIT_PAGE,
  };
}

/** The action names that appear in the log, for the filter's list. */
export async function auditActions(sql: SqlClient): Promise<string[]> {
  const r = await sql.query<{ action: string }>(
    'select distinct action from public.admin_audit_log order by 1',
  );
  return r.rows.map((x) => x.action);
}

/** The fixed-shape details of a row, in plain words. */
export function describeAudit(
  row: Pick<AuditRow, 'action' | 'targetType' | 'targetId' | 'details'>,
): string {
  const d = row.details;
  const parts: string[] = [];
  if (typeof d.switch_key === 'string') parts.push(`switch ${d.switch_key}`);
  if (typeof d.slot_id === 'string') parts.push(`ad slot ${d.slot_id}`);
  if (typeof d.enabled === 'boolean') parts.push(d.enabled ? 'turned on' : 'turned off');
  if (typeof d.role === 'string') parts.push(`role ${d.role}`);
  if (typeof d.until === 'string') parts.push(`until ${d.until}`);
  if (typeof d.count === 'number') {
    parts.push(
      row.action === 'user_ban' || row.action === 'user_suspend'
        ? `${d.count} session${d.count === 1 ? '' : 's'} ended`
        : `count ${d.count}`,
    );
  }
  if (typeof d.value === 'number' || typeof d.value === 'boolean')
    parts.push(`value ${String(d.value)}`);
  if (Array.isArray(d.ids)) parts.push(`${d.ids.length} account${d.ids.length === 1 ? '' : 's'}`);
  const what = row.targetType
    ? `${row.targetType.replace(/_/g, ' ')} ${row.targetId ?? ''}`.trim()
    : 'no target';
  return `${what}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

/** An action name in words: `user_set_role` is "User set role". */
export const actionWords = (action: string): string => {
  const s = action.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// ---------------------------------------------------------------- dashboard

export interface Dashboard {
  /** The database's own clock when these counts were read. */
  asAt: string;
  accounts: number;
  guests: number;
  farms: { daily: { active: number; ended: number }; fast: { active: number; ended: number } };
  /** Farms saved (a job, a day or a skip) since midnight Sydney time. */
  playedToday: number;
  /** Farms saved in the last 7 days, today included. */
  playedWeek: number;
  /** Saves that could not be opened and were kept aside. */
  brokenSaves: number;
}

export async function dashboard(sql: SqlClient): Promise<Dashboard> {
  const r = await sql.query<{
    as_at: string;
    accounts: number;
    guests: number;
    played_today: number;
    played_week: number;
    broken: number;
  }>(
    `with today as (select (app.today_sydney()::timestamp at time zone 'Australia/Sydney') as t)
     select now() as as_at,
            (select count(*)::int from public.profiles) as accounts,
            (select count(*)::int from public.guest_sessions where converted_at is null) as guests,
            (select count(*)::int from public.farm_saves s, today where s.updated_at >= today.t) as played_today,
            (select count(*)::int from public.farm_saves s, today
               where s.updated_at >= today.t - interval '6 days') as played_week,
            (select count(*)::int from public.farm_saves_aside) as broken`,
  );
  const byMode = await sql.query<{ mode: string; status: string; n: number }>(
    'select mode, status, count(*)::int as n from public.farms group by mode, status',
  );
  const farms = {
    daily: { active: 0, ended: 0 },
    fast: { active: 0, ended: 0 },
  };
  for (const x of byMode.rows) {
    if (
      (x.mode === 'daily' || x.mode === 'fast') &&
      (x.status === 'active' || x.status === 'ended')
    ) {
      farms[x.mode][x.status] = x.n;
    }
  }
  const row = r.rows[0]!;
  return {
    asAt: new Date(row.as_at).toISOString(),
    accounts: row.accounts,
    guests: row.guests,
    farms,
    playedToday: row.played_today,
    playedWeek: row.played_week,
    brokenSaves: row.broken,
  };
}

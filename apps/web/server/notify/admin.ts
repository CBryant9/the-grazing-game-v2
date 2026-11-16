import 'server-only';
import { NOTIFY_KINDS, type NotifyKind } from '../../lib/notify/kinds';
import { audit } from '../admin/store';
import { AdminError } from '../admin/errors';
import type { SqlClient, SqlRunner } from '../db/sql';
import { PAUSE_SETTING } from './sender';

/**
 * The admin's view of notifications: counts by type for the last days (no names, no addresses,
 * nothing a person wrote), and the switch that pauses all sending. Pausing is audited in the same
 * transaction as the change. A pause stops the sender from claiming anything and stops the
 * reminders from being made; inbox rows still appear.
 */

export interface KindCounts {
  kind: NotifyKind;
  sent: number;
  failed: number;
  held: number;
  dropped: number;
  waiting: number;
}

export interface Overview {
  days: number;
  paused: boolean;
  byKind: KindCounts[];
  /** Fixed reason codes with how many times each happened (failed and dropped). */
  reasons: { reason: string; count: number }[];
}

export async function overview(sql: SqlRunner, days = 7): Promise<Overview> {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const r = await sql.query<{ kind: NotifyKind; state: string; n: string }>(
    `select n.kind, s.state, count(*)::text as n
       from public.notification_sends s join public.notifications n on n.id = s.notification_id
      where s.created_at >= $1
      group by n.kind, s.state`,
    [since],
  );
  const reasons = await sql.query<{ reason: string; n: string }>(
    `select reason, count(*)::text as n from public.notification_sends
      where created_at >= $1 and state in ('failed', 'dropped') and reason is not null
      group by reason order by count(*) desc limit 20`,
    [since],
  );
  const p = await sql.query<{ paused: boolean | null }>(
    `select (value->>'paused')::boolean as paused from public.site_settings where key = $1`,
    [PAUSE_SETTING],
  );
  const byKind: KindCounts[] = NOTIFY_KINDS.map((kind) => {
    const get = (state: string): number =>
      Number(r.rows.find((x) => x.kind === kind && x.state === state)?.n ?? 0);
    return {
      kind,
      sent: get('sent'),
      failed: get('failed'),
      held: get('held'),
      dropped: get('dropped'),
      waiting: get('pending') + get('sending'),
    };
  });
  return {
    days,
    paused: p.rows[0]?.paused === true,
    byKind,
    reasons: reasons.rows.map((x) => ({ reason: x.reason, count: Number(x.n) })),
  };
}

/** Pause or resume all sending. One transaction with its audit row. */
export async function setPaused(
  sql: SqlClient,
  adminId: string,
  paused: unknown,
): Promise<{ changed: boolean }> {
  if (typeof paused !== 'boolean') throw new AdminError(400, 'Say whether sending is paused.');
  return sql.transaction(async (tx) => {
    const now = await tx.query<{ paused: boolean | null }>(
      `select (value->>'paused')::boolean as paused from public.site_settings where key = $1 for update`,
      [PAUSE_SETTING],
    );
    if ((now.rows[0]?.paused ?? false) === paused && now.rows[0]) return { changed: false };
    await tx.query(
      `insert into public.site_settings (key, value, is_public, updated_by)
       values ($1, $2::jsonb, false, $3)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
      [PAUSE_SETTING, JSON.stringify({ paused }), adminId],
    );
    await audit(tx, adminId, 'notify_pause_set', 'notify_sending', 'all', { enabled: !paused });
    return { changed: true };
  });
}

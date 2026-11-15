import 'server-only';
import { createHash } from 'node:crypto';
import type { AdSlotId } from '@gg/shared';
import { SLOTS, isSlotId } from '@/lib/ads/registry';
import type { SqlClient } from '../db/sql';
import { type Viewer } from './serve';
import { slotOn } from './slots';
import { readImpression } from './token';

/**
 * Counting views and clicks, honestly.
 *
 * - A view is reported by the browser only after the slot was on screen (half of it, for a
 *   second, with the tab showing). The server also refuses a view reported sooner than that after
 *   the ad was chosen, and one for a slot that is switched off.
 * - The token is signed by the server and carries a random impression id. The database holds one
 *   row per impression and kind (`ad_events_once`), so a replayed beacon counts once.
 * - Each viewer is limited by the database's own rules (`ad_view`, `ad_click`), by account, guest
 *   session or hashed address, never by something the caller chooses.
 * - A row holds the slot, campaign, creative, kind and time, and the account or guest session
 *   for caps. No address, no browser details, no cookie of any other site.
 */

/** A view can not be real sooner than this after the ad was chosen (the page must have drawn it and a second passed). */
export const MIN_VIEW_DELAY_MS = 900;

export type EventKind = 'view' | 'video_complete' | 'video_skip';
export const EVENT_KINDS: readonly EventKind[] = ['view', 'video_complete', 'video_skip'];

/** The rate-limit subject for a viewer: an id the server worked out, never text the caller chose. */
export function subjectOf(viewer: Viewer, callerKey: string): string {
  if (viewer.userId) return `u:${viewer.userId}`;
  if (viewer.guestId) return `g:${viewer.guestId}`;
  return `a:${createHash('sha256').update(callerKey).digest('hex').slice(0, 32)}`;
}

async function allowed(
  sql: SqlClient,
  action: 'ad_view' | 'ad_click',
  subject: string,
): Promise<boolean> {
  const r = await sql.query<{ ok: boolean }>('select public.take_rate_limit($1, $2) as ok', [
    action,
    subject,
  ]);
  return r.rows[0]?.ok === true;
}

export type EventResult =
  | { counted: true }
  | { counted: false; why: 'bad_token' | 'too_soon' | 'off' | 'repeat' | 'limited' };

export async function recordEvent(
  sql: SqlClient,
  pepper: string,
  viewer: Viewer,
  callerKey: string,
  token: unknown,
  kind: unknown,
  now = Date.now(),
): Promise<EventResult> {
  if (typeof kind !== 'string' || !EVENT_KINDS.includes(kind as EventKind)) {
    return { counted: false, why: 'bad_token' };
  }
  const imp = readImpression(pepper, token, now);
  if (!imp) return { counted: false, why: 'bad_token' };
  if (kind === 'view' && now - imp.at < MIN_VIEW_DELAY_MS)
    return { counted: false, why: 'too_soon' };
  // A video's end or skip can only follow its view.
  if (kind !== 'view' && !SLOTS[imp.slot].video) return { counted: false, why: 'bad_token' };
  if (!(await slotOn(sql, imp.slot, now))) return { counted: false, why: 'off' };
  if (!(await allowed(sql, 'ad_view', subjectOf(viewer, callerKey)))) {
    return { counted: false, why: 'limited' };
  }
  const r = await sql.query(
    `insert into public.ad_events (slot_id, campaign_id, creative_id, user_id, guest_session_id, kind, impression_id)
     select $1::text, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::text, $7::uuid
      where exists (select 1 from public.ad_creatives a where a.id = $3::uuid and a.campaign_id = $2::uuid)
        and ($6::text = 'view' or exists (
              select 1 from public.ad_events v where v.impression_id = $7::uuid and v.kind = 'view'))
     on conflict (impression_id, kind) where impression_id is not null do nothing`,
    [imp.slot, imp.campaign, imp.creative, viewer.userId, viewer.guestId, kind, imp.id],
  );
  return r.rowCount > 0 ? { counted: true } : { counted: false, why: 'repeat' };
}

// ---------------------------------------------------------------- clicks

export interface ClickTarget {
  /** The sponsor's address. Read from the database by creative id, never from the request. */
  url: string;
}

/**
 * Look up where a click goes, by creative id and slot, and count it. Returns null for an unknown
 * id, a creative or campaign that is off or outside its dates, a slot that is off or not linked
 * to the campaign, a missing link, or a link that is not a plain https address. The address is
 * never taken from the request, so this can not be used to send anyone to a place the admin did
 * not set.
 */
export async function followClick(
  sql: SqlClient,
  viewer: Viewer,
  callerKey: string,
  creativeId: string,
  slot: unknown,
  now = Date.now(),
): Promise<ClickTarget | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(creativeId))
    return null;
  if (!isSlotId(slot)) return null;
  const id: AdSlotId = slot;
  if (!(await slotOn(sql, id, now))) return null;
  const r = await sql.query<{ link_url: string | null; campaign_id: string }>(
    `select a.link_url, a.campaign_id
       from public.ad_creatives a
       join public.campaigns c on c.id = a.campaign_id
       join public.campaign_slots cs on cs.campaign_id = c.id and cs.slot_id = $2
      where a.id = $1 and a.active and c.active
        and c.starts_at <= $3::timestamptz
        and (c.ends_at is null or c.ends_at > $3::timestamptz)`,
    [creativeId, id, new Date(now).toISOString()],
  );
  const row = r.rows[0];
  const url = row?.link_url ? safeLink(row.link_url) : null;
  if (!row || !url) return null;
  // Over the limit the person still goes where they clicked; the click is just not counted.
  if (await allowed(sql, 'ad_click', subjectOf(viewer, callerKey))) {
    await sql.query(
      `insert into public.ad_events (slot_id, campaign_id, creative_id, user_id, guest_session_id, kind)
       values ($1, $2, $3, $4, $5, 'click')`,
      [id, row.campaign_id, creativeId, viewer.userId, viewer.guestId],
    );
  }
  return { url };
}

/** A link the site will send people to: https only, no login in it, no spaces, a real host. */
export function safeLink(raw: string): string | null {
  if (raw.length > 500 || /[\s\u0000-\u001f\\]/.test(raw)) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return null;
  return u.toString();
}

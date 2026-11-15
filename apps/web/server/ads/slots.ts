import 'server-only';
import { AD_SLOTS, type AdSlotId } from '@gg/shared';
import { SLOTS, isSlotId } from '@/lib/ads/registry';
import { featureSwitches } from '../auth/accounts';
import type { SqlClient, SqlRunner } from '../db/sql';

/**
 * What the server knows about each ad slot: its own switch, its settings, and whether anything
 * could be shown in it right now. Read from `ad_slots` and the feature switches and kept for 30
 * seconds on each server, like the feature switches, so a change in admin shows within half a
 * minute (at once on the server that made it).
 *
 * A slot is ON only when ALL of these hold: the master `ads` switch, the extra switch the slot
 * needs (`banner_ads` or `video_ads`), and the slot's own switch. Every one is off by default.
 */

const TTL_MS = 30_000;

export interface SlotRow {
  id: AdSlotId;
  enabled: boolean;
  settings: Record<string, unknown>;
  provider: string;
}

/**
 * The SQL that gives the counts the reports and the budgets use: rolled-up days come from
 * `ad_daily`; every day after the latest rolled-up day comes from the raw events. A day is
 * rolled up once, after it ends, so the two never overlap.
 */
export const COUNTS_CTE = `
  edge as (select coalesce(max(day) + 1, date '1970-01-01') as d from public.ad_daily),
  counts as (
    select day, slot_id, campaign_id, kind, count from public.ad_daily
    union all
    select (e.created_at at time zone 'Australia/Sydney')::date as day, e.slot_id, e.campaign_id,
           e.kind, count(*)::bigint
      from public.ad_events e, edge
     where (e.created_at at time zone 'Australia/Sydney')::date >= edge.d
     group by 1, 2, 3, 4
  )`;

let cache: { at: number; slots: Map<AdSlotId, SlotRow>; live: Set<AdSlotId> } | null = null;

export function resetAdCache(): void {
  cache = null;
}

/** Every slot's row, in the registry's order. A slot with no row is off with no settings. */
export async function readSlotRows(sql: SqlRunner): Promise<Map<AdSlotId, SlotRow>> {
  const r = await sql.query<{
    slot_id: string;
    enabled: boolean;
    settings: Record<string, unknown>;
    provider: string;
  }>('select slot_id, enabled, settings, provider from public.ad_slots');
  const out = new Map<AdSlotId, SlotRow>();
  for (const id of AD_SLOTS) out.set(id, { id, enabled: false, settings: {}, provider: 'house' });
  for (const x of r.rows) {
    if (isSlotId(x.slot_id)) {
      out.set(x.slot_id, {
        id: x.slot_id,
        enabled: x.enabled,
        settings: x.settings ?? {},
        provider: x.provider,
      });
    }
  }
  return out;
}

/** Slots with a campaign that is on, inside its dates, under its budget, with a creative that is on. */
async function readLive(sql: SqlRunner, now: Date): Promise<Set<AdSlotId>> {
  const r = await sql.query<{ slot_id: string }>(
    `with ${COUNTS_CTE}
     select distinct cs.slot_id
       from public.campaign_slots cs
       join public.campaigns c on c.id = cs.campaign_id
      where c.active
        and c.starts_at <= $1::timestamptz
        and (c.ends_at is null or c.ends_at > $1::timestamptz)
        and exists (
          select 1 from public.ad_creatives a
           where a.campaign_id = c.id and a.active and (a.kind = 'text' or a.media_path is not null))
        and (c.max_views is null or c.max_views > coalesce(
              (select sum(n.count) from counts n where n.campaign_id = c.id and n.kind = 'view'), 0))`,
    [now.toISOString()],
  );
  return new Set(r.rows.map((x) => x.slot_id).filter(isSlotId));
}

async function load(sql: SqlClient, now: number): Promise<NonNullable<typeof cache>> {
  if (cache && now - cache.at <= TTL_MS) return cache;
  const [slots, live] = await sql.transaction(async (tx) => [
    await readSlotRows(tx),
    await readLive(tx, new Date(now)),
  ]);
  cache = { at: now, slots, live };
  return cache;
}

/** Is this slot switched on, all the way up? Never throws: a database that can not be read means off. */
export async function slotOn(sql: SqlClient, id: AdSlotId, now = Date.now()): Promise<boolean> {
  try {
    const sw = await featureSwitches(sql, now);
    if (!sw.ads) return false;
    const need = SLOTS[id].needs;
    if (need && !sw[need]) return false;
    return (await load(sql, now)).slots.get(id)?.enabled === true;
  } catch {
    return false;
  }
}

export async function slotSettings(
  sql: SqlClient,
  id: AdSlotId,
  now = Date.now(),
): Promise<Record<string, unknown>> {
  return (await load(sql, now)).slots.get(id)?.settings ?? {};
}

/**
 * The slots that are on AND have something live to show, for the places that exist in this build.
 * This is what `/api/auth/me` tells the play screen: with every switch off (the launch default) it
 * is an empty list, the screen draws no ad markup and makes no ad request.
 */
export async function liveSlotIds(sql: SqlClient, now = Date.now()): Promise<AdSlotId[]> {
  try {
    const sw = await featureSwitches(sql, now);
    if (!sw.ads) return [];
    const c = await load(sql, now);
    return AD_SLOTS.filter((id) => {
      const def = SLOTS[id];
      if (!def.placed || !c.live.has(id)) return false;
      if (def.needs && !sw[def.needs]) return false;
      return c.slots.get(id)?.enabled === true;
    });
  } catch {
    return [];
  }
}

/** A number setting, kept inside sensible bounds. */
export function numberSetting(
  settings: Record<string, unknown>,
  key: string,
  fallback: number | null,
  min: number,
  max: number,
): number | null {
  const v = settings[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

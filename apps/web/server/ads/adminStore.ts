import 'server-only';
import { AD_SLOTS, type AdSlotId } from '@gg/shared';
import { SLOTS, isSlotId } from '@/lib/ads/registry';
import { AdminError } from '../admin/errors';
import { audit, isUuid } from '../admin/store';
import type { SqlClient, SqlRunner } from '../db/sql';
import { safeLink } from './events';
import { MediaError, adMediaStore, mediaPath, sniff } from './media';
import { COUNTS_CTE, readSlotRows, resetAdCache } from './slots';

/**
 * Everything the ad screens in admin read and change (PRD 11.4). Every change is ONE transaction
 * that makes the change and writes its row in the audit log (fixed shape, no free text), so a
 * change with no audit row is rolled back. Uploads go to the `ad-media` bucket first and are
 * removed again if the database change fails.
 */

const text = (v: unknown, max: number, what: string, required = false): string | null => {
  if (v === undefined || v === null || v === '') {
    if (required) throw new AdminError(400, `${what} is needed.`);
    return null;
  }
  if (typeof v !== 'string') throw new AdminError(400, `${what} must be words.`);
  const t = v.trim();
  if (t.length === 0 && required) throw new AdminError(400, `${what} is needed.`);
  if (t.length > max) throw new AdminError(400, `${what} can be up to ${max} characters.`);
  // No control characters (a new line in a one-line field).
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(t))
    throw new AdminError(400, `${what} has a character that is not allowed.`);
  return t === '' ? null : t;
};

const whole = (v: unknown, min: number, max: number, what: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) {
    throw new AdminError(400, `${what} must be a whole number from ${min} to ${max}.`);
  }
  return v;
};
const maybeWhole = (v: unknown, min: number, max: number, what: string): number | null =>
  v === null || v === undefined || v === '' ? null : whole(v, min, max, what);

/** A day as `YYYY-MM-DD`, a real date. Campaign days are Sydney days. */
const day = (v: unknown, what: string, required: boolean): string | null => {
  if (v === null || v === undefined || v === '') {
    if (required) throw new AdminError(400, `${what} is needed.`);
    return null;
  }
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new AdminError(400, `${what} is not a date.`);
  }
  const t = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== v) {
    throw new AdminError(400, `${what} is not a date.`);
  }
  return v;
};

// ---------------------------------------------------------------- slots

/** The settings an admin may change, with their bounds. Anything else in `settings` is kept as it is. */
const SETTING_BOUNDS: Record<string, [number, number, string]> = {
  min_seconds_between: [0, 86_400, 'Seconds between showings'],
  show_seconds_min: [5, 120, 'Shortest time shown'],
  show_seconds_max: [5, 120, 'Longest time shown'],
  max_per_day: [1, 100, 'Most a day'],
  every_n_posts: [2, 50, 'Posts between sponsored posts'],
  max_cards: [1, 3, 'Cards at once'],
  advertise_spots: [0, 100, 'Spots for the Advertise here card'],
  min_game_days_between: [1, 365, 'Game days between videos'],
};

/** Which settings each slot has (what its default row holds). */
export function settingKeysFor(slot: AdSlotId): string[] {
  const def = SLOTS[slot];
  const keys: string[] = [];
  if (def.timed) keys.push('min_seconds_between', 'show_seconds_min', 'show_seconds_max');
  if (slot === 'video_between_days') keys.push('min_seconds_between', 'min_game_days_between');
  if (slot === 'video_daily_summary') keys.push('max_per_day');
  if (slot === 'feed_sponsored') keys.push('every_n_posts');
  if (def.shape === 'cards') keys.push('max_cards');
  if (slot === 'pc_community_side') keys.push('advertise_spots');
  return [...new Set(keys)];
}

export interface SlotView {
  id: AdSlotId;
  label: string;
  enabled: boolean;
  provider: string;
  settings: Record<string, unknown>;
  settingKeys: { key: string; label: string; min: number; max: number }[];
  placed: boolean;
  notPlacedWhy: string | null;
  needs: string | null;
  liveCampaigns: number;
  views30: number;
  clicks30: number;
}

const today = (): string => `(now() at time zone 'Australia/Sydney')::date`;

export async function listSlots(sql: SqlClient): Promise<SlotView[]> {
  return sql.transaction(async (tx) => {
    const rows = await readSlotRows(tx);
    const live = await tx.query<{ slot_id: string; n: string }>(
      `select cs.slot_id, count(*) as n
         from public.campaign_slots cs join public.campaigns c on c.id = cs.campaign_id
        where c.active and c.starts_at <= now() and (c.ends_at is null or c.ends_at > now())
        group by cs.slot_id`,
    );
    const counts = await tx.query<{ slot_id: string; kind: string; n: string }>(
      `with ${COUNTS_CTE}
       select slot_id, kind, sum(count) as n from counts
        where day > ${today()} - 30 and kind in ('view', 'click') group by slot_id, kind`,
    );
    const liveBy = new Map(live.rows.map((r) => [r.slot_id, Number(r.n)]));
    const n = (slot: string, kind: string): number =>
      Number(counts.rows.find((c) => c.slot_id === slot && c.kind === kind)?.n ?? 0);
    return AD_SLOTS.map((id) => {
      const r = rows.get(id)!;
      const def = SLOTS[id];
      return {
        id,
        label: def.label,
        enabled: r.enabled,
        provider: r.provider,
        settings: r.settings,
        settingKeys: settingKeysFor(id).map((key) => ({
          key,
          label: SETTING_BOUNDS[key]![2],
          min: SETTING_BOUNDS[key]![0],
          max: key === 'max_cards' ? def.maxItems : SETTING_BOUNDS[key]![1],
        })),
        placed: def.placed,
        notPlacedWhy: def.notPlacedWhy ?? null,
        needs: def.needs,
        liveCampaigns: liveBy.get(id) ?? 0,
        views30: n(id, 'view'),
        clicks30: n(id, 'click'),
      };
    });
  });
}

export async function setSlot(
  sql: SqlClient,
  adminId: string,
  slot: unknown,
  enabled: unknown,
  settings: unknown,
): Promise<{ changed: boolean }> {
  if (!isSlotId(slot)) throw new AdminError(400, 'That is not an ad slot.');
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    throw new AdminError(400, 'Say whether it is on or off.');
  }
  const next: Record<string, number> = {};
  if (settings !== undefined) {
    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new AdminError(400, 'The settings were not sent properly.');
    }
    for (const [k, v] of Object.entries(settings)) {
      const b = SETTING_BOUNDS[k];
      if (!b || !settingKeysFor(slot).includes(k)) {
        throw new AdminError(400, 'That setting does not belong to this slot.');
      }
      const max = k === 'max_cards' ? SLOTS[slot].maxItems : b[1];
      next[k] = whole(v, b[0], max, b[2]);
    }
    const lo = next.show_seconds_min;
    const hi = next.show_seconds_max;
    if (lo !== undefined && hi !== undefined && lo > hi) {
      throw new AdminError(400, 'The shortest time can not be longer than the longest.');
    }
  }
  const changed = await sql.transaction(async (tx) => {
    const cur = await tx.query<{ enabled: boolean; settings: Record<string, unknown> }>(
      'select enabled, settings from public.ad_slots where slot_id = $1 for update',
      [slot],
    );
    const was = cur.rows[0];
    const merged = { ...(was?.settings ?? {}), ...next };
    const nextEnabled = enabled ?? was?.enabled ?? false;
    if (
      was &&
      was.enabled === nextEnabled &&
      JSON.stringify(was.settings) === JSON.stringify(merged)
    ) {
      return false;
    }
    await tx.query(
      `insert into public.ad_slots (slot_id, enabled, settings) values ($1, $2, $3::jsonb)
       on conflict (slot_id) do update set enabled = excluded.enabled, settings = excluded.settings`,
      [slot, nextEnabled, JSON.stringify(merged)],
    );
    await audit(tx, adminId, 'ad_slot_set', 'ad_slot', slot, {
      slot_id: slot,
      enabled: nextEnabled,
      count: Object.keys(next).length,
    });
    return true;
  });
  resetAdCache();
  return { changed };
}

// ---------------------------------------------------------------- sponsors

export interface SponsorRow {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  campaigns: number;
}

export async function listSponsors(sql: SqlRunner): Promise<SponsorRow[]> {
  const r = await sql.query<SponsorRow & { campaigns: string }>(
    `select s.id, s.name, s.contact, s.notes,
            (select count(*) from public.campaigns c where c.sponsor_id = s.id) as campaigns
       from public.sponsors s order by lower(s.name)`,
  );
  return r.rows.map((x) => ({ ...x, campaigns: Number(x.campaigns) }));
}

export async function saveSponsor(
  sql: SqlClient,
  adminId: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const name = text(input.name, 120, 'The name', true)!;
  const contact = text(input.contact, 300, 'The contact');
  const notes = text(input.notes, 2000, 'The notes');
  if (input.id !== undefined && input.id !== null && !isUuid(input.id)) {
    throw new AdminError(400, 'That is not a sponsor.');
  }
  return sql.transaction(async (tx) => {
    let id: string;
    if (input.id) {
      const r = await tx.query<{ id: string }>(
        'update public.sponsors set name = $2, contact = $3, notes = $4 where id = $1 returning id',
        [input.id, name, contact, notes],
      );
      if (!r.rows[0]) throw new AdminError(404, 'That sponsor was not found.');
      id = r.rows[0].id;
    } else {
      const r = await tx.query<{ id: string }>(
        'insert into public.sponsors (name, contact, notes) values ($1, $2, $3) returning id',
        [name, contact, notes],
      );
      id = r.rows[0]!.id;
    }
    await audit(tx, adminId, 'ad_sponsor_save', 'ad_sponsor', id, { ids: [id] });
    return { id };
  });
}

export async function deleteSponsor(sql: SqlClient, adminId: string, id: unknown): Promise<void> {
  if (!isUuid(id)) throw new AdminError(400, 'That is not a sponsor.');
  await sql.transaction(async (tx) => {
    const n = await tx.query('select 1 from public.campaigns where sponsor_id = $1', [id]);
    if (n.rowCount > 0) {
      throw new AdminError(409, 'This sponsor still has campaigns. Remove or move them first.');
    }
    const r = await tx.query('delete from public.sponsors where id = $1', [id]);
    if (r.rowCount === 0) throw new AdminError(404, 'That sponsor was not found.');
    await audit(tx, adminId, 'ad_sponsor_delete', 'ad_sponsor', id, { ids: [id] });
  });
}

// ---------------------------------------------------------------- campaigns

export interface CampaignRow {
  id: string;
  name: string;
  sponsorId: string | null;
  sponsorName: string | null;
  isHouse: boolean;
  /** First and last day shown, as Sydney days (the last day is included). */
  startDay: string;
  endDay: string | null;
  audience: 'everyone' | 'farmers';
  states: string[];
  weight: number;
  maxViewsPerViewerDay: number | null;
  maxViews: number | null;
  active: boolean;
  slots: AdSlotId[];
  creatives: number;
  views: number;
  clicks: number;
}

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

interface RawCampaign {
  id: string;
  name: string;
  sponsor_id: string | null;
  sponsor_name: string | null;
  is_house_ad: boolean;
  start_day: string;
  end_day: string | null;
  targeting: { audience?: string; states?: string[] };
  weight: number;
  max_views_per_viewer_day: number | null;
  max_views: number | null;
  active: boolean;
  slots: string[] | null;
  creatives: string;
  views: string | null;
  clicks: string | null;
}

export async function listCampaigns(sql: SqlRunner, id?: string): Promise<CampaignRow[]> {
  const r = await sql.query<RawCampaign>(
    `with ${COUNTS_CTE}
     select c.id, c.name, c.sponsor_id, s.name as sponsor_name, c.is_house_ad,
            to_char(c.starts_at at time zone 'Australia/Sydney', 'YYYY-MM-DD') as start_day,
            to_char((c.ends_at - interval '1 second') at time zone 'Australia/Sydney', 'YYYY-MM-DD') as end_day,
            c.targeting, c.weight, c.max_views_per_viewer_day, c.max_views, c.active,
            (select array_agg(cs.slot_id order by cs.slot_id) from public.campaign_slots cs where cs.campaign_id = c.id) as slots,
            (select count(*) from public.ad_creatives a where a.campaign_id = c.id) as creatives,
            (select sum(n.count) from counts n where n.campaign_id = c.id and n.kind = 'view') as views,
            (select sum(n.count) from counts n where n.campaign_id = c.id and n.kind = 'click') as clicks
       from public.campaigns c left join public.sponsors s on s.id = c.sponsor_id
      ${id ? 'where c.id = $1' : ''}
      order by c.is_house_ad desc, c.starts_at desc, c.name`,
    id ? [id] : [],
  );
  return r.rows.map((x) => ({
    id: x.id,
    name: x.name,
    sponsorId: x.sponsor_id,
    sponsorName: x.sponsor_name,
    isHouse: x.is_house_ad,
    startDay: x.start_day,
    endDay: x.end_day,
    audience: x.targeting?.audience === 'farmers' ? 'farmers' : 'everyone',
    states: Array.isArray(x.targeting?.states) ? x.targeting.states : [],
    weight: x.weight,
    maxViewsPerViewerDay: x.max_views_per_viewer_day,
    maxViews: x.max_views,
    active: x.active,
    slots: (x.slots ?? []).filter(isSlotId),
    creatives: Number(x.creatives),
    views: Number(x.views ?? 0),
    clicks: Number(x.clicks ?? 0),
  }));
}

export async function saveCampaign(
  sql: SqlClient,
  adminId: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  const name = text(input.name, 120, 'The name', true)!;
  const startDay = day(input.startDay, 'The start date', true)!;
  const endDay = day(input.endDay, 'The end date', false);
  if (endDay && endDay < startDay) {
    throw new AdminError(400, 'The end date can not be before the start date.');
  }
  const house = input.house === true;
  const sponsorId = input.sponsorId ?? null;
  if (!house && !isUuid(sponsorId))
    throw new AdminError(400, 'Choose a sponsor, or make it a house ad.');
  if (input.id !== undefined && input.id !== null && !isUuid(input.id)) {
    throw new AdminError(400, 'That is not a campaign.');
  }
  const audience = input.audience === 'farmers' ? 'farmers' : 'everyone';
  const states = Array.isArray(input.states) ? input.states : [];
  if (states.some((s) => typeof s !== 'string' || !STATES.includes(s))) {
    throw new AdminError(400, 'A state was not one of ACT, NSW, NT, QLD, SA, TAS, VIC, WA.');
  }
  const weight = whole(input.weight ?? 1, 1, 100, 'The weight');
  const perViewer = maybeWhole(input.maxViewsPerViewerDay, 1, 1000, 'Views a day for one player');
  const maxViews = maybeWhole(input.maxViews, 1, 1_000_000_000, 'The view budget');
  const slots = Array.isArray(input.slots) ? input.slots : [];
  if (slots.some((s) => !isSlotId(s)))
    throw new AdminError(400, 'One of the slots is not an ad slot.');
  const slotIds = [...new Set(slots as AdSlotId[])];
  const active = input.active === true;
  const targeting = JSON.stringify({ audience, states: [...new Set(states as string[])] });
  return sql
    .transaction(async (tx) => {
      if (!house) {
        const s = await tx.query('select 1 from public.sponsors where id = $1', [sponsorId]);
        if (s.rowCount === 0) throw new AdminError(404, 'That sponsor was not found.');
      }
      let id: string;
      const args = [
        name,
        house ? null : sponsorId,
        house,
        startDay,
        endDay,
        targeting,
        weight,
        perViewer,
        maxViews,
        active,
      ];
      if (input.id) {
        const r = await tx.query<{ id: string }>(
          `update public.campaigns set name = $2, sponsor_id = $3, is_house_ad = $4, starts_at = ($5::date)::timestamp at time zone 'Australia/Sydney',
                ends_at = (($6::date + 1)::timestamp at time zone 'Australia/Sydney'), targeting = $7::jsonb, weight = $8,
                max_views_per_viewer_day = $9, max_views = $10, active = $11
          where id = $1 returning id`,
          [input.id, ...args],
        );
        if (!r.rows[0]) throw new AdminError(404, 'That campaign was not found.');
        id = r.rows[0].id;
      } else {
        const r = await tx.query<{ id: string }>(
          `insert into public.campaigns (name, sponsor_id, is_house_ad, starts_at, ends_at, targeting, weight,
                max_views_per_viewer_day, max_views, active)
         values ($1, $2, $3, ($4::date)::timestamp at time zone 'Australia/Sydney', (($5::date + 1)::timestamp at time zone 'Australia/Sydney'), $6::jsonb, $7, $8, $9, $10) returning id`,
          args,
        );
        id = r.rows[0]!.id;
      }
      await tx.query(
        'delete from public.campaign_slots where campaign_id = $1 and not (slot_id = any($2::text[]))',
        [id, slotIds],
      );
      for (const s of slotIds) {
        await tx.query(
          `insert into public.ad_slots (slot_id) values ($1) on conflict (slot_id) do nothing`,
          [s],
        );
        await tx.query(
          `insert into public.campaign_slots (campaign_id, slot_id) values ($1, $2)
         on conflict (campaign_id, slot_id) do nothing`,
          [id, s],
        );
      }
      await audit(tx, adminId, 'ad_campaign_save', 'ad_campaign', id, {
        ids: [id],
        enabled: active,
      });
      return { id };
    })
    .finally(resetAdCache);
}

export async function deleteCampaign(sql: SqlClient, adminId: string, id: unknown): Promise<void> {
  if (!isUuid(id)) throw new AdminError(400, 'That is not a campaign.');
  let paths: string[] = [];
  await sql.transaction(async (tx) => {
    const seen = await tx.query(
      `select 1 where exists (select 1 from public.ad_daily where campaign_id = $1)
                  or exists (select 1 from public.ad_events where campaign_id = $1)`,
      [id],
    );
    if (seen.rowCount > 0) {
      throw new AdminError(
        409,
        'This campaign has views or clicks, which its report needs. Turn it off instead of deleting it.',
      );
    }
    paths = (
      await tx.query<{ media_path: string }>(
        'select media_path from public.ad_creatives where campaign_id = $1 and media_path is not null',
        [id],
      )
    ).rows.map((r) => r.media_path);
    const r = await tx.query('delete from public.campaigns where id = $1', [id]);
    if (r.rowCount === 0) throw new AdminError(404, 'That campaign was not found.');
    await audit(tx, adminId, 'ad_campaign_delete', 'ad_campaign', id, { ids: [id] });
  });
  resetAdCache();
  const store = adMediaStore();
  for (const p of paths) await store?.remove(p).catch(() => undefined);
}

// ---------------------------------------------------------------- creatives

export interface CreativeRow {
  id: string;
  campaignId: string;
  kind: 'image' | 'video' | 'text' | 'logo';
  headline: string | null;
  body: string | null;
  alt: string | null;
  linkUrl: string | null;
  active: boolean;
  hasMedia: boolean;
  mime: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
}

export async function listCreatives(sql: SqlRunner, campaignId: string): Promise<CreativeRow[]> {
  const r = await sql.query<{
    id: string;
    campaign_id: string;
    kind: CreativeRow['kind'];
    headline: string | null;
    body: string | null;
    alt: string | null;
    link_url: string | null;
    active: boolean;
    media_path: string | null;
    media_mime: string | null;
    width: number | null;
    height: number | null;
    duration_s: number | null;
  }>(
    `select id, campaign_id, kind, headline, body, alt, link_url, active, media_path, media_mime,
            width, height, duration_s
       from public.ad_creatives where campaign_id = $1 order by created_at, id`,
    [campaignId],
  );
  return r.rows.map((x) => ({
    id: x.id,
    campaignId: x.campaign_id,
    kind: x.kind,
    headline: x.headline,
    body: x.body,
    alt: x.alt,
    linkUrl: x.link_url,
    active: x.active,
    hasMedia: x.media_path !== null,
    mime: x.media_mime,
    width: x.width,
    height: x.height,
    durationS: x.duration_s,
  }));
}

const KINDS = ['image', 'video', 'text', 'logo'] as const;

/**
 * Add or change a creative. `upload` is `{ data }`, the file as base64. The bytes are looked at:
 * what the file is comes from them, not from any name or type the browser sent.
 */
export async function saveCreative(
  sql: SqlClient,
  adminId: string,
  input: Record<string, unknown>,
): Promise<{ id: string }> {
  if (!isUuid(input.campaignId)) throw new AdminError(400, 'That is not a campaign.');
  const kind = input.kind;
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) {
    throw new AdminError(400, 'Choose image, video, text or logo.');
  }
  const headline = text(input.headline, 80, 'The headline');
  const body = text(input.body, 200, 'The one line');
  const alt = text(input.alt, 120, 'The picture description');
  let linkUrl: string | null = null;
  if (input.linkUrl !== undefined && input.linkUrl !== null && input.linkUrl !== '') {
    linkUrl = typeof input.linkUrl === 'string' ? safeLink(input.linkUrl.trim()) : null;
    if (!linkUrl) throw new AdminError(400, 'The link must be a plain https address.');
  }
  if (kind === 'text' && !headline && !body) {
    throw new AdminError(400, 'A text ad needs a headline or one line.');
  }
  if (input.id !== undefined && input.id !== null && !isUuid(input.id)) {
    throw new AdminError(400, 'That is not a creative.');
  }
  const active = input.active !== false;

  // The file, if one came with this save.
  let file: { path: string; bytes: Uint8Array; found: ReturnType<typeof sniff> } | null = null;
  const up = input.upload;
  if (up !== undefined && up !== null) {
    const data =
      typeof up === 'object' && !Array.isArray(up) ? (up as { data?: unknown }).data : null;
    if (typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
      throw new AdminError(400, 'The file was not sent properly.');
    }
    const bytes = new Uint8Array(Buffer.from(data, 'base64'));
    let found;
    try {
      found = sniff(bytes);
    } catch (e) {
      if (e instanceof MediaError) throw new AdminError(400, e.message);
      throw e;
    }
    if ((kind === 'video') !== (found.kind === 'video')) {
      throw new AdminError(
        400,
        kind === 'video'
          ? 'A video ad needs an MP4 video.'
          : 'That ad needs a picture, not a video.',
      );
    }
    file = { path: '', bytes, found };
  }
  if (kind === 'text' && file) throw new AdminError(400, 'A text ad has no file.');

  const store = adMediaStore();
  if (file && !store) throw new AdminError(503, 'File storage is not set up on this copy yet.');
  const newId = !input.id
    ? (await sql.query<{ id: string }>('select gen_random_uuid() as id')).rows[0]!.id
    : null;
  const id = (input.id as string | undefined) ?? newId!;
  if (file) {
    file.path = mediaPath(id, file.found.ext);
    await store!.put(file.path, file.bytes, file.found.mime);
  }
  let oldPath: string | null = null;
  try {
    await sql.transaction(async (tx) => {
      const camp = await tx.query('select 1 from public.campaigns where id = $1', [
        input.campaignId,
      ]);
      if (camp.rowCount === 0) throw new AdminError(404, 'That campaign was not found.');
      if (input.id) {
        const cur = await tx.query<{
          media_path: string | null;
          kind: string;
          campaign_id: string;
        }>(
          'select media_path, kind, campaign_id from public.ad_creatives where id = $1 for update',
          [id],
        );
        const was = cur.rows[0];
        if (!was || was.campaign_id !== input.campaignId)
          throw new AdminError(404, 'That creative was not found.');
        if (was.kind !== kind)
          throw new AdminError(400, 'The kind of an ad can not be changed. Add a new one.');
        if (!file && kind !== 'text' && was.media_path === null && input.active !== false) {
          throw new AdminError(400, 'This ad has no file yet. Upload one first.');
        }
        oldPath = file ? was.media_path : null;
        await tx.query(
          `update public.ad_creatives
              set headline = $2, body = $3, alt = $4, link_url = $5, active = $6
                  ${file ? ', media_path = $7, media_mime = $8, media_bytes = $9, width = $10, height = $11, duration_s = $12' : ''}
            where id = $1`,
          file
            ? [
                id,
                headline,
                body,
                alt,
                linkUrl,
                active,
                file.path,
                file.found.mime,
                file.bytes.length,
                file.found.width,
                file.found.height,
                file.found.durationS,
              ]
            : [id, headline, body, alt, linkUrl, active],
        );
      } else {
        if (kind !== 'text' && !file) throw new AdminError(400, 'Choose a file for this ad.');
        await tx.query(
          `insert into public.ad_creatives
             (id, campaign_id, kind, headline, body, alt, link_url, active, media_path, media_mime, media_bytes, width, height, duration_s)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
            id,
            input.campaignId,
            kind,
            headline,
            body,
            alt,
            linkUrl,
            active,
            file?.path ?? null,
            file?.found.mime ?? null,
            file?.bytes.length ?? null,
            file?.found.width ?? null,
            file?.found.height ?? null,
            file?.found.durationS ?? null,
          ],
        );
      }
      await audit(tx, adminId, 'ad_creative_save', 'ad_creative', id, {
        ids: [id],
        enabled: active,
      });
    });
  } catch (e) {
    // The change did not happen, so the new file must not be left behind.
    if (file) await store!.remove(file.path).catch(() => undefined);
    throw e;
  }
  resetAdCache();
  if (oldPath) await store?.remove(oldPath).catch(() => undefined);
  return { id };
}

export async function deleteCreative(sql: SqlClient, adminId: string, id: unknown): Promise<void> {
  if (!isUuid(id)) throw new AdminError(400, 'That is not a creative.');
  let path: string | null = null;
  await sql.transaction(async (tx) => {
    const r = await tx.query<{ media_path: string | null }>(
      'delete from public.ad_creatives where id = $1 returning media_path',
      [id],
    );
    if (!r.rows[0]) throw new AdminError(404, 'That creative was not found.');
    path = r.rows[0].media_path;
    await audit(tx, adminId, 'ad_creative_delete', 'ad_creative', id, { ids: [id] });
  });
  resetAdCache();
  if (path)
    await adMediaStore()
      ?.remove(path)
      .catch(() => undefined);
}

// ---------------------------------------------------------------- views and clicks, reports

export interface DayCount {
  day: string;
  slot: string;
  views: number;
  clicks: number;
  videoCompletes: number;
  videoSkips: number;
}

/** Daily counts, newest first, from the roll-up and the raw events after it. Aggregates only. */
export async function dailyCounts(
  sql: SqlRunner,
  options: { campaignId?: string; days?: number } = {},
): Promise<DayCount[]> {
  const r = await sql.query<{ day: string; slot_id: string; kind: string; n: string }>(
    `with ${COUNTS_CTE}
     select to_char(day, 'YYYY-MM-DD') as day, slot_id, kind, sum(count) as n
       from counts
      where ($1::uuid is null or campaign_id = $1::uuid)
        and ($2::int is null or day > ${today()} - $2::int)
      group by day, slot_id, kind order by day desc, slot_id`,
    [options.campaignId ?? null, options.days ?? null],
  );
  const out = new Map<string, DayCount>();
  for (const x of r.rows) {
    const k = `${x.day}|${x.slot_id}`;
    const row = out.get(k) ?? {
      day: x.day,
      slot: x.slot_id,
      views: 0,
      clicks: 0,
      videoCompletes: 0,
      videoSkips: 0,
    };
    const n = Number(x.n);
    if (x.kind === 'view') row.views = n;
    else if (x.kind === 'click') row.clicks = n;
    else if (x.kind === 'video_complete') row.videoCompletes = n;
    else if (x.kind === 'video_skip') row.videoSkips = n;
    out.set(k, row);
  }
  return [...out.values()];
}

export interface CampaignReport {
  campaign: CampaignRow;
  rows: DayCount[];
  totals: { views: number; clicks: number; videoCompletes: number; videoSkips: number };
}

export async function campaignReport(sql: SqlClient, id: unknown): Promise<CampaignReport> {
  if (!isUuid(id)) throw new AdminError(400, 'That is not a campaign.');
  return sql.transaction(async (tx) => {
    const campaign = (await listCampaigns(tx, id))[0];
    if (!campaign) throw new AdminError(404, 'That campaign was not found.');
    const rows = await dailyCounts(tx, { campaignId: id });
    const totals = rows.reduce(
      (t, r) => ({
        views: t.views + r.views,
        clicks: t.clicks + r.clicks,
        videoCompletes: t.videoCompletes + r.videoCompletes,
        videoSkips: t.videoSkips + r.videoSkips,
      }),
      { views: 0, clicks: 0, videoCompletes: 0, videoSkips: 0 },
    );
    return { campaign, rows, totals };
  });
}

/**
 * The sponsor report as CSV: one line for each day and slot, with counts only. Nothing about any
 * player, and no free text (the slot ids and numbers are all there is), so nothing in it can be
 * read as a spreadsheet formula.
 */
export function reportCsv(report: CampaignReport): string {
  const lines = ['day,slot,views,clicks,video_completes,video_skips'];
  for (const r of [...report.rows].reverse()) {
    lines.push([r.day, r.slot, r.views, r.clicks, r.videoCompletes, r.videoSkips].join(','));
  }
  const t = report.totals;
  lines.push(['total', '', t.views, t.clicks, t.videoCompletes, t.videoSkips].join(','));
  return lines.join('\r\n') + '\r\n';
}

import 'server-only';
import type { AdSlotId } from '@gg/shared';
import { SLOTS, type CreativeKind } from '@/lib/ads/registry';
import { sessionHash } from '../db/dbstore';
import type { SqlClient, SqlRunner } from '../db/sql';
import { SESSION_COOKIE } from '../game/http';
import { isSessionId } from '../game/game';
import { makeImpression } from './token';
import { COUNTS_CTE, liveSlotIds, numberSetting, slotOn, slotSettings } from './slots';

/**
 * Choosing what to show. The choice reads the slot, its campaigns, their dates, budgets and
 * caps, and the viewer's own last views of ads. It NEVER reads anything about the player's farm.
 *
 * Who may see what:
 * - No-ads owners are shown nothing, anywhere.
 * - Targeting (farmers only, a state) reads the profile's own answers, only for a signed-in
 *   account aged 16 or over. A guest, an account with no profile and an account under 16 are
 *   shown only campaigns for everyone: nothing is aimed at them by interest (PRD 8.3, and the
 *   server's `interestAds: false` flag for under 16).
 * - Sponsors' campaigns come before house ads, which fill what is left (PRD 11.4).
 */

export interface Viewer {
  userId: string | null;
  /** The guest session row (`guest_sessions.id`), when the cookie names a live one. */
  guestId: string | null;
  underSixteen: boolean;
  /** The profile's own answers. Null for a guest or an under-16 account (never used for them). */
  farms: boolean | null;
  state: string | null;
}

export const ANON: Viewer = {
  userId: null,
  guestId: null,
  underSixteen: false,
  farms: null,
  state: null,
};

// ---------------------------------------------------------------- no-ads

/**
 * Does this account own no-ads (PRD 10.3)? Read through this one small function so the purchases
 * milestone can change where it looks, and the tests can give a fake.
 */
export type NoAdsReader = (sql: SqlRunner, userId: string) => Promise<boolean>;

const fromTable: NoAdsReader = async (sql, userId) => {
  const r = await sql.query(
    `select 1 from public.account_entitlements
      where user_id = $1 and entitlement = 'no_ads' and revoked_at is null`,
    [userId],
  );
  return r.rowCount > 0;
};

let reader: NoAdsReader = fromTable;

/** For tests: use this reader, or `undefined` for the real one. */
export function setNoAdsReader(r: NoAdsReader | undefined): void {
  reader = r ?? fromTable;
}

export const ownsNoAds = (sql: SqlRunner, userId: string): Promise<boolean> => reader(sql, userId);

// ---------------------------------------------------------------- the viewer

/** The viewer's guest session row for a `gg_session` cookie value, or null. */
export async function guestIdOf(sql: SqlRunner, cookie: string | null): Promise<string | null> {
  if (!isSessionId(cookie)) return null;
  const r = await sql.query<{ id: string }>(
    'select id from public.guest_sessions where token_hash = $1 and converted_at is null',
    [sessionHash(cookie)],
  );
  return r.rows[0]?.id ?? null;
}

export const guestCookie = (req: Request): string | null => {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE) return rest.join('=');
  }
  return null;
};

/**
 * Work out who is looking, from the database. `null` means "show this person nothing": they own
 * no-ads. A signed-in account with no finished profile is a guest. Never throws.
 */
export async function viewerFor(
  sql: SqlClient,
  user: { id: string } | null,
  req: Request,
): Promise<Viewer | null> {
  try {
    if (user) {
      const r = await sql.query<{
        farms: boolean | null;
        state: string | null;
        age: number;
      }>(
        `select p.farms, p.state, app.age_on(a.date_of_birth, app.today_sydney()) as age
           from public.profiles p
           join public.account_private a on a.user_id = p.user_id
          where p.user_id = $1`,
        [user.id],
      );
      const row = r.rows[0];
      if (row) {
        if (await ownsNoAds(sql, user.id)) return null;
        const under = row.age < 16;
        return {
          userId: user.id,
          guestId: null,
          underSixteen: under,
          farms: under ? null : row.farms,
          state: under ? null : row.state,
        };
      }
    }
    const guestId = await guestIdOf(sql, guestCookie(req));
    return { ...ANON, guestId };
  } catch {
    return ANON;
  }
}

/**
 * The slots for `/api/auth/me`. Switches off, no keys, a no-ads owner: an empty list, and the
 * play screen then draws no ad markup and asks for no ad.
 */
export async function adSlotsFor(
  sql: SqlClient,
  account: { userId: string } | null,
  now = Date.now(),
): Promise<AdSlotId[]> {
  const live = await liveSlotIds(sql, now);
  if (live.length === 0) return [];
  if (account && (await ownsNoAds(sql, account.userId).catch(() => false))) return [];
  return live;
}

// ---------------------------------------------------------------- choosing

export interface PickedAd {
  /** Signed. Sent back with the view. */
  token: string;
  creativeId: string;
  kind: CreativeKind;
  headline: string | null;
  body: string | null;
  alt: string | null;
  sponsor: string | null;
  /** `Ad` for the house's own, `Sponsored` for a sponsor's. */
  label: 'Ad' | 'Sponsored';
  /** A path on this site, never the sponsor's own address. */
  mediaUrl: string | null;
  /** A path on this site that records the click, then redirects. Null when there is no link. */
  href: string | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
}

export interface Pick {
  items: PickedAd[];
  /** Seconds the browser waits before asking again (a cap). */
  retryAfter?: number;
  /** For a timed banner: how long it stays, in seconds. */
  showSeconds?: number;
}

interface Candidate {
  campaign_id: string;
  is_house_ad: boolean;
  weight: number;
  targeting: { audience?: unknown; states?: unknown };
  max_views_per_viewer_day: number | null;
  max_views: number | null;
  creative_id: string;
  kind: CreativeKind;
  headline: string | null;
  body: string | null;
  alt: string | null;
  has_media: boolean;
  has_link: boolean;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  sponsor: string | null;
}

const viewerCol = (v: Viewer): { col: string; id: string } | null =>
  v.userId
    ? { col: 'user_id', id: v.userId }
    : v.guestId
      ? { col: 'guest_session_id', id: v.guestId }
      : null;

/** May this campaign be shown to this viewer, by who it is aimed at? */
export function targetsViewer(t: Candidate['targeting'], v: Viewer): boolean {
  const audience = t?.audience;
  const states = Array.isArray(t?.states)
    ? (t.states as unknown[]).filter((s) => typeof s === 'string')
    : [];
  const aimed = (audience !== undefined && audience !== 'everyone') || states.length > 0;
  if (!aimed) return true;
  // Aimed by the profile: only a signed-in adult with those answers, never a guest or under 16.
  if (!v.userId || v.underSixteen) return false;
  if (audience === 'farmers' && v.farms !== true) return false;
  if (states.length > 0 && (!v.state || !states.includes(v.state))) return false;
  return true;
}

/** A weighted pick. `rng` gives a number in [0, 1). */
export function weightedPick<T extends { weight: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((n, i) => n + i.weight, 0);
  let at = rng() * total;
  for (const i of items) {
    at -= i.weight;
    if (at < 0) return i;
  }
  return items[items.length - 1]!;
}

export interface ChooseInput {
  slot: AdSlotId;
  viewer: Viewer;
  pepper: string;
  now?: number;
  rng?: () => number;
}

/** The ads for one slot, for one viewer, right now. */
export async function chooseAds(sql: SqlClient, input: ChooseInput): Promise<Pick> {
  const { slot, viewer, pepper } = input;
  const now = input.now ?? Date.now();
  const rng = input.rng ?? Math.random;
  const def = SLOTS[slot];
  if (!def.placed || !(await slotOn(sql, slot, now))) return { items: [] };
  const settings = await slotSettings(sql, slot, now);
  const who = viewerCol(viewer);
  const out: Pick = { items: [] };

  // Caps that need to know the viewer. A viewer the server can not tell apart gets none of a
  // capped slot, rather than an uncapped one.
  const minGap = numberSetting(settings, 'min_seconds_between', null, 0, 86_400);
  const perDay = numberSetting(settings, 'max_per_day', null, 1, 100);
  if (minGap !== null || perDay !== null) {
    if (!who) return { items: [] };
    const r = await sql.query<{ last: string | null; today: string }>(
      `select max(created_at) as last,
              count(*) filter (
                where (created_at at time zone 'Australia/Sydney')::date
                    = ($3::timestamptz at time zone 'Australia/Sydney')::date) as today
         from public.ad_events
        where slot_id = $1 and kind = 'view' and ${who.col} = $2`,
      [slot, who.id, new Date(now).toISOString()],
    );
    const last = r.rows[0]?.last ? new Date(r.rows[0].last).getTime() : null;
    if (minGap !== null && last !== null && now - last < minGap * 1000) {
      return { items: [], retryAfter: Math.ceil((minGap * 1000 - (now - last)) / 1000) };
    }
    if (perDay !== null && Number(r.rows[0]?.today ?? 0) >= perDay) {
      return { items: [], retryAfter: 3600 };
    }
  }

  const cands = (
    await sql.query<Candidate>(
      `select c.id as campaign_id, c.is_house_ad, c.weight, c.targeting,
              c.max_views_per_viewer_day, c.max_views,
              a.id as creative_id, a.kind, a.headline, a.body, a.alt,
              (a.media_path is not null) as has_media, (a.link_url is not null) as has_link,
              a.width, a.height, a.duration_s, s.name as sponsor
         from public.campaign_slots cs
         join public.campaigns c on c.id = cs.campaign_id
         join public.ad_creatives a on a.campaign_id = c.id
         left join public.sponsors s on s.id = c.sponsor_id
        where cs.slot_id = $1
          and c.active
          and c.starts_at <= $2::timestamptz
          and (c.ends_at is null or c.ends_at > $2::timestamptz)
          and a.active
          and a.kind = any($3::text[])
          and (a.kind = 'text' or a.media_path is not null)`,
      [slot, new Date(now).toISOString(), [...def.kinds]],
    )
  ).rows.filter((c) => targetsViewer(c.targeting, viewer));
  if (cands.length === 0) return out;

  // Budgets and per-viewer daily caps, for the campaigns still in the running.
  const ids = [...new Set(cands.map((c) => c.campaign_id))];
  const total = new Map<string, number>();
  const mine = new Map<string, number>();
  if (cands.some((c) => c.max_views !== null)) {
    const r = await sql.query<{ campaign_id: string; n: string }>(
      `with ${COUNTS_CTE}
       select campaign_id, sum(count) as n from counts
        where kind = 'view' and campaign_id = any($1::uuid[]) group by campaign_id`,
      [ids],
    );
    for (const x of r.rows) total.set(x.campaign_id, Number(x.n));
  }
  if (who && cands.some((c) => c.max_views_per_viewer_day !== null)) {
    const r = await sql.query<{ campaign_id: string; n: string }>(
      `select campaign_id, count(*) as n from public.ad_events
        where kind = 'view' and ${who.col} = $1 and campaign_id = any($2::uuid[])
          and (created_at at time zone 'Australia/Sydney')::date
            = ($3::timestamptz at time zone 'Australia/Sydney')::date
        group by campaign_id`,
      [who.id, ids, new Date(now).toISOString()],
    );
    for (const x of r.rows) mine.set(x.campaign_id, Number(x.n));
  }
  const open = cands.filter((c) => {
    if (c.max_views !== null && (total.get(c.campaign_id) ?? 0) >= c.max_views) return false;
    if (c.max_views_per_viewer_day !== null) {
      // A cap per viewer needs a viewer the server can tell apart.
      if (!who) return false;
      if ((mine.get(c.campaign_id) ?? 0) >= c.max_views_per_viewer_day) return false;
    }
    return true;
  });

  // Sponsors first. House ads fill only what a sponsor leaves empty.
  const sponsors = open.filter((c) => !c.is_house_ad);
  let pool = sponsors.length > 0 ? sponsors : open.filter((c) => c.is_house_ad);
  const picked: Candidate[] = [];
  const room = Math.max(
    1,
    Math.min(def.maxItems, numberSetting(settings, 'max_cards', def.maxItems, 1, def.maxItems)!),
  );
  while (picked.length < room && pool.length > 0) {
    // One campaign at a time: a campaign is chosen by weight, then one of its creatives.
    const byCampaign = new Map<string, Candidate[]>();
    for (const c of pool)
      byCampaign.set(c.campaign_id, [...(byCampaign.get(c.campaign_id) ?? []), c]);
    const campaigns = [...byCampaign.values()].map((list) => ({ weight: list[0]!.weight, list }));
    const chosen = weightedPick(campaigns, rng);
    picked.push(chosen.list[Math.floor(rng() * chosen.list.length)]!);
    pool = pool.filter((c) => c.campaign_id !== chosen.list[0]!.campaign_id);
    if (sponsors.length > 0 && pool.length === 0 && picked.length < room) {
      // Not enough sponsors to fill the cards: house ads fill the rest (a sponsor card is never left empty).
      pool = open.filter(
        (c) => c.is_house_ad && !picked.some((p) => p.campaign_id === c.campaign_id),
      );
      if (pool.length === 0) break;
    }
  }

  out.items = picked.map((c) => {
    const { token } = makeImpression(pepper, slot, c.campaign_id, c.creative_id, now);
    return {
      token,
      creativeId: c.creative_id,
      kind: c.kind,
      headline: c.headline,
      body: c.body,
      alt: c.alt,
      sponsor: c.sponsor,
      label: c.is_house_ad ? 'Ad' : 'Sponsored',
      mediaUrl: c.has_media ? `/api/ads/media/${c.creative_id}` : null,
      href: c.has_link ? `/api/ads/click/${c.creative_id}?s=${slot}` : null,
      width: c.width,
      height: c.height,
      durationS: c.duration_s,
    };
  });
  if (def.timed) {
    const lo = numberSetting(settings, 'show_seconds_min', 30, 5, 120)!;
    const hi = Math.max(lo, numberSetting(settings, 'show_seconds_max', 60, 5, 120)!);
    out.showSeconds = lo + Math.floor(rng() * (hi - lo + 1));
    out.retryAfter = minGap ?? 300;
  }
  return out;
}

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AD_SLOTS } from '@gg/shared';
import { pgliteSql } from '../test-support/pgliteSql';
import * as meRoute from '../../app/api/auth/me/route';
import * as pickRoute from '../../app/api/ads/pick/route';
import * as eventRoute from '../../app/api/ads/event/route';
import * as clickRoute from '../../app/api/ads/click/[id]/route';
import { recordEvent, safeLink, MIN_VIEW_DELAY_MS } from './events';
import { hasNoAds } from '../billing/products';
import { chooseAds, ownsNoAds, setNoAdsReader, targetsViewer, ANON, type Viewer } from './serve';
import { makeImpression, readImpression, TOKEN_LIFE_MS } from './token';
import {
  PEPPER,
  call,
  campaign,
  guest,
  person,
  resetKit,
  slotOnDb,
  startKit,
  stopKit,
  switches,
  type Kit,
} from './testkit';

let kit: Kit;
beforeAll(async () => {
  kit = await startKit();
}, 120_000);
afterAll(() => stopKit(kit));
beforeEach(() => resetKit(kit));

const sql = () => pgliteSql(kit.db);
const events = async (kind?: string): Promise<number> =>
  Number(
    (
      await kit.db.query<{ n: string }>(
        `select count(*) as n from public.ad_events ${kind ? `where kind = '${kind}'` : ''}`,
      )
    ).rows[0]!.n,
  );
const me = async (p?: { full: string } | null, cookie?: string) =>
  (await (await call(kit, meRoute.GET, '/api/auth/me', { cookie: p?.full ?? cookie })).json()) as {
    ads: string[];
    interestAds: boolean;
  };
const pick = async (slot: string, cookie?: string) =>
  (await (await call(kit, pickRoute.GET, `/api/ads/pick?slot=${slot}`, { cookie })).json()) as {
    items: { token: string; label: string; href: string | null }[];
  };

const adult: Viewer = { ...ANON, userId: '00000000-0000-4000-8000-0000000000aa' };

// ---------------------------------------------------------------- everything off

describe('every switch off (the launch default): nothing, anywhere', () => {
  it('the launch state is off: no slot is on, and no switch is on', async () => {
    const slots = await kit.db.query<{ enabled: boolean }>('select enabled from public.ad_slots');
    expect(slots.rows.length).toBe(AD_SLOTS.length);
    expect(slots.rows.every((r) => r.enabled === false)).toBe(true);
    const sw = await kit.db.query<{ key: string; enabled: boolean }>(
      `select key, enabled from public.feature_switches where key in ('ads', 'banner_ads', 'video_ads', 'adsense')`,
    );
    expect(sw.rows.every((r) => r.enabled === false)).toBe(true);
  });

  it('with a campaign made for every slot but every switch off, nothing is told to the screen, picked, counted or followed', async () => {
    const c = await campaign(kit, {
      house: true,
      slots: [...AD_SLOTS],
      creatives: [{ kind: 'image' }, { kind: 'text' }, { kind: 'video' }],
    });
    const pat = await person(kit, 'pat');
    for (const who of [null, pat]) {
      expect((await me(who)).ads).toEqual([]);
    }
    expect((await me(null, (await guest(kit)).cookie)).ads).toEqual([]);
    for (const slot of AD_SLOTS) {
      expect(await pick(slot, pat.full)).toEqual({ items: [] });
      expect(await pick(slot)).toEqual({ items: [] });
    }
    // A forged or old token counts nothing, and a click on a real creative goes nowhere.
    const t = makeImpression(PEPPER, 'pc_banner', c.id, c.creatives[0]!, Date.now() - 5000).token;
    const ev = await call(kit, eventRoute.POST, '/api/ads/event', {
      body: { token: t, kind: 'view' },
      cookie: pat.full,
    });
    expect(await ev.json()).toEqual({ counted: false });
    for (const slot of AD_SLOTS) {
      const res = await call(kit, clickRoute.GET, `/api/ads/click/${c.creatives[0]}?s=${slot}`);
      expect(res.status).toBe(404);
    }
    expect(await events()).toBe(0);
  });

  it('the master switch off hides a slot that is itself on, and the slot off hides it with the master on', async () => {
    await campaign(kit, { house: true, slots: ['summary_sponsor_card'] });
    await slotOnDb(kit, 'summary_sponsor_card');
    expect((await me()).ads).toEqual([]);
    await switches(kit, 'ads');
    expect((await me()).ads).toEqual(['summary_sponsor_card']);
    await kit.db.query(`update public.ad_slots set enabled = false`);
    (await import('./slots')).resetAdCache();
    expect((await me()).ads).toEqual([]);
  });

  it('banner slots also need Banner ads, and video slots need Video ads', async () => {
    await campaign(kit, {
      house: true,
      slots: ['phone_banner', 'video_between_years'],
      creatives: [{ kind: 'text' }, { kind: 'video' }],
    });
    await slotOnDb(kit, 'phone_banner', 'video_between_years');
    await switches(kit, 'ads');
    expect((await me()).ads).toEqual([]);
    await switches(kit, 'banner_ads');
    expect((await me()).ads).toEqual(['phone_banner']);
    await switches(kit, 'video_ads');
    expect((await me()).ads.sort()).toEqual(['phone_banner', 'video_between_years']);
  });

  it('a slot with a place that is not built yet is never told to the screen', async () => {
    await campaign(kit, { house: true, slots: ['pc_leaderboard_banner', 'landing_sponsors'] });
    await slotOnDb(kit, 'pc_leaderboard_banner', 'landing_sponsors');
    await switches(kit, 'ads');
    expect((await me()).ads).toEqual([]);
  });

  it('a slot with no live campaign shows nothing at all, not an empty box', async () => {
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    expect((await me()).ads).toEqual([]);
    expect(await pick('summary_sponsor_card')).toEqual({ items: [] });
  });
});

// ---------------------------------------------------------------- one slot on

describe('one slot on shows one ad and records one view', () => {
  it('shows a house ad with its label, then counts one view once', async () => {
    const c = await campaign(kit, {
      house: true,
      slots: ['summary_sponsor_card'],
      creatives: [{ kind: 'text', headline: 'Our soil tests' }],
    });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    const pat = await person(kit, 'pat');
    const got = await pick('summary_sponsor_card', pat.full);
    expect(got.items).toHaveLength(1);
    expect(got.items[0]!.label).toBe('Ad');
    // The link goes through the server's click route, never straight to the sponsor.
    expect(got.items[0]!.href).toBe(`/api/ads/click/${c.creatives[0]}?s=summary_sponsor_card`);
    expect(JSON.stringify(got)).not.toContain('example.com.au');
    // Seen for a second: counted. Sooner than that: not.
    const early = await recordEvent(
      sql(),
      PEPPER,
      { ...ANON, userId: pat.id },
      'k',
      got.items[0]!.token,
      'view',
    );
    expect(early).toEqual({ counted: false, why: 'too_soon' });
    await new Promise((r) => setTimeout(r, MIN_VIEW_DELAY_MS + 100));
    const res = await call(kit, eventRoute.POST, '/api/ads/event', {
      body: { token: got.items[0]!.token, kind: 'view' },
      cookie: pat.full,
    });
    expect(await res.json()).toEqual({ counted: true });
    expect(await events('view')).toBe(1);
    const again = await call(kit, eventRoute.POST, '/api/ads/event', {
      body: { token: got.items[0]!.token, kind: 'view' },
      cookie: pat.full,
    });
    expect(await again.json()).toEqual({ counted: false });
    expect(await events('view')).toBe(1);
    const row = (await kit.db.query<Record<string, unknown>>('select * from public.ad_events'))
      .rows[0]!;
    expect(row.slot_id).toBe('summary_sponsor_card');
    expect(row.campaign_id).toBe(c.id);
    expect(row.user_id).toBe(pat.id);
  });

  it('a sponsor label says Sponsored, and a sponsor comes before a house ad', async () => {
    await campaign(kit, {
      house: true,
      name: 'house',
      slots: ['summary_sponsor_card'],
      creatives: [{ headline: 'House' }],
    });
    await campaign(kit, {
      name: 'sponsor',
      slots: ['summary_sponsor_card'],
      creatives: [{ headline: 'Sponsor' }],
    });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    for (let i = 0; i < 6; i++) {
      const r = await chooseAds(sql(), {
        slot: 'summary_sponsor_card',
        viewer: adult,
        pepper: PEPPER,
      });
      expect(r.items).toHaveLength(1);
      expect(r.items[0]!.label).toBe('Sponsored');
      expect(r.items[0]!.headline).toBe('Sponsor');
    }
  });

  it('a rail shows up to 3 cards, sponsors first and house ads fill the rest, never one campaign twice', async () => {
    await campaign(kit, {
      name: 's1',
      slots: ['pc_farm_rail'],
      creatives: [{ kind: 'image', headline: 'S1' }],
    });
    await campaign(kit, {
      house: true,
      name: 'h1',
      slots: ['pc_farm_rail'],
      creatives: [{ kind: 'image', headline: 'H1' }],
    });
    await campaign(kit, {
      house: true,
      name: 'h2',
      slots: ['pc_farm_rail'],
      creatives: [{ kind: 'image', headline: 'H2' }],
    });
    await campaign(kit, {
      house: true,
      name: 'h3',
      slots: ['pc_farm_rail'],
      creatives: [{ kind: 'image', headline: 'H3' }],
    });
    await slotOnDb(kit, 'pc_farm_rail');
    await switches(kit, 'ads');
    const r = await chooseAds(sql(), { slot: 'pc_farm_rail', viewer: adult, pepper: PEPPER });
    expect(r.items).toHaveLength(3);
    expect(r.items[0]!.headline).toBe('S1');
    expect(new Set(r.items.map((i) => i.headline)).size).toBe(3);
  });

  it('weights decide how often a campaign is chosen', async () => {
    await campaign(kit, {
      name: 'heavy',
      weight: 9,
      slots: ['summary_sponsor_card'],
      creatives: [{ headline: 'Heavy' }],
    });
    await campaign(kit, {
      name: 'light',
      weight: 1,
      slots: ['summary_sponsor_card'],
      creatives: [{ headline: 'Light' }],
    });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    let heavy = 0;
    let n = 0;
    const rng = () => (n++ % 10) / 10 + 0.01;
    for (let i = 0; i < 10; i++) {
      const r = await chooseAds(sql(), {
        slot: 'summary_sponsor_card',
        viewer: adult,
        pepper: PEPPER,
        rng,
      });
      if (r.items[0]!.headline === 'Heavy') heavy++;
    }
    expect(heavy).toBeGreaterThanOrEqual(8);
  });

  it('choosing an ad reads nothing about the farm', async () => {
    await campaign(kit, { house: true, slots: ['summary_sponsor_card'] });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    const seen: string[] = [];
    const spy = {
      ...sql(),
      query: (t: string, p?: unknown[]) => (seen.push(t), sql().query(t, p)),
      transaction: (fn: Parameters<ReturnType<typeof sql>['transaction']>[0]) =>
        sql().transaction((tx) =>
          fn({ query: (t: string, p?: unknown[]) => (seen.push(t), tx.query(t, p)) }),
        ),
    } as ReturnType<typeof sql>;
    await chooseAds(spy, { slot: 'summary_sponsor_card', viewer: adult, pepper: PEPPER });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.join(' ')).not.toMatch(/farm|snapshot|paddock|mob\b|cattle|cash|game_/i);
  });
});

// ---------------------------------------------------------------- who is shown what

describe('no-ads owners see no ads anywhere', () => {
  it('a fake entitlement reader and the real table both end every route', async () => {
    const c = await campaign(kit, { house: true, slots: ['summary_sponsor_card'] });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    const owner = await person(kit, 'owner');
    const other = await person(kit, 'other');
    expect((await me(owner)).ads).toEqual(['summary_sponsor_card']);
    // The fake: the purchases milestone will change where this looks.
    setNoAdsReader(async (_s, id) => id === owner.id);
    expect((await me(owner)).ads).toEqual([]);
    expect((await me(other)).ads).toEqual(['summary_sponsor_card']);
    expect(await pick('summary_sponsor_card', owner.full)).toEqual({ items: [] });
    const t = makeImpression(
      PEPPER,
      'summary_sponsor_card',
      c.id,
      c.creatives[0]!,
      Date.now() - 5000,
    ).token;
    expect(
      await (
        await call(kit, eventRoute.POST, '/api/ads/event', {
          body: { token: t, kind: 'view' },
          cookie: owner.full,
        })
      ).json(),
    ).toEqual({ counted: false });
    expect(
      (
        await call(kit, clickRoute.GET, `/api/ads/click/${c.creatives[0]}?s=summary_sponsor_card`, {
          cookie: owner.full,
        })
      ).status,
    ).toBe(404);
    // The real table.
    setNoAdsReader(undefined);
    await kit.db.query(
      `insert into public.account_entitlements (user_id, entitlement) values ($1, 'no_ads')`,
      [owner.id],
    );
    (await import('./slots')).resetAdCache();
    expect((await me(owner)).ads).toEqual([]);
    expect(await pick('summary_sponsor_card', owner.full)).toEqual({ items: [] });
    // A revoked entitlement is not ownership.
    await kit.db.query(`update public.account_entitlements set revoked_at = now()`);
    expect((await me(owner)).ads).toEqual(['summary_sponsor_card']);
    expect(await events()).toBe(0);
  });
});

describe('the ads ask the purchases (m6 join)', () => {
  it("the real no-ads reader gives the purchases' own hasNoAds answer in every state", async () => {
    setNoAdsReader(undefined);
    const p = await person(kit, 'buyer');
    const both = async () => [
      await ownsNoAds(kit.deps.sql, p.id),
      await hasNoAds(kit.deps.sql, p.id),
    ];
    expect(await both()).toEqual([false, false]);
    await kit.db.query(
      `insert into public.account_entitlements (user_id, entitlement) values ($1, 'no_ads')`,
      [p.id],
    );
    expect(await both()).toEqual([true, true]);
    await kit.db.query(
      `update public.account_entitlements set revoked_at = now() where user_id = $1`,
      [p.id],
    );
    expect(await both()).toEqual([false, false]);
  });
});

describe('under 16 (PRD 8.3: nothing aimed by interest)', () => {
  it('an under-16 account is shown ads for everyone only, never an aimed one', async () => {
    await campaign(kit, {
      name: 'aimed',
      slots: ['summary_sponsor_card'],
      targeting: { audience: 'farmers' },
      creatives: [{ headline: 'Aimed' }],
    });
    await campaign(kit, {
      name: 'qld',
      slots: ['summary_sponsor_card'],
      targeting: { audience: 'everyone', states: ['QLD'] },
      creatives: [{ headline: 'Qld' }],
    });
    await campaign(kit, {
      name: 'all',
      slots: ['summary_sponsor_card'],
      targeting: { audience: 'everyone' },
      creatives: [{ headline: 'All' }],
    });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    const kid = await person(kit, 'kid', { age: 15, farms: true, state: 'QLD' });
    const grown = await person(kit, 'grown', { age: 30, farms: true, state: 'QLD' });
    expect((await me(kid)).interestAds).toBe(false);
    for (let i = 0; i < 12; i++) {
      const r = await pick('summary_sponsor_card', kid.full);
      expect(r.items).toHaveLength(1);
    }
    const heads = new Set<string | null>();
    for (let i = 0; i < 40; i++) {
      const r = await chooseAds(sql(), {
        slot: 'summary_sponsor_card',
        viewer: { ...ANON, userId: kid.id, underSixteen: true, farms: null, state: null },
        pepper: PEPPER,
        rng: Math.random,
      });
      heads.add(r.items[0]!.headline);
    }
    expect([...heads]).toEqual(['All']);
    // The same campaigns do reach an adult farmer in Queensland.
    const seen = new Set<string | null>();
    for (let i = 0; i < 60; i++) {
      const r = await chooseAds(sql(), {
        slot: 'summary_sponsor_card',
        viewer: { ...ANON, userId: grown.id, farms: true, state: 'QLD' },
        pepper: PEPPER,
      });
      seen.add(r.items[0]!.headline);
    }
    expect(seen.has('Aimed')).toBe(true);
    expect(seen.has('Qld')).toBe(true);
  });

  it('targeting rules: guests and unknown answers get only the ones for everyone', () => {
    const farmers = { audience: 'farmers' };
    const qld = { audience: 'everyone', states: ['QLD'] };
    expect(targetsViewer({}, ANON)).toBe(true);
    expect(targetsViewer({ audience: 'everyone' }, ANON)).toBe(true);
    expect(targetsViewer(farmers, ANON)).toBe(false);
    expect(targetsViewer(qld, ANON)).toBe(false);
    expect(targetsViewer(farmers, { ...adult, farms: null })).toBe(false);
    expect(targetsViewer(farmers, { ...adult, farms: false })).toBe(false);
    expect(targetsViewer(farmers, { ...adult, farms: true })).toBe(true);
    expect(targetsViewer(qld, { ...adult, state: 'NSW' })).toBe(false);
    expect(targetsViewer(qld, { ...adult, state: 'QLD' })).toBe(true);
    expect(targetsViewer(farmers, { ...adult, underSixteen: true, farms: true })).toBe(false);
  });

  it('a guest is shown ads like a free player (nothing aimed)', async () => {
    await campaign(kit, {
      name: 'all',
      slots: ['summary_sponsor_card'],
      creatives: [{ headline: 'All' }],
    });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    const g = await guest(kit);
    expect((await me(null, g.cookie)).ads).toEqual(['summary_sponsor_card']);
    expect((await pick('summary_sponsor_card', g.cookie)).items).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- caps and dates

describe('campaign dates, budgets and caps are enforced when choosing', () => {
  const live = async (spec: Parameters<typeof campaign>[1]) => {
    const c = await campaign(kit, spec);
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    return c;
  };
  const shown = async (now = Date.now(), viewer = adult) =>
    (await chooseAds(sql(), { slot: 'summary_sponsor_card', viewer, pepper: PEPPER, now })).items
      .length;

  it('shows only between its first and last day, and only while running', async () => {
    const now = Date.parse('2026-12-10T02:00:00Z');
    await live({
      slots: ['summary_sponsor_card'],
      startsAt: '2026-12-01T00:00:00+11:00',
      endsAt: '2026-12-31T00:00:00+11:00',
    });
    expect(await shown(Date.parse('2026-11-20T02:00:00Z'))).toBe(0);
    expect(await shown(now)).toBe(1);
    expect(await shown(Date.parse('2027-01-05T02:00:00Z'))).toBe(0);
    await kit.db.query('update public.campaigns set active = false');
    (await import('./slots')).resetAdCache();
    expect(await shown(now)).toBe(0);
  });

  it('a creative that is off is never chosen, and a campaign with only that goes quiet', async () => {
    await live({
      slots: ['summary_sponsor_card'],
      creatives: [{ headline: 'Off', active: false }],
    });
    expect(await shown()).toBe(0);
    expect((await me()).ads).toEqual([]);
  });

  it('stops after its view budget', async () => {
    const c = await live({ slots: ['summary_sponsor_card'], maxViews: 2 });
    expect(await shown()).toBe(1);
    for (let i = 0; i < 2; i++) {
      await kit.db.query(
        `insert into public.ad_events (slot_id, campaign_id, kind) values ('summary_sponsor_card', $1, 'view')`,
        [c.id],
      );
    }
    expect(await shown()).toBe(0);
    // The screen is told within the switch cache time (30 seconds); here it is read again at once.
    (await import('./slots')).resetAdCache();
    expect((await me()).ads).toEqual([]);
    // Views already rolled up count too.
    await kit.db.query('delete from public.ad_events');
    await kit.db.query(
      `insert into public.ad_daily (day, slot_id, campaign_id, kind, count) values ((now() at time zone 'Australia/Sydney')::date - 3, 'summary_sponsor_card', $1, 'view', 5)`,
      [c.id],
    );
    expect(await shown()).toBe(0);
  });

  it('limits views a day for one player, by account, and never for a player it cannot tell apart', async () => {
    const pat = await person(kit, 'pat');
    const viewer = { ...ANON, userId: pat.id };
    const c = await live({ slots: ['summary_sponsor_card'], perViewerDay: 2 });
    expect(await shown(Date.now(), viewer)).toBe(1);
    for (let i = 0; i < 2; i++) {
      await kit.db.query(
        `insert into public.ad_events (slot_id, campaign_id, kind, user_id) values ('summary_sponsor_card', $1, 'view', $2)`,
        [c.id, pat.id],
      );
    }
    expect(await shown(Date.now(), viewer)).toBe(0);
    const bob = await person(kit, 'bob');
    expect(await shown(Date.now(), { ...ANON, userId: bob.id })).toBe(1);
    // Yesterday's views do not count today.
    expect(await shown(Date.now() + 36 * 3600_000, viewer)).toBe(1);
    // A viewer with no account or guest session can not be capped, so a capped campaign is not shown.
    expect(await shown(Date.now(), ANON)).toBe(0);
  });

  it('a banner shows at most once in its gap, by player, and says when to ask again', async () => {
    await campaign(kit, { house: true, slots: ['phone_banner'] });
    await slotOnDb(kit, 'phone_banner');
    await switches(kit, 'ads', 'banner_ads');
    const pat = await person(kit, 'pat');
    const viewer = { ...ANON, userId: pat.id };
    const t0 = Date.now();
    const first = await chooseAds(sql(), { slot: 'phone_banner', viewer, pepper: PEPPER, now: t0 });
    expect(first.items).toHaveLength(1);
    expect(first.showSeconds).toBeGreaterThanOrEqual(30);
    expect(first.showSeconds).toBeLessThanOrEqual(60);
    await kit.db.query(
      `insert into public.ad_events (slot_id, kind, user_id, created_at) values ('phone_banner', 'view', $1, $2)`,
      [pat.id, new Date(t0).toISOString()],
    );
    const soon = await chooseAds(sql(), {
      slot: 'phone_banner',
      viewer,
      pepper: PEPPER,
      now: t0 + 100_000,
    });
    expect(soon.items).toEqual([]);
    expect(soon.retryAfter).toBe(200);
    expect(
      (await chooseAds(sql(), { slot: 'phone_banner', viewer, pepper: PEPPER, now: t0 + 301_000 }))
        .items,
    ).toHaveLength(1);
    // Someone else is not held back by it.
    const bob = await person(kit, 'bob');
    expect(
      (
        await chooseAds(sql(), {
          slot: 'phone_banner',
          viewer: { ...ANON, userId: bob.id },
          pepper: PEPPER,
          now: t0 + 100_000,
        })
      ).items,
    ).toHaveLength(1);
    // A capped slot is not given to a viewer it can not tell apart.
    expect(
      (await chooseAds(sql(), { slot: 'phone_banner', viewer: ANON, pepper: PEPPER, now: t0 }))
        .items,
    ).toEqual([]);
    // The gap is a setting.
    await kit.db.query(
      `update public.ad_slots set settings = '{"min_seconds_between": 60}'::jsonb where slot_id = 'phone_banner'`,
    );
    (await import('./slots')).resetAdCache();
    expect(
      (await chooseAds(sql(), { slot: 'phone_banner', viewer, pepper: PEPPER, now: t0 + 100_000 }))
        .items,
    ).toHaveLength(1);
  });

  it('a daily-capped slot shows at most its number a day', async () => {
    await campaign(kit, {
      house: true,
      slots: ['video_daily_summary'],
      creatives: [{ kind: 'video' }],
    });
    // Placed since the m6 join (the Daily Farm catch-up). Its seed setting is 1 a day.
    await slotOnDb(kit, 'video_daily_summary');
    await switches(kit, 'ads', 'video_ads');
    expect((await me()).ads).toEqual(['video_daily_summary']);
    const pat = await person(kit, 'pat');
    const viewer = { ...ANON, userId: pat.id };
    const pick1 = () =>
      chooseAds(sql(), { slot: 'video_daily_summary', viewer, pepper: PEPPER, now: Date.now() });
    expect((await pick1()).items).toHaveLength(1);
    await kit.db.query(
      `insert into public.ad_events (slot_id, kind, user_id) values ('video_daily_summary', 'view', $1)`,
      [pat.id],
    );
    expect((await pick1()).items).toEqual([]);
  });
});

// ---------------------------------------------------------------- the click redirect

describe('the click redirect', () => {
  const setup = async (spec: Partial<Parameters<typeof campaign>[1]> = {}) => {
    const c = await campaign(kit, { house: true, slots: ['summary_sponsor_card'], ...spec });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    return c;
  };
  const click = (id: string, query = 's=summary_sponsor_card', cookie?: string, address?: string) =>
    call(kit, clickRoute.GET, `/api/ads/click/${id}${query ? `?${query}` : ''}`, {
      cookie,
      address,
    });

  it('redirects to the link saved with the creative, counts the click, and sends no referrer', async () => {
    const c = await setup();
    const pat = await person(kit, 'pat');
    const res = await click(c.creatives[0]!, undefined, pat.full);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://example.com.au/offer');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await events('click')).toBe(1);
    const row = (
      await kit.db.query<{ slot_id: string; campaign_id: string; creative_id: string }>(
        `select * from public.ad_events`,
      )
    ).rows[0]!;
    expect(row).toMatchObject({
      slot_id: 'summary_sponsor_card',
      campaign_id: c.id,
      creative_id: c.creatives[0],
    });
  });

  it('is a plain 404 for an unknown id, a made-up id, a disabled creative, a switched-off ad and a missing or wrong slot', async () => {
    const c = await setup({ creatives: [{ headline: 'On' }, { headline: 'Off', active: false }] });
    expect((await click('00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await click('not-an-id')).status).toBe(404);
    expect((await click("1'; drop table x;--")).status).toBe(404);
    expect((await click(c.creatives[1]!)).status).toBe(404);
    expect((await click(c.creatives[0]!, '')).status).toBe(404);
    expect((await click(c.creatives[0]!, 's=nonsense')).status).toBe(404);
    // A slot this campaign does not run in.
    expect((await click(c.creatives[0]!, 's=pc_banner')).status).toBe(404);
    await kit.db.query('update public.campaigns set active = false');
    expect((await click(c.creatives[0]!)).status).toBe(404);
    await kit.db.query('update public.campaigns set active = true');
    await kit.db.query(`update public.ad_slots set enabled = false`);
    (await import('./slots')).resetAdCache();
    expect((await click(c.creatives[0]!)).status).toBe(404);
    expect(await events()).toBe(0);
    const body = await (await click('nope')).text();
    expect(body).toBe('{"error":"Not found."}');
  });

  it('never goes where the request says: a url in the query string is ignored', async () => {
    const c = await setup();
    for (const q of [
      's=summary_sponsor_card&url=https://evil.example',
      's=summary_sponsor_card&next=//evil.example',
      's=summary_sponsor_card&to=https%3A%2F%2Fevil.example',
      's=summary_sponsor_card&redirect=javascript:alert(1)',
    ]) {
      const res = await click(c.creatives[0]!, q);
      expect(res.headers.get('location')).toBe('https://example.com.au/offer');
    }
    // A path that tries to carry an address is not an id.
    expect((await click(encodeURIComponent('https://evil.example'))).status).toBe(404);
    expect((await click(`${c.creatives[0]}/../../x`)).status).toBe(404);
  });

  it('refuses a stored link that is not plain https, even if it got into the database another way', async () => {
    const c = await setup({ creatives: [{ link: null }] });
    // The table's own check refuses a non-https link.
    await expect(
      kit.db.query(`update public.ad_creatives set link_url = 'http://example.com.au'`),
    ).rejects.toThrow();
    await expect(
      kit.db.query(`update public.ad_creatives set link_url = 'javascript:alert(1)'`),
    ).rejects.toThrow();
    expect((await click(c.creatives[0]!)).status).toBe(404);
    for (const bad of [
      'https://user:pw@example.com.au/',
      'https://example/',
      'https://exa mple.com/',
      'ftp://example.com/',
      'https://example.com.au/\nx',
      '//example.com.au',
      'https:///x',
    ]) {
      expect(safeLink(bad), bad).toBeNull();
    }
    expect(safeLink('https://example.com.au/offer?utm_source=grazinggame')).toBe(
      'https://example.com.au/offer?utm_source=grazinggame',
    );
  });

  it('is rate limited by the database: past the limit the person still goes, but is not counted', async () => {
    const c = await setup();
    await kit.db.query(
      `update public.rate_limit_rules set max_count = 2 where action = 'ad_click'`,
    );
    const pat = await person(kit, 'pat');
    for (let i = 0; i < 4; i++)
      expect((await click(c.creatives[0]!, undefined, pat.full)).status).toBe(302);
    expect(await events('click')).toBe(2);
  });

  it('a link in a creative with no link has no click route to follow', async () => {
    const c = await setup({ creatives: [{ link: null }] });
    expect((await pick('summary_sponsor_card')).items[0]!.href).toBeNull();
    expect((await click(c.creatives[0]!)).status).toBe(404);
  });
});

// ---------------------------------------------------------------- view-count abuse

describe('view counts can not be inflated', () => {
  const setup = async () => {
    const c = await campaign(kit, {
      house: true,
      slots: ['summary_sponsor_card', 'video_between_years'],
      creatives: [{ kind: 'text' }],
    });
    await slotOnDb(kit, 'summary_sponsor_card');
    await switches(kit, 'ads');
    const pat = await person(kit, 'pat');
    return { c, viewer: { ...ANON, userId: pat.id }, pat };
  };
  const send = (
    viewer: Viewer,
    token: unknown,
    kind: unknown = 'view',
    now = Date.now() + 2000,
    key = 'k',
  ) => recordEvent(sql(), PEPPER, viewer, key, token, kind, now);

  it('a replayed beacon counts once, however many times it is sent', async () => {
    const { c, viewer } = await setup();
    const { token } = makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!);
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await send(viewer, token));
    expect(results.filter((r) => r.counted)).toHaveLength(1);
    expect(await events('view')).toBe(1);
    // Replayed from another player too: still one.
    const bob = await person(kit, 'bob');
    expect((await send({ ...ANON, userId: bob.id }, token)).counted).toBe(false);
    expect(await events('view')).toBe(1);
  });

  it('refuses a forged, tampered, malformed or expired token', async () => {
    const { c, viewer } = await setup();
    const { token } = makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!);
    const [body, sig] = token.split('.') as [string, string];
    const other = makeImpression(PEPPER, 'pc_banner', c.id, c.creatives[0]!).token.split('.')[0]!;
    for (const bad of [
      makeImpression(
        'another pepper'.padEnd(48, 'y'),
        'summary_sponsor_card',
        c.id,
        c.creatives[0]!,
      ).token,
      `${body}.${sig.slice(0, -2)}AA`,
      `${other}.${sig}`,
      body,
      `${body}.${sig}.${sig}`,
      '',
      null,
      42,
      { token },
      'x'.repeat(500),
    ]) {
      expect((await send(viewer, bad)).counted, String(bad).slice(0, 30)).toBe(false);
    }
    expect(readImpression(PEPPER, token, Date.now() + TOKEN_LIFE_MS + 5000)).toBeNull();
    expect((await send(viewer, token, 'view', Date.now() + TOKEN_LIFE_MS + 5000)).counted).toBe(
      false,
    );
    expect(readImpression(PEPPER, token)).not.toBeNull();
    expect(await events()).toBe(0);
  });

  it('refuses a view reported sooner than a second after the ad was chosen, and a click or a made-up kind', async () => {
    const { c, viewer } = await setup();
    const { token } = makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!);
    expect(await send(viewer, token, 'view', Date.now() + 100)).toEqual({
      counted: false,
      why: 'too_soon',
    });
    for (const kind of ['click', 'VIEW', 'video_complete', '', null, 7]) {
      expect((await send(viewer, token, kind)).counted, String(kind)).toBe(false);
    }
    expect(await events()).toBe(0);
  });

  it('a video end or skip needs a video slot and a view of the same showing first', async () => {
    const { c, viewer } = await setup();
    const v = await kit.db.query<{ id: string }>(
      `insert into public.ad_creatives (campaign_id, kind, media_path, media_mime, duration_s, headline)
       values ($1, 'video', 'p/x.mp4', 'video/mp4', 10, 'V') returning id`,
      [c.id],
    );
    await slotOnDb(kit, 'video_between_years');
    await switches(kit, 'video_ads');
    const { token } = makeImpression(PEPPER, 'video_between_years', c.id, v.rows[0]!.id);
    expect((await send(viewer, token, 'video_complete')).counted).toBe(false);
    expect((await send(viewer, token, 'view')).counted).toBe(true);
    expect((await send(viewer, token, 'video_complete')).counted).toBe(true);
    expect((await send(viewer, token, 'video_skip')).counted).toBe(true);
    expect((await send(viewer, token, 'video_skip')).counted).toBe(false);
    // A picture slot can not report a video end.
    const pic = makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!).token;
    expect((await send(viewer, pic, 'video_complete')).counted).toBe(false);
  });

  it('refuses a view for a slot that is now off, or a creative that was deleted', async () => {
    const { c, viewer } = await setup();
    const { token } = makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!);
    await kit.db.query('update public.ad_slots set enabled = false');
    (await import('./slots')).resetAdCache();
    expect((await send(viewer, token)).counted).toBe(false);
    await slotOnDb(kit, 'summary_sponsor_card');
    await kit.db.query('delete from public.ad_creatives');
    expect((await send(viewer, token)).counted).toBe(false);
    expect(await events()).toBe(0);
  });

  it('is limited by the database per viewer, and the limit is not the caller to choose', async () => {
    const { c, viewer } = await setup();
    await kit.db.query(`update public.rate_limit_rules set max_count = 3 where action = 'ad_view'`);
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push(
        await send(
          viewer,
          makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!).token,
        ),
      );
    }
    expect(out.filter((r) => r.counted)).toHaveLength(3);
    expect(out.filter((r) => !r.counted && r.why === 'limited')).toHaveLength(3);
    // Another account has its own count.
    const bob = await person(kit, 'bob');
    expect(
      (
        await send(
          { ...ANON, userId: bob.id },
          makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!).token,
        )
      ).counted,
    ).toBe(true);
    // A viewer with no account is counted by a hash of the address the server worked out, not by a header it sends.
    const subjects = await kit.db.query<{ subject: string }>(
      `select subject from public.rate_limit_hits where action = 'ad_view'`,
    );
    expect(subjects.rows.every((r) => /^(u|g|a):[0-9a-f-]+$/.test(r.subject))).toBe(true);
    for (let i = 0; i < 5; i++) {
      await send(
        ANON,
        makeImpression(PEPPER, 'summary_sponsor_card', c.id, c.creatives[0]!).token,
        'view',
        Date.now() + 2000,
        'same-address',
      );
    }
    const anon = await kit.db.query<{ hits: number }>(
      `select hits from public.rate_limit_hits where subject like 'a:%'`,
    );
    expect(anon.rows).toHaveLength(1);
    expect(anon.rows[0]!.hits).toBe(5);
  });

  it('the event route: only POST with JSON, same site, and a small body', async () => {
    const { c, pat } = await setup();
    const { token } = makeImpression(
      PEPPER,
      'summary_sponsor_card',
      c.id,
      c.creatives[0]!,
      Date.now() - 3000,
    );
    const post = (h: Record<string, string> = {}, body: unknown = { token, kind: 'view' }) =>
      call(kit, eventRoute.POST, '/api/ads/event', { body, cookie: pat.full, headers: h });
    expect((await post({ origin: 'https://evil.example' })).status).toBe(403);
    expect((await post({ 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await post({ 'content-type': 'text/plain' })).status).toBe(403);
    expect((await post({}, { token: 'x'.repeat(5000), kind: 'view' })).status).toBe(413);
    expect((await post({}, [1, 2])).status).toBe(400);
    expect(await events()).toBe(0);
    expect(await (await post()).json()).toEqual({ counted: true });
  });
});

// ---------------------------------------------------------------- the counts match the database

describe('the daily counts match the database, before and after the nightly roll-up', () => {
  it('rolled-up days come from ad_daily and later days from the events, never both', async () => {
    const { dailyCounts } = await import('./adminStore');
    const c = await campaign(kit, { house: true, slots: ['summary_sponsor_card'] });
    const ins = (daysAgo: number, kind: string, n: number) =>
      kit.db.query(
        `insert into public.ad_events (slot_id, campaign_id, kind, created_at)
         select 'summary_sponsor_card', $1, $2, (now() - ($3 || ' days')::interval)
           from generate_series(1, $4)`,
        [c.id, kind, String(daysAgo), n],
      );
    await ins(2, 'view', 3);
    await ins(1, 'view', 4);
    await ins(1, 'click', 1);
    await ins(0, 'view', 5);
    const direct = async () =>
      Number(
        (
          await kit.db.query<{ n: string }>(
            `select count(*) as n from public.ad_events where kind = 'view'`,
          )
        ).rows[0]!.n,
      );
    const total = async () => (await dailyCounts(sql())).reduce((n, r) => n + r.views, 0);
    expect(await total()).toBe(await direct());
    expect(await total()).toBe(12);
    // Roll up two days ago and yesterday, as the nightly job does.
    await kit.db.query(
      `select public.rollup_ad_events((now() at time zone 'Australia/Sydney')::date - 2)`,
    );
    await kit.db.query(
      `select public.rollup_ad_events((now() at time zone 'Australia/Sydney')::date - 1)`,
    );
    expect(await total()).toBe(12);
    expect((await dailyCounts(sql())).reduce((n, r) => n + r.clicks, 0)).toBe(1);
    // Raw events older than the roll-up go away; the counts do not change.
    await kit.db.query(
      `delete from public.ad_events where created_at < now() - interval '1 hour' and created_at > now() - interval '5 days'`,
    );
    expect(await total()).toBe(12);
    const days = await dailyCounts(sql(), { days: 30, campaignId: c.id });
    expect(days.map((d) => d.views).sort()).toEqual([3, 4, 5]);
  });
});

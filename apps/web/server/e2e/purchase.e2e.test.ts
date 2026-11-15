import type { PGlite } from '@electric-sql/pglite';
import { loadFarm, saveFarm, type SavedFarm } from '@gg/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { setPaymentsProvider } from '../billing/payments';
import { setRescueEngine } from '../billing/rescue';
import { gameRescueEngine } from '../billing/rescueEngine';
import { DbFarmStore } from '../db/dbstore';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { FakeAuth } from '../test-support/fakeAuth';
import { FakePayments } from '../test-support/fakePayments';
import { pgliteSql } from '../test-support/pgliteSql';

/*
 * Launch check (m5.5), flows 4 and 5: a purchase through the fake Stripe path and its refund, and
 * paying to keep going. The player signs up, plays and buys through the real route handlers. The
 * fake Stripe signs its webhooks with the same code the real check reads (billing/verify.ts), so
 * the signature check is the real one. What it can not prove is Stripe itself (see the m5.2 log).
 */

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Mod> = {};

let db: PGlite;
let auth: FakeAuth;
let pay: FakePayments;
let deps: AuthDeps;
let game: GameServer;
let ip = 0;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  routes.email = (await import('@/app/api/auth/email/route')) as Mod;
  routes.callback = (await import('@/app/auth/callback/route')) as Mod;
  routes.finish = (await import('@/app/api/auth/finish/route')) as Mod;
  routes.farm = (await import('@/app/api/game/farm/route')) as Mod;
  routes.day = (await import('@/app/api/game/day/route')) as Mod;
  routes.store = (await import('@/app/api/billing/store/route')) as Mod;
  routes.checkout = (await import('@/app/api/billing/checkout/route')) as Mod;
  routes.webhook = (await import('@/app/api/billing/webhook/route')) as Mod;
  routes.mine = (await import('@/app/api/billing/mine/route')) as Mod;
  routes.offer = (await import('@/app/api/billing/offer/route')) as Mod;
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  setPaymentsProvider(undefined);
  setRescueEngine(null);
  await db?.close();
});

beforeEach(async () => {
  await db.exec(
    `delete from public.stripe_events; delete from public.account_entitlements;
     delete from public.purchases; delete from public.farms; delete from public.guest_sessions;
     delete from auth.users;
     update public.feature_switches set enabled = true where key = 'signups_open';
     update public.products set active = false;
     update public.feature_switches set enabled = false where key = 'purchases';`,
  );
  resetRateLimits();
  resetSwitchCache();
  auth = new FakeAuth(db);
  pay = new FakePayments();
  deps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  setPaymentsProvider(pay);
  game = new GameServer({ store: new DbFarmStore(deps.sql), seed: () => 3, saveRetryMs: [0, 0] });
  setGameServer(game);
  setRescueEngine(null);
  ip++;
});

/** Claudia's part, done as the admin page would: purchases on, and these products for sale. */
async function sell(products: string[]): Promise<void> {
  await db.query(`update public.feature_switches set enabled = true where key = 'purchases'`);
  await db.query(`update public.products set active = (id = any($1::text[]))`, [products]);
  resetSwitchCache();
}

class Browser {
  cookies = new Map<string, string>();
  constructor(readonly address = `10.66.0.${ip}`) {}
  async call(route: string, method: 'GET' | 'POST', path: string, body?: unknown) {
    const req = new Request(`${HOST}${path}`, {
      method,
      headers: {
        host: 'localhost:3000',
        'x-real-ip': this.address,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookies.size
          ? { cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ') }
          : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await routes[route]![method]!(req);
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq);
      const value = pair!.slice(eq + 1);
      if (value === '' || attrs.some((a) => /max-age=0/i.test(a))) this.cookies.delete(name);
      else this.cookies.set(name, decodeURIComponent(value));
    }
    return res;
  }
}

async function signUp(email: string, username: string): Promise<{ b: Browser; id: string }> {
  const b = new Browser();
  expect((await b.call('email', 'POST', '/api/auth/email', { email })).status).toBe(200);
  const link = auth.sent[auth.sent.length - 1]!;
  const url = new URL(link.redirectTo);
  url.searchParams.set('code', link.code);
  expect((await b.call('callback', 'GET', `${url.pathname}${url.search}`)).status).toBe(303);
  const res = await b.call('finish', 'POST', '/api/auth/finish', { username, dob: '1985-06-15' });
  expect(res.status).toBe(200);
  expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  const id = (await db.query<{ id: string }>('select id from auth.users where email = $1', [email]))
    .rows[0]!.id;
  return { b, id };
}

/** Stripe sends a signed event to the webhook route. */
const hook = (e: { body: string; header: string }) =>
  routes.webhook!.POST!(
    new Request(`${HOST}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': e.header, 'x-real-ip': `10.67.0.${ip}` },
      body: e.body,
    }),
  );

/** Press Buy, pay on the hosted page, and have Stripe send the completed event. */
async function buyAndPay(b: Browser, product: string, farm?: string) {
  const res = await b.call(
    'checkout',
    'POST',
    '/api/billing/checkout',
    farm ? { product, farm } : { product },
  );
  expect(res.status).toBe(200);
  const out = (await res.json()) as { url: string; purchaseId: string };
  const sid = /\/pay\/(cs_test_[0-9a-f]+)$/.exec(out.url)?.[1];
  expect(sid).toBeTruthy();
  const paid = pay.pay(sid!);
  const answer = await hook(pay.completed(sid!));
  expect(answer.status).toBe(200);
  return { sid: sid!, paid, purchaseId: out.purchaseId };
}

const farmChoices = (name: string) => ({
  district: 'cq',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name,
});

interface Mine {
  owned: { farmSlots: { daily: number; fast: number }; noAds: boolean };
  purchases: { status: string }[];
}

describe('launch flow 4: a purchase and its refund', () => {
  it('the pack lifts the farm limit and removes ads; a full refund takes both back', async () => {
    await sell(['farm_pack', 'farm_pack_no_ads', 'upgrade_no_ads']);
    const { b } = await signUp('launch.buyer@example.test', 'launch_buyer');

    // Before: two Fast Farms, and the third is refused.
    for (const name of ['A', 'B']) {
      expect((await b.call('farm', 'POST', '/api/game/farm', farmChoices(name))).status).toBe(200);
    }
    expect((await b.call('farm', 'POST', '/api/game/farm', farmChoices('C'))).status).toBe(409);
    const before = (await (await b.call('mine', 'GET', '/api/billing/mine')).json()) as Mine;
    expect(before.owned).toMatchObject({ farmSlots: { fast: 2 }, noAds: false });

    // The store lists the pack with its price.
    const store = (await (await b.call('store', 'GET', '/api/billing/store')).json()) as {
      selling: boolean;
      items: { id: string; priceText: string }[];
    };
    expect(store.selling).toBe(true);
    expect(store.items.find((i) => i.id === 'farm_pack_no_ads')!.priceText).toBe(
      'A$50, GST included',
    );

    // Buy and pay. The price comes from the product table, not the browser.
    const bought = await buyAndPay(b, 'farm_pack_no_ads');
    expect(pay.sessions.get(bought.sid)!.req.amountCents).toBe(5000);
    const after = (await (await b.call('mine', 'GET', '/api/billing/mine')).json()) as Mine;
    expect(after.owned).toMatchObject({ farmSlots: { daily: 5, fast: 5 }, noAds: true });
    expect(after.purchases[0]!.status).toBe('paid');
    expect((await b.call('farm', 'POST', '/api/game/farm', farmChoices('C'))).status).toBe(200);

    // A full refund from Stripe takes the pack away again.
    expect((await hook(pay.refunded(bought.paid.intent))).status).toBe(200);
    const refunded = (await (await b.call('mine', 'GET', '/api/billing/mine')).json()) as Mine;
    expect(refunded.owned).toMatchObject({ farmSlots: { fast: 2 }, noAds: false });
    expect(refunded.purchases[0]!.status).toBe('refunded');
    expect((await b.call('farm', 'POST', '/api/game/farm', farmChoices('D'))).status).toBe(409);
  }, 240_000);
});

describe('launch flow 5: paying to keep going', () => {
  it('a farm the bank took opens again on the same day, stock sold and the cash the card named', async () => {
    setRescueEngine(gameRescueEngine(game, () => deps.sql));
    await sell(['keep_going_fast']);
    const { b, id: userId } = await signUp('launch.rescue@example.test', 'launch_rescue');
    const made = await b.call('farm', 'POST', '/api/game/farm', farmChoices('Rescued'));
    expect(made.status).toBe(200);
    const farmId = (
      await db.query<{ id: string }>('select id from public.farms where owner_id = $1', [userId])
    ).rows[0]!.id;

    // The set-up no route can do in a test: the farm's cash a dollar past the bank's limit.
    const saved = await db.query<{ save: SavedFarm }>(
      'select save from public.farm_saves where farm_id = $1',
      [farmId],
    );
    const broke = loadFarm(saved.rows[0]!.save);
    broke.cash = broke.broke + 1;
    await db.query(
      'update public.farm_saves set save = $2::jsonb, rev = rev + 1 where farm_id = $1',
      [farmId, JSON.stringify(saveFarm(broke))],
    );

    // Next day: the bank takes the farm.
    const open = (await (await b.call('farm', 'GET', '/api/game/farm')).json()) as {
      snapshot: { farmVersion: string };
    };
    const day = await b.call('day', 'POST', '/api/game/day', {
      version: open.snapshot.farmVersion,
    });
    expect(day.status).toBe(200);
    type Snap = {
      over: string | null;
      day: number;
      date: unknown;
      farmVersion: string;
      totals: { head: number; calves: number; cash: number };
    };
    const ended = ((await day.json()) as { snapshot: Snap }).snapshot;
    expect(ended.over).not.toBeNull();
    expect(ended.totals.head).toBeGreaterThan(0);

    // The offer card.
    const offerRes = await b.call('offer', 'GET', `/api/billing/offer?farm=${farmId}`);
    expect(offerRes.status).toBe(200);
    const offer = (
      (await offerRes.json()) as {
        offer: { productId: string; priceText: string; does: string[]; cashAfter: number } | null;
      }
    ).offer!;
    expect(offer.productId).toBe('keep_going_fast');
    const card = offer.does.join(' ');
    expect(card).toContain(
      `Your stock (${(ended.totals.head + ended.totals.calves).toLocaleString('en-AU')} head) is sold first to pay the debt.`,
    );
    expect(card).toMatch(/opens again on the day it ended/);

    // Pay. The webhook applies the rescue.
    await buyAndPay(b, 'keep_going_fast', farmId);

    // Exactly what the card said.
    const back = (
      (await (await b.call('farm', 'GET', '/api/game/farm')).json()) as {
        snapshot: Snap;
      }
    ).snapshot;
    expect(back.over).toBeNull();
    expect(back.totals.head).toBe(0);
    expect(back.totals.cash).toBe(offer.cashAfter);
    expect(back.day).toBe(ended.day);
    expect(back.date).toEqual(ended.date);
    const row = await db.query<{ status: string; continued: boolean; rescue_count: number }>(
      'select status, continued, rescue_count from public.farms where id = $1',
      [farmId],
    );
    expect(row.rows[0]).toMatchObject({ status: 'active', continued: true, rescue_count: 1 });

    // And it plays on.
    const next = await b.call('day', 'POST', '/api/game/day', { version: back.farmVersion });
    expect(next.status).toBe(200);
    expect(((await next.json()) as { snapshot: Snap }).snapshot.day).toBe(ended.day + 1);
  }, 240_000);
});

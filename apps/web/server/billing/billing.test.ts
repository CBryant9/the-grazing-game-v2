import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { DbFarmStore } from '../db/dbstore';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { FakePayments } from '../test-support/fakePayments';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { setPaymentsProvider } from './payments';
import { setRescueEngine, type RescueEngine, type RescueFarm } from './rescue';
import { handleWebhook } from './webhook';
import { purchasesOverview, reconcilePurchase, refundPurchase, setProductActive } from './admin';
import { MIN_PURCHASE_AGE, hasNoAds } from './products';
import { signStripePayload, verifyStripeSignature } from './verify';
import { parseEvent } from './events';
import { encodeForm } from './stripe';
import { AdminError } from '../admin/errors';

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
const web = fileURLToPath(new URL('../../', import.meta.url));

type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler };
const modules = import.meta.glob('../../app/api/billing/**/route.ts');
const adminModules = import.meta.glob('../../app/api/admin/purchases/route.ts');
const routes: Record<string, Mod> = {};
let adminPurchases: Mod;
let dataRoute: Mod;
let deleteRoute: Mod;

let db: PGlite;
let auth: FakeAuth;
let pay: FakePayments;
let deps: AuthDeps;
let ip = 0;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  for (const [file, load] of Object.entries(modules)) {
    routes[file.replace('../../app/api/billing/', '').replace('/route.ts', '')] =
      (await load()) as Mod;
  }
  adminPurchases = (await Object.values(adminModules)[0]!()) as Mod;
  dataRoute = (await import('@/app/api/account/data/route')) as Mod;
  deleteRoute = (await import('@/app/api/account/delete/route')) as Mod;
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  setPaymentsProvider(undefined);
  setRescueEngine(null);
  await db?.close();
});

interface Person {
  id: string;
  cookie: string;
  username: string;
}

async function person(
  key: string,
  opts: { role?: string; ageYears?: number; banned?: boolean; suspended?: boolean } = {},
): Promise<Person> {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`);
  const username = `u_${key}`.slice(0, 20);
  await db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
    user.id,
    username,
  ]);
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
    [user.id, String(opts.ageYears ?? 30)],
  );
  await db.query(
    `insert into public.account_status (user_id, role, suspended_until, banned_at) values ($1, $2, $3, $4)`,
    [
      user.id,
      opts.role ?? 'player',
      opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
      opts.banned ? new Date().toISOString() : null,
    ],
  );
  return { id: user.id, cookie, username };
}

const sell = async (
  on: boolean,
  products: string[] = ['farm_pack', 'farm_pack_no_ads', 'upgrade_no_ads'],
) => {
  await db.query(`update public.feature_switches set enabled = $1 where key = 'purchases'`, [on]);
  await db.query(`update public.products set active = (id = any($1::text[]))`, [products]);
  resetSwitchCache();
};

beforeEach(async () => {
  await db.exec(
    `delete from public.stripe_events; delete from public.account_entitlements;
     delete from public.purchases; truncate public.admin_audit_log;
     update public.account_status set banned_at = null, suspended_until = null;
     delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     delete from public.ban_records; delete from public.signup_refusals;
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
  setRescueEngine(null);
  setGameServer(
    new GameServer({ store: new DbFarmStore(deps.sql), seed: () => 3, saveRetryMs: [0, 0] }),
  );
  ip++;
});

function req(
  route: string,
  method: 'GET' | 'POST',
  who: Person | null,
  body?: unknown,
  headers: Record<string, string> = {},
  query = '',
): Request {
  return new Request(`${HOST}/api/billing/${route}${query}`, {
    method,
    headers: {
      host: 'localhost:3000',
      'x-real-ip': `10.7.0.${ip}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(who ? { cookie: who.cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const get = (route: string, who: Person | null, query = '') =>
  routes[route]!.GET!(req(route, 'GET', who, undefined, {}, query));
const post = (route: string, who: Person | null, body: unknown, headers = {}) =>
  routes[route]!.POST!(req(route, 'POST', who, body, headers));

const hook = (e: { body: string; header: string }) =>
  routes.webhook!.POST!(
    new Request(`${HOST}/api/billing/webhook`, {
      method: 'POST',
      headers: { 'stripe-signature': e.header, 'x-real-ip': `10.8.0.${ip}` },
      body: e.body,
    }),
  );

/** The player presses Buy, and the one open purchase row and session are returned. */
async function buy(who: Person, product: string, farm?: string) {
  const res = await post('checkout', who, farm ? { product, farm } : { product });
  const text = await res.json();
  const row = (
    await db.query<{ id: string; stripe_checkout_session_id: string | null; amount_cents: number }>(
      `select id, stripe_checkout_session_id, amount_cents from public.purchases
        where user_id = $1 and product_id = $2 order by created_at desc limit 1`,
      [who.id, product],
    )
  ).rows[0];
  return { res, text, row };
}

/** Buy, pay on Stripe's page, and have Stripe send the event. */
async function buyAndPay(who: Person, product: string, farm?: string) {
  const b = await buy(who, product, farm);
  expect(b.res.status).toBe(200);
  const sid = b.row!.stripe_checkout_session_id!;
  const paid = pay.pay(sid);
  const e = pay.completed(sid);
  const answer = await hook(e);
  return { ...b, sid, paid, e, answer };
}

const status = async (id: string) =>
  (await db.query<{ status: string }>('select status from public.purchases where id = $1', [id]))
    .rows[0]!.status;
const owns = async (id: string) =>
  (
    await db.query<{ entitlement: string }>(
      'select entitlement from public.account_entitlements where user_id = $1 and revoked_at is null order by 1',
      [id],
    )
  ).rows.map((r) => r.entitlement);
const insertFarm = (owner: string, mode: 'fast' | 'daily', name = 'F') =>
  db.query(
    `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, timezone, sim_through)
     values ($1, $2, $3, 'cq', 'small', 100, 'grazing', 'scratch', 'easy', 'e1', case when $2 = 'daily' then 'Australia/Sydney' end, case when $2 = 'daily' then current_date end)`,
    [owner, mode, name],
  );

// ---------------------------------------------------------------- the whole flow

describe('a purchase, from the button to what the account owns', () => {
  it('A test purchase lifts the farm limit and removes ads', async () => {
    await sell(true);
    const pat = await person('pat');
    // Before: two Fast Farms is the most, and ads show.
    await insertFarm(pat.id, 'fast', 'A');
    await insertFarm(pat.id, 'fast', 'B');
    await expect(insertFarm(pat.id, 'fast', 'C')).rejects.toThrow(/farm_limit/);
    expect(await hasNoAds(deps.sql, pat.id)).toBe(false);

    const store = (await (await get('store', pat)).json()) as {
      selling: boolean;
      items: { id: string; priceText: string; confirm: string }[];
    };
    expect(store.selling).toBe(true);
    const item = store.items.find((i) => i.id === 'farm_pack_no_ads')!;
    expect(item.priceText).toBe('A$50, GST included');
    expect(item.confirm).toMatch(/A\$50/);

    const b = await buyAndPay(pat, 'farm_pack_no_ads');
    // The charge came from the product table (5000 cents), not from the browser.
    expect(pay.sessions.get(b.sid)!.req.amountCents).toBe(5000);
    expect(b.row!.amount_cents).toBe(5000);
    expect(b.answer.status).toBe(200);
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toEqual(['farm_pack', 'full_diary', 'no_ads', 'supporter_badge']);

    // After: five of each farm, and no ads.
    await insertFarm(pat.id, 'fast', 'C');
    await insertFarm(pat.id, 'fast', 'D');
    await insertFarm(pat.id, 'fast', 'E');
    await expect(insertFarm(pat.id, 'fast', 'F')).rejects.toThrow(/farm_limit/);
    expect(await hasNoAds(deps.sql, pat.id)).toBe(true);
    const mine = (await (await get('mine', pat)).json()) as {
      owned: { farmSlots: { daily: number; fast: number }; noAds: boolean };
      purchases: { status: string }[];
    };
    expect(mine.owned).toMatchObject({ farmSlots: { daily: 5, fast: 5 }, noAds: true });
    expect(mine.purchases[0]!.status).toBe('paid');
    // The Stripe customer id is kept, and no personal detail from the event is stored anywhere.
    const cust = await db.query(
      'select stripe_customer_id from public.stripe_customers where user_id = $1',
      [pat.id],
    );
    expect(cust.rows).toHaveLength(1);
    const dump = JSON.stringify((await db.query('select * from public.stripe_events')).rows);
    expect(dump).not.toMatch(/buyer\.secret|Buyer Secret/);
  });

  it('the pack alone keeps ads, and the upgrade then removes them', async () => {
    await sell(true);
    const pat = await person('pat');
    await buyAndPay(pat, 'farm_pack');
    expect(await owns(pat.id)).toEqual(['farm_pack', 'full_diary', 'supporter_badge']);
    expect(await hasNoAds(deps.sql, pat.id)).toBe(false);
    // Already has the pack: the second pack is refused, the upgrade is the one to buy.
    expect((await post('checkout', pat, { product: 'farm_pack_no_ads' })).status).toBe(409);
    await buyAndPay(pat, 'upgrade_no_ads');
    expect(await hasNoAds(deps.sql, pat.id)).toBe(true);
    expect((await post('checkout', pat, { product: 'upgrade_no_ads' })).status).toBe(409);
  });

  it('the upgrade is refused to an account with no pack', async () => {
    await sell(true);
    const pat = await person('pat');
    expect((await post('checkout', pat, { product: 'upgrade_no_ads' })).status).toBe(409);
  });

  it('the return from Checkout grants nothing: the status route only reads what the webhook wrote', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    pay.pay(b.row!.stripe_checkout_session_id!);
    // The buyer is back on the success page, but no event has arrived.
    const s = (await (await get('status', pat, `?purchase=${b.row!.id}`)).json()) as {
      status: string;
      owned: { farmPack: boolean };
    };
    expect(s.status).toBe('pending');
    expect(s.owned.farmPack).toBe(false);
    expect(await owns(pat.id)).toEqual([]);
    // Someone else's purchase is not found.
    const other = await person('other');
    expect((await get('status', other, `?purchase=${b.row!.id}`)).status).toBe(404);
  });

  it('a double click or a retried request makes one purchase and one session', async () => {
    await sell(true);
    const pat = await person('pat');
    const [a, c] = await Promise.all([
      post('checkout', pat, { product: 'farm_pack' }),
      post('checkout', pat, { product: 'farm_pack' }),
    ]);
    expect([a.status, c.status]).toEqual([200, 200]);
    const again = await post('checkout', pat, { product: 'farm_pack' });
    expect(((await again.json()) as { reused: boolean }).reused).toBe(true);
    const rows = await db.query('select 1 from public.purchases where user_id = $1', [pat.id]);
    expect(rows.rows).toHaveLength(1);
    expect(pay.sessions.size).toBe(1);
  });

  it('a stale open checkout is finished and a new one is made; a paid-but-unconfirmed one shows the waiting page', async () => {
    await sell(true);
    const pat = await person('pat');
    const first = await buy(pat, 'farm_pack');
    pay.expire(first.row!.stripe_checkout_session_id!);
    const second = await buy(pat, 'farm_pack');
    expect(second.res.status).toBe(200);
    expect(second.row!.id).not.toBe(first.row!.id);
    expect(await status(first.row!.id)).toBe('failed');
    pay.pay(second.row!.stripe_checkout_session_id!);
    const third = await post('checkout', pat, { product: 'farm_pack' });
    expect(((await third.json()) as { url: string }).url).toContain('/purchase/success?purchase=');
  });

  it('the browser can not choose the price: extra fields are ignored', async () => {
    await sell(true);
    const pat = await person('pat');
    const res = await post('checkout', pat, {
      product: 'farm_pack',
      price: 1,
      amount: 1,
      amountCents: 1,
    });
    expect(res.status).toBe(200);
    const s = [...pay.sessions.values()][0]!;
    expect(s.req.amountCents).toBe(3000);
    expect(s.req.currency).toBe('aud');
  });

  it('sends the buyer back to this site and gives Stripe an idempotency key', async () => {
    await sell(true);
    const pat = await person('pat');
    await buy(pat, 'farm_pack');
    const s = [...pay.sessions.values()][0]!;
    expect(s.req.successUrl).toMatch(
      /^http:\/\/localhost:3000\/purchase\/success\?purchase=[0-9a-f-]{36}$/,
    );
    expect(s.req.cancelUrl).toMatch(/\/purchase\/cancelled\?purchase=/);
    expect(s.req.idempotencyKey).toBe(`purchase-${s.req.purchaseId}`);
  });
});

// ---------------------------------------------------------------- who can buy, and when

describe('who can buy, and when', () => {
  it('signed out: refused with a 401, nothing is made', async () => {
    await sell(true);
    expect((await post('checkout', null, { product: 'farm_pack' })).status).toBe(401);
    expect(pay.createCalls).toBe(0);
  });

  it('under 16, banned, suspended and an unfinished sign-up are refused with a plain reason', async () => {
    await sell(true);
    const kid = await person('kid', { ageYears: 15 });
    const banned = await person('banned', { banned: true });
    const susp = await person('susp', { suspended: true });
    const { user, cookie } = await auth.signInAs('nosignup@example.test');
    const nosignup = { id: user.id, cookie, username: 'x' };
    for (const who of [kid, banned, susp, nosignup]) {
      const res = await post('checkout', who, { product: 'farm_pack' });
      expect(res.status, who.username).toBe(403);
    }
    expect(pay.createCalls).toBe(0);
    const store = (await (await get('store', kid)).json()) as { cannotBuy: string };
    expect(store.cannotBuy).toMatch(/18 and over/);
    const rows = await db.query('select 1 from public.purchases');
    expect(rows.rows).toHaveLength(0);
  });

  it('buying is for 18 and over until a lawyer says otherwise: 17 is refused with the age in the words, 18 can buy', async () => {
    await sell(true);
    const teen = await person('teen', { ageYears: 17 });
    const no = await post('checkout', teen, { product: 'farm_pack' });
    expect(no.status).toBe(403);
    expect(((await no.json()) as { error: string }).error).toBe(
      `Buying is for accounts of ${MIN_PURCHASE_AGE} and over.`,
    );
    expect(MIN_PURCHASE_AGE).toBe(18);
    const adult = await person('adult18', { ageYears: 18 });
    expect((await post('checkout', adult, { product: 'farm_pack' })).status).toBe(200);
  });

  it('switch off: nothing is for sale, no item is listed, and checkout refuses with a plain 404', async () => {
    await sell(false);
    const pat = await person('pat');
    const store = (await (await get('store', pat)).json()) as {
      selling: boolean;
      items: unknown[];
    };
    expect(store).toMatchObject({ selling: false, items: [] });
    const res = await post('checkout', pat, { product: 'farm_pack' });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toMatch(/Nothing is for sale/);
    expect(pay.createCalls).toBe(0);
  });

  it('switch on but the product is off: not for sale', async () => {
    await sell(true, ['farm_pack']);
    const pat = await person('pat');
    const store = (await (await get('store', pat)).json()) as { items: { id: string }[] };
    expect(store.items.map((i) => i.id)).toEqual(['farm_pack']);
    expect((await post('checkout', pat, { product: 'farm_pack_no_ads' })).status).toBe(404);
    expect((await post('checkout', pat, { product: 'does_not_exist' })).status).toBe(404);
    expect((await post('checkout', pat, { product: 42 })).status).toBe(400);
  });

  it('no keys: every route answers cleanly, no 5xx, and the webhook is a plain 404', async () => {
    await sell(true);
    setPaymentsProvider(null);
    const pat = await person('pat');
    expect(((await (await get('store', pat)).json()) as { selling: boolean }).selling).toBe(false);
    expect((await post('checkout', pat, { product: 'farm_pack' })).status).toBe(404);
    expect((await get('status', pat, '?purchase=x')).status).toBeLessThan(500);
    expect((await get('mine', pat)).status).toBe(200);
    expect((await get('receipt', pat, '?purchase=x')).status).toBe(404);
    expect(
      ((await (await get('offer', pat, `?farm=${pat.id}`)).json()) as { offer: unknown }).offer,
    ).toBeNull();
    const e = pay.signed('checkout.session.completed', { id: 'cs_test_x' });
    expect((await hook(e)).status).toBe(404);
  });

  it('no accounts at all: every route answers cleanly', async () => {
    setAuthDeps(null);
    expect(((await (await get('store', null)).json()) as { selling: boolean }).selling).toBe(false);
    expect((await post('checkout', null, { product: 'farm_pack' })).status).toBe(404);
    expect(((await (await get('mine', null)).json()) as { available: boolean }).available).toBe(
      false,
    );
    expect((await get('status', null)).status).toBe(404);
    expect((await hook(pay.signed('x.y', {}))).status).toBe(404);
  });

  it('a signed-out visitor sees the store listing but is told to sign in', async () => {
    await sell(true);
    const store = (await (await get('store', null)).json()) as {
      selling: boolean;
      signedIn: boolean;
      cannotBuy: string;
      items: unknown[];
    };
    expect(store.selling).toBe(true);
    expect(store.signedIn).toBe(false);
    expect(store.cannotBuy).toBe('Sign in to buy.');
    expect(store.items).toHaveLength(3);
  });

  it('a provider that is down is a plain 503 and leaves nothing charged, then the retry works', async () => {
    await sell(true);
    const pat = await person('pat');
    pay.fail.create = true;
    const res = await post('checkout', pat, { product: 'farm_pack' });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toMatch(/stripe is down/);
    pay.fail.create = false;
    expect((await post('checkout', pat, { product: 'farm_pack' })).status).toBe(200);
    const rows = await db.query('select 1 from public.purchases where user_id = $1', [pat.id]);
    expect(rows.rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------- the webhook

describe('the webhook', () => {
  it('refuses a bad signature, a missing one, a wrong secret and a changed body, and changes nothing', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    pay.pay(b.row!.stripe_checkout_session_id!);
    const good = pay.completed(b.row!.stripe_checkout_session_id!);
    const bad = [
      { body: good.body, header: 't=1,v1=' + '0'.repeat(64) },
      { body: good.body, header: '' },
      {
        body: good.body,
        header: signStripePayload(good.body, 'whsec_other', Math.floor(Date.now() / 1000)),
      },
      { body: good.body.replace('"amount_total":3000', '"amount_total":1'), header: good.header },
      { body: good.body, header: 'garbage' },
    ];
    for (const e of bad) {
      const res = await hook(e);
      expect(res.status).toBe(400);
    }
    expect(await status(b.row!.id)).toBe('pending');
    expect(await owns(pat.id)).toEqual([]);
    expect((await db.query('select 1 from public.stripe_events')).rows).toHaveLength(0);
  });

  it('refuses a validly signed event that is too old or too far ahead', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    pay.pay(sid);
    const now = Math.floor(Date.now() / 1000);
    expect((await hook(pay.completed(sid, {}, { at: now - 301 }))).status).toBe(400);
    expect((await hook(pay.completed(sid, {}, { at: now + 301 }))).status).toBe(400);
    expect(await status(b.row!.id)).toBe('pending');
    expect((await hook(pay.completed(sid, {}, { at: now - 200 }))).status).toBe(200);
    expect(await status(b.row!.id)).toBe('paid');
  });

  it('checks the signature exactly as Stripe describes: other entries ignored, any v1 may match', () => {
    const body = '{"a":1}';
    const secret = 'whsec_x';
    const t = 1_800_000_000;
    const good = signStripePayload(body, secret, t).split(',')[1]!;
    const ok = (h: string) => verifyStripeSignature(body, h, secret, t + 10).ok;
    expect(ok(`t=${t},${good}`)).toBe(true);
    expect(ok(`v0=${'a'.repeat(64)},t=${t},v1=${'b'.repeat(64)},${good},secret=x,payload=y`)).toBe(
      true,
    );
    expect(ok(`t=${t},v0=${good.slice(3)}`)).toBe(false);
    expect(ok(`t=${t},v1=${'b'.repeat(64)}`)).toBe(false);
    expect(verifyStripeSignature(body, `t=${t},${good}`, secret, t + 301).ok).toBe(false);
    expect(verifyStripeSignature(body + ' ', `t=${t},${good}`, secret, t).ok).toBe(false);
  });

  it('a replay does nothing: the event id is recorded once', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    const before = await db.query(
      'select granted_at from public.account_entitlements where user_id = $1',
      [pat.id],
    );
    const again = await hook(b.e);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { result: string }).result).toBe('replay');
    const after = await db.query(
      'select granted_at from public.account_entitlements where user_id = $1',
      [pat.id],
    );
    expect(after.rows).toEqual(before.rows);
    expect((await db.query('select 1 from public.stripe_events')).rows).toHaveLength(1);
    // A second event for the same payment (Stripe's "two separate events" case) changes nothing either.
    const dup = await hook(pay.completed(b.sid));
    expect(dup.status).toBe(200);
    expect(await owns(pat.id)).toHaveLength(3);
  });

  it('records ids only: no email, name or card detail reaches the events table', async () => {
    await sell(true);
    const pat = await person('pat');
    await buyAndPay(pat, 'farm_pack');
    const row = (await db.query<Record<string, unknown>>('select * from public.stripe_events'))
      .rows[0]!;
    expect(Object.keys(row).sort()).toEqual([
      'created_at',
      'error',
      'id',
      'object_id',
      'payment_intent_id',
      'processed_at',
      'received_at',
      'stripe_customer_id',
      'type',
      'updated_at',
    ]);
    expect(JSON.stringify(row)).not.toMatch(/@|Secret/);
  });

  it('a wrong amount gives nothing and the purchase says failed', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    pay.pay(sid);
    const res = await hook(pay.completed(sid, { amount_total: 100 }));
    expect(res.status).toBe(200);
    expect(await status(b.row!.id)).toBe('failed');
    expect(await owns(pat.id)).toEqual([]);
    const ev = await db.query<{ error: string }>('select error from public.stripe_events');
    expect(ev.rows[0]!.error).toBe('amount_mismatch');
  });

  it('a wrong currency gives nothing', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    pay.pay(sid);
    await hook(pay.completed(sid, { currency: 'usd' }));
    expect(await status(b.row!.id)).toBe('failed');
    expect(await owns(pat.id)).toEqual([]);
  });

  it('metadata that names another product or purchase gives nothing; metadata alone never grants', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    pay.pay(sid);
    await hook(
      pay.completed(sid, { metadata: { product_id: 'farm_pack_no_ads', purchase_id: b.row!.id } }),
    );
    expect(await status(b.row!.id)).toBe('failed');
    expect(await owns(pat.id)).toEqual([]);
    // An event for a session this server never made, naming a real product, is recorded and ignored.
    const forged = pay.signed('checkout.session.completed', {
      id: 'cs_test_forged',
      amount_total: 5000,
      currency: 'aud',
      payment_status: 'paid',
      payment_intent: 'pi_forged',
      metadata: { product_id: 'farm_pack_no_ads', purchase_id: b.row!.id },
    });
    expect((await hook(forged)).status).toBe(200);
    expect(await owns(pat.id)).toEqual([]);
    // And one that names a product that does not exist.
    const unknown = pay.signed('checkout.session.completed', {
      id: 'cs_test_unknown',
      amount_total: 1,
      currency: 'aud',
      payment_status: 'paid',
      metadata: { product_id: 'free_everything' },
    });
    expect((await hook(unknown)).status).toBe(200);
    expect(await owns(pat.id)).toEqual([]);
  });

  it('an unknown event type is recorded and acknowledged, and changes nothing', async () => {
    const e = pay.signed('customer.subscription.updated', { id: 'sub_1' });
    const res = await hook(e);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { result: string }).result).toBe('ignored');
    expect((await db.query('select type from public.stripe_events')).rows).toEqual([
      { type: 'customer.subscription.updated' },
    ]);
  });

  it('a body that is not an event, or has no usable id, is a 400', async () => {
    const notJson = {
      body: 'nope',
      header: signStripePayload('nope', pay.webhookSecret, Math.floor(Date.now() / 1000)),
    };
    expect((await hook(notJson)).status).toBe(400);
    const noId = pay.signed('charge.refunded', {}, { id: 'bad id!' });
    expect((await hook(noId)).status).toBe(400);
    expect(parseEvent(null)).toBeNull();
  });

  it('a payment that is not paid yet grants nothing; the async success event does', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    const p = pay.pay(sid);
    await hook(pay.completed(sid, { payment_status: 'unpaid' }));
    expect(await status(b.row!.id)).toBe('pending');
    expect(await owns(pat.id)).toEqual([]);
    const late = pay.signed('checkout.session.async_payment_succeeded', {
      id: sid,
      amount_total: 3000,
      currency: 'aud',
      payment_status: 'paid',
      payment_intent: p.intent,
      metadata: { purchase_id: b.row!.id, product_id: 'farm_pack' },
    });
    await hook(late);
    expect(await status(b.row!.id)).toBe('paid');
  });

  it('an expired or failed checkout finishes the purchase and never touches a paid one', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    await hook(pay.signed('checkout.session.expired', { id: sid }));
    expect(await status(b.row!.id)).toBe('failed');
    const c = await buyAndPay(pat, 'farm_pack');
    await hook(pay.signed('checkout.session.expired', { id: c.sid }));
    expect(await status(c.row!.id)).toBe('paid');
  });

  it('a database failure is a 500, so Stripe sends the event again, and nothing is half written', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    pay.pay(sid);
    const e = pay.completed(sid);
    const broken = {
      query: deps.sql.query,
      transaction: <T>(fn: Parameters<typeof deps.sql.transaction<T>>[0]) =>
        deps.sql.transaction((tx) =>
          fn({
            query: (text, params) =>
              /insert into public\.account_entitlements/.test(text)
                ? Promise.reject(new Error('disk full'))
                : tx.query(text, params),
          }),
        ),
    };
    const res = await handleWebhook({ sql: broken as typeof deps.sql }, pay, e.body, e.header);
    expect(res.status).toBe(500);
    expect(await status(b.row!.id)).toBe('pending');
    expect((await db.query('select 1 from public.stripe_events')).rows).toHaveLength(0);
    expect((await hook(e)).status).toBe(200);
    expect(await status(b.row!.id)).toBe('paid');
  });
});

// ---------------------------------------------------------------- refunds, disputes, order

describe('refunds and disputes', () => {
  it('a full refund takes the entitlement away; a part refund does not', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack_no_ads');
    await hook(pay.refunded(b.paid.intent, { full: false }));
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(4);
    await hook(pay.refunded(b.paid.intent));
    expect(await status(b.row!.id)).toBe('refunded');
    expect(await owns(pat.id)).toEqual([]);
    expect(await hasNoAds(deps.sql, pat.id)).toBe(false);
    // Back to two farms.
    await insertFarm(pat.id, 'fast', 'A');
    await insertFarm(pat.id, 'fast', 'B');
    await expect(insertFarm(pat.id, 'fast', 'C')).rejects.toThrow(/farm_limit/);
  });

  it('a dispute takes it away, and a dispute won gives it back; one lost keeps it away', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    await hook(pay.dispute(b.paid.intent, 'charge.dispute.created', 'needs_response'));
    expect(await status(b.row!.id)).toBe('disputed');
    expect(await owns(pat.id)).toEqual([]);
    await hook(pay.dispute(b.paid.intent, 'charge.dispute.closed', 'lost'));
    expect(await status(b.row!.id)).toBe('disputed');
    await hook(pay.dispute(b.paid.intent, 'charge.dispute.closed', 'won'));
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(3);
  });

  it('a refund that arrives before the payment is known waits, and is applied when the payment arrives', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    const p = pay.pay(sid);
    // The refund event comes first, and Stripe's own state already says refunded.
    pay.states.set(p.intent, { fullyRefunded: true, disputed: false, receiptUrl: null });
    expect((await hook(pay.refunded(p.intent))).status).toBe(200);
    const waiting = await db.query<{ processed_at: string | null; error: string }>(
      'select processed_at, error from public.stripe_events',
    );
    expect(waiting.rows[0]).toMatchObject({ processed_at: null, error: 'waiting_for_purchase' });
    expect(await status(b.row!.id)).toBe('pending');
    // Then the completed event.
    await hook(pay.completed(sid));
    expect(await status(b.row!.id)).toBe('refunded');
    expect(await owns(pat.id)).toEqual([]);
    const done = await db.query('select 1 from public.stripe_events where processed_at is null');
    expect(done.rows).toHaveLength(0);
  });

  it('a dispute before the payment is known waits the same way', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const sid = b.row!.stripe_checkout_session_id!;
    const p = pay.pay(sid);
    pay.states.set(p.intent, { fullyRefunded: false, disputed: true, receiptUrl: null });
    await hook(pay.dispute(p.intent, 'charge.dispute.created', 'needs_response'));
    await hook(pay.completed(sid));
    expect(await status(b.row!.id)).toBe('disputed');
    expect(await owns(pat.id)).toEqual([]);
  });

  it('events in any order: paid then refunded then the paid event again', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    await hook(pay.refunded(b.paid.intent));
    const again = await hook(pay.completed(b.sid));
    expect(again.status).toBe(200);
    expect(await status(b.row!.id)).toBe('refunded');
    expect(await owns(pat.id)).toEqual([]);
  });

  it('a refund for an account that was deleted is recorded and breaks nothing', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    await db.query('delete from auth.users where id = $1', [pat.id]);
    expect((await hook(pay.refunded(b.paid.intent))).status).toBe(200);
    expect(await status(b.row!.id)).toBe('refunded');
  });
});

// ---------------------------------------------------------------- admin

describe('the admin purchases page actions', () => {
  const adminPost = (who: Person, body: unknown, headers = {}) =>
    adminPurchases.POST!(
      new Request(`${HOST}/api/admin/purchases`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'x-real-ip': `10.9.0.${ip}`,
          'content-type': 'application/json',
          cookie: who.cookie,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );
  const audits = async () =>
    (
      await db.query<{ action: string; target_id: string; details: unknown }>(
        'select action, target_id, details from public.admin_audit_log order by id',
      )
    ).rows;

  it('switches a product on and off with an audit row, and refuses the Open price and an unbuilt rescue', async () => {
    const admin = await person('admin', { role: 'admin' });
    expect(
      (await adminPost(admin, { action: 'product', product: 'farm_pack', active: true })).status,
    ).toBe(200);
    expect(
      (await db.query('select active from public.products where id = $1', ['farm_pack'])).rows[0],
    ).toEqual({ active: true });
    expect(await audits()).toEqual([
      { action: 'product_set', target_id: 'farm_pack', details: { enabled: true } },
    ]);
    // Same state again: no second audit row.
    await adminPost(admin, { action: 'product', product: 'farm_pack', active: true });
    expect(await audits()).toHaveLength(1);
    const open = await adminPost(admin, {
      action: 'product',
      product: 'keep_going_daily_under_6m',
      active: true,
    });
    expect(open.status).toBe(409);
    expect(((await open.json()) as { error: string }).error).toMatch(/to be set/);
    const rescue = await adminPost(admin, {
      action: 'product',
      product: 'keep_going_fast',
      active: true,
    });
    expect(rescue.status).toBe(409);
    expect(
      (await adminPost(admin, { action: 'product', product: 'nope', active: true })).status,
    ).toBe(404);
    expect((await adminPost(admin, { action: 'nonsense' })).status).toBe(400);
    // With the engine built the rescue products can be switched on, the Open one still not.
    setRescueEngine(fakeEngine().engine);
    expect(
      (await adminPost(admin, { action: 'product', product: 'keep_going_fast', active: true }))
        .status,
    ).toBe(200);
    expect(
      (
        await adminPost(admin, {
          action: 'product',
          product: 'keep_going_daily_under_6m',
          active: true,
        })
      ).status,
    ).toBe(409);
  });

  it('refunds through the provider, takes the entitlement away, and writes an audit row', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    const res = await adminPost(admin, { action: 'refund', id: b.row!.id });
    expect(res.status).toBe(200);
    expect(pay.refundCalls).toEqual([{ intent: b.paid.intent, key: `refund-${b.row!.id}` }]);
    expect(await status(b.row!.id)).toBe('refunded');
    expect(await owns(pat.id)).toEqual([]);
    expect(await audits()).toEqual([
      { action: 'purchase_refund', target_id: b.row!.id, details: { value: 3000 } },
    ]);
    // Stripe then sends its own refund event: nothing more happens.
    await hook(pay.refunded(b.paid.intent));
    expect(await status(b.row!.id)).toBe('refunded');
    // A second refund of the same purchase is refused.
    expect((await adminPost(admin, { action: 'refund', id: b.row!.id })).status).toBe(409);
    expect(pay.refundCalls).toHaveLength(1);
  });

  it('a refund Stripe refuses changes nothing here', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    pay.fail.refund = true;
    const res = await adminPost(admin, { action: 'refund', id: b.row!.id });
    expect(res.status).toBeLessThan(600);
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(3);
    expect(await audits()).toEqual([]);
    expect(await res.text()).not.toMatch(/stripe is down/);
  });

  it('reconcile asks the provider and settles a purchase whose webhook never came', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack_no_ads');
    pay.pay(b.row!.stripe_checkout_session_id!);
    expect(await status(b.row!.id)).toBe('pending');
    const res = await adminPost(admin, { action: 'reconcile', id: b.row!.id });
    expect(((await res.json()) as { status: string }).status).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(4);
    expect((await audits())[0]).toMatchObject({
      action: 'purchase_reconcile',
      target_id: b.row!.id,
    });
    // An abandoned checkout that Stripe expired is closed.
    const sam = await person('sam');
    const c = await buy(sam, 'farm_pack');
    pay.expire(c.row!.stripe_checkout_session_id!);
    await adminPost(admin, { action: 'reconcile', id: c.row!.id });
    expect(await status(c.row!.id)).toBe('failed');
    // A refund Stripe made that never reached us is found too.
    pay.states.set(b.row!.stripe_checkout_session_id!, {
      fullyRefunded: true,
      disputed: false,
      receiptUrl: null,
    });
    const intent = (
      await db.query<{ pi: string }>(
        'select stripe_payment_intent_id as pi from public.purchases where id = $1',
        [b.row!.id],
      )
    ).rows[0]!.pi;
    pay.states.set(intent, { fullyRefunded: true, disputed: false, receiptUrl: null });
    await adminPost(admin, { action: 'reconcile', id: b.row!.id });
    expect(await status(b.row!.id)).toBe('refunded');
    expect((await adminPost(admin, { action: 'reconcile', id: 'not-an-id' })).status).toBe(400);
  });

  it('refund and reconcile with no Stripe keys say so plainly', async () => {
    const admin = await person('admin', { role: 'admin' });
    setPaymentsProvider(null);
    const res = await adminPost(admin, {
      action: 'refund',
      id: '00000000-0000-4000-8000-000000000001',
    });
    expect(res.status).toBe(409);
  });

  it('direct calls: refund needs a paid purchase with a payment; unknown ids are 404', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    await expect(refundPurchase(deps, pay, admin.id, b.row!.id)).rejects.toBeInstanceOf(AdminError);
    await expect(
      refundPurchase(deps, pay, admin.id, '00000000-0000-4000-8000-0000000000aa'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      reconcilePurchase(deps, pay, admin.id, '00000000-0000-4000-8000-0000000000aa'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(setProductActive(deps.sql, admin.id, 'farm_pack', 'yes')).rejects.toMatchObject({
      status: 400,
    });
  });
});

// ---------------------------------------------------------------- paying to keep going

function fakeEngine() {
  const applied: string[] = [];
  const diary: Record<string, string> = {};
  const engine: RescueEngine = {
    async preview() {
      return { cashAfter: 20000 };
    },
    async apply({ purchaseId, farm }: { purchaseId: string; farm: RescueFarm }) {
      // Keyed on the purchase id, as the real one must be.
      if (!applied.includes(purchaseId)) {
        applied.push(purchaseId);
        diary[farm.id] =
          `You paid to keep going. The stock was sold to clear the debt and cash was set to A$20000.`;
      }
      return { diary: diary[farm.id]! };
    },
  };
  return { engine, applied, diary };
}

async function endedFarm(owner: string, mode: 'fast' | 'daily', day = 10): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, status, ended_at, current_day, timezone, sim_through)
     values ($1, $2, 'Over', 'cq', 'small', 100, 'grazing', 'scratch', 'easy', 'e1', 'ended', now(), $3,
             case when $2 = 'daily' then 'Australia/Sydney' end, case when $2 = 'daily' then current_date end) returning id`,
    [owner, mode, day],
  );
  return r.rows[0]!.id;
}

describe('paying to keep going', () => {
  it('with no engine function there is no offer and the products can not be bought', async () => {
    await sell(true, ['keep_going_fast']);
    const pat = await person('pat');
    const farm = await endedFarm(pat.id, 'fast');
    const offer = (await (await get('offer', pat, `?farm=${farm}`)).json()) as { offer: unknown };
    expect(offer.offer).toBeNull();
    expect((await post('checkout', pat, { product: 'keep_going_fast', farm })).status).toBe(404);
  });

  it('A rescue does exactly what the card said', async () => {
    const fake = fakeEngine();
    setRescueEngine(fake.engine);
    await sell(true, ['keep_going_fast', 'keep_going_daily_6m']);
    const pat = await person('pat');
    const farm = await endedFarm(pat.id, 'fast');
    const other = await endedFarm(pat.id, 'fast');
    const offer = (await (await get('offer', pat, `?farm=${farm}`)).json()) as {
      offer: { productId: string; priceText: string; does: string[]; farmId: string };
    };
    // The card states the amount and each thing the rescue changes.
    expect(offer.offer.productId).toBe('keep_going_fast');
    expect(offer.offer.priceText).toBe('A$5, GST included');
    expect(offer.offer.does.join(' ')).toMatch(/stock is sold first/);
    expect(offer.offer.does.join(' ')).toMatch(/starting cash for this farm, A\$20000/);
    expect(offer.offer.does.join(' ')).toMatch(/leaderboard score stays/);
    expect(offer.offer.does.join(' ')).toMatch(/continued/);

    const b = await buyAndPay(pat, 'keep_going_fast', farm);
    expect(pay.sessions.get(b.sid)!.req.amountCents).toBe(500);
    expect(await status(b.row!.id)).toBe('paid');
    // Applied once, to the right farm, and marked.
    expect(fake.applied).toEqual([b.row!.id]);
    expect(Object.keys(fake.diary)).toEqual([farm]);
    expect(fake.diary[other]).toBeUndefined();
    expect(fake.diary[farm]).toMatch(/paid to keep going/);
    const row = await db.query<{ applied_at: string | null; farm_id: string }>(
      'select applied_at, farm_id from public.purchases where id = $1',
      [b.row!.id],
    );
    expect(row.rows[0]!.applied_at).not.toBeNull();
    expect(row.rows[0]!.farm_id).toBe(farm);
    // The entitlements are untouched: a rescue gives nothing but the rescue.
    expect(await owns(pat.id)).toEqual([]);

    // A replay of the event, a second event, and a reconcile never rescue twice.
    await hook(b.e);
    await hook(pay.completed(b.sid));
    const admin = await person('admin', { role: 'admin' });
    await reconcilePurchase(deps, pay, admin.id, b.row!.id);
    expect(fake.applied).toEqual([b.row!.id]);
  });

  it('the server picks the offer for the farm: the wrong tier, another account, or a farm still running is refused', async () => {
    setRescueEngine(fakeEngine().engine);
    await sell(true, ['keep_going_fast', 'keep_going_daily_6m', 'keep_going_daily_1y']);
    const pat = await person('pat');
    const other = await person('other');
    const daily = await endedFarm(pat.id, 'daily', 400);
    const offer = (await (await get('offer', pat, `?farm=${daily}`)).json()) as {
      offer: { productId: string };
    };
    expect(offer.offer.productId).toBe('keep_going_daily_1y');
    expect(
      (await post('checkout', pat, { product: 'keep_going_daily_6m', farm: daily })).status,
    ).toBe(409);
    expect((await post('checkout', pat, { product: 'keep_going_fast', farm: daily })).status).toBe(
      409,
    );
    expect(
      (await post('checkout', other, { product: 'keep_going_daily_1y', farm: daily })).status,
    ).toBe(409);
    expect(
      ((await (await get('offer', other, `?farm=${daily}`)).json()) as { offer: unknown }).offer,
    ).toBeNull();
    await insertFarm(pat.id, 'fast', 'Running');
    const running = (
      await db.query<{ id: string }>(`select id from public.farms where name = 'Running'`)
    ).rows[0]!.id;
    expect(
      (await post('checkout', pat, { product: 'keep_going_fast', farm: running })).status,
    ).toBe(409);
    expect((await post('checkout', pat, { product: 'keep_going_fast' })).status).toBe(400);
  });

  it('the Open price under 6 months is never offered or sold, even if the row is switched on', async () => {
    setRescueEngine(fakeEngine().engine);
    await sell(true, ['keep_going_daily_under_6m']);
    const pat = await person('pat');
    const daily = await endedFarm(pat.id, 'daily', 100);
    expect(
      (await post('checkout', pat, { product: 'keep_going_daily_under_6m', farm: daily })).status,
    ).toBe(404);
  });

  it('when the engine fails the purchase stays paid and unapplied, and reconcile applies it once', async () => {
    let fail = true;
    const fake = fakeEngine();
    setRescueEngine({
      preview: fake.engine.preview,
      apply: (i) => (fail ? Promise.reject(new Error('engine down')) : fake.engine.apply(i)),
    });
    await sell(true, ['keep_going_fast']);
    const pat = await person('pat');
    const farm = await endedFarm(pat.id, 'fast');
    const b = await buyAndPay(pat, 'keep_going_fast', farm);
    expect(b.answer.status).toBe(200);
    expect(await status(b.row!.id)).toBe('paid');
    expect(fake.applied).toEqual([]);
    const admin = await person('admin', { role: 'admin' });
    const stuck = await db.query(
      'select 1 from public.purchases where applied_at is null and status = $1',
      ['paid'],
    );
    expect(stuck.rows).toHaveLength(1);
    fail = false;
    const r = await reconcilePurchase(deps, pay, admin.id, b.row!.id);
    expect(r.rescue).toBe('applied');
    expect(fake.applied).toEqual([b.row!.id]);
    expect((await reconcilePurchase(deps, pay, admin.id, b.row!.id)).rescue).toBe('already');
    expect(fake.applied).toHaveLength(1);
  });

  it('a refunded rescue is not applied', async () => {
    const fake = fakeEngine();
    setRescueEngine(fake.engine);
    await sell(true, ['keep_going_fast']);
    const pat = await person('pat');
    const farm = await endedFarm(pat.id, 'fast');
    const b = await buy(pat, 'keep_going_fast', farm);
    const sid = b.row!.stripe_checkout_session_id!;
    const p = pay.pay(sid);
    pay.states.set(p.intent, { fullyRefunded: true, disputed: false, receiptUrl: null });
    await hook(pay.refunded(p.intent));
    await hook(pay.completed(sid));
    expect(await status(b.row!.id)).toBe('refunded');
    expect(fake.applied).toEqual([]);
  });
});

// ---------------------------------------------------------------- your purchases, data rights

describe('your purchases and your data', () => {
  it("lists the player's own purchases with a receipt link, never anyone else's", async () => {
    await sell(true);
    const pat = await person('pat');
    const other = await person('other');
    const b = await buyAndPay(pat, 'farm_pack');
    await buyAndPay(other, 'farm_pack');
    const mine = (await (await get('mine', pat)).json()) as {
      purchases: { id: string; product: string; canReceipt: boolean }[];
    };
    expect(mine.purchases).toHaveLength(1);
    expect(mine.purchases[0]).toMatchObject({
      id: b.row!.id,
      product: 'Farm pack',
      canReceipt: true,
    });
    const rec = (await (await get('receipt', pat, `?purchase=${b.row!.id}`)).json()) as {
      url: string;
    };
    expect(rec.url).toBe(`https://pay.example/receipts/${b.paid.intent}`);
    const theirs = (await (await get('receipt', other, `?purchase=${b.row!.id}`)).json()) as {
      url: string | null;
    };
    expect(theirs.url).toBeNull();
    expect(JSON.stringify(mine)).not.toMatch(/cs_test|pi_/);
  });

  it('download my data includes the purchases and entitlements, and no Stripe ids', async () => {
    await sell(true);
    const pat = await person('pat');
    await buyAndPay(pat, 'farm_pack');
    const res = await dataRoute.GET!(
      new Request(`${HOST}/api/account/data`, {
        headers: { host: 'localhost:3000', 'x-real-ip': `10.5.0.${ip}`, cookie: pat.cookie },
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    const data = JSON.parse(text) as {
      purchases: { product_id: string; amount_cents: number }[];
      entitlements: { entitlement: string }[];
    };
    expect(data.purchases).toHaveLength(1);
    expect(data.purchases[0]).toMatchObject({ product_id: 'farm_pack', amount_cents: 3000 });
    expect(data.entitlements.map((e) => e.entitlement).sort()).toEqual([
      'farm_pack',
      'full_diary',
      'supporter_badge',
    ]);
    expect(text).not.toMatch(/cs_test_|pi_|cus_/);
  });

  it('delete my account: the purchase record stays with no account, the entitlements and Stripe customer go', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    const res = await deleteRoute.POST!(
      new Request(`${HOST}/api/account/delete`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'x-real-ip': `10.5.1.${ip}`,
          'content-type': 'application/json',
          cookie: pat.cookie,
        },
        body: JSON.stringify({ confirm: pat.username }),
      }),
    );
    expect(res.status).toBe(200);
    const row = await db.query<{ user_id: string | null; status: string }>(
      'select user_id, status from public.purchases where id = $1',
      [b.row!.id],
    );
    expect(row.rows[0]).toEqual({ user_id: null, status: 'paid' });
    expect((await db.query('select 1 from public.account_entitlements')).rows).toHaveLength(0);
    expect((await db.query('select 1 from public.stripe_customers')).rows).toHaveLength(0);
    const events = await db.query<{ stripe_customer_id: string | null }>(
      'select stripe_customer_id from public.stripe_events',
    );
    expect(events.rows.every((e) => e.stripe_customer_id === null)).toBe(true);
  });
});

// ---------------------------------------------------------------- second pass (security review)

describe('second pass: the review of m5.2', () => {
  const sidOf = (b: { row: { stripe_checkout_session_id: string | null } | undefined }) =>
    b.row!.stripe_checkout_session_id!;
  const payEvent = async (sid: string) => {
    pay.pay(sid);
    return hook(pay.completed(sid));
  };

  it('two pack checkouts both paid, then one refunded: the account keeps what the other covers', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const a = await buy(pat, 'farm_pack');
    const b = await buy(pat, 'farm_pack_no_ads');
    // Starting the second pack checkout finishes the first one that was still open.
    expect(await status(a.row!.id)).toBe('failed');
    await payEvent(sidOf(a));
    await payEvent(sidOf(b));
    expect(await status(a.row!.id)).toBe('paid');
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(4);
    await refundPurchase(deps, pay, admin.id, b.row!.id);
    expect(await status(b.row!.id)).toBe('refunded');
    // Only no ads goes: the pack the other purchase paid for stays.
    expect(await owns(pat.id)).toEqual(['farm_pack', 'full_diary', 'supporter_badge']);
    // And the other way round: refunding the earlier pack keeps what the later one covers.
    const sam = await person('sam');
    const c = await buy(sam, 'farm_pack');
    const d = await buy(sam, 'farm_pack_no_ads');
    await payEvent(sidOf(c));
    await payEvent(sidOf(d));
    await refundPurchase(deps, pay, admin.id, c.row!.id);
    expect(await owns(sam.id)).toHaveLength(4);
    await refundPurchase(deps, pay, admin.id, d.row!.id);
    expect(await owns(sam.id)).toEqual([]);
  });

  it('a pack paid that the account already owns is recorded as needing a refund and shown to the admin', async () => {
    await sell(true);
    const pat = await person('pat');
    const a = await buy(pat, 'farm_pack');
    const b = await buy(pat, 'farm_pack_no_ads');
    await payEvent(sidOf(b));
    await payEvent(sidOf(a));
    expect(await status(a.row!.id)).toBe('paid');
    const flags = await db.query<{ id: string; needs_refund: boolean }>(
      'select id, needs_refund from public.purchases order by created_at',
    );
    expect(flags.rows.find((r) => r.id === a.row!.id)!.needs_refund).toBe(true);
    expect(flags.rows.find((r) => r.id === b.row!.id)!.needs_refund).toBe(false);
    const o = await purchasesOverview(deps.sql);
    expect(o.refundsNeeded).toBe(1);
    expect(o.recent.find((r) => r.id === a.row!.id)!.needsRefund).toBe(true);
    // Refunding the duplicate leaves the account with everything the other covers.
    const admin = await person('admin', { role: 'admin' });
    await refundPurchase(deps, pay, admin.id, a.row!.id);
    expect(await owns(pat.id)).toHaveLength(4);
  });

  it('a payment that failed the amount check can still be refunded from admin', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    pay.pay(sidOf(b));
    await hook(pay.completed(sidOf(b), { amount_total: 100 }));
    expect(await status(b.row!.id)).toBe('failed');
    await refundPurchase(deps, pay, admin.id, b.row!.id);
    expect(pay.refundCalls).toHaveLength(1);
    expect(await status(b.row!.id)).toBe('refunded');
    expect(await owns(pat.id)).toEqual([]);
  });

  it('two overlapping checkout calls never reuse the idempotency key with different details', async () => {
    await sell(true);
    const pat = await person('pat');
    const [x, y] = await Promise.all([
      post('checkout', pat, { product: 'farm_pack' }),
      post('checkout', pat, { product: 'farm_pack' }),
    ]);
    expect([x.status, y.status]).toEqual([200, 200]);
    // A retry a moment later still works, with the same expiry worked out from the purchase row.
    await new Promise((r) => setTimeout(r, 1100));
    expect((await post('checkout', pat, { product: 'farm_pack' })).status).toBe(200);
    expect(pay.sessions.size).toBe(1);
    const row = await db.query<{ e: string }>(
      'select extract(epoch from created_at)::bigint as e from public.purchases',
    );
    const req = [...pay.sessions.values()][0]!.req;
    expect(req.expiresAt).toBe(Number(row.rows[0]!.e) + 60 * 60);
  });

  it('a paid session the server never saved is found by the purchase id, with the same checks', async () => {
    await sell(true);
    const pat = await person('pat');
    const other = await person('other');
    const real = deps.sql;
    setAuthDeps({
      ...deps,
      sql: {
        query: (t, p) =>
          /set stripe_checkout_session_id = \$2/.test(t)
            ? Promise.reject(new Error('disk full'))
            : real.query(t, p),
        transaction: real.transaction,
      },
    });
    expect((await post('checkout', pat, { product: 'farm_pack' })).status).toBe(503);
    setAuthDeps(deps);
    const row = (
      await db.query<{ id: string; stripe_checkout_session_id: string | null }>(
        'select id, stripe_checkout_session_id from public.purchases',
      )
    ).rows[0]!;
    expect(row.stripe_checkout_session_id).toBeNull();
    const session = [...pay.sessions.values()][0]!;
    pay.pay(session.id);
    // Metadata that names another account is not accepted.
    await hook(pay.completed(session.id, { metadata: { ...session.metadata, user_id: other.id } }));
    expect(await status(row.id)).toBe('pending');
    expect(await owns(pat.id)).toEqual([]);
    // A wrong amount is not accepted either.
    await hook(pay.completed(session.id, { amount_total: 5 }));
    expect(await owns(pat.id)).toEqual([]);
    expect((await hook(pay.completed(session.id))).status).toBe(200);
    expect(await status(row.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(3);
    const saved = await db.query<{ s: string }>(
      'select stripe_checkout_session_id as s from public.purchases where id = $1',
      [row.id],
    );
    expect(saved.rows[0]!.s).toBe(session.id);
  });

  const raceSql = (intent: () => string) => {
    const real = deps.sql;
    return {
      query: async (t: string, p?: unknown[]) => {
        const r = await real.query(t, p);
        // The refund event lands just after the "is a refund waiting?" check and before the paid write.
        if (/error = \$2 and processed_at is null limit 1/.test(t)) {
          await db.query(
            `insert into public.stripe_events (id, type, object_id, payment_intent_id, error)
             values ('evt_racing', 'charge.refunded', $1, $1, 'waiting_for_purchase')`,
            [intent()],
          );
        }
        return r;
      },
      transaction: real.transaction,
    } as typeof deps.sql;
  };

  it('a refund that lands during the paid write is settled after the paid write commits', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buy(pat, 'farm_pack');
    const paid = pay.pay(sidOf(b));
    pay.states.set(paid.intent, { fullyRefunded: true, disputed: false, receiptUrl: null });
    const e = pay.completed(sidOf(b));
    const res = await handleWebhook({ sql: raceSql(() => paid.intent) }, pay, e.body, e.header);
    expect(res.status).toBe(200);
    expect(await status(b.row!.id)).toBe('refunded');
    expect(await owns(pat.id)).toEqual([]);
    const open = await db.query('select 1 from public.stripe_events where processed_at is null');
    expect(open.rows).toHaveLength(0);
  });

  it('reconcile settles events that are still waiting for their purchase', async () => {
    await sell(true);
    const admin = await person('admin', { role: 'admin' });
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    await db.query(
      `insert into public.stripe_events (id, type, object_id, payment_intent_id, error)
       values ('evt_stuck', 'charge.refunded', $1, $1, 'waiting_for_purchase')`,
      [b.paid.intent],
    );
    pay.states.set(b.paid.intent, { fullyRefunded: true, disputed: false, receiptUrl: null });
    await reconcilePurchase(deps, pay, admin.id, b.row!.id);
    expect(await status(b.row!.id)).toBe('refunded');
    const open = await db.query('select 1 from public.stripe_events where processed_at is null');
    expect(open.rows).toHaveLength(0);
  });

  it('a dispute won that arrives before its raised event keeps the entitlement', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    await hook(pay.dispute(b.paid.intent, 'charge.dispute.closed', 'won'));
    await hook(pay.dispute(b.paid.intent, 'charge.dispute.created', 'needs_response'));
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(3);
  });

  it('an inquiry closed without a dispute changes nothing, and restores what its opening took away', async () => {
    await sell(true);
    const pat = await person('pat');
    const b = await buyAndPay(pat, 'farm_pack');
    await hook(pay.dispute(b.paid.intent, 'charge.dispute.closed', 'warning_closed'));
    expect(await status(b.row!.id)).toBe('paid');
    expect(await owns(pat.id)).toHaveLength(3);
    const sam = await person('sam');
    const c = await buyAndPay(sam, 'farm_pack');
    await hook(pay.dispute(c.paid.intent, 'charge.dispute.created', 'warning_needs_response'));
    expect(await status(c.row!.id)).toBe('disputed');
    await hook(pay.dispute(c.paid.intent, 'charge.dispute.closed', 'warning_closed'));
    expect(await status(c.row!.id)).toBe('paid');
    expect(await owns(sam.id)).toHaveLength(3);
    // A lost dispute still keeps it away.
    const lee = await person('lee');
    const d = await buyAndPay(lee, 'farm_pack');
    await hook(pay.dispute(d.paid.intent, 'charge.dispute.created', 'needs_response'));
    await hook(pay.dispute(d.paid.intent, 'charge.dispute.closed', 'lost'));
    expect(await status(d.row!.id)).toBe('disputed');
  });
});

// ---------------------------------------------------------------- every billing route, found by walking the code

const walk = (dir: string, match: RegExp): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(join(web, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(web, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match.test(name)) out.push(rel);
  }
  return out;
};
const billingFiles = walk('app/api/billing', /^route\.ts$/);
const names = billingFiles.map((f) => f.replace('app/api/billing/', '').replace('/route.ts', ''));

describe('every billing route, found by walking the code', () => {
  it('uses billingRoute or webhookRoute, exports only GET or POST and dynamic, and a POST says write: true', () => {
    expect(billingFiles.length).toBeGreaterThanOrEqual(7);
    for (const f of billingFiles) {
      const text = readFileSync(join(web, f), 'utf8');
      expect(text, f).toMatch(/billingRoute\(|webhookRoute\(/);
      const exported = [...text.matchAll(/export (?:const|async function|function) (\w+)/g)].map(
        (m) => m[1]!,
      );
      expect(
        exported.every((e) => ['GET', 'POST', 'dynamic'].includes(e)),
        f,
      ).toBe(true);
      expect(exported, f).toContain('dynamic');
      if (exported.includes('POST') && !/webhookRoute\(/.test(text))
        expect(text, f).toMatch(/write: true/);
      if (exported.includes('GET')) expect(text, f).toMatch(/write: false/);
      expect(text, f).not.toMatch(/@gg\/engine|—/);
    }
  });

  it('the browser side of billing never imports the engine or server code, and has no em dash', () => {
    for (const f of walk('components/billing', /\.(tsx?|css)$/)) {
      const text = readFileSync(join(web, f), 'utf8');
      expect(text, f).not.toMatch(/@gg\/engine|@\/server|—/);
    }
  });

  for (const name of names.filter((n) => n !== 'webhook')) {
    const method =
      billingFiles.length &&
      readFileSync(join(web, `app/api/billing/${name}/route.ts`), 'utf8').includes(
        'export const POST',
      )
        ? 'POST'
        : 'GET';
    it(`${name}: refuses a cross-site request when it writes, and answers a plain error with no 5xx and no keys`, async () => {
      await sell(true);
      const pat = await person('pat');
      const call = (who: Person | null, headers: Record<string, string> = {}) =>
        method === 'POST'
          ? post(name, who, { product: 'farm_pack' }, headers)
          : routes[name]!.GET!(req(name, 'GET', who, undefined, headers, '?purchase=x&farm=x'));
      if (method === 'POST') {
        expect((await call(pat, { origin: 'https://evil.example' })).status).toBe(403);
        expect((await call(pat, { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
        expect((await call(pat, { 'content-type': 'text/plain' })).status).toBe(403);
        expect(pay.createCalls).toBe(0);
      }
      setPaymentsProvider(null);
      setAuthDeps(null);
      expect((await call(null)).status).toBeLessThan(500);
    });

    it(`${name}: is rate limited for each signed-in player`, async () => {
      await sell(true);
      const pat = await person('pat');
      const other = await person('other');
      let last = 200;
      for (let i = 0; i < 80; i++) {
        const res =
          method === 'POST'
            ? await post(name, pat, { product: 'does_not_exist' })
            : await routes[name]!.GET!(req(name, 'GET', pat, undefined, {}, '?purchase=x&farm=x'));
        last = res.status;
        if (last === 429) break;
      }
      expect(last).toBe(429);
      // Another player behind the same address still has their own allowance.
      const res =
        method === 'POST'
          ? await post(name, other, { product: 'does_not_exist' })
          : await routes[name]!.GET!(req(name, 'GET', other, undefined, {}, '?purchase=x&farm=x'));
      expect(res.status).not.toBe(429);
    });
  }

  it('the webhook is rate limited by address and refuses a body that is too big', async () => {
    const big = 'x'.repeat(300 * 1024);
    const res = await routes.webhook!.POST!(
      new Request(`${HOST}/api/billing/webhook`, {
        method: 'POST',
        headers: { 'stripe-signature': 't=1,v1=a', 'x-real-ip': '10.99.0.1' },
        body: big,
      }),
    );
    expect(res.status).toBe(400);
    let last = 0;
    for (let i = 0; i < 700; i++) {
      last = (
        await routes.webhook!.POST!(
          new Request(`${HOST}/api/billing/webhook`, {
            method: 'POST',
            headers: { 'x-real-ip': '10.99.0.2' },
            body: '{}',
          }),
        )
      ).status;
      if (last === 429) break;
    }
    expect(last).toBe(429);
  });

  it('encodes Stripe form bodies the way Stripe reads them', () => {
    expect(
      encodeForm({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'aud' } }],
        metadata: { a: 'b c' },
      }).join('&'),
    ).toBe(
      'mode=payment&line_items%5B0%5D%5Bquantity%5D=1&line_items%5B0%5D%5Bprice_data%5D%5Bcurrency%5D=aud&metadata%5Ba%5D=b%20c',
    );
  });
});

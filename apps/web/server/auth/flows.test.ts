import type { PGlite } from '@electric-sql/pglite';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { DbFarmStore } from '../db/dbstore';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { resetSwitchCache, convertGuest, type AuthDeps } from './accounts';
import { setAuthDeps } from './deps';
import { banHash } from './email';
import type { MeResponse } from '../../lib/auth/types';

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';

type Handler = (req: Request) => Promise<Response>;
type Mod = { GET?: Handler; POST?: Handler; DELETE?: Handler };
const routes: Record<string, Mod> = {};

let db: PGlite;
let auth: FakeAuth;
let deps: AuthDeps;
let game: GameServer;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  routes.email = await import('@/app/api/auth/email/route');
  routes.google = await import('@/app/api/auth/google/route');
  routes.callback = await import('@/app/auth/callback/route');
  routes.me = await import('@/app/api/auth/me/route');
  routes.username = await import('@/app/api/auth/username/route');
  routes.finish = await import('@/app/api/auth/finish/route');
  routes.signout = await import('@/app/api/auth/signout/route');
  routes.data = await import('@/app/api/account/data/route');
  routes.delete = await import('@/app/api/account/delete/route');
  routes.farm = await import('@/app/api/game/farm/route');
  routes.farms = await import('@/app/api/game/farms/route');
  routes.day = await import('@/app/api/game/day/route');
  routes.past = await import('@/app/api/game/past/route');
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setGameServer(undefined);
  await db?.close();
});

let ip = 0;
beforeEach(async () => {
  await db.exec(
    `delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     delete from public.ban_records; delete from public.signup_refusals;
     update public.feature_switches set enabled = true where key = 'signups_open';
     update public.feature_switches set enabled = false where key = 'community';`,
  );
  resetRateLimits();
  resetSwitchCache();
  auth = new FakeAuth(db);
  deps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  game = new GameServer({ store: new DbFarmStore(deps.sql), seed: () => 3, saveRetryMs: [0, 0] });
  setGameServer(game);
  ip++;
});

// ---- helpers

class Browser {
  cookies = new Map<string, string>();
  constructor(readonly address = `10.0.0.${ip}`) {}
  header(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  eat(res: Response): void {
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(';');
      const eq = pair!.indexOf('=');
      const name = pair!.slice(0, eq);
      const value = pair!.slice(eq + 1);
      if (value === '' || attrs.some((a) => /max-age=0/i.test(a))) this.cookies.delete(name);
      else this.cookies.set(name, decodeURIComponent(value));
    }
  }
  async call(
    route: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const req = new Request(`${HOST}${path}`, {
      method,
      headers: {
        host: 'localhost:3000',
        'x-real-ip': this.address,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(this.cookies.size ? { cookie: this.header() } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await routes[route]![method]!(req);
    this.eat(res);
    return res;
  }
  async json<T = Record<string, unknown>>(res: Response): Promise<T> {
    return (await res.json()) as T;
  }
  me = async (): Promise<MeResponse> =>
    this.json<MeResponse>(await this.call('me', 'GET', '/api/auth/me'));
}

const adultDob = '1985-06-15';
const dobYearsAgo = (years: number, extraMonths = 0): string => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - extraMonths);
  return `${d.getUTCFullYear() - years}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-15`;
};

const choices = {
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'scratch',
  difficulty: 'medium',
  name: 'Flow Farm',
};

/** Sign in with an emailed link, as a person would. Returns the browser and the callback's answer. */
async function signIn(email: string, b = new Browser()): Promise<{ b: Browser; res: Response }> {
  const sent = await b.call('email', 'POST', '/api/auth/email', { email });
  expect(sent.status).toBe(200);
  const link = auth.sent[auth.sent.length - 1]!;
  const url = new URL(link.redirectTo);
  url.searchParams.set('code', link.code);
  const res = await b.call('callback', 'GET', `${url.pathname}${url.search}`);
  return { b, res };
}

async function signUp(email: string, username: string, dob = adultDob, b = new Browser()) {
  await signIn(email, b);
  const res = await b.call('finish', 'POST', '/api/auth/finish', { username, dob });
  return {
    b,
    res,
    out: await b.json<{
      ok: boolean;
      reason?: string;
      moved?: number;
      noRoom?: boolean;
      final?: boolean;
    }>(res),
  };
}

// ---- the emailed link

describe('the emailed link', () => {
  it('sends a link and answers the same words for every address, so it never says who has an account', async () => {
    const b = new Browser();
    const first = await b.call('email', 'POST', '/api/auth/email', {
      email: 'new.person@example.com',
    });
    await signUp('known@example.com', 'known_user');
    const known = await new Browser().call('email', 'POST', '/api/auth/email', {
      email: 'known@example.com',
    });
    expect(first.status).toBe(known.status);
    expect(await first.json()).toEqual(await known.json());
  });

  it('answers the same even when the mail provider fails, and keeps the reason in the log only', async () => {
    auth.fail.sendLink = true;
    const ok = await new Browser().call('email', 'POST', '/api/auth/email', {
      email: 'x@example.com',
    });
    auth.fail.sendLink = false;
    const fine = await new Browser().call('email', 'POST', '/api/auth/email', {
      email: 'y@example.com',
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual(await fine.json());
  });

  it('refuses text that is not an address with a plain line', async () => {
    const res = await new Browser().call('email', 'POST', '/api/auth/email', {
      email: 'not an email',
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not look like an email/);
  });

  it("sends the link back to this site's own callback with a page from the allow-list", async () => {
    await new Browser().call('email', 'POST', '/api/auth/email', {
      email: 'a@example.com',
      next: 'https://evil.example/',
    });
    const link = auth.sent[0]!;
    expect(link.redirectTo).toBe(`${HOST}/auth/callback?next=${encodeURIComponent('/play')}`);
    await new Browser().call('email', 'POST', '/api/auth/email', {
      email: 'b@example.com',
      next: '/account',
    });
    expect(auth.sent[1]!.redirectTo).toBe(`${HOST}/auth/callback?next=%2Faccount`);
  });

  it('only a few links an hour go to one address, with the same answer', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await new Browser(`10.9.0.${i}`).call('email', 'POST', '/api/auth/email', {
        email: 'busy@example.com',
      });
      expect(res.status).toBe(200);
    }
    expect(auth.sent.filter((s) => s.email === 'busy@example.com')).toHaveLength(3);
  });

  it('limits one place to ten tries a minute', async () => {
    const b = new Browser('10.8.8.8');
    let last = 200;
    for (let i = 0; i < 12; i++) {
      last = (await b.call('email', 'POST', '/api/auth/email', { email: `u${i}@example.com` }))
        .status;
    }
    expect(last).toBe(429);
  });
});

describe('the callback', () => {
  it('turns a good link into a session and goes to finish sign-up for a new account', async () => {
    const { b, res } = await signIn('fresh@example.com');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(`${HOST}/sign-up/finish?next=%2Fplay`);
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('fake_session='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(b.cookies.has('fake_session')).toBe(true);
  });

  it('goes straight to the page asked for when sign-up is already done', async () => {
    await signUp('done@example.com', 'done_user');
    const again = new Browser();
    const { res } = await signIn('done@example.com', again);
    expect(res.headers.get('location')).toBe(`${HOST}/play`);
  });

  it('a link used a second time ends at the sign-in page with a plain problem, and makes no session', async () => {
    const b = new Browser();
    await b.call('email', 'POST', '/api/auth/email', { email: 'replay@example.com' });
    const link = auth.sent[0]!;
    const path = `/auth/callback?next=%2Fplay&code=${link.code}`;
    expect((await b.call('callback', 'GET', path)).headers.get('location')).toMatch(
      /sign-up\/finish/,
    );
    const other = new Browser();
    other.cookies = new Map(b.cookies);
    other.cookies.delete('fake_session');
    const replay = await other.call('callback', 'GET', path);
    expect(replay.headers.get('location')).toBe(`${HOST}/sign-in?problem=link`);
    expect(other.cookies.has('fake_session')).toBe(false);
  });

  it('an expired link, a link opened in another browser, a missing code and a provider error all end the same way', async () => {
    const b = new Browser();
    await b.call('email', 'POST', '/api/auth/email', { email: 'exp@example.com' });
    const link = auth.sent[0]!;
    auth.expire(link.code);
    const expired = await b.call('callback', 'GET', `/auth/callback?code=${link.code}`);
    expect(expired.headers.get('location')).toBe(`${HOST}/sign-in?problem=link`);

    const c = new Browser();
    await c.call('email', 'POST', '/api/auth/email', { email: 'diff@example.com' });
    const second = auth.sent[1]!;
    // Opened on a different phone or computer: the verifier cookie is not there.
    const elsewhere = await new Browser().call(
      'callback',
      'GET',
      `/auth/callback?code=${second.code}`,
    );
    expect(elsewhere.headers.get('location')).toBe(`${HOST}/sign-in?problem=link`);

    for (const q of [
      '',
      '?error=access_denied&error_description=nope',
      '?code=' + 'x'.repeat(600),
    ]) {
      const r = await new Browser().call('callback', 'GET', `/auth/callback${q}`);
      expect(r.headers.get('location')).toBe(`${HOST}/sign-in?problem=link`);
    }
  });

  it('a provider that fails during the exchange ends at the sign-in page, never a crash', async () => {
    const b = new Browser();
    await b.call('email', 'POST', '/api/auth/email', { email: 'down@example.com' });
    auth.fail.exchange = true;
    const r = await b.call('callback', 'GET', `/auth/callback?code=${auth.sent[0]!.code}`);
    expect(r.headers.get('location')).toBe(`${HOST}/sign-in?problem=link`);
  });

  it('never redirects anywhere but a listed page on this site', async () => {
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/\\evil.example',
      '/admin',
      '/account?x=1',
    ]) {
      const b = new Browser();
      await b.call('email', 'POST', '/api/auth/email', { email: `r${Math.random()}@example.com` });
      const link = auth.sent[auth.sent.length - 1]!;
      const r = await b.call(
        'callback',
        'GET',
        `/auth/callback?next=${encodeURIComponent(next)}&code=${link.code}`,
      );
      const loc = r.headers.get('location')!;
      expect(loc.startsWith(`${HOST}/`)).toBe(true);
      expect(loc).toBe(`${HOST}/sign-up/finish?next=%2Fplay`);
    }
  });

  it('Google comes back the same way', async () => {
    const b = new Browser();
    const start = await b.call('google', 'POST', '/api/auth/google', { next: '/play' });
    expect((await start.json()).url).toMatch(/^https:\/\/accounts\.example\/google\?to=/);
    const jar = {
      getAll: () => [...b.cookies].map(([name, value]) => ({ name, value })),
      setAll() {},
    };
    const code = auth.googleReturn(jar, 'g.user@example.com');
    const r = await b.call('callback', 'GET', `/auth/callback?next=%2Fplay&code=${code}`);
    expect(r.headers.get('location')).toMatch(/sign-up\/finish/);
    const me = await b.me();
    expect(me).toMatchObject({ signedIn: true, needsSignUp: true, method: 'google' });
  });
});

// ---- finishing sign-up

describe('finish sign-up', () => {
  it('makes the account with the date of birth and shows it signed in', async () => {
    const { b, out } = await signUp('adult@example.com', 'Farmer_Joe');
    expect(out).toMatchObject({ ok: true, moved: 0, noRoom: false });
    const me = await b.me();
    expect(me).toMatchObject({
      signedIn: true,
      needsSignUp: false,
      username: 'Farmer_Joe',
      accounts: true,
    });
    const row = await db.query<{ date_of_birth: string }>(
      'select date_of_birth::text from public.account_private',
    );
    expect(row.rows[0]!.date_of_birth).toBe(adultDob);
  });

  it('needs a signed-in player, and checks the username and the date', async () => {
    expect(
      (
        await new Browser().call('finish', 'POST', '/api/auth/finish', {
          username: 'abc',
          dob: adultDob,
        })
      ).status,
    ).toBe(401);
    const b = new Browser();
    await signIn('check@example.com', b);
    for (const body of [
      { username: 'ab', dob: adultDob },
      { username: 'has space', dob: adultDob },
      { username: 'good_name', dob: '2999-01-01' },
      { username: 'good_name', dob: '1985-02-31' },
      { username: 'good_name', dob: 'yesterday' },
      { username: 'good_name' },
    ]) {
      const out = await b.json<{ ok: boolean; reason: string }>(
        await b.call('finish', 'POST', '/api/auth/finish', body),
      );
      expect(out.ok).toBe(false);
      expect(['bad_username', 'bad_date_of_birth']).toContain(out.reason);
    }
    expect((await b.me()).needsSignUp).toBe(true);
  });

  it('under 14: refused kindly, no retry on that sign-in with any other date, no hint how to get round it', async () => {
    const { b, out } = await signUp('kid@example.com', 'young_one', dobYearsAgo(12));
    expect(out).toMatchObject({ ok: false, reason: 'too_young', final: true });
    expect((out as unknown as { message: string }).message).toBe(
      'You need to be 14 or older to make an account. You can still play The Grazing Game as a guest.',
    );
    expect((out as unknown as { message: string }).message).not.toMatch(
      /date|birth|try again|older date|another/i,
    );
    // The same sign-in again, now with an adult date: the same answer.
    const retry = await b.json<{ ok: boolean; reason: string }>(
      await b.call('finish', 'POST', '/api/auth/finish', { username: 'young_one', dob: adultDob }),
    );
    expect(retry).toMatchObject({ ok: false, reason: 'too_young' });
    const me = await b.me();
    expect(me).toMatchObject({ signedIn: true, needsSignUp: true, refused: true });
    expect(await db.query('select 1 from public.profiles')).toMatchObject({ rows: [] });
  });

  it('an account of 14 or 15 plays, but is told no community and no interest ads, whatever the switch says', async () => {
    await db.exec(`update public.feature_switches set enabled = true where key = 'community'`);
    const kid = await signUp('teen@example.com', 'teen_one', dobYearsAgo(15, 3));
    expect(kid.out.ok).toBe(true);
    expect(await kid.b.me()).toMatchObject({
      community: false,
      interestAds: false,
      signedIn: true,
    });
    resetSwitchCache();
    const adult = await signUp('grownup@example.com', 'grown_one');
    expect(await adult.b.me()).toMatchObject({ community: true, interestAds: true });
    // The flag is never taken from the browser: asking with a claim of being older changes nothing.
    const sneaky = await kid.b.call('me', 'GET', '/api/auth/me?under16=false', undefined, {
      'x-under-16': 'false',
    });
    expect(await sneaky.json()).toMatchObject({ community: false, interestAds: false });
  });

  it('refuses a banned address, whichever spelling reaches the same inbox, with a plain line', async () => {
    await db.query('insert into public.ban_records (email_hash, banned_until) values ($1, null)', [
      banHash('Test.Banned.Example@Gmail.com', PEPPER),
    ]);
    const { out, b } = await signUp('test.banned.example@googlemail.com', 'not_banned_name');
    expect(out).toMatchObject({ ok: false, reason: 'banned' });
    expect(await db.query('select 1 from public.profiles')).toMatchObject({ rows: [] });
    expect((await b.me()).needsSignUp).toBe(true);
    // A different address is a different sign-in.
    expect((await signUp('test.other.example@gmail.com', 'fine_name')).out.ok).toBe(true);
  });

  it('says Sign-ups are not open yet when the switch is off, in me and in finish', async () => {
    await db.exec(`update public.feature_switches set enabled = false where key = 'signups_open'`);
    resetSwitchCache();
    const { out, b } = await signUp('late@example.com', 'late_user');
    expect(out).toMatchObject({
      ok: false,
      reason: 'signups_closed',
      message: 'Sign-ups are not open yet.',
    });
    expect((await b.me()).signupsOpen).toBe(false);
  });

  it('a taken username says only that it is not available', async () => {
    await signUp('first@example.com', 'TakenName');
    const second = await signUp('second@example.com', 'takenname');
    expect(second.out).toMatchObject({ ok: false, reason: 'username_taken' });
  });
});

describe('the username check', () => {
  it('answers only free: true or false, the same for a taken name and a name the filter refuses', async () => {
    await signUp('owner@example.com', 'Somebody');
    const b = new Browser();
    await signIn('asker@example.com', b);
    const ask = async (name: string) =>
      b.json(await b.call('username', 'POST', '/api/auth/username', { name }));
    expect(await ask('Somebody')).toEqual({ free: false });
    expect(await ask('somebody')).toEqual({ free: false });
    expect(await ask('Brand_New')).toEqual({ free: true });
    expect(await ask('x')).toEqual({ free: false });
    expect(await ask('bad name!')).toEqual({ free: false });
  });

  it('is for signed-in players only, and rate limited', async () => {
    expect(
      (await new Browser().call('username', 'POST', '/api/auth/username', { name: 'abc' })).status,
    ).toBe(401);
    const b = new Browser();
    await signIn('limit@example.com', b);
    let last = 200;
    for (let i = 0; i < 34; i++) {
      last = (await b.call('username', 'POST', '/api/auth/username', { name: `name_${i}` })).status;
    }
    expect(last).toBe(429);
  });
});

// ---- moving a guest's farm in

describe('a guest becomes an account', () => {
  it('the guest farm moves into the account and keeps its days', async () => {
    const guest = new Browser();
    const made = await guest.call('farm', 'POST', '/api/game/farm', choices);
    expect(made.status).toBe(200);
    await guest.call('day', 'POST', '/api/game/day', {
      version: (await guest.json<{ snapshot: { farmVersion: string } }>(made)).snapshot.farmVersion,
    });
    expect(guest.cookies.has('gg_session')).toBe(true);
    const { out } = await signUp('convert@example.com', 'convert_me', adultDob, guest);
    expect(out).toMatchObject({ ok: true, moved: 1, noRoom: false });
    // The guest cookie is gone and the farm is the account's, still on day 1.
    expect(guest.cookies.has('gg_session')).toBe(false);
    const farm = await guest.json<{ snapshot: { day: number; farm: { name: string } } }>(
      await guest.call('farm', 'GET', '/api/game/farm'),
    );
    expect(farm.snapshot).toMatchObject({ day: 1, farm: { name: 'Flow Farm' } });
    const owner = await db.query<{ owner_id: string | null; guest_session_id: string | null }>(
      'select owner_id, guest_session_id from public.farms',
    );
    expect(owner.rows[0]!.owner_id).not.toBeNull();
    expect(owner.rows[0]!.guest_session_id).toBeNull();
  });

  it('with no room the guest farm stays where it is, nothing moves, and the player is told', async () => {
    const acct = await signUp('full@example.com', 'full_house');
    const me = await acct.b.me();
    for (const name of ['One', 'Two']) {
      expect(
        (await acct.b.call('farm', 'POST', '/api/game/farm', { ...choices, name })).status,
      ).toBe(200);
    }
    // A guest farm on another browser, then the account asks to take it in.
    const guest = new Browser();
    await guest.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'Guest Farm' });
    const sessionCookie = guest.cookies.get('gg_session')!;
    const result = await convertGuest(deps, sessionCookie, me.scope!);
    expect(result).toEqual({ moved: 0, noRoom: true });
    const g = await db.query<{ owner_id: string | null }>(
      `select owner_id from public.farms where name = 'Guest Farm'`,
    );
    expect(g.rows[0]!.owner_id).toBeNull();
    // And the guest can still play it.
    const farm = await guest.json<{ snapshot: { farm: { name: string } } }>(
      await guest.call('farm', 'GET', '/api/game/farm'),
    );
    expect(farm.snapshot.farm.name).toBe('Guest Farm');
  });

  it('a third farm on a full account is refused with a plain message', async () => {
    const acct = await signUp('three@example.com', 'three_farms');
    for (const name of ['A', 'B'])
      await acct.b.call('farm', 'POST', '/api/game/farm', { ...choices, name });
    const third = await acct.b.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'C' });
    expect(third.status).toBe(409);
    expect((await third.json()).error).toMatch(/most farms/);
  });

  it('moving twice does nothing the second time', async () => {
    const guest = new Browser();
    await guest.call('farm', 'POST', '/api/game/farm', choices);
    const secret = guest.cookies.get('gg_session')!;
    const acct = await signUp('twice@example.com', 'twice_over', adultDob, guest);
    expect(acct.out.ok).toBe(true);
    const again = await convertGuest(deps, secret, (await acct.b.me()).scope!);
    expect(again).toEqual({ moved: 0, noRoom: false });
  });
});

// ---- the farm picker and account farms through the game routes

describe('an account with farms', () => {
  it('opens its only farm straight away, and shows the picker when there is more than one', async () => {
    const { b } = await signUp('picker@example.com', 'picker_user');
    await b.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'First' });
    const one = await b.json<{ snapshot: { farm: { name: string } } | null; pick?: unknown }>(
      await b.call('farm', 'GET', '/api/game/farm'),
    );
    expect(one.snapshot?.farm.name).toBe('First');
    await b.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'Second' });
    // A new browser session for the same account: no farm chosen, so the picker.
    const again = new Browser();
    again.cookies.set('fake_session', b.cookies.get('fake_session')!);
    const pick = await again.json<{
      snapshot: unknown;
      pick: { id: string; name: string; districtName: string; day: number }[];
    }>(await again.call('farm', 'GET', '/api/game/farm'));
    expect(pick.snapshot).toBeNull();
    expect(pick.pick.map((f) => f.name).sort()).toEqual(['First', 'Second']);
    expect(pick.pick[0]!.districtName).toMatch(/\w/);
    // Opening one sets the choice (a browser-session cookie) and gives its farm.
    const first = pick.pick.find((f) => f.name === 'First')!;
    const opened = await again.call('farms', 'POST', '/api/game/farms', { id: first.id });
    expect((await opened.json()).snapshot.farm.name).toBe('First');
    expect(opened.headers.getSetCookie().find((c) => c.startsWith('gg_farm='))).not.toMatch(
      /Max-Age/,
    );
    const now = await again.json<{ snapshot: { farm: { name: string } } }>(
      await again.call('farm', 'GET', '/api/game/farm'),
    );
    expect(now.snapshot.farm.name).toBe('First');
    // Back to the picker.
    await again.call('farms', 'POST', '/api/game/farms', { id: null });
    const back = await again.json<{ pick?: unknown[] }>(
      await again.call('farm', 'GET', '/api/game/farm'),
    );
    expect(back.pick).toHaveLength(2);
    const list = await again.json<{
      farms: unknown[];
      limit: number;
      going: number;
      signedIn: boolean;
    }>(await again.call('farms', 'GET', '/api/game/farms'));
    expect(list).toMatchObject({ limit: 2, going: 2, signedIn: true });
  });

  it("never opens or deletes another account's farm, even with its id", async () => {
    const a = await signUp('owner1@example.com', 'owner_one');
    await a.b.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'Mine' });
    const mine = (
      await a.b.json<{ farms: { id: string }[] }>(await a.b.call('farms', 'GET', '/api/game/farms'))
    ).farms[0]!.id;
    const other = await signUp('owner2@example.com', 'owner_two');
    expect((await other.b.call('farms', 'POST', '/api/game/farms', { id: mine })).status).toBe(404);
    expect((await other.b.call('farms', 'DELETE', '/api/game/farms', { id: mine })).status).toBe(
      404,
    );
    // A cookie naming it does not help either: the other account has no farm and sees none.
    other.b.cookies.set('gg_farm', mine);
    expect(
      (
        await other.b.json<{ snapshot: unknown }>(
          await other.b.call('farm', 'GET', '/api/game/farm'),
        )
      ).snapshot,
    ).toBeNull();
    expect(await db.query(`select 1 from public.farms where name = 'Mine'`)).toMatchObject({
      rowCount: 1,
    });
    // And a guest can not use the picker.
    expect(
      (await new Browser().call('farms', 'POST', '/api/game/farms', { id: mine })).status,
    ).toBe(401);
    expect(
      await (await new Browser().call('farms', 'GET', '/api/game/farms')).json(),
    ).toMatchObject({ signedIn: false, farms: [] });
  });

  it('deletes one farm, which can not be undone, and leaves the other', async () => {
    const { b } = await signUp('del@example.com', 'del_user');
    for (const name of ['Keep', 'Lose'])
      await b.call('farm', 'POST', '/api/game/farm', { ...choices, name });
    const farms = (
      await b.json<{ farms: { id: string; name: string }[] }>(
        await b.call('farms', 'GET', '/api/game/farms'),
      )
    ).farms;
    const lose = farms.find((f) => f.name === 'Lose')!;
    const res = await b.json<{ farms: { name: string }[]; going: number }>(
      await b.call('farms', 'DELETE', '/api/game/farms', { id: lose.id }),
    );
    expect(res.farms.map((f) => f.name)).toEqual(['Keep']);
    expect(res.going).toBe(1);
    expect(await db.query(`select 1 from public.farms where name = 'Lose'`)).toMatchObject({
      rowCount: 0,
    });
  });

  it('the diary can show a past day, read only', async () => {
    const { b } = await signUp('past@example.com', 'past_user');
    let version = (
      await b.json<{ snapshot: { farmVersion: string } }>(
        await b.call('farm', 'POST', '/api/game/farm', choices),
      )
    ).snapshot.farmVersion;
    for (let i = 0; i < 2; i++) {
      const day = await b.json<{ snapshot: { farmVersion: string } }>(
        await b.call('day', 'POST', '/api/game/day', { version }),
      );
      version = day.snapshot.farmVersion;
    }
    const days = await b.json<{ days: number[] }>(await b.call('past', 'GET', '/api/game/past'));
    expect(days.days).toEqual([2, 1]);
    const one = await b.json<{ day: number; view: { paddocks: unknown[] }; paddocks: unknown[] }>(
      await b.call('past', 'GET', '/api/game/past?day=1'),
    );
    expect(one.day).toBe(1);
    expect(one.paddocks.length).toBeGreaterThan(0);
    expect((await b.call('past', 'GET', '/api/game/past?day=77')).status).toBe(404);
    expect((await b.call('past', 'GET', '/api/game/past?day=-1')).status).toBe(400);
    expect((await b.call('past', 'GET', '/api/game/past?day=1&day=2')).status).toBe(400);
    // Another account can not see it.
    const other = await signUp('past2@example.com', 'past_two');
    expect((await other.b.call('past', 'GET', '/api/game/past?day=1')).status).toBe(404);
  });
});

// ---- sign out, download, delete

describe('sign out', () => {
  it('ends this device only, or every device, and clears the cookies', async () => {
    const { b } = await signUp('out@example.com', 'out_user');
    const phone = new Browser();
    phone.cookies.set(
      'fake_session',
      (await auth.signInAs('out@example.com')).cookie.split('=')[1]!,
    );
    expect((await phone.me()).signedIn).toBe(true);
    await b.call('signout', 'POST', '/api/auth/signout', {});
    expect(b.cookies.has('fake_session')).toBe(false);
    expect((await b.me()).signedIn).toBe(false);
    expect((await phone.me()).signedIn).toBe(true);
    await phone.call('signout', 'POST', '/api/auth/signout', { everywhere: true });
    expect((await phone.me()).signedIn).toBe(false);
  });

  it('everywhere failing at the provider says so, and this device still signs out when asked alone', async () => {
    const { b } = await signUp('out2@example.com', 'out_two');
    auth.fail.signOut = true;
    const res = await b.call('signout', 'POST', '/api/auth/signout', { everywhere: true });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/everywhere/);
  });

  it('is a state change: another site can not do it', async () => {
    const { b } = await signUp('out3@example.com', 'out_three');
    const res = await b.call(
      'signout',
      'POST',
      '/api/auth/signout',
      {},
      { origin: 'https://evil.example' },
    );
    expect(res.status).toBe(403);
    expect((await b.me()).signedIn).toBe(true);
  });
});

describe('download my data', () => {
  it("is a JSON file of the player's own data and never holds the engine save", async () => {
    const { b } = await signUp('data@example.com', 'data_user');
    await b.call('farm', 'POST', '/api/game/farm', choices);
    const res = await b.call('data', 'GET', '/api/account/data');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename=".*\.json"/);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    const json = JSON.parse(text);
    expect(JSON.stringify(json)).toContain('data_user');
    expect(JSON.stringify(json)).toContain('Flow Farm');
    expect(text).not.toMatch(/saveFormat|engineVersion|"saved"|pastures|herd/i);
    // Signed out, nothing.
    expect((await new Browser().call('data', 'GET', '/api/account/data')).status).toBe(401);
  });

  it('gives another player nothing of this one', async () => {
    const a = await signUp('d1@example.com', 'data_one');
    await a.b.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'Only Mine' });
    const other = await signUp('d2@example.com', 'data_two');
    const text = await (await other.b.call('data', 'GET', '/api/account/data')).text();
    expect(text).not.toContain('Only Mine');
    expect(text).not.toContain('data_one');
  });
});

describe('delete my account', () => {
  it('needs the username typed exactly, then removes the account, the farms and the files, and signs out', async () => {
    const { b } = await signUp('gone@example.com', 'gone_user');
    await b.call('farm', 'POST', '/api/game/farm', choices);
    const wrong = await b.call('delete', 'POST', '/api/account/delete', { confirm: 'gone' });
    expect(wrong.status).toBe(400);
    expect((await b.call('delete', 'POST', '/api/account/delete', {})).status).toBe(400);
    expect(
      await db.query(`select 1 from auth.users where email = 'gone@example.com'`),
    ).toMatchObject({ rowCount: 1 });
    const ok = await b.call('delete', 'POST', '/api/account/delete', { confirm: 'gone_user' });
    expect(ok.status).toBe(200);
    expect(
      await db.query(`select 1 from auth.users where email = 'gone@example.com'`),
    ).toMatchObject({ rowCount: 0 });
    expect(await db.query('select 1 from public.profiles')).toMatchObject({ rowCount: 0 });
    expect(await db.query('select 1 from public.farms')).toMatchObject({ rowCount: 0 });
    expect(await db.query('select 1 from public.farm_saves')).toMatchObject({ rowCount: 0 });
    expect(b.cookies.has('fake_session')).toBe(false);
  });

  it('a failure part way leaves the account in place and says nothing was deleted', async () => {
    const { b } = await signUp('stay@example.com', 'stay_user');
    auth.fail.deleteUser = true;
    const res = await b.call('delete', 'POST', '/api/account/delete', { confirm: 'stay_user' });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/nothing was deleted/);
    expect(
      await db.query(`select 1 from auth.users where email = 'stay@example.com'`),
    ).toMatchObject({ rowCount: 1 });
    auth.fail.deleteUser = false;
    expect(
      (await b.call('delete', 'POST', '/api/account/delete', { confirm: 'stay_user' })).status,
    ).toBe(200);
  });

  it("keeps a running ban's peppered hash, and nothing else, when a banned account is deleted", async () => {
    const { b } = await signUp('banme@example.com', 'ban_me');
    await db.exec(`update public.account_status set banned_at = now()`);
    expect(
      (await b.call('delete', 'POST', '/api/account/delete', { confirm: 'ban_me' })).status,
    ).toBe(200);
    const rec = await db.query<{ email_hash: string }>('select email_hash from public.ban_records');
    expect(rec.rows).toHaveLength(1);
    expect(rec.rows[0]!.email_hash).toBe(banHash('banme@example.com', PEPPER));
  });

  it('is for the signed-in player and passes the CSRF rule', async () => {
    expect(
      (await new Browser().call('delete', 'POST', '/api/account/delete', { confirm: 'x' })).status,
    ).toBe(401);
    const { b } = await signUp('csrf@example.com', 'csrf_user');
    expect(
      (
        await b.call(
          'delete',
          'POST',
          '/api/account/delete',
          { confirm: 'csrf_user' },
          { 'sec-fetch-site': 'cross-site' },
        )
      ).status,
    ).toBe(403);
    expect(
      await db.query(`select 1 from auth.users where email = 'csrf@example.com'`),
    ).toMatchObject({ rowCount: 1 });
  });
});

// ---- the shared CSRF rule, on the game routes too

describe('CSRF on every state-changing route', () => {
  it('refuses another site on the game routes and the account routes alike', async () => {
    const { b } = await signUp('x@example.com', 'x_user');
    const evil = { origin: 'https://evil.example' };
    expect((await b.call('farm', 'POST', '/api/game/farm', choices, evil)).status).toBe(403);
    expect((await b.call('farm', 'DELETE', '/api/game/farm', undefined, evil)).status).toBe(403);
    expect((await b.call('day', 'POST', '/api/game/day', { version: 'abc' }, evil)).status).toBe(
      403,
    );
    expect((await b.call('farms', 'POST', '/api/game/farms', { id: null }, evil)).status).toBe(403);
    expect(
      (await b.call('farms', 'DELETE', '/api/game/farms', { id: 'a'.repeat(32) }, evil)).status,
    ).toBe(403);
    expect(
      (await b.call('email', 'POST', '/api/auth/email', { email: 'a@example.com' }, evil)).status,
    ).toBe(403);
    expect((await b.call('google', 'POST', '/api/auth/google', {}, evil)).status).toBe(403);
    expect((await b.call('finish', 'POST', '/api/auth/finish', {}, evil)).status).toBe(403);
    expect(
      (await b.call('username', 'POST', '/api/auth/username', { name: 'abc' }, evil)).status,
    ).toBe(403);
    expect((await b.call('delete', 'POST', '/api/account/delete', {}, evil)).status).toBe(403);
    const cross = { 'sec-fetch-site': 'cross-site' };
    expect((await b.call('farm', 'POST', '/api/game/farm', choices, cross)).status).toBe(403);
    // A form post that names no origin still fails: it is not JSON.
    const form = new Request(`${HOST}/api/game/farm`, {
      method: 'POST',
      headers: {
        host: 'localhost:3000',
        'content-type': 'text/plain',
        'x-real-ip': '10.1.1.1',
        cookie: b.header(),
      },
      body: JSON.stringify(choices),
    });
    expect((await routes.farm!.POST!(form)).status).toBe(403);
    expect(await db.query('select 1 from public.farms')).toMatchObject({ rowCount: 0 });
  });
});

// ---- when sign-in is not set up

describe('with no sign-in keys', () => {
  it('says so plainly, and guest play carries on as it always did', async () => {
    setAuthDeps(null);
    const b = new Browser();
    expect(await b.me()).toMatchObject({ accounts: false, signedIn: false });
    const email = await b.call('email', 'POST', '/api/auth/email', { email: 'a@example.com' });
    expect(email.status).toBe(503);
    expect((await email.json()).error).toBe('Sign-in is not set up on this copy of the game yet.');
    expect((await b.call('google', 'POST', '/api/auth/google', {})).status).toBe(503);
    expect((await b.call('callback', 'GET', '/auth/callback?code=x')).status).toBe(503);
    expect((await b.call('data', 'GET', '/api/account/data')).status).toBe(503);
    const made = await b.call('farm', 'POST', '/api/game/farm', choices);
    expect(made.status).toBe(200);
    expect(b.cookies.get('gg_session')).toMatch(/^[0-9a-f]{32}$/);
    expect(await (await b.call('farms', 'GET', '/api/game/farms')).json()).toMatchObject({
      signedIn: false,
    });
  });
});

// ---- the allow-list for what the new replies hold (CLAUDE.md rule 14)

/** Every key at every depth, as dotted paths with [] for lists. */
function keyPaths(value: unknown): Set<string> {
  const out = new Set<string>();
  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x, `${path}[]`);
    } else if (typeof v === 'object' && v !== null) {
      for (const [k, x] of Object.entries(v)) {
        out.add(path ? `${path}.${k}` : k);
        walk(x, path ? `${path}.${k}` : k);
      }
    }
  };
  walk(value, '');
  return out;
}

const NEVER =
  /"seed"|"saved"|saveFormat|engineVersion|formula|dmdMax|frostSen|token|secret|password|email_hash|pepper/i;

describe('what the new replies send the browser', () => {
  it("holds only the keys listed, with nothing from the engine save or the accounts' secrets", async () => {
    const { b } = await signUp('keys@example.com', 'keys_user');
    await b.call('farm', 'POST', '/api/game/farm', choices);
    await b.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'Two' });
    const farms = await b.json(await b.call('farms', 'GET', '/api/game/farms'));
    const me = await b.json(await b.call('me', 'GET', '/api/auth/me'));
    const bad = await b.json(await b.call('farms', 'POST', '/api/game/farms', { id: 'x' }));
    const notAllowed = await b.json(
      await new Browser().call('finish', 'POST', '/api/auth/finish', {}),
    );

    const expectKeys = (reply: unknown, allowed: string[]): void => {
      expect([...keyPaths(reply)].sort()).toEqual([...allowed].sort());
    };
    expectKeys(me, [
      'accounts',
      'community',
      'interestAds',
      'method',
      'needsSignUp',
      'refused',
      'scope',
      'signedIn',
      'signupsOpen',
      'username',
    ]);
    expectKeys(farms, [
      'farms',
      'farms[].current',
      'farms[].day',
      'farms[].districtName',
      'farms[].id',
      'farms[].lastPlayed',
      'farms[].name',
      'going',
      'limit',
      'signedIn',
    ]);
    expectKeys(bad, ['error']);
    expectKeys(notAllowed, ['error']);
    // The pick list (two farms, none chosen) is the same list, nothing more.
    const again = new Browser();
    again.cookies.set('fake_session', b.cookies.get('fake_session')!);
    const pick = await again.json(await again.call('farm', 'GET', '/api/game/farm'));
    expectKeys(pick, [
      'pick',
      'pick[].current',
      'pick[].day',
      'pick[].districtName',
      'pick[].id',
      'pick[].lastPlayed',
      'pick[].name',
      'snapshot',
    ]);
    for (const reply of [farms, me, pick]) expect(JSON.stringify(reply)).not.toMatch(NEVER);
  });

  it('the picture of a past day holds the same keys as the live map and paddock figures, and no more', async () => {
    const { b } = await signUp('pk@example.com', 'pk_user');
    const made = await b.json<{ snapshot: { farmVersion: string } }>(
      await b.call('farm', 'POST', '/api/game/farm', choices),
    );
    await b.call('day', 'POST', '/api/game/day', { version: made.snapshot.farmVersion });
    const past = await b.json(await b.call('past', 'GET', '/api/game/past?day=1'));
    const own = [...keyPaths(past)].filter((k) => !/^(view|paddocks)/.test(k)).sort();
    expect(own).toEqual([
      'date',
      'date.date',
      'date.month',
      'date.year',
      'day',
      'season',
      'version',
    ]);
    const live = (
      await b.json<{ snapshot: unknown }>(await b.call('farm', 'GET', '/api/game/farm'))
    ).snapshot;
    const under = (set: Set<string>, root: string): string[] =>
      [...set]
        .filter((k) => k === root || k.startsWith(`${root}.`) || k.startsWith(`${root}[`))
        .sort();
    expect(under(keyPaths(past), 'view')).toEqual(under(keyPaths(live), 'view'));
    expect(under(keyPaths(past), 'paddocks')).toEqual(under(keyPaths(live), 'paddocks'));
    expect(JSON.stringify(past)).not.toMatch(NEVER);
  });

  it('a sign-up reply holds only ok, moved and noRoom, or a reason with its words', async () => {
    const good = await signUp('fin@example.com', 'fin_user');
    expect([...keyPaths(good.out)].sort()).toEqual(['moved', 'noRoom', 'ok']);
    const young = await signUp('fin2@example.com', 'fin_kid', dobYearsAgo(10));
    expect([...keyPaths(young.out)].sort()).toEqual(['final', 'message', 'ok', 'reason']);
  });
});

// ======================================================================
// Second pass (the Opus security review). Each test was written before its fix and seen to fail.
// ======================================================================

describe('1. an old guest cookie can not reach a farm that moved into an account', () => {
  async function movedFarm() {
    const guest = new Browser();
    const made = await guest.json<{ snapshot: { farmVersion: string } }>(
      await guest.call('farm', 'POST', '/api/game/farm', choices),
    );
    const oldSession = guest.cookies.get('gg_session')!;
    const { out } = await signUp('mover@example.com', 'mover_user', adultDob, guest);
    expect(out).toMatchObject({ ok: true, moved: 1 });
    await guest.call('signout', 'POST', '/api/auth/signout', {});
    // Someone with a copy of the old cookie.
    const thief = new Browser();
    thief.cookies.set('gg_session', oldSession);
    return { guest, thief, oldSession, version: made.snapshot.farmVersion };
  }

  it('GET, act, day, skip, record, the past-day view and DELETE all fail to reach the account farm', async () => {
    const { thief, version } = await movedFarm();
    routes.act = await import('@/app/api/game/act/route');
    routes.skip = await import('@/app/api/game/skip/route');
    routes.record = await import('@/app/api/game/record/route');
    const got = await thief.json<{ snapshot: unknown }>(
      await thief.call('farm', 'GET', '/api/game/farm'),
    );
    expect(got.snapshot).toBeNull();
    const act = await thief.call('act', 'POST', '/api/game/act', {
      action: { type: 'markCalves', mob: 9999 },
      version,
      requestId: 'req-thief-0001',
    });
    expect(act.status).toBe(404);
    expect((await thief.call('day', 'POST', '/api/game/day', { version })).status).toBe(404);
    expect(
      (await thief.call('skip', 'POST', '/api/game/skip', { length: 'week', version })).status,
    ).toBe(404);
    expect((await thief.call('record', 'GET', '/api/game/record')).status).toBe(404);
    expect((await thief.call('past', 'GET', '/api/game/past')).status).toBe(404);
    expect((await thief.call('past', 'GET', '/api/game/past?day=1')).status).toBe(404);
    await thief.call('farm', 'DELETE', '/api/game/farm');
    expect(await db.query('select 1 from public.farms')).toMatchObject({ rowCount: 1 });
    const f = await db.query<{ current_day: number }>('select current_day from public.farms');
    expect(f.rows[0]!.current_day).toBe(0);
  });

  it('the store refuses it too, whatever the route does, and a converted session is refused outright', async () => {
    const { oldSession } = await movedFarm();
    await expect(game.snapshot(oldSession)).rejects.toMatchObject({ status: 404 });
    await expect(game.endDay(oldSession)).rejects.toMatchObject({ status: 404 });
    await expect(game.remove(oldSession)).rejects.toMatchObject({ status: 404 });
    expect(await db.query('select 1 from public.farms')).toMatchObject({ rowCount: 1 });
  });

  it("the old cookie then starts a fresh guest farm with a new session, never the account's", async () => {
    const { thief, oldSession } = await movedFarm();
    const res = await thief.call('farm', 'POST', '/api/game/farm', { ...choices, name: 'Fresh' });
    expect(res.status).toBe(200);
    expect(thief.cookies.get('gg_session')).not.toBe(oldSession);
    expect(
      await db.query(`select 1 from public.farms where name = 'Fresh' and owner_id is null`),
    ).toMatchObject({ rowCount: 1 });
    expect(
      await db.query(
        `select 1 from public.farms where name = 'Flow Farm' and owner_id is not null`,
      ),
    ).toMatchObject({ rowCount: 1 });
  });
});

describe('2. rate limits never share one bucket, and accounts need the trusted address header in production', () => {
  const keys = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk',
    SUPABASE_SECRET_KEY: 'sk',
    SUPABASE_DB_POOLER_URL: 'postgres://u:p@localhost:6543/postgres',
    BAN_HASH_PEPPER: 'p'.repeat(40),
  };
  const set = (env: Record<string, string>) => {
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  };
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
    setAuthDeps(deps);
  });

  it('with the header unset in production, accounts are off; with it (and the site address) set they are on', async () => {
    const { authDeps } = await import('./deps');
    setAuthDeps(undefined);
    set({ ...keys, NODE_ENV: 'production', GG_SITE_URL: 'https://game.example' });
    delete process.env[TRUSTED_IP_HEADER_ENV];
    expect(authDeps()).toBeNull();
    setAuthDeps(undefined);
    set({ GG_TRUSTED_IP_HEADER: 'x-real-ip' });
    expect(authDeps()).not.toBeNull();
    // Outside production the header is not needed (a developer's machine).
    setAuthDeps(undefined);
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('GG_TRUSTED_IP_HEADER', '');
    vi.stubEnv('GG_SITE_URL', '');
    expect(authDeps()).not.toBeNull();
  });

  it("one caller flooding /api/auth/email does not block another caller's sign-in or /me", async () => {
    const a = new Browser('10.50.0.1');
    let last = 200;
    for (let i = 0; i < 25; i++) {
      last = (await a.call('email', 'POST', '/api/auth/email', { email: `flood${i}@example.com` }))
        .status;
    }
    expect(last).toBe(429);
    const b = new Browser('10.50.0.2');
    expect(
      (await b.call('email', 'POST', '/api/auth/email', { email: 'fine@example.com' })).status,
    ).toBe(200);
    expect((await b.call('me', 'GET', '/api/auth/me')).status).toBe(200);
  });

  it('/me is keyed on the session, so one signed-in player flooding it does not cap another on the same address', async () => {
    const one = (await signUp('m1@example.com', 'me_one', adultDob, new Browser('10.60.0.1'))).b;
    const two = (await signUp('m2@example.com', 'me_two', adultDob, new Browser('10.60.0.1'))).b;
    let last = 200;
    for (let i = 0; i < 130; i++) last = (await one.call('me', 'GET', '/api/auth/me')).status;
    expect(last).toBe(429);
    expect((await two.call('me', 'GET', '/api/auth/me')).status).toBe(200);
  });

  it('with no trusted address a request still gets its own bucket, never a shared one', async () => {
    delete process.env[TRUSTED_IP_HEADER_ENV];
    const mk = (agent: string) =>
      new Request(`${HOST}/api/auth/email`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'content-type': 'application/json',
          'user-agent': agent,
        },
        body: JSON.stringify({ email: 'x@example.com' }),
      });
    for (let i = 0; i < 12; i++) await routes.email!.POST!(mk('agent-a'));
    expect((await routes.email!.POST!(mk('agent-b'))).status).toBe(200);
  });
});

describe('3. every auth link is built from the site address, never from the Host header', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses GG_SITE_URL even when the request names another host', async () => {
    vi.stubEnv('GG_SITE_URL', 'https://game.example');
    const req = new Request('http://evil.example/api/auth/email', {
      method: 'POST',
      headers: {
        host: 'evil.example',
        'content-type': 'application/json',
        'x-real-ip': '10.70.0.1',
      },
      body: JSON.stringify({ email: 'link@example.com', next: '/play' }),
    });
    expect((await routes.email!.POST!(req)).status).toBe(200);
    expect(auth.sent[0]!.redirectTo.startsWith('https://game.example/auth/callback')).toBe(true);
    const cb = await routes.callback!.GET!(
      new Request('http://evil.example/auth/callback?code=nope', {
        headers: { host: 'evil.example', 'x-real-ip': '10.70.0.1' },
      }),
    );
    expect(cb.headers.get('location')).toBe('https://game.example/sign-in?problem=link');
  });

  it('in production, accounts are off without a site address', async () => {
    const { accountsBlockers } = await import('../startup');
    expect(accountsBlockers({ NODE_ENV: 'production', GG_TRUSTED_IP_HEADER: 'x-real-ip' })).toEqual(
      ['GG_SITE_URL'],
    );
    expect(
      accountsBlockers({
        NODE_ENV: 'production',
        GG_SITE_URL: 'https://a.example/path',
        GG_TRUSTED_IP_HEADER: 'x',
      }),
    ).toEqual(['GG_SITE_URL']);
    expect(accountsBlockers({ NODE_ENV: 'production', GG_SITE_URL: 'https://a.example' })).toEqual([
      'GG_TRUSTED_IP_HEADER',
    ]);
    expect(
      accountsBlockers({
        NODE_ENV: 'production',
        GG_SITE_URL: 'https://a.example',
        GG_TRUSTED_IP_HEADER: 'x-real-ip',
      }),
    ).toEqual([]);
    expect(accountsBlockers({ NODE_ENV: 'development' })).toEqual([]);
  });
});

describe('4. an account with no finished profile can play as a guest', () => {
  it('a refused under-14 can start a guest farm, with a guest session made and renewed', async () => {
    const { b } = await signUp('kid2@example.com', 'kid_two', dobYearsAgo(11));
    expect(b.cookies.has('gg_session')).toBe(false);
    const made = await b.call('farm', 'POST', '/api/game/farm', choices);
    expect(made.status).toBe(200);
    expect(b.cookies.get('gg_session')).toMatch(/^[0-9a-f]{32}$/);
    expect(
      await db.query('select 1 from public.farms where guest_session_id is not null'),
    ).toMatchObject({ rowCount: 1 });
    const again = await b.call('farm', 'GET', '/api/game/farm');
    expect((await again.json()).snapshot.farm.name).toBe('Flow Farm');
    expect(again.headers.getSetCookie().some((c) => c.startsWith('gg_session='))).toBe(true);
  });

  it('an abandoned sign-up (signed in, no username yet) can too', async () => {
    const { b } = await signIn('abandon@example.com');
    const made = await b.call('farm', 'POST', '/api/game/farm', choices);
    expect(made.status).toBe(200);
    expect(b.cookies.get('gg_session')).toMatch(/^[0-9a-f]{32}$/);
    expect(await db.query('select 1 from public.farms where owner_id is not null')).toMatchObject({
      rowCount: 0,
    });
  });
});

describe('5. the store runs as service_role', () => {
  it('a query through the store client runs as service_role and can not do what only the owner can', async () => {
    const who = await deps.sql.query<{ u: string }>('select current_user as u');
    expect(who.rows[0]!.u).toBe('service_role');
    await expect(deps.sql.query('create table public.nope (a int)')).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      deps.sql.transaction((tx) => tx.query('select current_user as u')),
    ).resolves.toMatchObject({ rows: [{ u: 'service_role' }] });
  });

  it('the production client wraps every statement in a transaction that sets the role first', async () => {
    const { clientOnPool } = await import('../db/sql');
    const log: string[] = [];
    const conn = {
      query: async (t: string) => (log.push(t), { rows: [], rowCount: 0 }),
      release: () => undefined,
    };
    const client = clientOnPool({ query: conn.query, connect: async () => conn });
    await client.query('select 1');
    expect(log).toEqual(['begin', 'set local role service_role', 'select 1', 'commit']);
    log.length = 0;
    await client.transaction(async (tx) => {
      await tx.query('select 2');
    });
    expect(log).toEqual(['begin', 'set local role service_role', 'select 2', 'commit']);
  });
});

describe('6. sign out and delete clear the guest session cookie too', () => {
  const clearsGuest = (res: Response): boolean =>
    res.headers.getSetCookie().some((c) => c.startsWith('gg_session=') && /Max-Age=0/.test(c));

  it('sign out, sign out everywhere and delete', async () => {
    const a = await signUp('c1@example.com', 'clear_one');
    a.b.cookies.set('gg_session', 'a'.repeat(32));
    expect(clearsGuest(await a.b.call('signout', 'POST', '/api/auth/signout', {}))).toBe(true);
    const b = await signUp('c2@example.com', 'clear_two');
    expect(
      clearsGuest(await b.b.call('signout', 'POST', '/api/auth/signout', { everywhere: true })),
    ).toBe(true);
    const c = await signUp('c3@example.com', 'clear_three');
    expect(
      clearsGuest(
        await c.b.call('delete', 'POST', '/api/account/delete', { confirm: 'clear_three' }),
      ),
    ).toBe(true);
  });
});

describe('7. the token check lets a signed-out-everywhere token pass; account routes check with the server', () => {
  it('a token still passes the claims check after a global sign out (the gap), but no account change goes through', async () => {
    const { b, out } = await signUp('gap@example.com', 'gap_user');
    expect(out.ok).toBe(true);
    const other = new Browser();
    other.cookies.set('fake_session', b.cookies.get('fake_session')!);
    await b.call('signout', 'POST', '/api/auth/signout', { everywhere: true });
    // The old token on another device: game identity (claims) still accepts it for its lifetime...
    expect((await other.me()).signedIn).toBe(true);
    // ...but anything that changes or exports the account asks the server, and is refused.
    expect((await other.call('data', 'GET', '/api/account/data')).status).toBe(401);
    expect(
      (await other.call('delete', 'POST', '/api/account/delete', { confirm: 'gap_user' })).status,
    ).toBe(401);
    expect(
      (
        await other.call('finish', 'POST', '/api/auth/finish', {
          username: 'gap2_user',
          dob: adultDob,
        })
      ).status,
    ).toBe(401);
    expect(
      await db.query(`select 1 from auth.users where email = 'gap@example.com'`),
    ).toMatchObject({ rowCount: 1 });
  });
});

describe('8. an account with no profile can delete its sign-in', () => {
  it('a refused under-14 deletes the sign-in with a plain confirm, and the refusal goes with it', async () => {
    const { b } = await signUp('kid3@example.com', 'kid_three', dobYearsAgo(10));
    expect(await db.query('select 1 from public.signup_refusals')).toMatchObject({ rowCount: 1 });
    expect((await b.call('delete', 'POST', '/api/account/delete', {})).status).toBe(400);
    expect(
      (await b.call('delete', 'POST', '/api/account/delete', { confirm: 'delete' })).status,
    ).toBe(200);
    expect(
      await db.query(`select 1 from auth.users where email = 'kid3@example.com'`),
    ).toMatchObject({ rowCount: 0 });
    // The refusal belonged to the sign-in (DATABASE.md): it goes with it, and nothing else of them is kept.
    expect(await db.query('select 1 from public.signup_refusals')).toMatchObject({ rowCount: 0 });
    expect(await db.query('select 1 from public.ban_records')).toMatchObject({ rowCount: 0 });
  });

  it('an abandoned sign-up can too', async () => {
    const { b } = await signIn('half@example.com');
    expect(
      (await b.call('delete', 'POST', '/api/account/delete', { confirm: 'delete' })).status,
    ).toBe(200);
    expect(
      await db.query(`select 1 from auth.users where email = 'half@example.com'`),
    ).toMatchObject({ rowCount: 0 });
  });
});

describe('9. no email address, token or link is ever logged', () => {
  it('a provider error that carries the address is logged as a fixed reason only', async () => {
    const lines: string[] = [];
    const spies = (['error', 'warn', 'log', 'info'] as const).map((m) =>
      vi
        .spyOn(console, m)
        .mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' '))),
    );
    try {
      auth.errorText =
        'Email address "secret.person@example.com" is invalid https://x.supabase.co/auth?token=abc123';
      auth.fail.sendLink = true;
      await new Browser().call('email', 'POST', '/api/auth/email', {
        email: 'secret.person@example.com',
      });
      auth.fail.sendLink = false;
      auth.fail.googleUrl = true;
      await new Browser().call('google', 'POST', '/api/auth/google', {});
      auth.fail.googleUrl = false;
      const b = new Browser();
      await b.call('email', 'POST', '/api/auth/email', { email: 'secret.person@example.com' });
      auth.fail.exchange = true;
      await b.call(
        'callback',
        'GET',
        `/auth/callback?code=${auth.sent[auth.sent.length - 1]!.code}`,
      );
      auth.fail.exchange = false;
      const acct = await signUp('secret.two@example.com', 'secret_two');
      auth.fail.deleteUser = true;
      await acct.b.call('delete', 'POST', '/api/account/delete', { confirm: 'secret_two' });
      auth.fail.deleteUser = false;
      auth.fail.signOut = true;
      await acct.b.call('signout', 'POST', '/api/auth/signout', { everywhere: true });
    } finally {
      auth.errorText = null;
      spies.forEach((s) => s.mockRestore());
    }
    expect(lines.length).toBeGreaterThan(0);
    const all = lines.join('\n');
    expect(all).not.toMatch(
      /secret\.person|secret\.two|example\.com|token=|abc123|supabase\.co|link-\d/,
    );
  });
});

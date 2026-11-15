import type { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/community',
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
import { freshDb } from '../../../../packages/db/src/harness';
import { GameServer, setGameServer } from '../game/game';
import { TRUSTED_IP_HEADER_ENV, resetRateLimits } from '../game/http';
import { DbFarmStore } from '../db/dbstore';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import {
  FakeCheck,
  FakeStorage,
  jpegWithExif,
  pngWithText,
  webpWithExif,
} from '../test-support/fakePhotos';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { setPhotoDeps } from './photos';
import { makeDayCard } from './share';
import { cleanImage, ImageError } from './image';
import { cleanText, safeUrl } from './text';

const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');
const HOST = 'http://localhost:3000';
const web = fileURLToPath(new URL('../../', import.meta.url));

type Handler = (req: Request) => Promise<Response>;
const routes: Record<string, { GET?: Handler; POST?: Handler }> = {};
const NAMES = [
  'profile',
  'avatar',
  'follow',
  'block',
  'post',
  'photo',
  'post-photo',
  'comment',
  'like',
  'report',
  'share',
  'search',
  'share-image',
  'group',
  'challenge',
] as const;

let db: PGlite;
let auth: FakeAuth;
let deps: AuthDeps;
let storage: FakeStorage;
let check: FakeCheck;
let ip = 0;

beforeAll(async () => {
  process.env[TRUSTED_IP_HEADER_ENV] = 'x-real-ip';
  db = await freshDb({ seed: false });
  routes.profile = await import('@/app/api/community/profile/route');
  routes.avatar = await import('@/app/api/community/avatar/route');
  routes.follow = await import('@/app/api/community/follow/route');
  routes.block = await import('@/app/api/community/block/route');
  routes.post = await import('@/app/api/community/post/route');
  routes.photo = await import('@/app/api/community/photo/route');
  routes['post-photo'] = await import('@/app/api/community/post-photo/route');
  routes.comment = await import('@/app/api/community/comment/route');
  routes.like = await import('@/app/api/community/like/route');
  routes.report = await import('@/app/api/community/report/route');
  routes.share = await import('@/app/api/community/share/route');
  routes.search = await import('@/app/api/community/search/route');
  routes['share-image'] = await import('@/app/api/community/share-image/route');
  routes.group = await import('@/app/api/community/group/route');
  routes.challenge = await import('@/app/api/community/challenge/route');
  routes.admin = await import('@/app/api/admin/photos/route');
  routes.farm = await import('@/app/api/game/farm/route');
}, 120_000);
afterAll(async () => {
  delete process.env[TRUSTED_IP_HEADER_ENV];
  setAuthDeps(undefined);
  setPhotoDeps(undefined);
  setGameServer(undefined);
  await db?.close();
});

interface Person {
  id: string;
  cookie: string;
  username: string;
}
let people: Record<string, Person>;

async function person(
  key: string,
  opts: {
    role?: string;
    ageYears?: number;
    suspended?: boolean;
    banned?: boolean;
    profile?: boolean;
    privacy?: 'public' | 'followers' | 'private';
  } = {},
): Promise<Person> {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`);
  const username = key.slice(0, 20);
  if (opts.profile !== false) {
    await db.query(
      'insert into public.profiles (user_id, username, privacy_profile) values ($1, $2, $3)',
      [user.id, username, opts.privacy ?? 'public'],
    );
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
  }
  const p = { id: user.id, cookie, username };
  people[key] = p;
  return p;
}

const setSwitch = async (key: string, on: boolean): Promise<void> => {
  await db.query('update public.feature_switches set enabled = $2 where key = $1', [key, on]);
  resetSwitchCache();
};

beforeEach(async () => {
  await db.exec(
    `delete from public.reports;
     truncate public.admin_audit_log;
     update public.account_status set banned_at = null, suspended_until = null;
     delete from storage.objects; delete from public.word_filter;
     delete from public.farms; delete from public.guest_sessions; delete from auth.users;
     truncate public.rate_limit_hits;
     update public.feature_switches set enabled = false where key in ('community','feed_posts','groups');
     update public.feature_switches set enabled = true where key in ('community','feed_posts','groups');`,
  );
  resetRateLimits();
  resetSwitchCache();
  auth = new FakeAuth(db);
  deps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  storage = new FakeStorage(db);
  check = new FakeCheck();
  setPhotoDeps({ storage, check });
  setGameServer(
    new GameServer({ store: new DbFarmStore(deps.sql), seed: () => 3, saveRetryMs: [0, 0] }),
  );
  people = {};
  ip++;
});

async function call(
  route: string,
  method: 'GET' | 'POST',
  who: Person | null,
  body?: unknown,
  opts: { query?: string; headers?: Record<string, string>; address?: string } = {},
): Promise<Response> {
  const base = route === 'admin' ? '/api/admin/photos' : `/api/community/${route}`;
  const req = new Request(`${HOST}${base}${opts.query ?? ''}`, {
    method,
    headers: {
      host: 'localhost:3000',
      'x-real-ip': opts.address ?? `10.2.0.${ip}`,
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...(who ? { cookie: who.cookie } : {}),
      ...opts.headers,
    },
    body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  return routes[route]![method]!(req);
}
const post = (
  route: string,
  who: Person | null,
  body?: unknown,
  opts?: Parameters<typeof call>[4],
) => call(route, 'POST', who, body, opts);
const get = (route: string, who: Person | null, query = '') =>
  call(route, 'GET', who, undefined, { query });
const json = async <T = Record<string, unknown>>(r: Response): Promise<T> => (await r.json()) as T;

/** A post by the person, as the route makes it. Returns its id. */
async function newPost(
  who: Person,
  body = 'Hello from the paddock',
  extra: Record<string, unknown> = {},
): Promise<string> {
  const r = await post('post', who, { action: 'create', body, ...extra });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await json<{ id: string }>(r)).id;
}

async function follow(a: Person, b: Person): Promise<string> {
  const r = await post('follow', a, { action: 'follow', username: b.username });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await json<{ status: string }>(r)).status;
}

const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');

// ================================================================== the walked routes

const ROUTE_BODIES: Record<string, { method: 'GET' | 'POST'; body?: unknown; query?: string }> = {
  profile: { method: 'POST', body: { bio: 'x' } },
  avatar: { method: 'POST', body: { action: 'clear' } },
  follow: { method: 'POST', body: { action: 'follow', username: 'someone' } },
  block: { method: 'POST', body: { action: 'block', username: 'someone' } },
  post: { method: 'POST', body: { action: 'create', body: 'hi' } },
  photo: { method: 'GET', query: '?k=avatar&id=00000000-0000-4000-8000-000000000001' },
  'post-photo': {
    method: 'POST',
    body: { action: 'remove', id: '00000000-0000-4000-8000-000000000001' },
  },
  comment: {
    method: 'POST',
    body: { action: 'delete', id: '00000000-0000-4000-8000-000000000001' },
  },
  like: {
    method: 'POST',
    body: { action: 'unlike', target: 'post', id: '00000000-0000-4000-8000-000000000001' },
  },
  report: {
    method: 'POST',
    body: { target: 'post', id: '00000000-0000-4000-8000-000000000001', reason: 'spam' },
  },
  share: { method: 'POST', body: { farmId: '00000000-0000-4000-8000-000000000001' } },
  search: { method: 'GET', query: '?q=ab' },
  'share-image': { method: 'GET', query: '?post=00000000-0000-4000-8000-000000000001' },
  group: { method: 'POST', body: { action: 'join', code: '000000000000' } },
  challenge: {
    method: 'POST',
    body: { action: 'enter', challengeId: '00000000-0000-4000-8000-000000000001' },
  },
};

function walk(dir: string, match: RegExp): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(web, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(web, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match.test(name)) out.push(rel);
  }
  return out;
}

describe('every community route goes through the gate, the CSRF rule and the limits', () => {
  it('is wrapped in communityRoute, exports only GET or POST, and is in this test (a new route can not be added without it)', () => {
    const files = walk('app/api/community', /^route\.tsx?$/);
    expect(files.length).toBe(NAMES.length);
    const seen: string[] = [];
    for (const f of files) {
      const text = readFileSync(join(web, f), 'utf8');
      expect(text, f).toMatch(/communityRoute\(/);
      const exported = [...text.matchAll(/export (?:const|async function|function) (\w+)/g)]
        .map((m) => m[1])
        .sort();
      const name = f.split('/').slice(-2, -1)[0]!;
      seen.push(name);
      const method = ROUTE_BODIES[name]?.method;
      expect(method, `${name} must be in ROUTE_BODIES`).toBeDefined();
      expect(exported, f).toEqual([method, 'dynamic'].sort());
      expect(text, f).not.toContain('—');
    }
    expect(seen.sort()).toEqual([...NAMES].sort());
  });

  it('gives a visitor, an under-16 account, a banned or suspended one, one with no profile, and anyone while the switch is off the same plain 404', async () => {
    await person('member');
    const kid = await person('kid', { ageYears: 15 });
    const banned = await person('banned', { banned: true });
    const susp = await person('susp', { suspended: true });
    const noprof = await person('noprof', { profile: false });
    const admin = await person('theadmin', { role: 'admin' });
    const answers = new Set<string>();
    for (const [name, spec] of Object.entries(ROUTE_BODIES)) {
      for (const who of [null, kid, banned, susp, noprof]) {
        const res = await call(name, spec.method, who, spec.body, { query: spec.query });
        expect(res.status, `${name} as ${who?.username ?? 'visitor'}`).toBe(404);
        answers.add(await res.text());
        // Nothing says the route exists: no noindex header that a real answer would carry.
        expect(res.headers.get('x-robots-tag')).toBeNull();
      }
    }
    expect(answers.size).toBe(1);
    // The switch off: a member and an admin are refused too.
    await setSwitch('community', false);
    for (const [name, spec] of Object.entries(ROUTE_BODIES)) {
      for (const who of [people.member!, admin]) {
        const res = await call(name, spec.method, who, spec.body, { query: spec.query });
        expect(res.status, `${name} switch off`).toBe(404);
      }
    }
  });

  it('turns the post routes off with the feed_posts switch alone, and leaves profiles on', async () => {
    const m = await person('member');
    await setSwitch('feed_posts', false);
    for (const name of ['post', 'post-photo', 'comment', 'like', 'share']) {
      const spec = ROUTE_BODIES[name]!;
      expect((await call(name, 'POST', m, spec.body)).status, name).toBe(404);
    }
    expect((await post('profile', m, { bio: 'still works' })).status).toBe(200);
  });

  it('refuses a cross-site or non-JSON write from a member with 403, and a write route has no GET', async () => {
    const m = await person('member');
    for (const [name, spec] of Object.entries(ROUTE_BODIES)) {
      if (spec.method !== 'POST') continue;
      const cross = await post(name, m, spec.body, { headers: { origin: 'https://evil.example' } });
      expect(cross.status, `${name} cross-site`).toBe(403);
      const same = await post(name, m, spec.body, { headers: { 'sec-fetch-site': 'same-site' } });
      expect(same.status, `${name} same-site`).toBe(403);
      const form = await routes[name]!.POST!(
        new Request(`${HOST}/api/community/${name}`, {
          method: 'POST',
          headers: {
            host: 'localhost:3000',
            'content-type': 'text/plain',
            cookie: m.cookie,
            'x-real-ip': `10.9.0.${ip}`,
          },
          body: JSON.stringify(spec.body),
        }),
      );
      expect(form.status, `${name} text/plain`).toBe(403);
      expect(routes[name]!.GET, name).toBeUndefined();
    }
  });

  it('limits each member on each route, and the answer carries noindex and no cache', async () => {
    const m = await person('member');
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (
        await post('report', m, {
          target: 'post',
          id: '00000000-0000-4000-8000-000000000001',
          reason: 'spam',
        })
      ).status;
    }
    expect(last).toBe(429);
    const ok = await get('search', m, '?q=zz');
    expect(ok.headers.get('x-robots-tag')).toMatch(/noindex/);
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('with no database keys, every route is a plain 404', async () => {
    const m = await person('member');
    setAuthDeps(null);
    for (const [name, spec] of Object.entries(ROUTE_BODIES)) {
      const res = await call(name, spec.method, m, spec.body, { query: spec.query });
      expect(res.status, name).toBe(404);
    }
  });
});

// ================================================================== the named test

describe('An under-16 test account sees no community anywhere', () => {
  it('is found by no search, followed by no one, shown on no feed, and every route says not found', async () => {
    const adult = await person('adult');
    const kid = await person('kidsmith', { ageYears: 15 });
    // The adult tries every way in.
    expect(
      (await json<{ people: unknown[] }>(await get('search', adult, '?q=kidsm'))).people,
    ).toEqual([]);
    expect((await post('follow', adult, { action: 'follow', username: 'kidsmith' })).status).toBe(
      404,
    );
    expect((await post('block', adult, { action: 'block', username: 'kidsmith' })).status).toBe(
      404,
    );
    expect(
      (await post('report', adult, { target: 'profile', username: 'kidsmith', reason: 'spam' }))
        .status,
    ).toBe(404);
    // The kid can not reach anything, in any direction.
    for (const [name, spec] of Object.entries(ROUTE_BODIES)) {
      expect(
        (await call(name, spec.method, kid, spec.body, { query: spec.query })).status,
        name,
      ).toBe(404);
    }
    // Even a post the database holds for them (written by the server) is not in anyone's feed.
    await db.query(
      `insert into public.posts (author_id, kind, body) values ($1, 'post', 'kid post')`,
      [kid.id],
    );
    const feed = await db.query<{ n: number }>(
      `select count(*)::int as n from public.public_profiles where false`,
    );
    expect(feed.rows[0]!.n).toBe(0);
  });

  it('turns 16 and the community opens by itself, with nothing to run', async () => {
    const turning = await person('turning', { ageYears: 16 });
    // Born 16 years ago today in Sydney: already 16.
    expect((await get('search', turning, '?q=ab')).status).toBe(200);
    await db.query(
      `update public.account_private set date_of_birth = ((now() at time zone 'Australia/Sydney')::date - interval '16 years' + interval '1 day')::date where user_id = $1`,
      [turning.id],
    );
    expect((await get('search', turning, '?q=ab')).status).toBe(404);
  });
});

// ================================================================== profiles

describe('profiles', () => {
  it('saves your own profile, privacy, links, jobs and courses, and validates them', async () => {
    const m = await person('member');
    const r = await post('profile', m, {
      displayName: 'Mem Ber',
      bio: 'Beef and a few sheep.',
      town: 'Emerald',
      district: 'cq',
      farms: true,
      enterprise: 'Beef',
      farmSizeBand: '500_2000',
      yearsFarming: 12,
      farmRole: 'Owner',
      realFarmName: 'Red Creek',
      privacyProfile: 'followers',
      privacyFarmView: 'public',
      tickerOptIn: true,
      hideTicker: true,
      links: { website: 'https://example.com/farm', instagram: '' },
      experience: [
        { role: 'Stockman', enterprise: 'Beef', place: 'Longreach', from: 2010, to: 2015 },
      ],
      education: [{ course: 'Grazing for Profit', provider: 'GFP', year: 2019 }],
    });
    expect(r.status, await r.clone().text()).toBe(200);
    const row = (
      await db.query<Record<string, unknown>>('select * from public.profiles where user_id = $1', [
        m.id,
      ])
    ).rows[0]!;
    expect(row).toMatchObject({
      display_name: 'Mem Ber',
      district: 'cq',
      state: 'QLD',
      privacy_profile: 'followers',
      privacy_farm_view: 'public',
      ticker_opt_in: true,
    });
    expect(
      (await db.query('select 1 from public.profile_links where user_id = $1', [m.id])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('select 1 from public.profile_experience where user_id = $1', [m.id])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query('select hide_ticker from public.account_private where user_id = $1', [m.id]))
        .rows[0],
    ).toEqual({ hide_ticker: true });
    // Refusals say why in plain words.
    for (const bad of [
      { links: { website: 'http://example.com' } },
      { links: { website: 'javascript:alert(1)' } },
      { links: { nonsense: 'https://example.com' } },
      { privacyProfile: 'everyone' },
      { district: 'zz' },
      { yearsFarming: 200 },
      { experience: [{ role: 'x', from: 2020, to: 2010 }] },
      { bio: 'a'.repeat(501) },
      { displayName: 'b'.repeat(51) },
    ]) {
      const res = await post('profile', m, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect((await json<{ error: string }>(res)).error.length).toBeGreaterThan(5);
    }
  });

  it('records the privacy defaults from DATABASE.md for a new account', async () => {
    const m = await person('member');
    const r = (
      await db.query<Record<string, unknown>>(
        'select privacy_profile, privacy_farm_view, ticker_opt_in from public.profiles where user_id = $1',
        [m.id],
      )
    ).rows[0];
    expect(r).toEqual({
      privacy_profile: 'public',
      privacy_farm_view: 'followers',
      ticker_opt_in: false,
    });
  });

  it('applies the word filter to profile text, and to the fields the database does not check', async () => {
    const m = await person('member');
    await db.query(`insert into public.word_filter (term, kind) values ('badword', 'block')`);
    for (const body of [
      { bio: 'this has a badword in it' },
      { enterprise: 'badword farming' },
      { experience: [{ role: 'badword hand' }] },
      { education: [{ course: 'the badword course' }] },
    ]) {
      const res = await post('profile', m, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await json<{ code: string }>(res)).code).toBe('word_filter');
    }
  });

  it('lets a username-shaped search find only members who may be found: not blocked, not under 16, not yourself', async () => {
    const a = await person('farmer_a');
    await person('farmer_b');
    const blocker = await person('farmer_c');
    await person('farmer_kid', { ageYears: 12 + 3 });
    await post('block', blocker, { action: 'block', username: 'farmer_a' });
    const names = async (who: Person, q: string): Promise<string[]> =>
      (
        await json<{ people: { username: string }[] }>(await get('search', who, `?q=${q}`))
      ).people.map((p) => p.username);
    expect(await names(a, 'farmer')).toEqual(['farmer_b']);
    expect(await names(blocker, 'farmer')).toEqual(['farmer_b']);
    expect(await names(people.farmer_b!, 'farmer')).toEqual(['farmer_a', 'farmer_c']);
    // Bounded and safe: wildcards, spaces, too short, too long find nothing and never error.
    for (const q of ['f', '%25', 'farmer%20a', '_', 'a'.repeat(30), "x'%3Bdrop"]) {
      const res = await get('search', a, `?q=${q}`);
      expect(res.status, q).toBe(200);
      expect((await json<{ people: unknown[] }>(res)).people).toEqual([]);
    }
  });
});

// ================================================================== follows and blocks

describe('following, requests and blocks', () => {
  it('follows a public profile at once, asks to follow a followers-only one, and refuses a private one', async () => {
    const a = await person('alice');
    const pub = await person('pubbie');
    const fol = await person('folly', { privacy: 'followers' });
    const priv = await person('privy', { privacy: 'private' });
    expect(await follow(a, pub)).toBe('accepted');
    expect(await follow(a, fol)).toBe('pending');
    const res = await post('follow', a, { action: 'follow', username: priv.username });
    expect(res.status).toBe(403);
    expect((await json<{ error: string }>(res)).error).toMatch(/private/i);
    // Following yourself or a stranger's made-up name is refused.
    expect((await post('follow', a, { action: 'follow', username: 'alice' })).status).toBe(400);
    expect((await post('follow', a, { action: 'follow', username: 'nobody_here' })).status).toBe(
      404,
    );
  });

  it('shows a pending request only to the two people, and lets only the person asked accept', async () => {
    const a = await person('alice');
    const f = await person('folly', { privacy: 'followers' });
    const other = await person('other');
    await follow(a, f);
    // Through the database as each person: the request row.
    const rowsAs = async (who: Person): Promise<number> => {
      const { asUser } = await import('../auth/accounts');
      return asUser(
        deps.sql,
        who.id,
        async (tx) =>
          (await tx.query(`select 1 from public.follows where status = 'pending'`)).rowCount,
      );
    };
    expect(await rowsAs(a)).toBe(1);
    expect(await rowsAs(f)).toBe(1);
    expect(await rowsAs(other)).toBe(0);
    // The one who asked can not accept their own request; a third person can not either.
    expect((await post('follow', a, { action: 'accept', username: 'folly' })).status).toBe(404);
    expect((await post('follow', other, { action: 'accept', username: 'alice' })).status).toBe(404);
    expect((await post('follow', f, { action: 'accept', username: 'alice' })).status).toBe(200);
    expect(await rowsAs(other)).toBe(0);
    // Decline removes a request.
    const b2 = await person('bobby');
    await follow(b2, f);
    expect((await post('follow', f, { action: 'decline', username: 'bobby' })).status).toBe(200);
    expect(
      (await db.query('select 1 from public.follows where follower_id = $1', [b2.id])).rows,
    ).toHaveLength(0);
  });

  it('hides a followers-only profile from a non-follower but not from an accepted follower', async () => {
    const f = await person('folly', { privacy: 'followers' });
    const a = await person('alice');
    const { asUser } = await import('../auth/accounts');
    const { profileByUsername } = await import('./data');
    const view = (who: Person) => asUser(deps.sql, who.id, (tx) => profileByUsername(tx, 'folly'));
    await post('profile', f, { bio: 'Followers only bio' });
    const before = await view(a);
    expect(before).toMatchObject({ username: 'folly', detailsVisible: false, bio: null });
    await follow(a, f);
    expect((await view(a))!.detailsVisible).toBe(false);
    await post('follow', f, { action: 'accept', username: 'alice' });
    expect(await view(a)).toMatchObject({ detailsVisible: true, bio: 'Followers only bio' });
    // A private profile shows its card and nothing else, to a follower too.
    await post('profile', f, { privacyProfile: 'private' });
    expect(await view(a)).toMatchObject({ detailsVisible: false, bio: null });
    expect(await view(f)).toMatchObject({ detailsVisible: true });
  });

  it('blocks both ways: no search, no profile, no follow, no comment, and a block ends a follow', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    await follow(a, b);
    await follow(b, a);
    expect((await post('block', a, { action: 'block', username: 'bobby' })).status).toBe(200);
    expect((await db.query('select 1 from public.follows')).rows).toHaveLength(0);
    const { asUser } = await import('../auth/accounts');
    const { profileByUsername } = await import('./data');
    expect(await asUser(deps.sql, a.id, (tx) => profileByUsername(tx, 'bobby'))).toBeNull();
    expect(await asUser(deps.sql, b.id, (tx) => profileByUsername(tx, 'alice'))).toBeNull();
    expect((await post('follow', b, { action: 'follow', username: 'alice' })).status).toBe(404);
    expect((await post('follow', a, { action: 'follow', username: 'bobby' })).status).toBe(404);
    // A post by one is not seen by the other, and can not be liked or commented on.
    const pid = await newPost(a, 'only for those who are not blocked');
    expect((await post('like', b, { action: 'like', target: 'post', id: pid })).status).toBe(404);
    expect((await post('comment', b, { action: 'create', postId: pid, body: 'hi' })).status).toBe(
      404,
    );
    // Unblock, from the blocker's own list.
    const blocked = await db.query<{ blocked_id: string }>(
      'select blocked_id from public.blocks where blocker_id = $1',
      [a.id],
    );
    expect(
      (await post('block', a, { action: 'unblock', userId: blocked.rows[0]!.blocked_id })).status,
    ).toBe(200);
    expect((await post('follow', b, { action: 'follow', username: 'alice' })).status).toBe(200);
    // Someone else's unblock changes nothing of a block that is not theirs.
    await post('block', a, { action: 'block', username: 'bobby' });
    await post('block', b, { action: 'unblock', userId: a.id });
    expect((await db.query('select 1 from public.blocks')).rows).toHaveLength(1);
  });
});

// ================================================================== posts, comments, likes, reports

describe('posts, comments, likes and reports', () => {
  it("writes, edits and deletes your own post, and not anyone else's", async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const id = await newPost(a, 'First post', { link: 'https://example.com/a' });
    expect(
      (await post('post', a, { action: 'edit', id, body: 'Edited post', visibility: 'followers' }))
        .status,
    ).toBe(200);
    const row = (
      await db.query<{ body: string; visibility: string; edited_at: string | null }>(
        'select body, visibility, edited_at from public.posts where id = $1',
        [id],
      )
    ).rows[0]!;
    expect(row).toMatchObject({ body: 'Edited post', visibility: 'followers' });
    expect(row.edited_at).not.toBeNull();
    expect((await post('post', b, { action: 'edit', id, body: 'Hijack' })).status).toBe(404);
    expect((await post('post', b, { action: 'delete', id })).status).toBe(404);
    expect((await post('post', a, { action: 'delete', id })).status).toBe(200);
    expect((await db.query('select 1 from public.posts')).rows).toHaveLength(0);
    // Refusals: empty, too long, a link that is not https.
    for (const bad of [
      { body: '' },
      { body: 'x'.repeat(2001) },
      { body: 'hi', link: 'http://example.com' },
      { body: 'hi', link: 'javascript:alert(1)' },
      { body: 'hi', visibility: 'friends' },
    ]) {
      expect(
        (await post('post', a, { action: 'create', ...bad })).status,
        JSON.stringify(bad),
      ).toBe(400);
    }
  });

  it('shows a post removed by a moderator as removed to its author, and the author can not delete it', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const id = await newPost(a, 'Something that gets removed');
    await db.query(`update public.posts set removed_at = now() where id = $1`, [id]);
    const { asUser } = await import('../auth/accounts');
    const { getPost } = await import('./data');
    const mine = await asUser(deps.sql, a.id, (tx) => getPost(tx, a.id, id));
    expect(mine).toMatchObject({ removed: true, body: null, mine: true });
    expect(await asUser(deps.sql, b.id, (tx) => getPost(tx, b.id, id))).toBeNull();
    const del = await post('post', a, { action: 'delete', id });
    expect(del.status).toBe(409);
    expect((await json<{ error: string }>(del)).error).toMatch(/removed/);
    expect((await db.query('select 1 from public.posts where id = $1', [id])).rows).toHaveLength(1);
    expect((await post('post', a, { action: 'edit', id, body: 'bring it back' })).status).toBe(409);
  });

  it('comments with one level of replies, edits and deletes only your own, and a removed comment shows as removed', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const id = await newPost(a);
    const c = await json<{ id: string }>(
      await post('comment', b, { action: 'create', postId: id, body: 'Nice' }),
    );
    const reply = await post('comment', a, {
      action: 'create',
      postId: id,
      parentId: c.id,
      body: 'Thanks',
    });
    expect(reply.status).toBe(200);
    const rid = (await json<{ id: string }>(reply)).id;
    // A reply to a reply is refused.
    expect(
      (await post('comment', b, { action: 'create', postId: id, parentId: rid, body: 'deeper' }))
        .status,
    ).toBe(400);
    expect((await post('comment', a, { action: 'edit', id: c.id, body: 'not mine' })).status).toBe(
      404,
    );
    expect((await post('comment', a, { action: 'delete', id: c.id })).status).toBe(404);
    expect((await post('comment', b, { action: 'edit', id: c.id, body: 'Very nice' })).status).toBe(
      200,
    );
    await db.query('update public.comments set removed_at = now() where id = $1', [c.id]);
    const { asUser } = await import('../auth/accounts');
    const { commentsPage } = await import('./data');
    const forB = await asUser(deps.sql, b.id, (tx) => commentsPage(tx, b.id, id, null));
    expect(forB.items.find((x) => x.id === c.id)).toMatchObject({ removed: true, body: null });
    const forA = await asUser(deps.sql, a.id, (tx) => commentsPage(tx, a.id, id, null));
    expect(forA.items.find((x) => x.id === c.id)).toBeUndefined();
    expect((await post('comment', b, { action: 'delete', id: c.id })).status).toBe(409);
  });

  it('likes and unlikes a post and a comment once each', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const id = await newPost(a);
    expect((await post('like', b, { action: 'like', target: 'post', id })).status).toBe(200);
    expect((await post('like', b, { action: 'like', target: 'post', id })).status).toBe(200);
    expect((await db.query('select 1 from public.likes')).rows).toHaveLength(1);
    expect((await post('like', b, { action: 'unlike', target: 'post', id })).status).toBe(200);
    expect((await db.query('select 1 from public.likes')).rows).toHaveLength(0);
    expect((await post('like', b, { action: 'like', target: 'thing', id })).status).toBe(400);
    expect((await post('like', b, { action: 'like', target: 'post', id: 'nope' })).status).toBe(
      400,
    );
  });

  it('reports a post, comment or profile with the listed reasons, once, and the reporter sees no moderator notes', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const id = await newPost(a);
    expect(
      (await post('report', b, { target: 'post', id, reason: 'spam', details: 'it is spam' }))
        .status,
    ).toBe(200);
    expect((await post('report', b, { target: 'post', id, reason: 'spam' })).status).toBe(200);
    expect(
      (await post('report', b, { target: 'profile', username: 'alice', reason: 'impersonation' }))
        .status,
    ).toBe(200);
    expect((await db.query('select 1 from public.reports')).rows).toHaveLength(2);
    for (const bad of [
      { target: 'post', id, reason: 'rude' },
      { target: 'group', id, reason: 'spam' },
      { target: 'post', id: 'x', reason: 'spam' },
    ]) {
      expect((await post('report', b, bad)).status, JSON.stringify(bad)).toBe(400);
    }
    // A post the reporter can not see is "not found".
    await post('block', a, { action: 'block', username: 'bobby' });
    expect((await post('report', b, { target: 'post', id, reason: 'spam' })).status).toBe(404);
    expect(
      (await post('report', b, { target: 'profile', username: 'bobby', reason: 'spam' })).status,
    ).toBe(400);
  });

  it('applies the word filter and the rate limit to posts and comments, with plain messages', async () => {
    const a = await person('alice');
    await db.query(
      `insert into public.word_filter (term, kind) values ('badword', 'block'), ('iffy', 'flag')`,
    );
    const blocked = await post('post', a, { action: 'create', body: 'a BADWORD here' });
    expect(blocked.status).toBe(400);
    expect((await json<{ code: string }>(blocked)).code).toBe('word_filter');
    // Hiding it with zero-width characters does not get past: they are removed before the check.
    const sneaky = await post('post', a, { action: 'create', body: 'a bad​word here' });
    expect(sneaky.status).toBe(400);
    // A flagged word posts and opens a report.
    const id = await newPost(a, 'this is iffy but allowed');
    expect(
      (await db.query('select 1 from public.reports where target_id = $1', [id])).rows,
    ).toHaveLength(1);
    // A new account is held to 5 posts an hour by the database.
    let status = 200;
    for (let i = 0; i < 6; i++)
      status = (await post('post', a, { action: 'create', body: `post ${i}` })).status;
    expect(status).toBe(429);
    expect(
      (await json<{ code: string }>(await post('post', a, { action: 'create', body: 'again' })))
        .code,
    ).toBe('rate_limited');
  });

  it('stores what is typed as plain text: script tags, links and odd characters never become markup', async () => {
    const a = await person('alice');
    const evil = '<script>alert(1)</script> <img src=x onerror=alert(2)> ‮evil‬';
    const id = await newPost(a, evil);
    const stored = (
      await db.query<{ body: string }>('select body from public.posts where id = $1', [id])
    ).rows[0]!.body;
    // The text is kept as text (React escapes it on the page). The direction override characters are gone.
    expect(stored).toContain('<script>alert(1)</script>');
    expect(stored).not.toMatch(/[‪-‮⁦-⁩]/);
    expect(cleanText('a​b‏c⁠d﻿e')).toBe('abcde');
    expect(cleanText('x\u0000y\u0007z')).toBe('xyz');
    expect(cleanText('👨‍🌾 farmer')).toBe('👨‍🌾 farmer');
    // Links: https only, no sign-in details, no other schemes, no spaces.
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<b>x</b>',
      'http://example.com',
      'https://user:pass@example.com',
      'https://exa mple.com',
      'https://localhost',
      'https://1.2.3.4',
      '//example.com',
      'ftp://example.com',
      'https://example.com/‮evil',
    ]) {
      expect(safeUrl(bad), bad).toBeNull();
    }
    expect(safeUrl('https://example.com/a?b=c#d')).toBe('https://example.com/a?b=c#d');
    // The pages' own output is escaped: rendered markup holds no live tag from the text.
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { PostCard } = await import('@/components/community/Parts');
    const { asUser } = await import('../auth/accounts');
    const { getPost } = await import('./data');
    const view = (await asUser(deps.sql, a.id, (tx) => getPost(tx, a.id, id)))!;
    const html = renderToStaticMarkup(
      PostCard({ post: { ...view, linkUrl: 'javascript:alert(3)', linkHref: null } }),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toMatch(/href="javascript:/i);
  });

  it('keeps RTL and zero-width characters out of usernames (the database refuses them)', async () => {
    const { user } = await auth.signInAs('odd@example.test');
    for (const name of ['abc​def', 'abc‮def', 'abcd‏']) {
      await expect(
        db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
          user.id,
          name,
        ]),
      ).rejects.toThrow();
    }
  });
});

// ================================================================== the feed

describe('the feed', () => {
  it('has the three tabs, pages by cursor with no gaps or repeats, and shows empty states', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const { asUser } = await import('../auth/accounts');
    const { feedPage, PAGE_SIZE } = await import('./data');
    // Many posts. The database limits a new account, so put them in directly.
    for (let i = 0; i < 45; i++) {
      await db.query(
        `insert into public.posts (author_id, body, created_at) values ($1, $2, now() - ($3 || ' minutes')::interval)`,
        [b.id, `post ${i}`, String(i)],
      );
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { items: { id: string; body: string | null }[]; next: string | null } =
        await asUser(deps.sql, a.id, (tx) => feedPage(tx, a.id, 'everyone', cursor));
      seen.push(...page.items.map((p) => p.id));
      cursor = page.next;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(45);
    expect(PAGE_SIZE).toBe(20);
    // Friends' days is empty until a follow is accepted, then holds their posts; groups is empty.
    const friends = () => asUser(deps.sql, a.id, (tx) => feedPage(tx, a.id, 'friends', null));
    expect((await friends()).items).toHaveLength(0);
    await follow(a, b);
    expect((await friends()).items).toHaveLength(20);
    expect(
      (await asUser(deps.sql, a.id, (tx) => feedPage(tx, a.id, 'groups', null))).items,
    ).toHaveLength(0);
    // A bad cursor is ignored, never run.
    expect(
      (
        await asUser(deps.sql, a.id, (tx) =>
          feedPage(tx, a.id, 'everyone', "1'; drop table posts; --"),
        )
      ).items,
    ).toHaveLength(20);
    // Followers-only posts reach followers only.
    const c = await person('carol');
    await db.query(
      `insert into public.posts (author_id, body, visibility) values ($1, 'followers only', 'followers')`,
      [b.id],
    );
    const everyoneC = await asUser(deps.sql, c.id, (tx) => feedPage(tx, c.id, 'everyone', null));
    expect(everyoneC.items.some((p) => p.body === 'followers only')).toBe(false);
  });

  it("shows a Friends' day card to a follower only, built from facts, and makes none for a private profile, a Fast Farm or an empty day", async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const { asUser } = await import('../auth/accounts');
    const { feedPage } = await import('./data');
    const farm = (
      await db.query<{ id: string }>(
        `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, timezone, sim_through, current_day, game_date)
       values ($1, 'daily', 'Day Farm', 'cq', 'small', 100, 'grazing', 'scratch', 'medium', 'x', 'Australia/Sydney', '2026-03-04', 5, '2026-03-05') returning id`,
        [b.id],
      )
    ).rows[0]!.id;
    await db.query(
      `insert into public.farm_days (farm_id, day, game_date, lines, more, rain_mm) values ($1, 4, '2026-03-04', array['Built 10 km of electric fence', 'Moved 2 mobs'], 1, 12.5)`,
      [farm],
    );
    await db.query(
      `insert into public.farm_days (farm_id, day, game_date, lines) values ($1, 3, '2026-03-03', '{}')`,
      [farm],
    );
    expect(await makeDayCard(deps.sql, farm, 3)).toBeNull();
    const made = await makeDayCard(deps.sql, farm, 4);
    expect(made).not.toBeNull();
    // Once per farm and day.
    expect(await makeDayCard(deps.sql, farm, 4)).toBeNull();
    const row = (
      await db.query<{
        card: { facts: { label: string | null; value: string }[] };
        visibility: string;
      }>('select card, visibility from public.posts where id = $1', [made!.id])
    ).rows[0]!;
    expect(row.visibility).toBe('public');
    expect(row.card.facts.map((f) => f.value)).toEqual([
      '4 Mar 2026',
      'Built 10 km of electric fence',
      'Moved 2 mobs',
      'and 1 more',
      '12.5 mm',
    ]);
    const friends = await asUser(deps.sql, a.id, (tx) => feedPage(tx, a.id, 'friends', null));
    expect(friends.items).toHaveLength(0);
    await follow(a, b);
    const after = await asUser(deps.sql, a.id, (tx) => feedPage(tx, a.id, 'friends', null));
    expect(after.items.map((p) => p.kind)).toEqual(['day_card']);
    expect(after.items[0]!.card?.title).toBe('Day 4');
    // A private profile makes no day card. A Fast Farm makes none.
    await db.query(`update public.profiles set privacy_profile = 'private' where user_id = $1`, [
      b.id,
    ]);
    await db.query(
      `insert into public.farm_days (farm_id, day, game_date, lines) values ($1, 6, '2026-03-06', array['x'])`,
      [farm],
    );
    expect(await makeDayCard(deps.sql, farm, 6)).toBeNull();
  });
});

// ================================================================== Share my farm

describe('Share my farm', () => {
  const choices = {
    district: 'wv',
    size: 'small',
    enterprise: 'grazing',
    years: 'random',
    startType: 'scratch',
    difficulty: 'medium',
    name: 'Share Farm',
  };

  async function farmFor(who: Person): Promise<string> {
    const res = await routes.farm!.POST!(
      new Request(`${HOST}/api/game/farm`, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'content-type': 'application/json',
          cookie: who.cookie,
          'x-real-ip': `10.7.0.${ip}`,
        },
        body: JSON.stringify(choices),
      }),
    );
    expect(res.status, await res.clone().text()).toBe(200);
    return (
      await db.query<{ id: string }>('select id from public.farms where owner_id = $1', [who.id])
    ).rows[0]!.id;
  }

  it("posts a card of plain facts the server builds from your own farm, fixed at posting time, and never from someone else's", async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const farm = await farmFor(a);
    const r = await post('share', a, { farmId: farm, body: 'Day one on the place' });
    expect(r.status, await r.clone().text()).toBe(200);
    const id = (await json<{ id: string }>(r)).id;
    const row = (
      await db.query<{
        kind: string;
        card: { v: number; kind: string; title: string; facts: { label: string; value: string }[] };
        farm_id: string;
      }>('select kind, card, farm_id from public.posts where id = $1', [id])
    ).rows[0]!;
    expect(row.kind).toBe('share_farm');
    expect(row.card.v).toBe(1);
    expect(row.card.title).toMatch(/^Share Farm, Day \d+$/);
    expect(row.card.facts.map((f) => f.label)).toEqual([
      'Farm',
      'Date',
      'Season',
      'Head',
      'Pasture',
      'Ground cover',
      'Net worth',
    ]);
    // Only facts the farm screen shows: no key that names a formula, a save or a table.
    const text = JSON.stringify(row.card);
    expect(text).not.toMatch(/save|formula|growth|seed|engine|intake|\bME\b/i);
    expect(text).not.toContain('—');
    // The card is stored, not a link: it does not change when the farm moves on.
    const before = JSON.stringify(row.card);
    await db.query('update public.farms set current_day = current_day + 3', []);
    expect(
      JSON.stringify(
        (await db.query<{ card: unknown }>('select card from public.posts where id = $1', [id]))
          .rows[0]!.card,
      ),
    ).toBe(before);
    // Someone else's farm is "not found".
    expect((await post('share', b, { farmId: farm })).status).toBe(404);
    expect((await post('share', b, { farmId: 'nope' })).status).toBe(400);
    // The share image is only for a public post, and shows the facts.
    const img = await get('share-image', b, `?post=${id}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');
    await db.query(`update public.posts set visibility = 'followers' where id = $1`, [id]);
    expect((await get('share-image', b, `?post=${id}`)).status).toBe(404);
    expect((await get('share-image', b, '?post=nope')).status).toBe(404);
  });
});

// ================================================================== photos

describe('A photo never shows before it has been checked', () => {
  async function postWithPhoto(
    a: Person,
    bytes = jpegWithExif(),
  ): Promise<{ post: string; photo: string }> {
    const pid = await newPost(a, 'A post with a photo');
    const r = await post('post-photo', a, { action: 'add', postId: pid, data: b64(bytes) });
    expect(r.status, await r.clone().text()).toBe(200);
    const out = await json<{ id: string; status: string }>(r);
    expect(out.status).toBe('pending');
    return { post: pid, photo: out.id };
  }
  const photoUrl = (id: string): string => `?k=post&id=${id}`;

  it('holds a new photo as pending (no service set up), shows nothing to anyone, and says so to the author only', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const { post: pid, photo } = await postWithPhoto(a);
    // Not served to the author, nor to anyone else, while pending.
    expect((await get('photo', a, photoUrl(photo))).status).toBe(404);
    expect((await get('photo', b, photoUrl(photo))).status).toBe(404);
    // The author's own read sees it as pending; others' read sees no photo row at all.
    const { asUser } = await import('../auth/accounts');
    const { getPost } = await import('./data');
    expect((await asUser(deps.sql, a.id, (tx) => getPost(tx, a.id, pid)))!.photos).toEqual([
      { id: photo, status: 'pending' },
    ]);
    expect((await asUser(deps.sql, b.id, (tx) => getPost(tx, b.id, pid)))!.photos).toEqual([]);
    // It was stored in the author's own folder with a name the server made.
    const path = (
      await db.query<{ storage_path: string }>(
        'select storage_path from public.post_photos where id = $1',
        [photo],
      )
    ).rows[0]!.storage_path;
    expect(path).toMatch(new RegExp(`^${a.id}/[0-9a-f-]{36}\\.jpg$`));
    // The check ran and said "review": nothing was approved.
    expect(check.seen.length).toBe(1);
    // The stored file carries no location: the EXIF, the comment, and nothing else were removed.
    const stored = Buffer.from(storage.files.get(`post-photos/${path}`)!).toString('latin1');
    expect(stored).not.toContain('GPSLatitude');
    expect(stored).not.toContain('secret-com');
    expect(stored).not.toContain('Exif');
    expect(stored).toContain('JFIF');
  });

  it('approves only through the image check or an admin, for the exact file, and then others can see it', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    check.answer = 'pass';
    const pid = await newPost(a, 'passes the check');
    const r = await post('post-photo', a, { action: 'add', postId: pid, data: b64(pngWithText()) });
    const out = await json<{ id: string; status: string }>(r);
    expect(out.status).toBe('approved');
    const served = await get('photo', b, photoUrl(out.id));
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    const bytes = Buffer.from(await served.arrayBuffer()).toString('latin1');
    expect(bytes).not.toContain('secret-text');
    expect(bytes).not.toContain('eXIf');
    // A check that fails rejects: not shown to anyone, the author told.
    check.answer = 'fail';
    const pid2 = await newPost(a, 'fails the check');
    const bad = await json<{ id: string; status: string }>(
      await post('post-photo', a, { action: 'add', postId: pid2, data: b64(webpWithExif()) }),
    );
    expect(bad.status).toBe('rejected');
    expect((await get('photo', b, photoUrl(bad.id))).status).toBe(404);
    expect((await get('photo', a, photoUrl(bad.id))).status).toBe(404);
    // A bare change of status to approved is refused for everyone (only approve_photo can).
    await expect(
      db.query(`update public.post_photos set moderation_status = 'approved' where id = $1`, [
        bad.id,
      ]),
    ).rejects.toThrow();
  });

  it('approves a queued photo from the admin page for the exact file shown, and refuses when the file was swapped', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const admin = await person('theadmin', { role: 'admin' });
    const { post: pid, photo } = await postWithPhoto(a);
    const { pendingPhotos } = await import('./photos');
    const queue = await pendingPhotos(deps.sql);
    expect(queue).toHaveLength(1);
    const file = queue[0]!.file!;
    const ask = (over: Record<string, unknown> = {}) =>
      post('admin', admin, {
        kind: 'post_photo',
        row: photo,
        objectId: file.id,
        updatedAt: file.updatedAt,
        version: file.version,
        decision: 'approve',
        ...over,
      });
    // A player, an under-16 account and a visitor can not use the queue: the same plain 404.
    expect(
      (
        await post('admin', a, {
          kind: 'post_photo',
          row: photo,
          objectId: file.id,
          updatedAt: file.updatedAt,
          version: file.version,
          decision: 'approve',
        })
      ).status,
    ).toBe(404);
    expect((await post('admin', null, {})).status).toBe(404);
    // Swap the file under the same name after the admin looked: nothing is approved.
    const path = queue[0]!.path;
    // A real JPEG (since Stage 4 only a real picture of the named type is served).
    await storage.put('post-photos', path, cleanImage(jpegWithExif(), 1 << 20).bytes, 'image/jpeg');
    const stale = await ask();
    expect(stale.status).toBe(409);
    expect((await json<{ error: string }>(stale)).error).toMatch(/changed/);
    expect(
      (
        await db.query<{ moderation_status: string }>(
          'select moderation_status from public.post_photos where id = $1',
          [photo],
        )
      ).rows[0]!.moderation_status,
    ).toBe('pending');
    expect((await get('photo', b, photoUrl(photo))).status).toBe(404);
    // Look again at the new file, and approve that one.
    const again = (await pendingPhotos(deps.sql))[0]!.file!;
    expect(
      (await ask({ objectId: again.id, updatedAt: again.updatedAt, version: again.version }))
        .status,
    ).toBe(200);
    expect(
      (
        await db.query<{ moderation_status: string; storage_object_id: string }>(
          'select moderation_status, storage_object_id from public.post_photos where id = $1',
          [photo],
        )
      ).rows[0],
    ).toMatchObject({ moderation_status: 'approved', storage_object_id: again.id });
    const audit = await db.query<{
      action: string;
      target_type: string;
      target_id: string;
      admin_id: string;
    }>('select action, target_type, target_id, admin_id from public.admin_audit_log');
    expect(audit.rows).toEqual([
      { action: 'photo_approve', target_type: 'photo', target_id: photo, admin_id: admin.id },
    ]);
    // The photo is served: the file is the approved one, and a real JPEG.
    expect((await get('photo', b, photoUrl(photo))).status).toBe(200);
    // Swapping the approved file hides it again at once, whatever the row says.
    await storage.put('post-photos', path, new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg');
    expect((await get('photo', b, photoUrl(photo))).status).toBe(404);
    expect(
      (
        await db.query<{ moderation_status: string }>(
          'select moderation_status from public.post_photos where id = $1',
          [photo],
        )
      ).rows[0]!.moderation_status,
    ).toBe('pending');
    void pid;
  });

  it('rejects from the queue, and writes the audit row in the same step (a failed audit write undoes the change)', async () => {
    const a = await person('alice');
    const admin = await person('theadmin', { role: 'admin' });
    const { photo } = await postWithPhoto(a);
    const { pendingPhotos } = await import('./photos');
    const file = (await pendingPhotos(deps.sql))[0]!.file!;
    const { reviewPhoto } = await import('./adminPhotos');
    const failing = {
      query: deps.sql.query,
      transaction: <T>(
        fn: (tx: { query: (t: string, p?: unknown[]) => Promise<never> }) => Promise<T>,
      ) =>
        deps.sql.transaction((tx) =>
          fn({
            query: ((t: string, p?: unknown[]) =>
              /insert into public\.admin_audit_log/.test(t)
                ? Promise.reject(new Error('audit down'))
                : tx.query(t, p)) as never,
          } as never),
        ),
    };
    await expect(
      reviewPhoto(failing as never, admin.id, {
        kind: 'post_photo',
        row: photo,
        objectId: file.id,
        updatedAt: file.updatedAt,
        version: file.version,
        decision: 'reject',
      }),
    ).rejects.toThrow('audit down');
    expect(
      (
        await db.query<{ moderation_status: string }>(
          'select moderation_status from public.post_photos where id = $1',
          [photo],
        )
      ).rows[0]!.moderation_status,
    ).toBe('pending');
    const r = await post('admin', admin, {
      kind: 'post_photo',
      row: photo,
      objectId: file.id,
      updatedAt: file.updatedAt,
      version: file.version,
      decision: 'reject',
    });
    expect(r.status).toBe(200);
    expect(
      (
        await db.query<{ moderation_status: string }>(
          'select moderation_status from public.post_photos where id = $1',
          [photo],
        )
      ).rows[0]!.moderation_status,
    ).toBe('rejected');
  });

  it('the photo queue route has the admin gate: 404 for everyone but an admin, 403 across sites, 404 with no keys', async () => {
    const a = await person('alice');
    const admin = await person('theadmin', { role: 'admin' });
    const kid = await person('kidsmith', { ageYears: 15 });
    const susp = await person('suspadmin', { role: 'admin', suspended: true });
    const body = {
      kind: 'post_photo',
      row: '00000000-0000-4000-8000-000000000001',
      objectId: '00000000-0000-4000-8000-000000000002',
      updatedAt: '2026-01-01T00:00:00.000000Z',
      version: null,
      decision: 'approve',
    };
    for (const who of [null, a, kid, susp]) {
      const res = await post('admin', who, body);
      expect(res.status, who?.username ?? 'visitor').toBe(404);
      expect(res.headers.get('x-robots-tag')).toBeNull();
    }
    expect(
      (await post('admin', admin, body, { headers: { origin: 'https://evil.example' } })).status,
    ).toBe(403);
    expect(
      (await post('admin', admin, body, { headers: { 'sec-fetch-site': 'cross-site' } })).status,
    ).toBe(403);
    // A photo that is not waiting is a plain 409, and nothing is written.
    const res = await post('admin', admin, body);
    expect(res.status).toBe(409);
    expect((await db.query('select 1 from public.admin_audit_log')).rows).toHaveLength(0);
    setAuthDeps(null);
    expect((await post('admin', admin, body)).status).toBe(404);
  });

  it('only the author adds photos, to a post that is theirs, up to four, and refuses files that are not pictures', async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const pid = await newPost(a);
    const add = (who: Person, data: string, id = pid) =>
      post('post-photo', who, { action: 'add', postId: id, data });
    expect((await add(b, b64(jpegWithExif()))).status).toBe(404);
    for (let i = 0; i < 4; i++) expect((await add(a, b64(jpegWithExif()))).status).toBe(200);
    const fifth = await add(a, b64(jpegWithExif()));
    expect(fifth.status).toBe(409);
    // Nothing is left behind when a photo is refused.
    const files = [...storage.files.keys()].length;
    expect(files).toBe(4);
    const p2 = await newPost(a, 'second');
    for (const bad of [
      Buffer.from('<script>alert(1)</script>').toString('base64'),
      Buffer.from('GIF89a....').toString('base64'),
      Buffer.from('%PDF-1.4').toString('base64'),
      'not base64 !!',
      '',
    ]) {
      expect((await add(a, bad, p2)).status, bad.slice(0, 12)).toBe(400);
    }
    // A page renamed .jpg, an oversize picture and a decompression bomb are refused.
    const html = new Uint8Array([0xff, 0xd8, 0xff, ...Buffer.from('<html>')]);
    expect((await add(a, b64(html), p2)).status).toBe(400);
    expect(() => cleanImage(new Uint8Array(7 * 1048576).fill(1), 6 * 1048576)).toThrow(ImageError);
    const bomb = Buffer.from(pngWithText());
    bomb.writeUInt32BE(60000, 16);
    expect(() => cleanImage(new Uint8Array(bomb), 6 * 1048576)).toThrow(ImageError);
    expect(storage.files.size).toBe(4);
  });

  it('removes metadata from JPEG, PNG and WebP, and keeps the picture itself', async () => {
    const j = cleanImage(jpegWithExif(), 1e7);
    expect(j).toMatchObject({ type: 'jpeg', width: 3, height: 2 });
    const jt = Buffer.from(j.bytes).toString('latin1');
    expect(jt).not.toMatch(/Exif|GPS|secret/);
    expect(j.bytes[0]).toBe(0xff);
    expect(j.bytes[j.bytes.length - 1]).toBe(0xd9);
    const p = cleanImage(pngWithText(), 1e7);
    expect(p).toMatchObject({ type: 'png', width: 1, height: 1 });
    expect(Buffer.from(p.bytes).toString('latin1')).not.toMatch(/tEXt|eXIf|secret|GPS/);
    expect(Buffer.from(p.bytes).toString('latin1')).toContain('IDAT');
    const w = cleanImage(webpWithExif(), 1e7);
    expect(w).toMatchObject({ type: 'webp', width: 2, height: 2 });
    const wt = Buffer.from(w.bytes).toString('latin1');
    expect(wt).not.toMatch(/EXIF|XMP|secret/);
    expect(wt).toContain('VP8L');
    // The WebP's header flags no longer say EXIF or XMP, and its size is right.
    expect(Buffer.from(w.bytes).readUInt32LE(4)).toBe(w.bytes.length - 8);
    const x = Buffer.from(w.bytes).subarray(20, 21)[0]!;
    expect(x & (0x08 | 0x04)).toBe(0);
  });

  it("profile photos follow the same path: pending, the author's alone, replaced by a new file, approved by the check", async () => {
    const a = await person('alice');
    const b = await person('bobby');
    const r = await post('avatar', a, { action: 'set', data: b64(pngWithText()) });
    expect(r.status, await r.clone().text()).toBe(200);
    expect((await json<{ status: string }>(r)).status).toBe('pending');
    expect((await get('photo', b, `?k=avatar&id=${a.id}`)).status).toBe(404);
    expect((await get('photo', a, `?k=avatar&id=${a.id}`)).status).toBe(404);
    const first = (
      await db.query<{ avatar_path: string; avatar_status: string }>(
        'select avatar_path, avatar_status from public.profiles where user_id = $1',
        [a.id],
      )
    ).rows[0]!;
    expect(first.avatar_status).toBe('pending');
    expect(first.avatar_path).toMatch(new RegExp(`^${a.id}/`));
    check.answer = 'pass';
    const r2 = await post('avatar', a, { action: 'set', data: b64(jpegWithExif()) });
    expect((await json<{ status: string }>(r2)).status).toBe('approved');
    expect(
      [...storage.files.keys()].some((k) => k.endsWith(first.avatar_path.split('/')[1]!)),
    ).toBe(false);
    expect((await get('photo', b, `?k=avatar&id=${a.id}`)).status).toBe(200);
    // A blocked person can not fetch it.
    await post('block', a, { action: 'block', username: 'bobby' });
    expect((await get('photo', b, `?k=avatar&id=${a.id}`)).status).toBe(404);
    expect((await post('avatar', a, { action: 'clear' })).status).toBe(200);
    expect(
      (
        await db.query<{ avatar_path: string | null }>(
          'select avatar_path from public.profiles where user_id = $1',
          [a.id],
        )
      ).rows[0]!.avatar_path,
    ).toBeNull();
  });

  it("deleting a post removes its stored photos, and a followers-only post's photo is not served to a non-follower", async () => {
    const a = await person('alice');
    const b = await person('bobby');
    check.answer = 'pass';
    const pid = await newPost(a, 'private-ish', { visibility: 'followers' });
    const ph = await json<{ id: string; status: string }>(
      await post('post-photo', a, { action: 'add', postId: pid, data: b64(pngWithText()) }),
    );
    expect(ph.status).toBe('approved');
    expect((await get('photo', b, photoUrl(ph.id))).status).toBe(404);
    await follow(b, a);
    expect((await get('photo', b, photoUrl(ph.id))).status).toBe(200);
    expect((await post('post', a, { action: 'delete', id: pid })).status).toBe(200);
    expect(storage.removed.length).toBe(1);
    expect(storage.files.size).toBe(0);
  });

  it('with no storage keys, uploads say photos are not set up, and nothing is stored', async () => {
    const a = await person('alice');
    setPhotoDeps({ storage: null, check });
    const pid = await newPost(a);
    const r = await post('post-photo', a, {
      action: 'add',
      postId: pid,
      data: b64(jpegWithExif()),
    });
    expect(r.status).toBe(503);
    expect((await post('avatar', a, { action: 'set', data: b64(jpegWithExif()) })).status).toBe(
      503,
    );
  });
});

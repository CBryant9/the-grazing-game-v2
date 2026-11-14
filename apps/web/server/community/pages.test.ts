import type { PGlite } from '@electric-sql/pglite';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { FakeCheck, FakeStorage, pngWithText } from '../test-support/fakePhotos';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { setPhotoDeps } from './photos';

/**
 * Every community page and the layout, run as each kind of visitor. The pages are server
 * components that read the sign-in cookie through `next/headers`, so the cookie is given by a mock.
 */
const state: { cookie: string } = { cookie: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () =>
      state.cookie
        ? state.cookie.split('; ').map((c) => ({ name: c.split('=')[0]!, value: c.split('=')[1]! }))
        : [],
  }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/community',
}));

const pageModules = import.meta.glob('../../app/community/**/page.tsx');
const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');

let db: PGlite;
let auth: FakeAuth;
let deps: AuthDeps;
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};
let photoId = '';
let postId = '';

beforeAll(async () => {
  db = await freshDb({ seed: false });
}, 120_000);
afterAll(async () => {
  setAuthDeps(undefined);
  setPhotoDeps(undefined);
  await db?.close();
});

async function person(
  key: string,
  opts: {
    role?: string;
    age?: number;
    suspended?: boolean;
    banned?: boolean;
    privacy?: string;
  } = {},
) {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`);
  await db.query(
    'insert into public.profiles (user_id, username, privacy_profile) values ($1, $2, $3)',
    [user.id, key, opts.privacy ?? 'public'],
  );
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
    [user.id, String(opts.age ?? 30)],
  );
  await db.query(
    'insert into public.account_status (user_id, role, suspended_until, banned_at) values ($1, $2, $3, $4)',
    [
      user.id,
      opts.role ?? 'player',
      opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
      opts.banned ? new Date().toISOString() : null,
    ],
  );
  ids[key] = user.id;
  cookies[key] = cookie;
}

beforeEach(async () => {
  await db.exec(
    `update public.account_status set banned_at = null, suspended_until = null;
     delete from public.farms; delete from storage.objects; delete from auth.users;
     update public.feature_switches set enabled = false where key in ('community','feed_posts');
     update public.feature_switches set enabled = true where key in ('community','feed_posts');`,
  );
  resetSwitchCache();
  auth = new FakeAuth(db);
  deps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  setPhotoDeps({ storage: new FakeStorage(db), check: new FakeCheck() });
  await person('alice');
  await person('bobby');
  await person('privy', { privacy: 'private' });
  await person('kid', { age: 15 });
  await person('banned', { banned: true });
  await person('susp', { suspended: true });
  await person('theadmin', { role: 'admin' });
  const p = await db.query<{ id: string }>(
    `insert into public.posts (author_id, body) values ($1, 'Hello <b>there</b>') returning id`,
    [ids.bobby],
  );
  postId = p.rows[0]!.id;
  const ph = await db.query<{ id: string }>(
    `insert into public.post_photos (post_id, storage_path, position) values ($1, $2, 1) returning id`,
    [postId, `${ids.bobby}/x.png`],
  );
  photoId = ph.rows[0]!.id;
});

const props = (over: Record<string, string> = {}) => ({
  params: Promise.resolve({ username: 'bobby', list: 'followers', id: postId, ...over }),
  searchParams: Promise.resolve({}),
  children: null,
});

const load = async (path: string) =>
  ((await pageModules[path]!()) as { default: (p: unknown) => Promise<unknown> }).default;

describe('every community page', () => {
  it('finds all the pages', () => {
    expect(
      Object.keys(pageModules)
        .map((p) => p.replace('../../app/community', '').replace('/page.tsx', '') || '/')
        .sort(),
    ).toEqual(
      [
        '/',
        '/me',
        '/people',
        '/post/[id]',
        '/requests',
        '/u/[username]',
        '/u/[username]/[list]',
      ].sort(),
    );
  });

  it('every page calls requireMember, itself, before anything else', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const root = fileURLToPath(new URL('../../app/community/', import.meta.url));
    const files = [
      ...Object.keys(pageModules).map((p) => p.replace('../../app/community/', '')),
      'layout.tsx',
    ];
    for (const f of files) {
      const text = readFileSync(root + f, 'utf8');
      expect(text, f).toMatch(/await requireMember\(/);
    }
  });

  it('answers a visitor, an under-16 account, a banned and a suspended one, and no profile, with not found (An under-16 test account sees no community anywhere)', async () => {
    for (const path of Object.keys(pageModules)) {
      const Page = await load(path);
      for (const who of [null, 'kid', 'banned', 'susp']) {
        state.cookie = who ? cookies[who]! : '';
        await expect(Page(props()), `${path} as ${who ?? 'nobody'}`).rejects.toThrow(
          'NEXT_NOT_FOUND',
        );
      }
    }
    const Layout = (
      (await import('../../app/community/layout')) as { default: (p: unknown) => Promise<unknown> }
    ).default;
    for (const who of [null, 'kid', 'banned', 'susp']) {
      state.cookie = who ? cookies[who]! : '';
      await expect(Layout({ children: null }), who ?? 'nobody').rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('answers everyone with not found while the switch is off, an admin included', async () => {
    await db.query(`update public.feature_switches set enabled = false where key = 'community'`);
    resetSwitchCache();
    for (const path of Object.keys(pageModules)) {
      const Page = await load(path);
      for (const who of ['alice', 'theadmin']) {
        state.cookie = cookies[who]!;
        await expect(Page(props()), `${path} as ${who}`).rejects.toThrow('NEXT_NOT_FOUND');
      }
    }
  });

  it('with no database keys, every page is not found', async () => {
    setAuthDeps(null);
    for (const path of Object.keys(pageModules)) {
      const Page = await load(path);
      state.cookie = cookies.alice!;
      await expect(Page(props()), path).rejects.toThrow('NEXT_NOT_FOUND');
    }
  });

  it('renders for a member', async () => {
    state.cookie = cookies.alice!;
    for (const path of Object.keys(pageModules)) {
      const Page = await load(path);
      const out = await Page(props());
      const html = renderToStaticMarkup(out as never);
      expect(html.length, path).toBeGreaterThan(20);
    }
  });

  it("shows a post's words as text, not markup, and the photo as waiting only to its author", async () => {
    state.cookie = cookies.alice!;
    const Feed = await load('../../app/community/page.tsx');
    const html = renderToStaticMarkup(
      (await Feed({ searchParams: Promise.resolve({ tab: 'everyone' }) })) as never,
    );
    expect(html).toContain('Hello &lt;b&gt;there&lt;/b&gt;');
    expect(html).not.toContain('<b>there</b>');
    expect(html).not.toContain('waiting for a check');
    expect(html).not.toContain(photoId);
    state.cookie = cookies.bobby!;
    const own = renderToStaticMarkup(
      (await Feed({ searchParams: Promise.resolve({ tab: 'everyone' }) })) as never,
    );
    expect(own).toContain('waiting for a check');
    // Never an image address for a pending photo, even to its author.
    expect(own).not.toContain(`/api/community/photo?k=post&id=${photoId}`);
  });

  it('a private profile shows only its card, and "as others see it" shows a stranger\'s view', async () => {
    state.cookie = cookies.alice!;
    const Profile = await load('../../app/community/u/[username]/page.tsx');
    const html = renderToStaticMarkup((await Profile(props({ username: 'privy' }))) as never);
    expect(html).toContain('This profile is private.');
    expect(html).not.toContain('Ask to follow');
    // Someone who blocked another gets not found for them, and the other way round.
    await db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [
      ids.alice,
      ids.bobby,
    ]);
    await expect(Profile(props({ username: 'bobby' }))).rejects.toThrow('NEXT_NOT_FOUND');
    state.cookie = cookies.bobby!;
    await expect(Profile(props({ username: 'alice' }))).rejects.toThrow('NEXT_NOT_FOUND');
    // Their own profile, as others see it, for a private profile: the card only.
    state.cookie = cookies.privy!;
    const mine = renderToStaticMarkup(
      (await Profile({
        params: Promise.resolve({ username: 'privy' }),
        searchParams: Promise.resolve({ view: 'public' }),
      })) as never,
    );
    expect(mine).toContain('This is how your profile looks to other members.');
    expect(mine).toContain('This profile is private.');
  });

  it('the manual photo queue page lists a waiting photo for an admin and shows it as a picture', async () => {
    const storage = new FakeStorage(db);
    setPhotoDeps({ storage, check: new FakeCheck() });
    await storage.put('post-photos', `${ids.bobby}/x.png`, pngWithText(), 'image/png');
    state.cookie = cookies.theadmin!;
    const Queue = (
      (await import('../../app/admin/photos/page')) as { default: () => Promise<unknown> }
    ).default;
    const html = renderToStaticMarkup((await Queue()) as never);
    expect(html).toContain('Post photo');
    expect(html).toContain('from @bobby');
    // Shown through the admin preview route, never as a data address in the page (Stage 4).
    expect(html).toContain('/api/admin/photo-preview?kind=post_photo&amp;row=');
    expect(html).not.toContain('data:image');
    state.cookie = cookies.alice!;
    await expect(Queue()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('is never kept by the service worker, never in the sitemap, and the pages say noindex', async () => {
    const { isCacheablePagePath } = await import('../../lib/pwa/cacheablePage');
    for (const p of [
      '/community',
      '/community/me',
      '/community/u/bobby',
      '/api/community/photo',
      '/admin/photos',
    ]) {
      expect(isCacheablePagePath(p), p).toBe(false);
    }
    const sitemap = (await import('../../app/sitemap')).default;
    for (const s of sitemap()) expect(s.url).not.toMatch(/\/community(\/|$)/);
    const layout = await import('../../app/community/layout');
    expect(JSON.stringify(layout.metadata)).toMatch(/"index":false/);
  });

  it('no community page or component carries an em dash or imports the engine', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { join } = await import('node:path');
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const walk = (d: string): string[] =>
      readdirSync(join(root, d)).flatMap((n) => {
        const rel = `${d}/${n}`;
        return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
      });
    for (const f of [
      ...walk('app/community'),
      ...walk('components/community'),
      ...walk('server/community'),
    ]) {
      if (/\.test\.ts$/.test(f)) continue;
      const text = readFileSync(join(root, f), 'utf8');
      expect(text, f).not.toContain('—');
      expect(text, f).not.toMatch(/@gg\/engine/);
      if (f.startsWith('components/community'))
        expect(text, f).not.toMatch(/@\/server|\.\.\/\.\.\/server/);
    }
  });
});

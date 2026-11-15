import type { PGlite } from '@electric-sql/pglite';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import { pgliteSql } from '../test-support/pgliteSql';
import { FakeAuth } from '../test-support/fakeAuth';
import { resetSwitchCache, type AuthDeps } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';

/**
 * Every admin page and the admin layout, run as the five kinds of visitor. The pages are server
 * components that read the sign-in cookie through `next/headers`, so the cookie is given through a mock.
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
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => '/admin',
}));

const pageModules = import.meta.glob('../../app/admin/**/page.tsx');
const PEPPER = 'pepper-for-tests-'.padEnd(48, 'x');

let db: PGlite;
let auth: FakeAuth;
let deps: AuthDeps;
const ids: Record<string, string> = {};
const cookies: Record<string, string> = {};

beforeAll(async () => {
  db = await freshDb({ seed: false });
}, 120_000);
afterAll(async () => {
  setAuthDeps(undefined);
  await db?.close();
});

async function person(
  key: string,
  opts: { role?: string; age?: number; suspended?: boolean } = {},
) {
  const { user, cookie } = await auth.signInAs(`${key}@example.test`);
  await db.query('insert into public.profiles (user_id, username) values ($1, $2)', [
    user.id,
    `u_${key}`,
  ]);
  await db.query(
    `insert into public.account_private (user_id, date_of_birth, terms_accepted_at)
     values ($1, ((now() at time zone 'Australia/Sydney')::date - ($2 || ' years')::interval)::date, now())`,
    [user.id, String(opts.age ?? 30)],
  );
  await db.query(
    'insert into public.account_status (user_id, role, suspended_until) values ($1, $2, $3)',
    [
      user.id,
      opts.role ?? 'player',
      opts.suspended ? new Date(Date.now() + 86_400_000).toISOString() : null,
    ],
  );
  ids[key] = user.id;
  cookies[key] = cookie;
}

beforeEach(async () => {
  await db.exec(
    `update public.account_status set banned_at = null, suspended_until = null; delete from auth.users;`,
  );
  resetSwitchCache();
  auth = new FakeAuth(db);
  deps = { provider: auth, sql: pgliteSql(db), pepper: PEPPER };
  setAuthDeps(deps);
  await person('admin', { role: 'admin' });
  await person('player');
  await person('kid', { age: 15 });
  await person('susp', { role: 'admin', suspended: true });
});

const props = (adminId: string) => ({
  params: Promise.resolve({ id: adminId }),
  searchParams: Promise.resolve({}),
  children: null,
});

describe('every admin page', () => {
  it('finds all the pages', () => {
    const names = Object.keys(pageModules).map(
      (p) => p.replace('../../app/admin', '').replace('/page.tsx', '') || '/',
    );
    expect(names.sort()).toEqual(
      [
        '/',
        '/ads',
        '/ads/campaigns',
        '/ads/campaigns/[id]',
        '/ads/campaigns/[id]/report',
        '/ads/sponsors',
        '/ads/stats',
        '/audit',
        '/challenges',
        '/moderation',
        '/notifications',
        '/purchases',
        '/settings',
        '/switches',
        '/users',
        '/users/[id]',
      ].sort(),
    );
  });

  it('answers a signed-out visitor, a player, an under-16 player and a suspended admin with not found', async () => {
    for (const [path, load] of Object.entries(pageModules)) {
      const Page = ((await load()) as { default: (p: unknown) => Promise<unknown> }).default;
      for (const who of [null, 'player', 'kid', 'susp']) {
        state.cookie = who ? cookies[who]! : '';
        await expect(Page(props(ids.admin!)), `${path} as ${who ?? 'nobody'}`).rejects.toThrow(
          'NEXT_NOT_FOUND',
        );
      }
    }
  });

  it('shows the layout as not found to the same four, and the shell to an admin', async () => {
    const Layout = (
      (await import('../../app/admin/layout')) as { default: (p: unknown) => Promise<unknown> }
    ).default;
    for (const who of [null, 'player', 'kid', 'susp']) {
      state.cookie = who ? cookies[who]! : '';
      await expect(Layout({ children: null }), who ?? 'nobody').rejects.toThrow('NEXT_NOT_FOUND');
    }
    state.cookie = cookies.admin!;
    expect(await Layout({ children: null })).toBeTruthy();
  });

  it('an admin whose access token has run out gets not found from a page, and no refresh token is spent', async () => {
    auth.expireAccess(cookies.admin!);
    state.cookie = `${cookies.admin!}; fake_refresh=whatever`;
    for (const [path, load] of Object.entries(pageModules)) {
      const Page = ((await load()) as { default: (p: unknown) => Promise<unknown> }).default;
      await expect(Page(props(ids.admin!)), path).rejects.toThrow('NEXT_NOT_FOUND');
    }
    expect(auth.refreshed).toBe(0);
  });

  it('renders for an admin in good standing', async () => {
    state.cookie = cookies.admin!;
    for (const [path, load] of Object.entries(pageModules)) {
      const Page = ((await load()) as { default: (p: unknown) => Promise<unknown> }).default;
      // A campaign page is given the admin's own id, which is not a campaign: not found. The ad
      // pages are rendered with real campaigns in server/ads/adminads.test.ts.
      if (path.includes('/ads/campaigns/[id]')) {
        await expect(Page(props(ids.admin!)), path).rejects.toThrow('NEXT_NOT_FOUND');
        continue;
      }
      const out = await Page(props(ids.admin!));
      expect(out, path).toBeTruthy();
    }
  });

  it('with no accounts set up says so plainly, and the pages show nothing', async () => {
    setAuthDeps(null);
    state.cookie = '';
    const Layout = (
      (await import('../../app/admin/layout')) as { default: (p: unknown) => Promise<unknown> }
    ).default;
    const html = renderToStaticMarkup((await Layout({ children: null })) as never);
    expect(html).toContain('Admin needs accounts to be set up');
    for (const load of Object.values(pageModules)) {
      const Page = ((await load()) as { default: (p: unknown) => Promise<unknown> }).default;
      expect(await Page(props(ids.admin ?? 'x'))).toBeNull();
    }
  });

  it('the placeholders say plainly that they are built in a later milestone', async () => {
    state.cookie = cookies.admin!;
    for (const name of ['moderation', 'challenges']) {
      const Page = (
        (await pageModules[`../../app/admin/${name}/page.tsx`]!()) as {
          default: () => Promise<unknown>;
        }
      ).default;
      const html = renderToStaticMarkup((await Page()) as never);
      expect(html, name).toContain('Built in a later milestone');
    }
    // Purchases is a real page since 5.2: it says whether Stripe is connected.
    const purchases = (
      (await pageModules['../../app/admin/purchases/page.tsx']!()) as {
        default: () => Promise<unknown>;
      }
    ).default;
    expect(renderToStaticMarkup((await purchases()) as never)).toContain('Stripe is not connected');
    const dash = (
      (await pageModules['../../app/admin/page.tsx']!()) as { default: () => Promise<unknown> }
    ).default;
    const html = renderToStaticMarkup((await dash()) as never);
    expect(html).toContain('Built in a later milestone');
    expect(html).toContain('As at');
  });
});

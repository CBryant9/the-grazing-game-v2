import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAuthDeps } from '../auth/deps';
import { communityKit, cookieList, type Person } from '../test-support/communityKit';

/**
 * The live activity ticker, read side (PRD 9.4). The security cases were written first and seen
 * to fail.
 */
const state: { cookie: string } = { cookie: '' };
vi.mock('next/headers', () => ({
  cookies: async () => ({ getAll: () => cookieList(state.cookie) }),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/community',
}));

const kit = communityKit(['community', 'activity_ticker']);

const ROOT = join(__dirname, '..', '..');
type Line = { user: string; text: string; at: string };

async function lines(who: Person | null, address?: string): Promise<Line[]> {
  const route = await import('@/app/api/ticker/route');
  const res = await kit.call(route, '/api/ticker', 'GET', who, undefined, { address });
  expect(res.status).toBe(200);
  expect(res.headers.get('Cache-Control')).toBe('no-store');
  return ((await res.json()) as { lines: Line[] }).lines;
}
const say = (who: Person, text: string) =>
  kit.db.query(
    `insert into public.activity_events (user_id, kind, text, public) values ($1, 'farm_started', $2, true)`,
    [who.id, text],
  );
const block = (a: Person, b: Person) =>
  kit.db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [a.id, b.id]);

afterEach(() => {
  process.env.SITE_SWITCHES_ON = '';
});

describe('who appears in the ticker', () => {
  it('only opted-in, adult, non-private, unbanned members, for a visitor', async () => {
    const ok = await kit.person('okay1', { ticker: true });
    const quiet = await kit.person('quiet1', { ticker: false });
    const kid = await kit.person('kid1', { ticker: true, ageYears: 15 });
    const banned = await kit.person('banned1', { ticker: true });
    const sus = await kit.person('sus1', { ticker: true });
    const priv = await kit.person('priv1', { ticker: true, privacy: 'private' });
    await kit.db.query(`update public.account_status set banned_at = now() where user_id = $1`, [
      banned.id,
    ]);
    await kit.db.query(
      `update public.account_status set suspended_until = now() + interval '1 day' where user_id = $1`,
      [sus.id],
    );
    for (const p of [ok, quiet, kid, banned, sus, priv]) await say(p, `fact from ${p.username}`);
    const got = await lines(null);
    expect(got.map((l) => l.user)).toEqual(['okay1']);
    expect(got[0]!.text).toBe('fact from okay1');
    expect(got[0]!.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Object.keys(got[0]!).sort()).toEqual(['at', 'text', 'user']);
  });

  it('a line from someone who has since gone private, opted out or been banned goes at once', async () => {
    const a = await kit.person('later1', { ticker: true });
    await say(a, 'started a Fast Farm in Western Victoria');
    expect(await lines(null)).toHaveLength(1);
    await kit.db.query(`update public.profiles set ticker_opt_in = false where user_id = $1`, [
      a.id,
    ]);
    expect(await lines(null)).toHaveLength(0);
    await kit.db.query(`update public.profiles set ticker_opt_in = true where user_id = $1`, [
      a.id,
    ]);
    await kit.db.query(
      `update public.profiles set privacy_profile = 'private' where user_id = $1`,
      [a.id],
    );
    expect(await lines(null)).toHaveLength(0);
    await kit.db.query(`update public.profiles set privacy_profile = 'public' where user_id = $1`, [
      a.id,
    ]);
    expect(await lines(null)).toHaveLength(1);
    await kit.db.query(`update public.account_status set banned_at = now() where user_id = $1`, [
      a.id,
    ]);
    expect(await lines(null)).toHaveLength(0);
  });

  it('never across a block, either way', async () => {
    const a = await kit.person('blockera', { ticker: true });
    const b = await kit.person('blockedb', { ticker: true });
    await say(a, 'line from a');
    await say(b, 'line from b');
    expect((await lines(a)).map((l) => l.user)).toEqual(['blockedb', 'blockera']);
    await block(a, b);
    expect((await lines(a)).map((l) => l.user)).toEqual(['blockera']);
    expect((await lines(b)).map((l) => l.user)).toEqual(['blockedb']);
    // A visitor has no block, so a visitor still sees both.
    expect(await lines(null)).toHaveLength(2);
  });

  it('nothing for a viewer who is under 16, banned, suspended or has hidden the ticker', async () => {
    const author = await kit.person('author2', { ticker: true });
    await say(author, 'a line');
    const kid = await kit.person('kid2', { ageYears: 15 });
    const banned = await kit.person('banned2');
    const sus = await kit.person('sus2');
    const hider = await kit.person('hider2');
    const fine = await kit.person('fine2');
    await kit.db.query(`update public.account_status set banned_at = now() where user_id = $1`, [
      banned.id,
    ]);
    await kit.db.query(
      `update public.account_status set suspended_until = now() + interval '1 day' where user_id = $1`,
      [sus.id],
    );
    await kit.db.query(`update public.account_private set hide_ticker = true where user_id = $1`, [
      hider.id,
    ]);
    expect(await lines(kid)).toEqual([]);
    expect(await lines(banned)).toEqual([]);
    expect(await lines(sus)).toEqual([]);
    expect(await lines(hider)).toEqual([]);
    expect(await lines(fine)).toHaveLength(1);
  });

  it('a visitor and a signed-in account that has not finished sign-up get the public lines', async () => {
    const author = await kit.person('author3', { ticker: true });
    await say(author, 'a public line');
    const unfinished = await kit.person('unfinished3', { profile: false });
    expect(await lines(null)).toHaveLength(1);
    expect(await lines(unfinished)).toHaveLength(1);
  });

  it('answers with at most 10 lines, newest first', async () => {
    const a = await kit.person('many4', { ticker: true });
    for (let i = 1; i <= 12; i++) {
      await kit.db.query(
        `insert into public.activity_events (user_id, kind, text, public, created_at)
         values ($1, 'farm_day', $2, true, now() - ($3 || ' minutes')::interval)`,
        [a.id, `line ${i}`, String(i)],
      );
    }
    const got = await lines(null);
    expect(got).toHaveLength(10);
    expect(got[0]!.text).toBe('line 1');
    expect(got[9]!.text).toBe('line 10');
  });

  it('leaves out a line that is marked not public, and one older than a few days', async () => {
    const a = await kit.person('old5', { ticker: true });
    await kit.db.query(
      `insert into public.activity_events (user_id, kind, text, public) values ($1, 'x', 'hidden', false)`,
      [a.id],
    );
    await kit.db.query(
      `insert into public.activity_events (user_id, kind, text, public, created_at)
       values ($1, 'x', 'ancient', true, now() - interval '10 days')`,
      [a.id],
    );
    expect(await lines(null)).toEqual([]);
  });
});

describe('when the ticker is off', () => {
  it('is empty with the ticker switch off, the community switch off, or no database keys', async () => {
    const a = await kit.person('off6', { ticker: true });
    await say(a, 'a line');
    expect(await lines(null)).toHaveLength(1);
    await kit.setSwitch('activity_ticker', false);
    expect(await lines(null)).toEqual([]);
    expect(await lines(a)).toEqual([]);
    await kit.setSwitch('activity_ticker', true);
    await kit.setSwitch('community', false);
    expect(await lines(null)).toEqual([]);
    await kit.setSwitch('community', true);
    const deps = kit.deps;
    try {
      setAuthDeps(null);
      expect(await lines(null)).toEqual([]);
    } finally {
      setAuthDeps(deps);
    }
  });

  it('limits how often one address may ask', async () => {
    const route = await import('@/app/api/ticker/route');
    let last = 200;
    for (let i = 0; i < 35; i++) {
      const res = await kit.call(route, '/api/ticker', 'GET', null, undefined, {
        address: '10.9.9.9',
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('is not a community route: a visitor may call it, and nothing else about the community opens', async () => {
    const src = readFileSync(join(ROOT, 'app/api/ticker/route.ts'), 'utf8');
    expect(src).not.toContain('communityRoute');
    expect(
      Object.keys(await import('@/app/api/ticker/route')).filter((k) => /^[A-Z]+$/.test(k)),
    ).toEqual(['GET']);
  });
});

/** Every source file under a folder, as [path, text]. */
function sources(dir: string): [string, string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.(ts|tsx|css)$/.test(name) && !/\.test\./.test(name)) {
      out.push([relative(ROOT, p).replace(/\\/g, '/'), readFileSync(p, 'utf8')]);
    }
  }
  return out;
}

describe('where the ticker is, and is not', () => {
  it('the game never mentions it: not the play page, not the game components, not the root layout', () => {
    const files = [
      ...sources(join(ROOT, 'app/play')),
      ...sources(join(ROOT, 'components/play')),
      ...sources(join(ROOT, 'components/shell')),
      ...sources(join(ROOT, 'lib/game')),
      ['app/layout.tsx', readFileSync(join(ROOT, 'app/layout.tsx'), 'utf8')] as [string, string],
    ];
    expect(files.length).toBeGreaterThan(10);
    for (const [path, text] of files) {
      expect(text, path).not.toMatch(/ticker/i);
    }
  });

  it('the script has no libraries, builds its text safely and stays small', () => {
    const raw = readFileSync(join(ROOT, 'public/ticker.js'));
    const text = raw.toString('utf8');
    expect(gzipSync(raw, { level: 9 }).length).toBeLessThan(1536);
    expect(text).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|import |require\(/,
    );
    expect(text).toContain('textContent');
    expect(text).toContain('prefers-reduced-motion');
    expect(text).toContain('localStorage');
    expect(text).toContain('/api/ticker');
    expect(text).toContain('max-width:360px');
    expect(text).toContain('min-width:44px');
    expect(text).toContain('min-height:44px');
    expect(text).not.toContain(String.fromCharCode(0x2014));
  });

  it('the landing page sends no script with the switch off, and the one script with it on', async () => {
    const Landing = ((await import('../../pages/index')) as { default: () => unknown }).default;
    process.env.SITE_SWITCHES_ON = '';
    const off = renderToStaticMarkup(Landing() as never);
    expect(off).not.toContain('<script');
    expect(off).not.toContain('ticker');
    process.env.SITE_SWITCHES_ON = 'community,activity_ticker';
    const on = renderToStaticMarkup(Landing() as never);
    expect(on.match(/<script[^>]*>/g)).toEqual(['<script src="/ticker.js" defer="">']);
    process.env.SITE_SWITCHES_ON = 'community';
    expect(renderToStaticMarkup(Landing() as never)).not.toContain('<script');
  });

  it('the community layout adds it, as a strip, only with the community and ticker switches on', async () => {
    const author = await kit.person('layout7');
    state.cookie = author.cookie;
    const Layout = (
      (await import('@/app/community/layout')) as {
        default: (p: { children: unknown }) => Promise<unknown>;
      }
    ).default;
    const show = async () => renderToStaticMarkup((await Layout({ children: null })) as never);
    expect(await show()).toContain('<script src="/ticker.js" defer="" data-place="strip">');
    await kit.setSwitch('activity_ticker', false);
    expect(await show()).not.toContain('ticker.js');
  });

  it('the Ticker component renders the script tag and the strip place', async () => {
    const { Ticker } = await import('@/components/site/Ticker');
    expect(renderToStaticMarkup(Ticker({}) as never)).toBe(
      '<script src="/ticker.js" defer=""></script>',
    );
    expect(renderToStaticMarkup(Ticker({ place: 'strip' }) as never)).toBe(
      '<script src="/ticker.js" defer="" data-place="strip"></script>',
    );
  });
});

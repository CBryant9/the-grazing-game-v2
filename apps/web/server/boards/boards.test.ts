import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
  usePathname: () => '/community',
}));
import { communityKit, type Person } from '../test-support/communityKit';
import { asUser } from '../auth/accounts';
import { setAuthDeps } from '../auth/deps';
import { farmKey, gameServer } from '../game/game';
import { boardPage } from './page';
import { asVisitor, parseBoardQuery, readBoard } from './read';
import { figures, headline } from './score';
import { periodKey, writeBoards } from './write';

/**
 * Leaderboards (Stage 4, milestone 4.1; PRD 9.8, 14.5), on PGlite with the fake sign-in. The board
 * rows are written by the server only; read through `leaderboard_rows` as the viewer.
 */
const kit = communityKit(['community', 'feed_posts', 'groups', 'leaderboards']);
const NOW = new Date('2026-11-15T03:00:00Z');

/** A farm row with an action log the board check accepts, owned by `who`. */
async function farmOf(
  who: Person,
  extra: Partial<Record<'district' | 'size' | 'mode' | 'name', string>> & { gap?: boolean } = {},
): Promise<string> {
  const r = await kit.db.query<{ id: string }>(
    `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, current_day)
     values ($1, 'fast', $2, $3, $4, 1000, 'grazing', 'running', 'medium', 't', 400) returning id`,
    [who.id, extra.name ?? `${who.username} farm`, extra.district ?? 'cq', extra.size ?? 'small'],
  );
  const id = r.rows[0]!.id;
  await kit.db.query(
    `insert into public.farm_actions (farm_id, seq, game_day, action, ok) values
       ($1, 0, 0, '{"type":"skip","length":"year"}', true), ($1, $2, 365, '{"type":"day"}', true)`,
    [id, extra.gap ? 2 : 1],
  );
  return id;
}

const year = (total: number, profit = 10_000, realYear: number | null = null) => ({
  n: 1,
  realYear,
  total,
  profit,
  gain: 50_000,
  cover: 70,
});

async function scored(who: Person, total: number, extra = {}): Promise<string> {
  const id = await farmOf(who, extra);
  expect(
    await writeBoards(kit.deps.sql, id, { day: 400, ha: 1000, years: [year(total)] }, NOW),
  ).toBe('written');
  return id;
}

const q = (over: Record<string, string> = {}) => parseBoardQuery(over);

describe('the score provider', () => {
  it('uses the year score as a marked stand-in headline, and the year view figures for the other boards', () => {
    const f = { day: 730, ha: 2000, years: [year(60, 40_000), year(80, 80_000)] };
    expect(headline(f)).toBe(70);
    expect(figures(f)).toEqual({
      grazier: 70,
      profit_per_ha: 30,
      beef_per_ha: 25,
      ground_cover: 70,
      days_survived: 730,
    });
    expect(figures({ ...f, years: [] })).toBeNull();
  });

  it('keys each period in Sydney time', () => {
    expect(periodKey('week', NOW)).toBe('2026-W46');
    expect(periodKey('month', NOW)).toBe('2026-11');
    expect(periodKey('season', NOW)).toBe('2026-spring');
    expect(periodKey('season', new Date('2026-12-02T00:00:00Z'))).toBe('2027-summer');
    expect(periodKey('all', NOW)).toBe('all');
  });
});

describe('writing the boards (server only, PRD 14.5)', () => {
  it('writes every board and period for a ranked account farm whose action log agrees', async () => {
    const ann = await kit.person('annie');
    const id = await scored(ann, 50);
    const rows = await kit.db.query<{ board: string; period: string }>(
      'select board, period from public.leaderboard_entries where farm_id = $1',
      [id],
    );
    expect(rows.rows).toHaveLength(20);
    const s = await kit.db.query<{ verified: boolean; grazier_score: string }>(
      'select verified, grazier_score from public.farm_scores where farm_id = $1',
      [id],
    );
    expect(s.rows[0]).toEqual({ verified: true, grazier_score: '50.00' });
  });

  it('refuses a farm whose action log does not agree, a rescued farm and an unranked one', async () => {
    const ann = await kit.person('annie');
    const gap = await farmOf(ann, { gap: true });
    const f = { day: 400, ha: 1000, years: [year(50)] };
    expect(await writeBoards(kit.deps.sql, gap, f, NOW)).toBe('log_disagrees');
    const ahead = await farmOf(ann);
    expect(await writeBoards(kit.deps.sql, ahead, { ...f, day: 100 }, NOW)).toBe('log_disagrees');
    const rescued = await farmOf(await kit.person('bobby'));
    await kit.db.query('update public.farms set continued = true where id = $1', [rescued]);
    expect(await writeBoards(kit.deps.sql, rescued, f, NOW)).toBe('not_ranked');
    const unranked = await farmOf(await kit.person('catty'));
    await kit.db.query('update public.farms set ranked = false where id = $1', [unranked]);
    expect(await writeBoards(kit.deps.sql, unranked, f, NOW)).toBe('not_ranked');
    const n = await kit.db.query<{ n: number }>(
      'select count(*)::int as n from public.leaderboard_entries',
    );
    expect(n.rows[0]!.n).toBe(0);
  });

  it('a player can not write a board row or a score with their own token', async () => {
    const ann = await kit.person('annie');
    const id = await farmOf(ann);
    for (const sql of [
      `insert into public.leaderboard_entries (farm_id, user_id, board, mode, district, size, start_type, enterprise, period, period_key, score)
         values ('${id}', '${ann.id}', 'grazier', 'fast', 'cq', 'small', 'running', 'grazing', 'all', 'all', 999)`,
      `insert into public.farm_scores (farm_id, grazier_score) values ('${id}', 999)`,
      `update public.farm_scores set grazier_score = 999`,
    ]) {
      let err: unknown = null;
      try {
        await asUser(kit.deps.sql, ann.id, (tx) => tx.query(sql));
      } catch (e) {
        err = e;
      }
      if (!err) {
        const r = await kit.db.query<{ n: number }>(
          `select count(*)::int as n from public.farm_scores where grazier_score = 999`,
        );
        expect(r.rows[0]!.n).toBe(0);
      }
    }
  });

  it('a year closing on the server writes the rows (the hook after a skip)', async () => {
    const ann = await kit.person('annie');
    const farm = await kit.farmFor(ann, { years: 'random' });
    const key = farmKey(farm.replace(/-/g, ''));
    for (let i = 0; i < 3; i++) {
      const r = await gameServer().skip(key, 'year', true);
      if (r.yearsClosed > 0) break;
    }
    const rows = await kit.db.query<{ n: number }>(
      `select count(*)::int as n from public.leaderboard_entries where farm_id = $1 and board = 'grazier'`,
      [farm],
    );
    expect(rows.rows[0]!.n).toBe(4);
  });
});

describe('reading the boards', () => {
  it('Your row pins at the bottom', async () => {
    const ann = await kit.person('annie');
    for (let i = 0; i < 55; i++) {
      const p = await kit.person(`pl${i}`);
      await scored(p, 100 + i);
    }
    await scored(ann, 10);
    const view = await asUser(kit.deps.sql, ann.id, (tx) => readBoard(tx, q(), NOW));
    expect(view.rows).toHaveLength(50);
    expect(view.rows.some((r) => r.mine)).toBe(false);
    expect(view.mine).toMatchObject({ rank: 56, username: 'annie', mine: true });
    // And on the page, the pinned row is drawn last.
    const page = (await import('@/pages/leaderboards')).default;
    const props = (await boardPage({ fake_session: ann.cookie.split('=')[1] }, {}, NOW))!;
    const html = renderToStaticMarkup(page(props) as never);
    expect(html.lastIndexOf('annie')).toBeGreaterThan(html.lastIndexOf('pl54'));
    expect(html).toContain('aria-label="Your row"');
  });

  it('A real-year board ranks on the change over that year', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const a = await farmOf(ann);
    const b = await farmOf(bob);
    // Ann's 2010 year added $40,000 on 1,000 ha; Bob's added $10,000, though his year score is far higher.
    await writeBoards(
      kit.deps.sql,
      a,
      { day: 400, ha: 1000, years: [year(20, 40_000, 2010)] },
      NOW,
    );
    await writeBoards(
      kit.deps.sql,
      b,
      { day: 400, ha: 1000, years: [year(95, 10_000, 2010)] },
      NOW,
    );
    const view = await asVisitor(kit.deps.sql, (tx) =>
      readBoard(tx, q({ board: 'real_year', year: '2010' }), NOW),
    );
    expect(view.rows.map((r) => [r.username, r.score])).toEqual([
      ['annie', 40],
      ['bobby', 10],
    ]);
    expect(view.years).toEqual([2010]);
    const headline = await asVisitor(kit.deps.sql, (tx) => readBoard(tx, q(), NOW));
    expect(headline.rows[0]!.username).toBe('bobby');
  });

  it('filters by district, size, mode and period', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    await scored(ann, 50, { district: 'cq', size: 'small' });
    await scored(bob, 60, { district: 'wv', size: 'large' });
    const names = async (over: Record<string, string>) =>
      (await asVisitor(kit.deps.sql, (tx) => readBoard(tx, q(over), NOW))).rows.map(
        (r) => r.username,
      );
    expect(await names({ district: 'cq' })).toEqual(['annie']);
    expect(await names({ size: 'large' })).toEqual(['bobby']);
    expect(await names({ mode: 'daily' })).toEqual([]);
    expect(await names({ period: 'week' })).toEqual(['bobby', 'annie']);
    // Next week's board is empty until a year closes in it.
    expect(
      (
        await asVisitor(kit.deps.sql, (tx) =>
          readBoard(tx, q({ period: 'week' }), new Date('2026-12-01T00:00:00Z')),
        )
      ).rows,
    ).toEqual([]);
  });

  it('under 16 and private rows show the username and district only; banned shows as Former player; a block hides both ways', async () => {
    const ann = await kit.person('annie');
    const kid = await kit.person('kiddo', { ageYears: 15 });
    const priv = await kit.person('privy', { privacy: 'private' });
    const bad = await kit.person('baddie', { banned: true });
    const bob = await kit.person('bobby');
    for (const [p, s] of [
      [kid, 90],
      [priv, 80],
      [bad, 70],
      [bob, 60],
    ] as const)
      await scored(p, s);
    await kit.db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [
      bob.id,
      ann.id,
    ]);
    const view = await asUser(kit.deps.sql, ann.id, (tx) => readBoard(tx, q(), NOW));
    expect(view.rows.map((r) => [r.username, r.userId !== null, r.farmName !== null])).toEqual([
      ['kiddo', false, false],
      ['privy', false, false],
      ['Former player', false, false],
    ]);
    // A visitor sees Bob (no block for a visitor).
    const visitor = await asVisitor(kit.deps.sql, (tx) => readBoard(tx, q(), NOW));
    expect(visitor.rows.map((r) => r.username)).toContain('bobby');
  });

  it('the friends filter shows the farms of people I follow, for a member only', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const cat = await kit.person('catty');
    await scored(bob, 60);
    await scored(cat, 70);
    await kit.db.query(
      `insert into public.follows (follower_id, followee_id, status) values ($1, $2, 'accepted')`,
      [ann.id, bob.id],
    );
    const p = (await boardPage({ fake_session: ann.cookie.split('=')[1] }, { friends: '1' }, NOW))!;
    expect(p.view.rows.map((r) => r.username)).toEqual(['bobby']);
    // An under-16 account gets the boards but never the friends filter.
    const kid = await kit.person('kiddo', { ageYears: 15 });
    const k = (await boardPage({ fake_session: kid.cookie.split('=')[1] }, { friends: '1' }, NOW))!;
    expect(k.member).toBe(false);
    expect(k.view.rows.map((r) => r.username)).toEqual(['catty', 'bobby']);
  });
});

describe('the public leaderboard page', () => {
  it('sends no script, and is not found with the switch off or no database keys', async () => {
    const text = readFileSync(new URL('../../pages/leaderboards.tsx', import.meta.url), 'utf8');
    expect(text).toMatch(/unstable_runtimeJS: false/);
    expect(text).not.toMatch(/['"]use client['"]/);
    expect(text).not.toContain('—');
    const ann = await kit.person('annie');
    await scored(ann, 50);
    const page = (await import('@/pages/leaderboards')).default;
    const visitor = (await boardPage({}, {}, NOW))!;
    expect(visitor.signedIn).toBe(false);
    const html = renderToStaticMarkup(page(visitor) as never);
    expect(html).toContain('annie');
    expect(html).not.toContain('<script');
    expect(html).toContain('the game year score averaged');
    await kit.setSwitch('leaderboards', false);
    expect(await boardPage({}, {}, NOW)).toBeNull();
    await kit.setSwitch('leaderboards', true);
    setAuthDeps(null);
    expect(await boardPage({}, {}, NOW)).toBeNull();
  });

  it('getServerSideProps answers not found with the switch off', async () => {
    await kit.setSwitch('leaderboards', false);
    const { getServerSideProps } = await import('@/pages/leaderboards');
    const out = await getServerSideProps({
      req: { cookies: {} },
      res: { setHeader: () => undefined },
      query: {},
    } as never);
    expect(out).toEqual({ notFound: true });
  });
});

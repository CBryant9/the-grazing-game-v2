import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { setAuthDeps } from '../auth/deps';
import { asUser } from '../auth/accounts';
import { communityKit, cookieList, type Person } from '../test-support/communityKit';
import { feedPage } from './data';
import { makeDayCard } from './share';

/**
 * Look at someone's farm, read-only (PRD 9.5). The refusals were written first and seen to fail.
 * `can_view_farm_for` allows Daily Farms only, and every farm is 'fast' today, so a test makes its
 * farms daily by SQL.
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

const kit = communityKit(['community', 'feed_posts', 'farm_viewing']);

type PageFn = (p: unknown) => Promise<unknown>;
const load = async (path: () => Promise<unknown>): Promise<PageFn> =>
  ((await path()) as { default: PageFn }).default;
const FarmPage = () => load(() => import('@/app/community/farm/[id]/page'));
const ProfilePage = () => load(() => import('@/app/community/u/[username]/page'));
const as = (who: Person | null) => {
  state.cookie = who?.cookie ?? '';
};
const html = (out: unknown) => renderToStaticMarkup(out as never);
const idProps = (id: string) => ({ params: Promise.resolve({ id }) });
const nameProps = (username: string) => ({
  params: Promise.resolve({ username }),
  searchParams: Promise.resolve({}),
});

async function dailyFarm(who: Person, name = 'Kit Farm'): Promise<string> {
  const id = await kit.farmFor(who, { name });
  await kit.db.query(
    `update public.farms set mode = 'daily', timezone = 'Australia/Sydney', sim_through = current_date
      where id = $1`,
    [id],
  );
  return id;
}
async function follow(a: Person, b: Person) {
  await kit.db.query(
    `insert into public.follows (follower_id, followee_id) values ($1, $2)
       on conflict do nothing`,
    [a.id, b.id],
  );
  await kit.db.query(
    `update public.follows set status = 'accepted' where follower_id = $1 and followee_id = $2`,
    [a.id, b.id],
  );
}
const block = (a: Person, b: Person) =>
  kit.db.query('insert into public.blocks (blocker_id, blocked_id) values ($1, $2)', [a.id, b.id]);

/** The page as this viewer: its HTML, or 'NOT_FOUND'. */
async function look(viewer: Person | null, farmId: string): Promise<string> {
  const Page = await FarmPage();
  as(viewer);
  try {
    return html(await Page(idProps(farmId)));
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_NOT_FOUND') return 'NOT_FOUND';
    throw e;
  }
}

describe('looking is not opening (m6 join)', () => {
  it("someone else's look never marks the owner's farm opened", async () => {
    const owner = await kit.person('owner0', { farmView: 'public' });
    const viewer = await kit.person('viewer0');
    const id = await dailyFarm(owner, 'Quiet Downs');
    await kit.db.query(
      `update public.farms set last_opened_at = timestamptz '2026-01-01T00:00:00Z' where id = $1`,
      [id],
    );
    expect(await look(viewer, id)).toContain('Quiet Downs');
    const r = await kit.db.query<{ t: string }>(
      `select to_char(last_opened_at at time zone 'UTC', 'YYYY-MM-DD') as t from public.farms where id = $1`,
      [id],
    );
    expect(r.rows[0]!.t).toBe('2026-01-01');
  });

  it('a Fast Farm is never shown to others: PRD 9.5 says their Daily Farm', async () => {
    const owner = await kit.person('owner00', { farmView: 'public' });
    const viewer = await kit.person('viewer00');
    const id = await kit.farmFor(owner, { name: 'Fast Acres' });
    expect(await look(viewer, id)).toBe('NOT_FOUND');
  });
});

describe('who may look at a farm (the refusals)', () => {
  it('a stranger with farm view on followers-only gets the plain not found', async () => {
    const owner = await kit.person('owner1', { farmView: 'followers' });
    const stranger = await kit.person('stranger1');
    const id = await dailyFarm(owner, 'Secret Acres');
    const out = await look(stranger, id);
    expect(out).toBe('NOT_FOUND');
  });

  it('farm view off gives not found, even to a follower', async () => {
    const owner = await kit.person('owner2', { farmView: 'off' });
    const fan = await kit.person('fan2');
    await follow(fan, owner);
    const id = await dailyFarm(owner);
    expect(await look(fan, id)).toBe('NOT_FOUND');
  });

  it('a block hides the farm both ways', async () => {
    const owner = await kit.person('owner3', { farmView: 'public' });
    const other = await kit.person('other3');
    const id = await dailyFarm(owner);
    expect(await look(other, id)).not.toBe('NOT_FOUND');
    await block(owner, other);
    expect(await look(other, id)).toBe('NOT_FOUND');
    await kit.db.query('delete from public.blocks');
    await block(other, owner);
    expect(await look(other, id)).toBe('NOT_FOUND');
  });

  it('an under-16 viewer and an under-16 owner both give not found', async () => {
    const owner = await kit.person('owner4', { farmView: 'public' });
    const kid = await kit.person('kid4', { ageYears: 15 });
    const kidOwner = await kit.person('kidowner4', { ageYears: 15, farmView: 'public' });
    const adult = await kit.person('adult4');
    const id = await dailyFarm(owner);
    const kidFarm = await dailyFarm(kidOwner);
    expect(await look(kid, id)).toBe('NOT_FOUND');
    expect(await look(adult, kidFarm)).toBe('NOT_FOUND');
  });

  it('a banned viewer, a suspended viewer and a banned owner give not found', async () => {
    const owner = await kit.person('owner5', { farmView: 'public' });
    const bad = await kit.person('bad5');
    const sus = await kit.person('sus5');
    const bannedOwner = await kit.person('bowner5', { farmView: 'public' });
    const adult = await kit.person('adult5');
    const id = await dailyFarm(owner);
    const bFarm = await dailyFarm(bannedOwner);
    await kit.db.query(`update public.account_status set banned_at = now() where user_id = $1`, [
      bad.id,
    ]);
    await kit.db.query(
      `update public.account_status set suspended_until = now() + interval '1 day' where user_id = $1`,
      [sus.id],
    );
    await kit.db.query(`update public.account_status set banned_at = now() where user_id = $1`, [
      bannedOwner.id,
    ]);
    expect(await look(bad, id)).toBe('NOT_FOUND');
    expect(await look(sus, id)).toBe('NOT_FOUND');
    expect(await look(adult, bFarm)).toBe('NOT_FOUND');
  });

  it('a visitor who is signed out gets not found', async () => {
    const owner = await kit.person('owner6', { farmView: 'public' });
    const id = await dailyFarm(owner);
    expect(await look(null, id)).toBe('NOT_FOUND');
  });

  it('with the farm viewing switch off, or the community off, nobody gets in (the owner too)', async () => {
    const owner = await kit.person('owner7', { farmView: 'public' });
    const other = await kit.person('other7');
    const id = await dailyFarm(owner);
    expect(await look(other, id)).not.toBe('NOT_FOUND');
    await kit.setSwitch('farm_viewing', false);
    expect(await look(other, id)).toBe('NOT_FOUND');
    expect(await look(owner, id)).toBe('NOT_FOUND');
    await kit.setSwitch('farm_viewing', true);
    await kit.setSwitch('community', false);
    expect(await look(other, id)).toBe('NOT_FOUND');
    expect(await look(owner, id)).toBe('NOT_FOUND');
  });

  it('with no database keys it is not found', async () => {
    const owner = await kit.person('owner8', { farmView: 'public' });
    const id = await dailyFarm(owner);
    const deps = kit.deps;
    try {
      setAuthDeps(null);
      expect(await look(owner, id)).toBe('NOT_FOUND');
    } finally {
      setAuthDeps(deps);
    }
  });

  it('a Fast Farm is not shown to anyone else, and an id that is not a farm is not found', async () => {
    const owner = await kit.person('owner9', { farmView: 'public' });
    const other = await kit.person('other9');
    const fast = await kit.farmFor(owner);
    expect(await look(other, fast)).toBe('NOT_FOUND');
    expect(await look(other, 'not-a-uuid')).toBe('NOT_FOUND');
    expect(await look(other, '00000000-0000-4000-8000-000000000000')).toBe('NOT_FOUND');
  });
});

describe('who may look at a farm (the allowed)', () => {
  it('the owner, a follower (the default setting) and a stranger when the setting is public', async () => {
    const owner = await kit.person('owner10');
    const fan = await kit.person('fan10');
    const stranger = await kit.person('stranger10');
    await follow(fan, owner);
    const id = await dailyFarm(owner, 'Open Gate');
    for (const [who, label] of [
      [owner, 'owner'],
      [fan, 'follower'],
    ] as const) {
      const out = await look(who, id);
      expect(out, label).toContain('Open Gate');
    }
    expect(await look(stranger, id)).toBe('NOT_FOUND');
    await kit.db.query(
      `update public.profiles set privacy_farm_view = 'public' where user_id = $1`,
      [owner.id],
    );
    expect(await look(stranger, id)).toContain('Open Gate');
  });

  it('shows what PRD 9.5 lists and nothing about the rules or private matters', async () => {
    const owner = await kit.person('owner11', { farmView: 'public' });
    const other = await kit.person('other11');
    const id = await dailyFarm(owner, 'Plain Farm');
    const out = await look(other, id);
    for (const want of [
      'Plain Farm',
      'Western Victoria',
      'Daily Farm',
      'Day',
      'Season',
      'Head',
      'kg DM/ha',
      'Net worth',
      'Ground cover',
      'Score (stand-in)',
      'Paddocks',
    ]) {
      expect(out).toContain(want);
    }
    expect(out).toContain('<details');
    expect(out).not.toMatch(/<form|<button|<input|<select|<textarea/i);
    expect(out).not.toMatch(/\b(save|seed|formula|version|inbox)\b/i);
    expect(out).not.toContain(String.fromCharCode(0x2014));
    // No id of the farm or the owner's account.
    expect(out).not.toContain(owner.id);
    expect(out).not.toContain(id);
  });

  it('a farm name that the word filter blocks is not shown', async () => {
    const owner = await kit.person('owner12', { farmView: 'public' });
    const other = await kit.person('other12');
    const id = await dailyFarm(owner, 'Badword Farm');
    await kit.db.query(`insert into public.word_filter (term) values ('badword')`);
    const out = await look(other, id);
    expect(out).not.toContain('Badword');
    expect(out).toContain('A farm');
  });
});

describe('the links to a farm', () => {
  it('the profile shows "Their farm today" only when the viewer may look', async () => {
    const owner = await kit.person('owner13');
    const fan = await kit.person('fan13');
    const stranger = await kit.person('stranger13');
    await follow(fan, owner);
    const id = await dailyFarm(owner);
    const Profile = await ProfilePage();
    as(fan);
    const seen = html(await Profile(nameProps('owner13')));
    expect(seen).toContain('Their farm today');
    expect(seen).toContain(`/community/farm/${id}`);
    as(stranger);
    expect(html(await Profile(nameProps('owner13')))).not.toContain('Their farm today');
    as(owner);
    expect(html(await Profile(nameProps('owner13')))).not.toContain('Their farm today');
  });

  it("Two test accounts follow each other and see each other's day cards and farms", async () => {
    const ann = await kit.person('annie14');
    const bob = await kit.person('bobby14');
    await follow(ann, bob);
    await follow(bob, ann);
    const annFarm = await dailyFarm(ann, 'Annie Downs');
    const bobFarm = await dailyFarm(bob, 'Bobby Plains');
    for (const f of [annFarm, bobFarm]) {
      await kit.db.query(
        `insert into public.farm_days (farm_id, day, game_date, lines, card_lines) values ($1, 1, current_date, $2, $2)`,
        [f, ['Moved 1 mob', 'Built 2 km of electric fence']],
      );
      expect(await makeDayCard(kit.deps.sql, f, 1)).not.toBeNull();
    }
    const friendsOf = (who: Person) =>
      asUser(kit.deps.sql, who.id, (tx) => feedPage(tx, who.id, 'friends', null));
    const annSees = await friendsOf(ann);
    const bobSees = await friendsOf(bob);
    expect(annSees.items.map((p) => [p.kind, p.author.username, p.farmId])).toEqual([
      ['day_card', 'bobby14', bobFarm],
    ]);
    expect(bobSees.items.map((p) => [p.kind, p.author.username, p.farmId])).toEqual([
      ['day_card', 'annie14', annFarm],
    ]);
    expect(await look(ann, bobFarm)).toContain('Bobby Plains');
    expect(await look(bob, annFarm)).toContain('Annie Downs');
  });

  it('makes no day card when the farm view is off, so a follower sees none', async () => {
    const owner = await kit.person('owner15', { farmView: 'off' });
    const fan = await kit.person('fan15');
    await follow(fan, owner);
    const id = await dailyFarm(owner);
    await kit.db.query(
      `insert into public.farm_days (farm_id, day, game_date, lines, card_lines) values ($1, 1, current_date, $2, $2)`,
      [id, ['Moved 1 mob']],
    );
    expect(await makeDayCard(kit.deps.sql, id, 1)).toBeNull();
    const page = await asUser(kit.deps.sql, fan.id, (tx) => feedPage(tx, fan.id, 'friends', null));
    expect(page.items).toHaveLength(0);
  });
});

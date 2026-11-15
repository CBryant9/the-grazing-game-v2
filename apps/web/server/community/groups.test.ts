import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { communityKit, cookieList, type Person } from '../test-support/communityKit';

/** Groups, group boards and challenges (Stage 4, milestone 4.4; PRD 9.6, 11.6). */
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

const kit = communityKit(['community', 'feed_posts', 'groups', 'leaderboards']);

const groupRoute = () => import('@/app/api/community/group/route');
const challengeRoute = () => import('@/app/api/community/challenge/route');
const adminRoute = () => import('@/app/api/admin/challenges/route');

async function g(who: Person | null, body: Record<string, unknown>) {
  return kit.call(await groupRoute(), '/api/community/group', 'POST', who, body);
}
const body = async (r: Response) => (await r.json()) as Record<string, unknown>;

async function newGroup(
  owner: Person,
  visibility = 'private',
  name = 'Hill Grazers',
): Promise<string> {
  const r = await g(owner, { action: 'create', name, description: 'Talk', visibility });
  expect(r.status, await r.clone().text()).toBe(200);
  return (await body(r)).id as string;
}

async function codeOf(id: string): Promise<string> {
  const r = await kit.db.query<{ invite_code: string }>(
    'select invite_code from public.groups where id = $1',
    [id],
  );
  return r.rows[0]!.invite_code;
}

type PageFn = (p: unknown) => Promise<unknown>;
const groupPage = async (): Promise<PageFn> =>
  ((await import('@/app/community/groups/[id]/page')) as { default: PageFn }).default;
const props = (id: string, search: Record<string, string> = {}) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve(search),
});

/** A board row for a person's farm, written the way the server writes them. */
async function boardRow(
  who: Person,
  score: number,
  challenge: string | null = null,
): Promise<void> {
  const f = await kit.db.query<{ id: string }>(
    `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version, challenge_id)
     values ($1, 'fast', 'F', 'cq', 'small', 500, 'grazing', 'running', 'easy', 't', $2) returning id`,
    [who.id, challenge],
  );
  await kit.db.query(
    `insert into public.leaderboard_entries (farm_id, user_id, board, mode, district, size, start_type, enterprise, period, period_key, score, days, challenge_id)
     values ($1, $2, 'grazier', 'fast', 'cq', 'small', 'running', 'grazing', 'all', 'all', $3, 365, $4)`,
    [f.rows[0]!.id, who.id, score, challenge],
  );
}

describe('groups', () => {
  it('create, join by invite code, member list, leave', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const id = await newGroup(ann);
    // Bob can not see a private group he is not in.
    state.cookie = bob.cookie;
    const Page = await groupPage();
    await expect(Page(props(id))).rejects.toThrow('NEXT_NOT_FOUND');
    expect((await g(bob, { action: 'join', code: 'ffffffffffff' })).status).toBe(404);
    expect((await g(bob, { action: 'join', groupId: id })).status).toBe(403);
    const ok = await g(bob, { action: 'join', code: await codeOf(id) });
    expect(ok.status).toBe(200);
    const html = renderToStaticMarkup((await Page(props(id))) as never);
    expect(html).toContain('annie (owner)');
    expect(html).toContain('bobby');
    // Only the owner sees the code.
    expect(html).not.toContain(await codeOf(id));
    state.cookie = ann.cookie;
    expect(renderToStaticMarkup((await Page(props(id))) as never)).toContain(await codeOf(id));
    expect((await g(bob, { action: 'leave', groupId: id })).status).toBe(200);
    expect((await g(ann, { action: 'leave', groupId: id })).status).toBe(409);
  });

  it('owner tools: remove a member, hand over, and only the owner may', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const cat = await kit.person('catty');
    const id = await newGroup(ann, 'public');
    for (const p of [bob, cat])
      expect((await g(p, { action: 'join', groupId: id })).status).toBe(200);
    expect((await g(bob, { action: 'remove', groupId: id, username: 'catty' })).status).toBe(403);
    expect((await g(ann, { action: 'remove', groupId: id, username: 'catty' })).status).toBe(200);
    expect((await g(ann, { action: 'handover', groupId: id, username: 'bobby' })).status).toBe(200);
    const o = await kit.db.query<{ owner_id: string }>(
      'select owner_id from public.groups where id = $1',
      [id],
    );
    expect(o.rows[0]!.owner_id).toBe(bob.id);
    expect(
      (await g(ann, { action: 'update', groupId: id, name: 'Mine now', visibility: 'public' }))
        .status,
    ).toBe(403);
    expect((await g(ann, { action: 'leave', groupId: id })).status).toBe(200);
  });

  it('an ownerless group can be read and posted in by its members, and changed by nobody', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const id = await newGroup(ann, 'public');
    await g(bob, { action: 'join', groupId: id });
    // As when the owner's account went and nobody could take over.
    await kit.db.query(`update public.group_members set role = 'member' where group_id = $1`, [id]);
    await kit.db.query('update public.groups set owner_id = null where id = $1', [id]);
    state.cookie = bob.cookie;
    const html = renderToStaticMarkup((await (await groupPage())(props(id))) as never);
    expect(html).toContain('This group has no owner');
    const post = await import('@/app/api/community/post/route');
    const r = await kit.call(post, '/api/community/post', 'POST', bob, {
      action: 'create',
      body: 'Still here',
      groupId: id,
    });
    expect(r.status).toBe(200);
    const change = await g(bob, {
      action: 'update',
      groupId: id,
      name: 'Taken',
      visibility: 'public',
    });
    expect(change.status).toBe(409);
    // An admin gives it an owner (audited).
    const admin = await kit.person('adminx', { role: 'admin' });
    const a = await kit.call(await adminRoute(), '/api/admin/challenges', 'POST', admin, {
      action: 'assign_owner',
      groupId: id,
      username: 'bobby',
    });
    expect(a.status, await a.clone().text()).toBe(200);
    expect(
      (await g(bob, { action: 'update', groupId: id, name: 'Taken', visibility: 'public' })).status,
    ).toBe(200);
    const audit = await kit.db.query<{ action: string }>(
      'select action from public.admin_audit_log',
    );
    expect(audit.rows.map((x) => x.action)).toContain('assign_group_owner');
  });

  it('Two accounts in one group see the same board', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const out = await kit.person('outsider');
    const id = await newGroup(ann);
    await g(bob, { action: 'join', code: await codeOf(id) });
    await boardRow(ann, 40);
    await boardRow(bob, 70);
    await boardRow(out, 99);
    const Page = await groupPage();
    const boardOf = async (who: Person): Promise<string> => {
      state.cookie = who.cookie;
      const html = renderToStaticMarkup((await Page(props(id))) as never);
      const at = html.indexOf('Group board');
      return html.slice(at, html.indexOf('</ol>', at)).replace(/ class="[^"]*"/g, '');
    };
    const a = await boardOf(ann);
    const b = await boardOf(bob);
    expect(a).toContain('bobby');
    expect(a).toContain('annie');
    expect(a).not.toContain('outsider');
    // The same rows in the same order. Only the "You" mark differs.
    expect(a.replace(/You · /g, '')).toBe(b.replace(/You · /g, ''));
  });

  it('under 16, banned, signed out, the groups switch off and no keys all get the plain 404', async () => {
    const ann = await kit.person('annie');
    const id = await newGroup(ann, 'public');
    const kid = await kit.person('kiddo', { ageYears: 15 });
    const banned = await kit.person('banned', { banned: true });
    for (const who of [null, kid, banned]) {
      expect((await g(who, { action: 'join', groupId: id })).status).toBe(404);
      expect(
        (
          await kit.call(await challengeRoute(), '/api/community/challenge', 'POST', who, {
            action: 'enter',
            challengeId: id,
          })
        ).status,
      ).toBe(404);
    }
    state.cookie = kid.cookie;
    await expect((await groupPage())(props(id))).rejects.toThrow('NEXT_NOT_FOUND');
    await kit.setSwitch('groups', false);
    expect((await g(ann, { action: 'join', groupId: id })).status).toBe(404);
    state.cookie = ann.cookie;
    await expect((await groupPage())(props(id))).rejects.toThrow('NEXT_NOT_FOUND');
    const { setAuthDeps } = await import('../auth/deps');
    setAuthDeps(null);
    expect((await g(ann, { action: 'join', groupId: id })).status).toBe(404);
  });

  it('the CSRF rule and the word filter apply', async () => {
    const ann = await kit.person('annie');
    const r = await kit.call(
      await groupRoute(),
      '/api/community/group',
      'POST',
      ann,
      { action: 'create', name: 'X group', visibility: 'public' },
      { headers: { origin: 'https://evil.example' } },
    );
    expect(r.status).toBe(403);
    await kit.db.query(`insert into public.word_filter (term) values ('badword')`);
    expect(
      (await g(ann, { action: 'create', name: 'Badword club', visibility: 'public' })).status,
    ).toBe(400);
  });
});

describe('challenges', () => {
  it('a group owner sets a challenge; a member enters it with a farm on its fixed seed; one entry each; its board', async () => {
    const ann = await kit.person('annie');
    const bob = await kit.person('bobby');
    const id = await newGroup(ann);
    await g(bob, { action: 'join', code: await codeOf(id) });
    const settings = {
      district: 'wv',
      size: 'small',
      enterprise: 'grazing',
      years: 'random',
      startType: 'scratch',
      difficulty: 'easy',
    };
    expect(
      (
        await g(bob, {
          action: 'challenge',
          groupId: id,
          kind: 'fast_challenge',
          name: 'Spring cup',
          settings,
        })
      ).status,
    ).toBe(403);
    const made = await g(ann, {
      action: 'challenge',
      groupId: id,
      kind: 'fast_challenge',
      name: 'Spring cup',
      settings,
    });
    expect(made.status, await made.clone().text()).toBe(200);
    const answer = await body(made);
    const cid = answer.id as string;
    // The seed is never sent to a player.
    expect(JSON.stringify(answer)).not.toMatch(/seed/);
    const enter = () =>
      challengeRoute().then((m) =>
        kit.call(m, '/api/community/challenge', 'POST', bob, { action: 'enter', challengeId: cid }),
      );
    const r = await enter();
    expect(r.status, await r.clone().text()).toBe(200);
    expect(r.headers.get('set-cookie')).toMatch(/gg_farm=/);
    expect(await r.text()).not.toMatch(/seed/);
    const farm = await kit.db.query<{ challenge_id: string; district: string }>(
      'select challenge_id, district from public.farms where owner_id = $1',
      [bob.id],
    );
    expect(farm.rows[0]).toEqual({ challenge_id: cid, district: 'wv' });
    expect((await enter()).status).toBe(409);
    // Someone outside the group can not enter it.
    const out = await kit.person('outsider');
    const no = await kit.call(await challengeRoute(), '/api/community/challenge', 'POST', out, {
      action: 'enter',
      challengeId: cid,
    });
    expect(no.status).toBe(404);
    // Its board, on the group page.
    await boardRow(ann, 55, cid);
    state.cookie = bob.cookie;
    const html = renderToStaticMarkup(
      (await (
        await groupPage()
      )(props(id, { challenge: cid }))) as never,
    );
    expect(html).toContain('Challenge board: Spring cup');
    expect(html).toContain('annie');
  });

  it('a Daily league is refused for now with a plain reason', async () => {
    const admin = await kit.person('adminx', { role: 'admin' });
    const ann = await kit.person('annie');
    const r = await kit.call(await adminRoute(), '/api/admin/challenges', 'POST', admin, {
      action: 'challenge',
      kind: 'daily_league',
      name: 'Winter league',
      settings: {
        district: 'cq',
        size: 'small',
        enterprise: 'grazing',
        years: 'random',
        startType: 'scratch',
        difficulty: 'easy',
      },
    });
    expect(r.status, await r.clone().text()).toBe(200);
    const cid = (await body(r)).id as string;
    const e = await kit.call(await challengeRoute(), '/api/community/challenge', 'POST', ann, {
      action: 'enter',
      challengeId: cid,
    });
    expect(e.status).toBe(409);
    expect(String((await body(e)).error)).toMatch(/Daily/);
  });

  it('admin makes and ends a public challenge, audited; players can not', async () => {
    const admin = await kit.person('adminx', { role: 'admin' });
    const ann = await kit.person('annie');
    const settings = {
      district: 'cq',
      size: 'small',
      enterprise: 'grazing',
      years: 'random',
      startType: 'scratch',
      difficulty: 'easy',
    };
    const no = await kit.call(await adminRoute(), '/api/admin/challenges', 'POST', ann, {
      action: 'challenge',
      kind: 'fast_challenge',
      name: 'Cup',
      settings,
    });
    expect(no.status).toBe(404);
    const r = await kit.call(await adminRoute(), '/api/admin/challenges', 'POST', admin, {
      action: 'challenge',
      kind: 'fast_challenge',
      name: 'Cup',
      settings,
    });
    const cid = (await body(r)).id as string;
    const end = await kit.call(await adminRoute(), '/api/admin/challenges', 'POST', admin, {
      action: 'end',
      challengeId: cid,
    });
    expect(end.status).toBe(200);
    const audit = await kit.db.query<{ action: string }>(
      'select action from public.admin_audit_log order by id',
    );
    expect(audit.rows.map((x) => x.action)).toEqual(['challenge_create', 'challenge_end']);
    // An ended challenge can not be entered.
    const e = await kit.call(await challengeRoute(), '/api/community/challenge', 'POST', ann, {
      action: 'enter',
      challengeId: cid,
    });
    expect(e.status).toBe(409);
    // The admin page lists it, with no seed shown.
    state.cookie = admin.cookie;
    const Page = ((await import('@/app/admin/challenges/page')) as { default: PageFn }).default;
    const html = renderToStaticMarkup(
      (await Page({ searchParams: Promise.resolve({ results: cid }) })) as never,
    );
    expect(html).toContain('Cup');
    const seed = await kit.db.query<{ seed: string }>(
      'select seed::text as seed from public.challenges where id = $1',
      [cid],
    );
    expect(html).not.toContain(seed.rows[0]!.seed);
  });
});

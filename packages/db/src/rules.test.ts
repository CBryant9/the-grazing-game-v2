import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMUNITY_SWITCHES,
  ID,
  as,
  asMany,
  freshDb,
  passed,
  rows,
  rowsOf,
  switchesSql,
  type Outcome,
  type Who,
} from './harness';

// The rules one by one: private fields, the save, leaderboards, the under-16
// rule on every community table, blocks, follows, photos, the switches.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(switchesSql(COMMUNITY_SWITCHES, true));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const count = (o: Outcome): number => (o.ok ? o.rows.length : -1);
const refusedOrEmpty = (o: Outcome): boolean => !o.ok || (o.rows.length === 0 && o.affected === 0);
const deniedError = (o: Outcome): boolean => !o.ok && /permission denied/.test(o.error);

describe('private fields', () => {
  it('nobody but the player reads a date of birth, not even an admin', async () => {
    for (const who of ['anon', 'b', 'u16', 'admin'] as Who[]) {
      const o = await as(
        db,
        who,
        `select date_of_birth from public.account_private where user_id = '${ID.a}'`,
      );
      expect(refusedOrEmpty(o), who).toBe(true);
    }
    const own = await as(
      db,
      'a',
      `select date_of_birth from public.account_private where user_id = '${ID.a}'`,
    );
    expect(count(own)).toBe(1);
  });

  it('a player can not change their own date of birth', async () => {
    const o = await as(
      db,
      'a',
      `update public.account_private set date_of_birth = '2000-01-01' where user_id = '${ID.a}'`,
    );
    expect(deniedError(o)).toBe(true);
  });

  it('a player can not make themselves an admin or lift a ban', async () => {
    const o1 = await as(
      db,
      'a',
      `update public.account_status set role = 'admin' where user_id = '${ID.a}'`,
    );
    const o2 = await as(
      db,
      'a',
      `update public.account_status set banned_at = null where user_id = '${ID.a}'`,
    );
    expect(deniedError(o1)).toBe(true);
    expect(deniedError(o2)).toBe(true);
  });

  it('email (auth.users) is never readable by the browser roles', async () => {
    for (const who of ['anon', 'a', 'admin'] as Who[]) {
      expect(deniedError(await as(db, who, `select email from auth.users`)), who).toBe(true);
    }
  });

  it('another player sees no private column on a profile', async () => {
    const o = await as(db, 'b', `select * from public.public_profiles where user_id = '${ID.a}'`);
    expect(o.ok && o.rows.length).toBe(1);
    const cols = Object.keys(rowsOf(o)[0]!);
    for (const bad of ['date_of_birth', 'email', 'role', 'ticker_opt_in', 'privacy_farm_view']) {
      expect(cols).not.toContain(bad);
    }
    // And the base table is closed to them.
    expect(
      count(await as(db, 'b', `select * from public.profiles where user_id = '${ID.a}'`)),
    ).toBe(0);
  });

  it('hidden columns stay hidden: challenge seeds, invite codes, moderator notes, Stripe ids, switch notes', async () => {
    expect(deniedError(await as(db, 'anon', `select seed from public.challenges`))).toBe(true);
    expect(deniedError(await as(db, 'a', `select seed from public.challenges`))).toBe(true);
    expect(deniedError(await as(db, 'a', `select invite_code from public.groups`))).toBe(true);
    expect(deniedError(await as(db, 'b', `select notes from public.reports`))).toBe(true);
    expect(deniedError(await as(db, 'b', `select moderator_id from public.reports`))).toBe(true);
    expect(
      deniedError(await as(db, 'b', `select stripe_checkout_session_id from public.purchases`)),
    ).toBe(true);
    expect(deniedError(await as(db, 'anon', `select note from public.feature_switches`))).toBe(
      true,
    );
  });

  it('the group invite code goes to the owner only', async () => {
    const owner = await as(db, 'a', `select public.group_invite_code('${ID.group}') as code`);
    const member = await as(db, 'b', `select public.group_invite_code('${ID.group}') as code`);
    expect(owner.ok && owner.rows[0]!.code).toMatch(/^[0-9a-f]{32}$/);
    expect(member.ok && member.rows[0]!.code).toBeNull();
  });

  it('download my data: only the player, and never the engine save', async () => {
    const o = await as(db, 'a', `select public.export_my_data() as d`);
    expect(o.ok).toBe(true);
    const d = rowsOf(o)[0]!.d as Record<string, unknown>;
    expect((d.profile as { username: string }).username).toBe('ava_grazier');
    expect((d.private as { date_of_birth: string }).date_of_birth).toBe('1990-06-15');
    expect((d.farms as unknown[]).length).toBe(2);
    expect(JSON.stringify(d)).not.toContain('hidden rules');
    expect(JSON.stringify(d)).not.toContain('ben_paddock');
    expect(JSON.stringify(d)).not.toContain('cs_test_');
    expect(passed(await as(db, 'anon', `select public.export_my_data()`))).toBe(false);
  });

  it('download my data holds the analytics consent choice (m7 join)', async () => {
    const before = rowsOf(await as(db, 'a', `select public.export_my_data() as d`))[0]!.d as Record<
      string,
      unknown
    >;
    expect(before).toHaveProperty('analytics_consent', null);
    await db.query(
      `insert into public.analytics_consent (user_id, granted) values ($1, true)
       on conflict (user_id) do update set granted = true`,
      [ID.a],
    );
    try {
      const after = rowsOf(await as(db, 'a', `select public.export_my_data() as d`))[0]!
        .d as Record<string, { granted: boolean; decided_at: string } | null>;
      expect(after.analytics_consent?.granted).toBe(true);
      expect(typeof after.analytics_consent?.decided_at).toBe('string');
      // Another player's choice is never in it.
      const other = rowsOf(await as(db, 'b', `select public.export_my_data() as d`))[0]!
        .d as Record<string, unknown>;
      expect(other.analytics_consent).toBeNull();
    } finally {
      await db.query(`delete from public.analytics_consent where user_id = $1`, [ID.a]);
    }
  });
});

describe('the engine save', () => {
  it('no browser role can read it, not even the farm owner', async () => {
    for (const who of ['anon', 'a', 'b', 'u16', 'admin'] as Who[]) {
      for (const t of ['farm_saves', 'farm_actions']) {
        const o = await as(db, who, `select * from public.${t} where farm_id = '${ID.farmA}'`);
        expect(deniedError(o), `${who} ${t}`).toBe(true);
      }
    }
  });

  it('the server reads and writes it', async () => {
    const o = await as(
      db,
      'service',
      `select save, stored_format, engine_version from public.farm_saves where farm_id = '${ID.farmA}'`,
    );
    expect(count(o)).toBe(1);
  });

  it('weather and price data are server only', async () => {
    for (const t of ['weather_daily', 'price_daily']) {
      expect(deniedError(await as(db, 'a', `select * from public.${t}`))).toBe(true);
    }
  });
});

describe('leaderboards', () => {
  it('players can not write a leaderboard row or a score', async () => {
    for (const who of ['a', 'admin'] as Who[]) {
      const ins = await as(
        db,
        who,
        `insert into public.leaderboard_entries (farm_id, user_id, board, mode, district, size, start_type, enterprise, period, period_key, score, farm_name)
         values ('${ID.farmA}', '${ID.a}', 'grazier', 'fast', 'nsw', 'medium', 'running', 'grazing', 'all', 'x', 1e9, 'x')`,
      );
      const up = await as(db, who, `update public.leaderboard_entries set score = 1e9`);
      const del = await as(db, who, `delete from public.leaderboard_entries`);
      const score = await as(
        db,
        who,
        `update public.farm_scores set grazier_score = 1e6 where farm_id = '${ID.farmA}'`,
      );
      for (const o of [ins, up, del, score]) expect(deniedError(o), who).toBe(true);
    }
  });

  it('under 16: username and district only, no photo, no profile link, no farm name', async () => {
    const o = await as(
      db,
      'anon',
      `select * from public.leaderboard_rows where username = 'kid_cattle'`,
    );
    expect(count(o)).toBe(1);
    const row = rowsOf(o)[0]!;
    expect(row.district).toBe('cq');
    expect(row.user_id).toBeNull();
    expect(row.avatar_path).toBeNull();
    expect(row.farm_name).toBeNull();
    const adult = await as(
      db,
      'anon',
      `select user_id, farm_name from public.leaderboard_rows where username = 'ava_grazier'`,
    );
    expect(adult.ok && adult.rows[0]!.user_id).toBe(ID.a);
  });

  it('are hidden while the leaderboards switch is off, except to admins', async () => {
    const off = switchesSql(['leaderboards'], false);
    expect(count(await as(db, 'anon', `select 1 from public.leaderboard_rows`, off))).toBe(0);
    expect(count(await as(db, 'a', `select 1 from public.leaderboard_rows`, off))).toBe(0);
    expect(
      count(await as(db, 'admin', `select 1 from public.leaderboard_rows`, off)),
    ).toBeGreaterThan(0);
  });

  it('a deleted account stays on the board as "Former player"', async () => {
    const prep = `delete from auth.users where id = '${ID.a}';`;
    const o = await as(
      db,
      'anon',
      `select username, user_id from public.leaderboard_rows where username = 'Former player'`,
      prep,
    );
    expect(count(o)).toBe(2);
    expect(o.ok && o.rows.every((r) => r.user_id === null)).toBe(true);
  });
});

const COMMUNITY_READS: Record<string, string> = {
  public_profiles: `select 1 from public.public_profiles where user_id <> '${ID.u16}'`,
  public_farms: `select 1 from public.public_farms`,
  profile_links: `select 1 from public.profile_links`,
  profile_experience: `select 1 from public.profile_experience`,
  profile_education: `select 1 from public.profile_education`,
  farm_showcase_photos: `select 1 from public.farm_showcase_photos`,
  follows: `select 1 from public.follows`,
  blocks: `select 1 from public.blocks`,
  groups: `select id from public.groups`,
  group_members: `select 1 from public.group_members`,
  posts: `select 1 from public.posts`,
  post_photos: `select 1 from public.post_photos`,
  comments: `select 1 from public.comments`,
  likes: `select 1 from public.likes`,
  activity_events: `select 1 from public.activity_events`,
  reports: `select id from public.reports`,
  group_challenges: `select id from public.challenges where group_id is not null`,
};

const COMMUNITY_WRITES: Record<string, string> = {
  profile_links: `insert into public.profile_links (user_id, kind, url) values ('${ID.u16}', 'x', 'https://example.org/k')`,
  profile_experience: `insert into public.profile_experience (user_id, role) values ('${ID.u16}', 'Rouseabout')`,
  profile_education: `insert into public.profile_education (user_id, course_name) values ('${ID.u16}', 'School')`,
  farm_showcase_photos: `insert into public.farm_showcase_photos (user_id, storage_path) values ('${ID.u16}', '${ID.u16}/a.jpg')`,
  follows: `insert into public.follows (follower_id, followee_id) values ('${ID.u16}', '${ID.a}')`,
  blocks: `insert into public.blocks (blocker_id, blocked_id) values ('${ID.u16}', '${ID.a}')`,
  groups: `insert into public.groups (name, owner_id) values ('Kids group', '${ID.u16}')`,
  posts: `insert into public.posts (author_id, body) values ('${ID.u16}', 'Hi')`,
  comments: `insert into public.comments (post_id, author_id, body) values ('${ID.postA}', '${ID.u16}', 'Hi')`,
  likes: `insert into public.likes (user_id, post_id) values ('${ID.u16}', '${ID.postA}')`,
  reports: `insert into public.reports (reporter_id, target_type, target_id, reason) values ('${ID.u16}', 'post', '${ID.postA}', 'spam')`,
  join_group: `select public.join_group('${ID.group}', (select invite_code from public.groups where id = '${ID.group}'))`,
};

describe('under 16: no community anywhere (PRD 8.3)', () => {
  for (const [name, sql] of Object.entries(COMMUNITY_READS)) {
    it(`sees nothing in ${name}`, async () => {
      expect(refusedOrEmpty(await as(db, 'u16', sql))).toBe(true);
      // The same read finds rows for an adult member, so the empty result means something.
      // (Ann, who is in the group: since Stage 4 an admin sees the community as any member does.)
      if (name !== 'blocks' && name !== 'reports') {
        expect(count(await as(db, name === 'public_farms' ? 'admin' : 'a', sql))).toBeGreaterThan(
          0,
        );
      }
    });
  }

  for (const [name, sql] of Object.entries(COMMUNITY_WRITES)) {
    it(`can not write to ${name}`, async () => {
      expect(passed(await as(db, 'u16', sql))).toBe(false);
    });
  }

  it('is never shown to anyone else: no profile, no ticker line, no farm view', async () => {
    expect(
      count(await as(db, 'a', `select 1 from public.public_profiles where user_id = '${ID.u16}'`)),
    ).toBe(0);
    expect(
      count(await as(db, 'a', `select 1 from public.activity_events where user_id = '${ID.u16}'`)),
    ).toBe(0);
    expect(
      count(await as(db, 'a', `select 1 from public.public_farms where owner_id = '${ID.u16}'`)),
    ).toBe(0);
    const viewU16Daily = `update public.farms set mode = 'daily', timezone = 'Australia/Brisbane', sim_through = current_date where id = '${ID.farmU16}';`;
    expect(
      count(
        await as(
          db,
          'a',
          `select 1 from public.public_farms where owner_id = '${ID.u16}'`,
          viewU16Daily,
        ),
      ),
    ).toBe(0);
    const can = await as(
      db,
      'service',
      `select public.can_view_farm('${ID.a}', '${ID.farmU16}') as ok`,
    );
    expect(can.ok && can.rows[0]!.ok).toBe(false);
  });

  it('still has the game: their own farms, scores, diary and notifications', async () => {
    expect(
      count(await as(db, 'u16', `select 1 from public.farms where owner_id = '${ID.u16}'`)),
    ).toBe(1);
    expect(
      count(
        await as(db, 'u16', `select 1 from public.farm_scores where farm_id = '${ID.farmU16}'`),
      ),
    ).toBe(1);
    expect(
      count(await as(db, 'u16', `select 1 from public.farm_days where farm_id = '${ID.farmU16}'`)),
    ).toBe(1);
    expect(count(await as(db, 'u16', `select 1 from public.notifications`))).toBe(1);
    expect(count(await as(db, 'u16', `select 1 from public.leaderboard_rows`))).toBeGreaterThan(0);
  });

  it('opens by itself on the 16th birthday', async () => {
    const turn16 = `update public.account_private set date_of_birth = ((now() at time zone 'Australia/Sydney')::date - interval '16 years')::date where user_id = '${ID.u16}';`;
    expect(count(await as(db, 'u16', `select 1 from public.posts`, turn16))).toBeGreaterThan(0);
    const dayBefore = `update public.account_private set date_of_birth = ((now() at time zone 'Australia/Sydney')::date - interval '16 years')::date + 1 where user_id = '${ID.u16}';`;
    expect(count(await as(db, 'u16', `select 1 from public.posts`, dayBefore))).toBe(0);
  });
});

describe('blocks hide both ways', () => {
  const blockAB = `insert into public.blocks (blocker_id, blocked_id) values ('${ID.a}', '${ID.b}');`;

  it('the blocked player no longer sees the blocker, and the blocker no longer sees them', async () => {
    const checks: [Who, string][] = [
      ['b', `select 1 from public.posts where author_id = '${ID.a}'`],
      ['b', `select 1 from public.public_profiles where user_id = '${ID.a}'`],
      ['b', `select 1 from public.profile_links where user_id = '${ID.a}'`],
      ['b', `select 1 from public.activity_events where user_id = '${ID.a}'`],
      ['b', `select 1 from public.public_farms where owner_id = '${ID.a}'`],
      ['a', `select 1 from public.posts where author_id = '${ID.b}'`],
      ['a', `select 1 from public.comments where author_id = '${ID.b}'`],
      ['a', `select 1 from public.likes where user_id = '${ID.b}'`],
      ['a', `select 1 from public.public_profiles where user_id = '${ID.b}'`],
      ['a', `select 1 from public.leaderboard_rows where username = 'ben_paddock'`],
    ];
    for (const [who, sql] of checks) {
      expect(count(await as(db, who, sql)), `before: ${who} ${sql}`).toBeGreaterThan(0);
      expect(count(await as(db, who, sql, blockAB)), `after: ${who} ${sql}`).toBe(0);
    }
  });

  it('the blocked player can not follow, comment on or like the blocker', async () => {
    const prep = blockAB + `delete from public.likes where user_id = '${ID.b}';`;
    expect(
      passed(
        await as(
          db,
          'b',
          `insert into public.follows (follower_id, followee_id) values ('${ID.b}', '${ID.a}')`,
          prep,
        ),
      ),
    ).toBe(false);
    expect(
      passed(
        await as(
          db,
          'b',
          `insert into public.comments (post_id, author_id, body) values ('${ID.postA}', '${ID.b}', 'x')`,
          prep,
        ),
      ),
    ).toBe(false);
    expect(
      passed(
        await as(
          db,
          'b',
          `insert into public.likes (user_id, post_id) values ('${ID.b}', '${ID.postA}')`,
          prep,
        ),
      ),
    ).toBe(false);
  });

  it('a block removes the follows both ways, and the blocked player never sees the block', async () => {
    const left = await as(
      db,
      'service',
      `select 1 from public.follows where (follower_id = '${ID.a}' and followee_id = '${ID.b}') or (follower_id = '${ID.b}' and followee_id = '${ID.a}')`,
      blockAB,
    );
    expect(count(left)).toBe(0);
    expect(
      count(await as(db, 'b', `select 1 from public.blocks where blocked_id = '${ID.b}'`, blockAB)),
    ).toBe(0);
  });

  it('the seed block (Ben blocked Cara) hides each from the other', async () => {
    const find = (viewer: string, owner: string) =>
      as(db, 'service', `select app.can_find_profile_for('${viewer}', '${owner}') as ok`);
    const yes = await find(ID.a, ID.c);
    const benSeesCara = await find(ID.b, ID.c);
    const caraSeesBen = await find(ID.c, ID.b);
    expect(yes.ok && yes.rows[0]!.ok).toBe(true);
    expect(benSeesCara.ok && benSeesCara.rows[0]!.ok).toBe(false);
    expect(caraSeesBen.ok && caraSeesBen.rows[0]!.ok).toBe(false);
  });
});

describe('follows', () => {
  it('a public profile is followed at once', async () => {
    const o = await asMany(db, 'a', [
      `insert into public.follows (follower_id, followee_id) values ('${ID.a}', '${ID.c}')`,
      `select status from public.follows where follower_id = '${ID.a}' and followee_id = '${ID.c}'`,
    ]);
    expect(o[1]!.ok && o[1]!.rows[0]!.status).toBe('accepted');
  });

  it('a followers-only profile needs approval, given only by the one followed', async () => {
    const prep = `update public.profiles set privacy_profile = 'followers' where user_id = '${ID.c}';`;
    const o = await asMany(
      db,
      'a',
      [
        `insert into public.follows (follower_id, followee_id, status) values ('${ID.a}', '${ID.c}', 'accepted')`,
      ],
      prep,
    );
    // The follower can't choose the status (the column is not theirs to write).
    expect(o[0]!.ok).toBe(false);
    const o2 = await asMany(
      db,
      'a',
      [
        `insert into public.follows (follower_id, followee_id) values ('${ID.a}', '${ID.c}')`,
        `select status from public.follows where follower_id = '${ID.a}' and followee_id = '${ID.c}'`,
        `update public.follows set status = 'accepted' where follower_id = '${ID.a}' and followee_id = '${ID.c}'`,
      ],
      prep,
    );
    expect(o2[1]!.ok && o2[1]!.rows[0]!.status).toBe('pending');
    expect(o2[2]!.ok && o2[2]!.affected).toBe(0);
  });

  it('a private profile can not be followed, and its details are hidden', async () => {
    const prep = `update public.profiles set privacy_profile = 'private' where user_id = '${ID.c}';`;
    expect(
      passed(
        await as(
          db,
          'a',
          `insert into public.follows (follower_id, followee_id) values ('${ID.a}', '${ID.c}')`,
          prep,
        ),
      ),
    ).toBe(false);
    const card = await as(
      db,
      'a',
      `select username, bio, details_visible from public.public_profiles where user_id = '${ID.c}'`,
      prep,
    );
    expect(card.ok && card.rows[0]).toEqual({
      username: 'cara_cropper',
      bio: null,
      details_visible: false,
    });
  });

  it('a followers-only post shows only to accepted followers', async () => {
    expect(count(await as(db, 'a', `select 1 from public.posts where id = '${ID.postB}'`))).toBe(1);
    // An admin who does not follow Ben does not see it either (Stage 4: no staff view here).
    expect(
      count(
        await as(
          db,
          'admin',
          `select 1 from public.posts where id = '${ID.postB}' and author_id <> '${ID.admin}'`,
        ),
      ),
    ).toBe(0);
    const unfollow = `delete from public.follows where follower_id = '${ID.a}' and followee_id = '${ID.b}';`;
    expect(
      count(await as(db, 'a', `select 1 from public.posts where id = '${ID.postB}'`, unfollow)),
    ).toBe(0);
  });
});

describe('posts, photos and comments', () => {
  it('a photo is never shown to others before the image check passes', async () => {
    expect(
      count(await as(db, 'b', `select 1 from public.post_photos where id = '${ID.photoPending}'`)),
    ).toBe(0);
    expect(
      count(await as(db, 'a', `select 1 from public.post_photos where id = '${ID.photoPending}'`)),
    ).toBe(1);
  });

  it('a player can not mark their own photo as checked', async () => {
    const ins = await as(
      db,
      'a',
      `insert into public.post_photos (post_id, storage_path, position, moderation_status) values ('${ID.postA}', '${ID.a}/x.jpg', 3, 'approved')`,
    );
    expect(deniedError(ins)).toBe(true);
    const up = await as(
      db,
      'a',
      `update public.post_photos set moderation_status = 'approved' where id = '${ID.photoPending}'`,
    );
    expect(deniedError(up)).toBe(true);
    const show = await as(
      db,
      'a',
      `insert into public.farm_showcase_photos (user_id, storage_path, moderation_status) values ('${ID.a}', '${ID.a}/y.jpg', 'approved')`,
    );
    expect(deniedError(show)).toBe(true);
  });

  it('players write plain posts only; share cards and day cards come from the server', async () => {
    const o = await as(
      db,
      'a',
      `insert into public.posts (author_id, kind, body) values ('${ID.a}', 'day_card', 'x')`,
    );
    expect(deniedError(o)).toBe(true);
  });

  it('a removed post is hidden from everyone but its author (staff use the admin tools)', async () => {
    const prep = `update public.posts set removed_at = now() where id = '${ID.postA}';`;
    expect(
      count(await as(db, 'b', `select 1 from public.posts where id = '${ID.postA}'`, prep)),
    ).toBe(0);
    expect(
      count(await as(db, 'a', `select 1 from public.posts where id = '${ID.postA}'`, prep)),
    ).toBe(1);
    expect(
      count(await as(db, 'admin', `select 1 from public.posts where id = '${ID.postA}'`, prep)),
    ).toBe(0);
  });

  it('a group post shows only to the group', async () => {
    expect(
      count(await as(db, 'b', `select 1 from public.posts where id = '${ID.groupPostA}'`)),
    ).toBe(1);
    const leave = `delete from public.group_members where user_id = '${ID.b}';`;
    expect(
      count(await as(db, 'b', `select 1 from public.posts where id = '${ID.groupPostA}'`, leave)),
    ).toBe(0);
    expect(
      count(
        await as(
          db,
          'b',
          `select id from public.challenges where id = '${ID.challengeGroup}'`,
          leave,
        ),
      ),
    ).toBe(0);
    expect(
      count(
        await as(db, 'b', `select id from public.challenges where id = '${ID.challengeGroup}'`),
      ),
    ).toBe(1);
  });

  it('replies go one level deep', async () => {
    const o = await as(
      db,
      'b',
      `insert into public.comments (post_id, author_id, parent_id, body) values ('${ID.postA}', '${ID.b}', '${ID.replyA}', 'Too deep')`,
    );
    expect(passed(o)).toBe(false);
  });

  it('the word filter refuses blocked words and queues flagged ones', async () => {
    expect(
      passed(
        await as(
          db,
          'a',
          `insert into public.posts (author_id, body) values ('${ID.a}', 'what a badword day')`,
        ),
      ),
    ).toBe(false);
    expect(
      passed(
        await as(
          db,
          'a',
          `update public.profiles set username = 'the_badword_1' where user_id = '${ID.a}'`,
        ),
      ),
    ).toBe(false);
    const flagged = await asMany(db, 'a', [
      `insert into public.posts (author_id, body) values ('${ID.a}', 'a flagword here')`,
    ]);
    expect(passed(flagged[0]!)).toBe(true);
    const queued = await as(
      db,
      'service',
      `select 1 from public.reports where reporter_id is null and details = 'Flagged by the word filter'`,
      `insert into public.posts (author_id, body) values ('${ID.a}', 'a flagword here');`,
    );
    expect(count(queued)).toBe(1);
  });

  it('posting is rate limited, more tightly for a new account', async () => {
    const tight = `update public.rate_limit_rules set max_count = 2 where action = 'post';`;
    const post = `insert into public.posts (author_id, body) values ('${ID.a}', 'again')`;
    const o = await asMany(db, 'a', [post, post, post], tight);
    expect(o.map((x) => x.ok)).toEqual([true, true, false]);
    expect(o[2]!.ok === false && o[2]!.error).toMatch(/rate_limited/);
    const young = `update public.profiles set created_at = now() where user_id = '${ID.a}'; update public.rate_limit_rules set new_account_max = 1 where action = 'post';`;
    const o2 = await asMany(db, 'a', [post, post], young);
    expect(o2.map((x) => x.ok)).toEqual([true, false]);
  });
});

describe('the community switches', () => {
  const off = switchesSql(['community'], false);

  it('with the community off, players see and write nothing in it; admins still can', async () => {
    expect(count(await as(db, 'a', `select 1 from public.posts`, off))).toBe(0);
    expect(
      count(
        await as(db, 'a', `select 1 from public.public_profiles where user_id <> '${ID.a}'`, off),
      ),
    ).toBe(0);
    expect(
      passed(
        await as(
          db,
          'a',
          `insert into public.posts (author_id, body) values ('${ID.a}', 'x')`,
          off,
        ),
      ),
    ).toBe(false);
    expect(count(await as(db, 'admin', `select 1 from public.posts`, off))).toBeGreaterThan(0);
  });

  it('each part has its own switch', async () => {
    expect(
      count(await as(db, 'b', `select 1 from public.posts`, switchesSql(['feed_posts'], false))),
    ).toBe(0);
    expect(
      count(await as(db, 'b', `select id from public.groups`, switchesSql(['groups'], false))),
    ).toBe(0);
    expect(
      count(
        await as(
          db,
          'b',
          `select 1 from public.activity_events`,
          switchesSql(['activity_ticker'], false),
        ),
      ),
    ).toBe(0);
    expect(
      count(
        await as(
          db,
          'b',
          `select 1 from public.public_farms`,
          switchesSql(['farm_viewing'], false),
        ),
      ),
    ).toBe(0);
    expect(count(await as(db, 'b', `select 1 from public.public_farms`))).toBe(1);
  });

  it('a banned or suspended account loses the community', async () => {
    const ban = `update public.account_status set banned_at = now() where user_id = '${ID.b}';`;
    const suspend = `update public.account_status set suspended_until = now() + interval '3 days' where user_id = '${ID.b}';`;
    expect(count(await as(db, 'b', `select 1 from public.posts`, ban))).toBe(0);
    expect(count(await as(db, 'b', `select 1 from public.posts`, suspend))).toBe(0);
    expect(
      count(await as(db, 'a', `select 1 from public.posts where author_id = '${ID.b}'`, ban)),
    ).toBe(0);
  });

  it('the ticker shows only players who switched it on', async () => {
    const off2 = `update public.profiles set ticker_opt_in = false where user_id = '${ID.a}';`;
    expect(
      count(await as(db, 'b', `select 1 from public.activity_events where user_id = '${ID.a}'`)),
    ).toBe(1);
    expect(
      count(
        await as(db, 'b', `select 1 from public.activity_events where user_id = '${ID.a}'`, off2),
      ),
    ).toBe(0);
  });
});

describe('farm viewing', () => {
  it("follows the owner's farm view setting, Daily Farms only", async () => {
    expect(
      count(await as(db, 'b', `select 1 from public.public_farms where farm_id = '${ID.dailyA}'`)),
    ).toBe(1);
    expect(
      count(await as(db, 'b', `select 1 from public.public_farms where farm_id = '${ID.farmA}'`)),
    ).toBe(0);
    const offView = `update public.profiles set privacy_farm_view = 'off' where user_id = '${ID.a}';`;
    expect(count(await as(db, 'b', `select 1 from public.public_farms`, offView))).toBe(0);
    const followersOnly = `update public.profiles set privacy_farm_view = 'followers' where user_id = '${ID.a}';`;
    expect(count(await as(db, 'b', `select 1 from public.public_farms`, followersOnly))).toBe(1);
    expect(
      count(
        await as(
          db,
          'admin',
          `select 1 from public.public_farms where owner_id = '${ID.a}'`,
          followersOnly,
        ),
      ),
    ).toBe(0);
  });
});

describe('storage', () => {
  const put = (who: Who, bucket: string, path: string): Promise<Outcome> =>
    as(db, who, `insert into storage.objects (bucket_id, name) values ('${bucket}', '${path}')`);

  it('a player uploads nothing with their own token: only the server stores a photo (Stage 4)', async () => {
    expect(passed(await put('a', 'avatars', `${ID.a}/other.png`))).toBe(false);
    expect(passed(await put('a', 'avatars', `${ID.b}/me.png`))).toBe(false);
    expect(passed(await put('a', 'post-photos', `${ID.a}/p.jpg`))).toBe(false);
    expect(passed(await put('service', 'post-photos', `${ID.a}/p.jpg`))).toBe(true);
    expect(passed(await put('u16', 'post-photos', `${ID.u16}/p.jpg`))).toBe(false);
    expect(passed(await put('a', 'snapshots', `${ID.a}/s.json`))).toBe(false);
    expect(passed(await put('anon', 'avatars', `${ID.a}/other.png`))).toBe(false);
  });

  it('a photo file shows to others only once its row is approved and visible', async () => {
    // The seed has these files, with rain.jpg and both avatars approved.
    const see = (who: Who, name: string) =>
      as(db, who, `select 1 from storage.objects where name = '${name}'`);
    expect(count(await see('b', `${ID.a}/rain.jpg`))).toBe(1);
    expect(count(await see('b', `${ID.a}/gauge.jpg`))).toBe(0);
    expect(count(await see('a', `${ID.a}/gauge.jpg`))).toBe(1);
    expect(count(await see('b', `${ID.a}/me.png`))).toBe(1);
    expect(count(await see('a', `${ID.u16}/me.png`))).toBe(0);
    expect(count(await see('u16', `${ID.a}/me.png`))).toBe(0);
  });

  it('makes the five buckets', async () => {
    const b = await rows<{ id: string; public: boolean }>(
      db,
      `select id, public from storage.buckets order by id`,
    );
    expect(b).toEqual([
      // Private since 20261116000100: ad files are served only through the server's media route.
      { id: 'ad-media', public: false },
      { id: 'avatars', public: false },
      { id: 'group-photos', public: false },
      { id: 'post-photos', public: false },
      { id: 'snapshots', public: false },
    ]);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMUNITY_SWITCHES,
  ID,
  MIGRATIONS_DIR,
  as,
  asMany,
  freshDb,
  passed,
  rowsOf,
  switchesSql,
  type Outcome,
  type Who,
} from './harness';

// The holes the security review found (second pass), each tried as the
// role that would attack it. Every test here failed before its fix.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(switchesSql(COMMUNITY_SWITCHES, true));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const count = (o: Outcome): number => (o.ok ? o.rows.length : -1);
const errorOf = (o: Outcome): string => (o.ok ? '' : o.error);
const first = (o: Outcome): Record<string, unknown> => rowsOf(o)[0] ?? {};

const RAIN = `${ID.a}/rain.jpg`;
const YARDS = `${ID.a}/yards.jpg`;
const AVATAR_A = `${ID.a}/me.png`;
const seeFile = (who: Who, bucket: string, name: string, prep?: string) =>
  as(
    db,
    who,
    `select 1 from storage.objects where bucket_id = '${bucket}' and name = '${name}'`,
    prep,
  );

describe('1. a photo is approved by its file, not its name', () => {
  it('B sees the approved photo file to begin with', async () => {
    expect(count(await seeFile('b', 'post-photos', RAIN))).toBe(1);
  });

  it('the author swaps the file under the approved row: B never sees the new file', async () => {
    const swap = `delete from storage.objects where bucket_id = 'post-photos' and name = '${RAIN}';
      insert into storage.objects (bucket_id, name) values ('post-photos', '${RAIN}');`;
    // As the author: the delete is allowed in their own folder, but since Stage 4 only the server
    // stores a file (20261115001000_stage4_review.sql), so the new file comes from the prep.
    const o = await asMany(db, 'a', [
      `delete from storage.objects where bucket_id = 'post-photos' and name = '${RAIN}'`,
      `insert into storage.objects (bucket_id, name) values ('post-photos', '${RAIN}')`,
    ]);
    expect(o[0]!.ok).toBe(true);
    expect(o[1]!.ok).toBe(false);
    expect(count(await seeFile('b', 'post-photos', RAIN, swap))).toBe(0);
    const row = await as(
      db,
      'service',
      `select moderation_status, storage_object_id from public.post_photos where id = '${ID.photoApproved}'`,
      swap,
    );
    expect(first(row)).toEqual({ moderation_status: 'pending', storage_object_id: null });
  });

  it('even without the Storage trigger, a swapped file does not match the approval', async () => {
    const swap = `alter table storage.objects disable trigger gg_photo_file_changed;
      delete from storage.objects where bucket_id = 'post-photos' and name = '${RAIN}';
      insert into storage.objects (bucket_id, name) values ('post-photos', '${RAIN}');`;
    expect(count(await seeFile('b', 'post-photos', RAIN, swap))).toBe(0);
    const upsert = `alter table storage.objects disable trigger gg_photo_file_changed;
      update storage.objects set metadata = '{"v": 2}' where bucket_id = 'post-photos' and name = '${RAIN}';`;
    expect(count(await seeFile('b', 'post-photos', RAIN, upsert))).toBe(0);
  });

  it('the same for a showcase photo', async () => {
    const swap = `delete from storage.objects where name = '${YARDS}';
      insert into storage.objects (bucket_id, name) values ('post-photos', '${YARDS}');`;
    expect(count(await seeFile('b', 'post-photos', YARDS))).toBe(1);
    expect(count(await seeFile('b', 'post-photos', YARDS, swap))).toBe(0);
  });

  it('a row can not be approved before its file exists', async () => {
    const o = await asMany(db, 'service', [
      `insert into public.post_photos (post_id, storage_path, position) values ('${ID.postA}', '${ID.a}/later.jpg', 3)`,
      `select public.approve_photo('post_photo', (select id from public.post_photos where storage_path = '${ID.a}/later.jpg'), gen_random_uuid(), now())`,
    ]);
    expect(o[0]!.ok).toBe(true);
    expect(errorOf(o[1]!)).toMatch(/photo_file_changed/);
  });

  it('approving records the exact file', async () => {
    const o = await as(
      db,
      'service',
      `select ph.storage_object_id = o.id as same from public.post_photos ph join storage.objects o on o.name = ph.storage_path where ph.id = '${ID.photoApproved}'`,
    );
    expect(first(o)).toEqual({ same: true });
  });
});

describe('2. avatars and group photos are owned and checked', () => {
  it("a player can not point their avatar at someone else's photo", async () => {
    const o = await as(
      db,
      'a',
      `update public.profiles set avatar_path = '${ID.b}/me.png' where user_id = '${ID.a}'`,
    );
    expect(errorOf(o)).toMatch(/profiles_avatar_own_folder/);
  });

  it('a player can not mark their own avatar as checked', async () => {
    const o = await as(
      db,
      'a',
      `update public.profiles set avatar_status = 'approved' where user_id = '${ID.a}'`,
    );
    expect(errorOf(o)).toMatch(/permission denied/);
  });

  it('a new avatar shows to no one else until it has been checked', async () => {
    const newPhoto = `insert into storage.objects (bucket_id, name) values ('avatars', '${ID.a}/new.png');`;
    const o = await asMany(
      db,
      'a',
      [`update public.profiles set avatar_path = '${ID.a}/new.png' where user_id = '${ID.a}'`],
      newPhoto,
    );
    expect(o[0]!.ok).toBe(true);
    const prep =
      newPhoto +
      `update public.profiles set avatar_path = '${ID.a}/new.png' where user_id = '${ID.a}';`;
    expect(
      first(
        await as(
          db,
          'b',
          `select avatar_path from public.public_profiles where user_id = '${ID.a}'`,
          prep,
        ),
      ),
    ).toEqual({
      avatar_path: null,
    });
    expect(count(await seeFile('b', 'avatars', `${ID.a}/new.png`, prep))).toBe(0);
    // Before the change, B saw the checked one.
    expect(count(await seeFile('b', 'avatars', AVATAR_A))).toBe(1);
  });

  it('an overwritten avatar file goes back to pending', async () => {
    const overwrite = `update storage.objects set metadata = '{"v": 2}' where name = '${AVATAR_A}';`;
    const o = await as(
      db,
      'service',
      `select avatar_status from public.profiles where user_id = '${ID.a}'`,
      overwrite,
    );
    expect(first(o)).toEqual({ avatar_status: 'pending' });
    expect(count(await seeFile('b', 'avatars', AVATAR_A, overwrite))).toBe(0);
  });

  it('group photos: nobody uploads with their own token (the server stores them), and nobody sees one before it is checked', async () => {
    const path = `${ID.group}/g.jpg`;
    expect(
      passed(
        await as(
          db,
          'b',
          `insert into storage.objects (bucket_id, name) values ('group-photos', '${path}')`,
        ),
      ),
    ).toBe(false);
    // Not even the group's owner: since Stage 4 only the server stores a photo.
    expect(
      passed(
        await as(
          db,
          'a',
          `insert into storage.objects (bucket_id, name) values ('group-photos', '${path}')`,
        ),
      ),
    ).toBe(false);
    const wrongFolder = await as(
      db,
      'a',
      `update public.groups set photo_path = '${ID.a}/g.jpg' where id = '${ID.group}'`,
    );
    expect(passed(wrongFolder)).toBe(false);
    const uploaded = `insert into storage.objects (bucket_id, name) values ('group-photos', '${path}');
      update public.groups set photo_path = '${path}' where id = '${ID.group}';`;
    expect(
      first(
        await as(
          db,
          'b',
          `select photo_status from public.groups where id = '${ID.group}'`,
          uploaded,
        ),
      ),
    ).toEqual({
      photo_status: 'pending',
    });
    expect(count(await seeFile('b', 'group-photos', path, uploaded))).toBe(0);
    const checked =
      uploaded +
      `select public.approve_photo('group', '${ID.group}', o.id, o.updated_at, o.version) from storage.objects o where o.name = '${path}';`;
    expect(count(await seeFile('b', 'group-photos', path, checked))).toBe(1);
    expect(count(await seeFile('c', 'group-photos', path, checked))).toBe(0);
  });
});

describe('3. deleting an account hands its groups on', () => {
  it('the group goes to the longest-standing other member, with its posts and challenges', async () => {
    const o = await as(
      db,
      'service',
      `select g.owner_id, (select role from public.group_members where group_id = g.id and user_id = '${ID.b}') as role,
              (select count(*)::int from public.challenges where group_id = g.id) as challenges
         from public.groups g where g.id = '${ID.group}'`,
      `delete from auth.users where id = '${ID.a}';`,
    );
    expect(first(o)).toEqual({ owner_id: ID.b, role: 'owner', challenges: 1 });
  });

  it('a group goes only when its owner was the only member', async () => {
    const prep = `insert into public.groups (id, name, owner_id) values ('00000000-0000-4000-8000-0000000000f2', 'Just me', '${ID.c}');
      delete from auth.users where id = '${ID.c}';`;
    const o = await as(
      db,
      'service',
      `select 1 from public.groups where id = '00000000-0000-4000-8000-0000000000f2'`,
      prep,
    );
    expect(count(o)).toBe(0);
  });
});

describe('4. pending follow requests stay between the two', () => {
  it('a third party sees an accepted follow but never a pending one', async () => {
    const scene = `delete from public.blocks where blocker_id = '${ID.b}' and blocked_id = '${ID.c}';
      update public.profiles set privacy_profile = 'followers' where user_id = '${ID.a}';
      insert into public.follows (follower_id, followee_id, status) values ('${ID.c}', '${ID.a}', 'accepted');
      update public.follows set status = 'accepted' where follower_id = '${ID.c}' and followee_id = '${ID.a}';`;
    const q = `select 1 from public.follows where follower_id = '${ID.b}' and followee_id = '${ID.a}'`;
    expect(count(await as(db, 'c', q, scene))).toBe(1);
    const pending =
      scene +
      `update public.follows set status = 'pending' where follower_id = '${ID.b}' and followee_id = '${ID.a}';`;
    expect(count(await as(db, 'c', q, pending))).toBe(0);
    expect(count(await as(db, 'a', q, pending))).toBe(1);
  });
});

describe('5. a refused under-14 sign-up can not try again', () => {
  it('the same sign-in is refused even with an older date of birth', async () => {
    const out: Outcome[] = [];
    const jwt = JSON.stringify({ sub: ID.fresh, role: 'authenticated' });
    await db.exec('begin');
    try {
      await db.exec(`insert into auth.users (id) values ('${ID.fresh}');
        insert into public.signup_email_checks (user_id, email_hash) values ('${ID.fresh}', repeat('cd', 32));
        set local role authenticated; select set_config('request.jwt.claims', '${jwt}', true);`);
      for (const sql of [
        `select public.complete_sign_up('little_one', ((now() at time zone 'Australia/Sydney')::date - interval '12 years')::date) as r`,
        `select public.complete_sign_up('little_one', '1990-01-01') as r`,
        `select 1 from public.profiles where user_id = '${ID.fresh}'`,
      ]) {
        const r = await db.query<Record<string, unknown>>(sql);
        out.push({ ok: true, rows: r.rows, affected: 0 });
      }
    } finally {
      await db.exec('rollback');
    }
    expect(first(out[0]!)).toEqual({ r: 'too_young' });
    expect(first(out[1]!)).toEqual({ r: 'too_young' });
    expect(count(out[2]!)).toBe(0);
  });
});

describe('6. banned and suspended accounts disappear', () => {
  const banB = `update public.account_status set banned_at = now() where user_id = '${ID.b}';`;

  it('from group member lists', async () => {
    const q = `select 1 from public.group_members where group_id = '${ID.group}' and user_id = '${ID.b}'`;
    expect(count(await as(db, 'a', q))).toBe(1);
    expect(count(await as(db, 'a', q, banB))).toBe(0);
  });

  it('from public boards, as "Former player"', async () => {
    const q = `select username, user_id, farm_name from public.leaderboard_rows where district = 'cw'`;
    expect(first(await as(db, 'anon', q))).toEqual({
      username: 'ben_paddock',
      user_id: ID.b,
      farm_name: 'Red Hill',
    });
    expect(first(await as(db, 'anon', q, banB))).toEqual({
      username: 'Former player',
      user_id: null,
      farm_name: null,
    });
    const suspend = `update public.account_status set suspended_until = now() + interval '1 day' where user_id = '${ID.b}';`;
    expect(first(await as(db, 'anon', q, suspend))).toEqual({
      username: 'Former player',
      user_id: null,
      farm_name: null,
    });
  });
});

describe('7. a removed post stays removed', () => {
  it('the author can not delete a post moderation removed', async () => {
    const removed = `update public.posts set removed_at = now() where id = '${ID.postA}';`;
    expect(
      passed(await as(db, 'a', `delete from public.posts where id = '${ID.postA}'`, removed)),
    ).toBe(false);
    expect(passed(await as(db, 'a', `delete from public.posts where id = '${ID.postA}'`))).toBe(
      true,
    );
  });
});

describe('8. download my data is complete', () => {
  it('has the ticker lines, board rows, challenge entries and ad events, and still no save', async () => {
    const o = await as(db, 'a', `select public.export_my_data() as d`);
    const d = first(o).d as Record<string, unknown[]>;
    expect(d.activity!.length).toBe(1);
    expect(d.leaderboard_rows!.length).toBe(2);
    expect(d.challenge_entries!.length).toBe(1);
    expect(d.ad_events!.length).toBe(1);
    expect(JSON.stringify(d)).not.toContain('hidden rules');
  });
});

describe('9. deleting an account leaves no personal data', () => {
  it('Stripe events keep ids only, never the payload', async () => {
    const cols = await as(
      db,
      'service',
      `select column_name from information_schema.columns where table_name = 'stripe_events'`,
    );
    expect(rowsOf(cols).map((r) => r.column_name)).not.toContain('payload');
  });

  it('the audit log refuses an email address in its details', async () => {
    const o = await as(
      db,
      'service',
      `insert into public.admin_audit_log (admin_id, action, details) values ('${ID.admin}', 'ban', '{"note": "someone@example.org"}')`,
    );
    expect(errorOf(o)).toMatch(/audit_details_ok|check constraint/);
    const ok = await as(
      db,
      'service',
      `insert into public.admin_audit_log (admin_id, action, target_id) values ('${ID.admin}', 'ban', '${ID.b}')`,
    );
    expect(ok.ok).toBe(true);
  });

  it('what a deleted reporter wrote is cleared', async () => {
    const o = await as(
      db,
      'service',
      `select reporter_id, details from public.reports where id = '${ID.reportB}'`,
      `delete from auth.users where id = '${ID.b}';`,
    );
    expect(first(o)).toEqual({ reporter_id: null, details: null });
  });

  it("every file in the account's folders is listed for removal, linked or not", async () => {
    const stray = `insert into storage.objects (bucket_id, name) values ('post-photos', '${ID.a}/stray.jpg'), ('avatars', '${ID.a}/old.png');`;
    const o = await as(
      db,
      'service',
      `select bucket, path from public.account_storage_paths('${ID.a}') order by 1, 2`,
      stray,
    );
    expect(rowsOf(o).map((r) => r.path)).toEqual([
      `${ID.a}/me.png`,
      `${ID.a}/old.png`,
      `${ID.a}/gauge.jpg`,
      `${ID.a}/rain.jpg`,
      `${ID.a}/stray.jpg`,
      `${ID.a}/yards.jpg`,
    ]);
  });

  it('a ban outlives the account as a hash only, and refuses the same email a new sign-up', async () => {
    // The server works out the peppered hash; the database keeps only that.
    const hash = 'be'.repeat(32);
    const prep = `update public.account_status set banned_at = now() where user_id = '${ID.b}';
      select public.prepare_account_deletion('${ID.b}', '${hash}');
      delete from auth.users where id = '${ID.b}';`;
    const rec = await as(
      db,
      'service',
      `select email_hash, banned_until from public.ban_records`,
      prep,
    );
    expect(rowsOf(rec)).toHaveLength(1);
    expect(String(first(rec).email_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rowsOf(rec))).not.toMatch(/ben/i);
    const back =
      prep +
      `insert into auth.users (id, email) values ('${ID.fresh}', 'ben@example.org');
       insert into public.signup_email_checks (user_id, email_hash) values ('${ID.fresh}', '${hash}');`;
    const jwt = JSON.stringify({ sub: ID.fresh, role: 'authenticated' });
    await db.exec('begin');
    let err = '';
    try {
      await db.exec(back);
      await db.exec(
        `set local role authenticated; select set_config('request.jwt.claims', '${jwt}', true);`,
      );
      await db.query(`select public.complete_sign_up('ben_again', '1978-11-02')`);
    } catch (e) {
      err = (e as Error).message;
    } finally {
      await db.exec('rollback');
    }
    expect(err).toMatch(/banned/);
  });
});

describe('10. the moderator', () => {
  it('reads reports, the moderation history and the word filter, but sees the community as any member does', async () => {
    const removed = `update public.posts set removed_at = now() where id = '${ID.postA}';`;
    expect(count(await as(db, 'mod', `select id from public.reports`))).toBe(1);
    expect(count(await as(db, 'mod', `select 1 from public.moderation_actions`))).toBe(1);
    expect(count(await as(db, 'mod', `select 1 from public.word_filter`))).toBe(2);
    // Stage 4: staff powers are in the admin tools (the server's own connection), not in the
    // community's rules. A removed post and a photo still waiting are the author's alone.
    expect(
      count(await as(db, 'mod', `select 1 from public.posts where id = '${ID.postA}'`, removed)),
    ).toBe(0);
    expect(
      count(
        await as(db, 'mod', `select 1 from public.post_photos where id = '${ID.photoPending}'`),
      ),
    ).toBe(0);
  });

  it('changes nothing directly, and reads no admin-only or private data', async () => {
    expect(passed(await as(db, 'mod', `update public.reports set status = 'dismissed'`))).toBe(
      false,
    );
    expect(
      passed(
        await as(db, 'mod', `update public.posts set removed_at = now() where id = '${ID.postA}'`),
      ),
    ).toBe(false);
    expect(
      passed(await as(db, 'mod', `insert into public.word_filter (term) values ('another')`)),
    ).toBe(false);
    for (const t of ['admin_audit_log', 'daily_counts', 'sponsors', 'campaigns', 'ad_events']) {
      expect(count(await as(db, 'mod', `select 1 from public.${t}`)), t).toBe(0);
    }
    expect(
      count(
        await as(db, 'mod', `select 1 from public.account_private where user_id <> '${ID.mod}'`),
      ),
    ).toBe(0);
    expect(
      count(await as(db, 'mod', `select 1 from public.farms where owner_id <> '${ID.mod}'`)),
    ).toBe(0);
    expect(passed(await as(db, 'mod', `select notes from public.reports`))).toBe(false);
  });
});

describe('10. ages on the Sydney date, leap days and birthdays', () => {
  const age = async (dob: string, on: string): Promise<number> =>
    Number(first(await as(db, 'service', `select app.age_on('${dob}', '${on}') as n`)).n);

  it('a birthday counts from the day itself', async () => {
    expect(await age('2010-11-16', '2026-11-15')).toBe(15);
    expect(await age('2010-11-16', '2026-11-16')).toBe(16);
    expect(await age('2012-11-16', '2026-11-15')).toBe(13);
    expect(await age('2012-11-16', '2026-11-16')).toBe(14);
  });

  it('a 29 February birthday counts from 1 March in other years, and on the day in a leap year', async () => {
    expect(await age('2012-02-29', '2026-02-28')).toBe(13);
    expect(await age('2012-02-29', '2026-03-01')).toBe(14);
    expect(await age('2012-02-29', '2028-02-28')).toBe(15);
    expect(await age('2012-02-29', '2028-02-29')).toBe(16);
  });

  it("the date is Sydney's, in summer and winter time", async () => {
    const d = async (ts: string) =>
      String(first(await as(db, 'service', `select app.sydney_date('${ts}')::text as d`)).d);
    expect(await d('2026-11-15T12:59:00Z')).toBe('2026-11-15');
    expect(await d('2026-11-15T13:00:00Z')).toBe('2026-11-16');
    expect(await d('2026-06-15T13:59:00Z')).toBe('2026-06-15');
    expect(await d('2026-06-15T14:00:00Z')).toBe('2026-06-16');
  });
});

describe('12. converting a guest locks the session', () => {
  it('the conversion takes a row lock before it checks', () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20261114001000_server_functions.sql'), 'utf8');
    const fn = sql.slice(
      sql.indexOf('function public.convert_guest'),
      sql.indexOf('function public.daily_days_owed'),
    );
    expect(fn.indexOf('for update')).toBeGreaterThan(0);
    expect(fn.indexOf('for update')).toBeLessThan(fn.indexOf('converted_at is null'));
  });
});

describe('13. the action log', () => {
  it('goes with its farm, though nobody can delete it directly', async () => {
    const o = await asMany(db, 'service', [
      `delete from public.farm_actions where farm_id = '${ID.farmA}'`,
    ]);
    expect(passed(o[0]!)).toBe(false);
    const gone = await as(
      db,
      'service',
      `select 1 from public.farm_actions where farm_id = '${ID.farmA}'`,
      `delete from public.farms where id = '${ID.farmA}';`,
    );
    expect(count(gone)).toBe(0);
  });
});

describe('14. push subscriptions point only at known push services', () => {
  const add = (endpoint: string) =>
    as(
      db,
      'a',
      `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ('${ID.a}', '${endpoint}', 'k', 'a')`,
    );

  it('refuses any other host', async () => {
    for (const e of [
      'https://evil.example.org/x',
      'https://push.apple.com.evil.org/x',
      'https://web.push.apple.com@evil.org/x',
      'https://evilpush.apple.com.org/x',
    ]) {
      expect(errorOf(await add(e)), e).toMatch(/push_host_not_allowed|endpoint_check/);
    }
  });

  it('takes the listed ones', async () => {
    expect((await add('https://web.push.apple.com/abc')).ok).toBe(true);
    expect((await add('https://updates.push.services.mozilla.com/wpush/v2/abc')).ok).toBe(true);
  });
});

describe('16. notification links stay on this site', () => {
  it('refuses //host and /\\host', async () => {
    const add = (link: string) =>
      as(
        db,
        'service',
        `insert into public.notifications (user_id, kind, title, link) values ('${ID.a}', 'system', 'x', '${link}')`,
      );
    expect((await add('//evil.example.org')).ok).toBe(false);
    expect((await add('/\\evil.example.org')).ok).toBe(false);
    expect((await add('/play')).ok).toBe(true);
    expect((await add('/')).ok).toBe(true);
  });
});

describe('17. a private profile on the boards', () => {
  it('shows a visitor the username only: no id, no farm name, no photo', async () => {
    const priv = `update public.profiles set privacy_profile = 'private' where user_id = '${ID.a}';`;
    const o = await as(
      db,
      'anon',
      `select username, user_id, farm_name, avatar_path from public.leaderboard_rows where username = 'ava_grazier'`,
      priv,
    );
    expect(rowsOf(o)).toHaveLength(2);
    for (const r of rowsOf(o))
      expect(r).toEqual({
        username: 'ava_grazier',
        user_id: null,
        farm_name: null,
        avatar_path: null,
      });
    const own = await as(
      db,
      'a',
      `select user_id from public.leaderboard_rows where username = 'ava_grazier'`,
      priv,
    );
    expect(first(own)).toEqual({ user_id: ID.a });
  });
});

describe('18. an anonymous sign-in counts as not signed in', () => {
  it('sees and writes nothing of the account it names', async () => {
    const jwt = JSON.stringify({ sub: ID.a, role: 'authenticated', is_anonymous: true });
    const results: Outcome[] = [];
    for (const sql of [
      `select 1 from public.farms`,
      `select 1 from public.notifications`,
      `select 1 from public.account_private`,
      `insert into public.posts (author_id, body) values ('${ID.a}', 'x')`,
    ]) {
      await db.exec('begin');
      try {
        await db.exec(
          `set local role authenticated; select set_config('request.jwt.claims', '${jwt}', true);`,
        );
        const r = await db.query(sql);
        results.push({
          ok: true,
          rows: r.rows as Record<string, unknown>[],
          affected: r.affectedRows ?? 0,
        });
      } catch (e) {
        results.push({ ok: false, error: (e as Error).message, code: undefined });
      } finally {
        await db.exec('rollback');
      }
    }
    expect(results.map((r) => passed(r))).toEqual([false, false, false, false]);
  });
});

describe('19. re-running the bucket setup fixes old limits', () => {
  it('an existing bucket gets the current size and types', async () => {
    const sql = readFileSync(join(MIGRATIONS_DIR, '20261114001200_storage.sql'), 'utf8');
    const insert = sql.slice(
      sql.indexOf('insert into storage.buckets'),
      sql.indexOf('allowed_mime_types = excluded.allowed_mime_types;') + 49,
    );
    const prep =
      `update storage.buckets set file_size_limit = 1, allowed_mime_types = array['image/svg+xml'] where id = 'ad-media';` +
      insert;
    const o = await as(
      db,
      'service',
      `select file_size_limit, allowed_mime_types from storage.buckets where id = 'ad-media'`,
      prep,
    );
    expect(Number(first(o).file_size_limit)).toBe(52428800);
    expect(first(o).allowed_mime_types).not.toContain('image/svg+xml');
  });
});

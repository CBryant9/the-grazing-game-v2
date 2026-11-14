import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMUNITY_SWITCHES,
  ID,
  as,
  asMany,
  freshDb,
  passed,
  rowsOf,
  switchesSql,
  type Outcome,
  type Who,
} from './harness';

// The third pass (a second security review). Each test here was written
// first and seen to fail on commit feee0fc before its fix.

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
const HASH = 'a1'.repeat(32);

const RACE = `${ID.a}/race.jpg`;
/** A pending photo row on Ava's post, with its file; then the server "reads" the file. */
const raceScene = `insert into storage.objects (bucket_id, name) values ('post-photos', '${RACE}');
  insert into public.post_photos (id, post_id, storage_path, position)
    values ('00000000-0000-4000-8000-0000000009a1', '${ID.postA}', '${RACE}', 3);
  create temp table checked on commit drop as
    select id, updated_at, version from storage.objects where name = '${RACE}';
  grant select on checked to service_role;`;
const approveChecked = `select public.approve_photo('post_photo', '00000000-0000-4000-8000-0000000009a1',
  (select id from checked), (select updated_at from checked), (select version from checked))`;

describe('M1. the image check approves only the file it saw', () => {
  it('the race: the server reads the file, the player swaps it, the server approves: refused', async () => {
    const swap = `delete from storage.objects where name = '${RACE}';
      insert into storage.objects (bucket_id, name) values ('post-photos', '${RACE}');`;
    const o = await as(db, 'service', approveChecked, raceScene + swap);
    expect(errorOf(o)).toMatch(/photo_file_changed/);
    const after = raceScene + swap;
    expect(
      count(await as(db, 'b', `select 1 from storage.objects where name = '${RACE}'`, after)),
    ).toBe(0);
  });

  it('with no swap the checked file is approved and shows', async () => {
    const o = await as(db, 'service', approveChecked, raceScene);
    expect(o.ok).toBe(true);
    const approved = raceScene + approveChecked.replace('select public', 'select public') + ';';
    expect(
      count(await as(db, 'b', `select 1 from storage.objects where name = '${RACE}'`, approved)),
    ).toBe(1);
  });

  it('a bare status change to approved is refused, for the server too', async () => {
    for (const sql of [
      `update public.post_photos set moderation_status = 'approved' where id = '00000000-0000-4000-8000-0000000009a1'`,
    ]) {
      expect(errorOf(await as(db, 'service', sql, raceScene))).toMatch(/approve_photo/);
    }
    const avatar = `insert into storage.objects (bucket_id, name) values ('avatars', '${ID.b}/me.png');
      update public.profiles set avatar_path = '${ID.b}/me.png' where user_id = '${ID.b}';`;
    expect(
      errorOf(
        await as(
          db,
          'service',
          `update public.profiles set avatar_status = 'approved' where user_id = '${ID.b}'`,
          avatar,
        ),
      ),
    ).toMatch(/approve_photo/);
    const group = `insert into storage.objects (bucket_id, name) values ('group-photos', '${ID.group}/g.jpg');
      update public.groups set photo_path = '${ID.group}/g.jpg' where id = '${ID.group}';`;
    expect(
      errorOf(
        await as(
          db,
          'service',
          `update public.groups set photo_status = 'approved' where id = '${ID.group}'`,
          group,
        ),
      ),
    ).toMatch(/approve_photo/);
    const show = `insert into storage.objects (bucket_id, name) values ('post-photos', '${ID.a}/show.jpg');
      insert into public.farm_showcase_photos (id, user_id, storage_path) values ('00000000-0000-4000-8000-0000000009b1', '${ID.a}', '${ID.a}/show.jpg');`;
    expect(
      errorOf(
        await as(
          db,
          'service',
          `update public.farm_showcase_photos set moderation_status = 'approved' where id = '00000000-0000-4000-8000-0000000009b1'`,
          show,
        ),
      ),
    ).toMatch(/approve_photo/);
  });

  it('approve_photo is server only', async () => {
    expect(errorOf(await as(db, 'a', approveChecked, raceScene))).toMatch(/permission denied/);
  });
});

describe('S1. group handover goes only to an adult member in good standing', () => {
  const newGroup = (members: string) => `
    insert into public.groups (id, name, owner_id) values ('00000000-0000-4000-8000-0000000000f3', 'Test group', '${ID.c}');
    ${members}
    insert into public.posts (id, author_id, body, group_id) values
      ('00000000-0000-4000-8000-0000000001f3', '${ID.c}', 'Owner post', '00000000-0000-4000-8000-0000000000f3');`;
  const after = (members: string) =>
    newGroup(members) + `delete from auth.users where id = '${ID.c}';`;
  const look = `select owner_id, (select count(*)::int from public.group_members m where m.group_id = g.id) as members
    from public.groups g where g.id = '00000000-0000-4000-8000-0000000000f3'`;

  it('an under-16 member is never made owner: the group stays with no owner', async () => {
    const m = `insert into public.group_members (group_id, user_id) values ('00000000-0000-4000-8000-0000000000f3', '${ID.u16}');`;
    expect(rowsOf(await as(db, 'service', look, after(m)))).toEqual([
      { owner_id: null, members: 1 },
    ]);
  });

  it('a banned member is never made owner: the group stays with no owner', async () => {
    const m = `insert into public.group_members (group_id, user_id) values ('00000000-0000-4000-8000-0000000000f3', '${ID.b}');
      update public.account_status set banned_at = now() where user_id = '${ID.b}';`;
    expect(rowsOf(await as(db, 'service', look, after(m)))).toEqual([
      { owner_id: null, members: 1 },
    ]);
  });

  it('an adult member in good standing is made owner', async () => {
    const m = `insert into public.group_members (group_id, user_id) values ('00000000-0000-4000-8000-0000000000f3', '${ID.u16}'), ('00000000-0000-4000-8000-0000000000f3', '${ID.a}');`;
    expect(rowsOf(await as(db, 'service', look, after(m)))).toEqual([
      { owner_id: ID.a, members: 2 },
    ]);
  });

  it('with no other member the group goes', async () => {
    expect(count(await as(db, 'service', look, after('')))).toBe(0);
  });

  it('an admin can give an ownerless group an owner, through the server', async () => {
    const m = `insert into public.group_members (group_id, user_id) values ('00000000-0000-4000-8000-0000000000f3', '${ID.u16}'), ('00000000-0000-4000-8000-0000000000f3', '${ID.b}');
      update public.account_status set banned_at = now() where user_id = '${ID.b}';`;
    const prep =
      after(m) + `update public.account_status set banned_at = null where user_id = '${ID.b}';`;
    const o = await asMany(
      db,
      'service',
      [
        `select public.assign_group_owner('${ID.admin}', '00000000-0000-4000-8000-0000000000f3', '${ID.b}')`,
        look,
      ],
      prep,
    );
    expect(o[0]!.ok).toBe(true);
    expect(first(o[1]!)).toEqual({ owner_id: ID.b, members: 2 });
  });
});

describe('S2. the ban list holds a peppered hash made on the server', () => {
  const banB = `update public.account_status set banned_at = now() where user_id = '${ID.b}';`;

  // Auth deletes the user (the server calls Auth's admin API); here the
  // database owner stands in for Auth.
  const asAuth = async (statements: string[]): Promise<Outcome[]> => {
    const out: Outcome[] = [];
    await db.exec('begin');
    try {
      for (const sql of statements) {
        try {
          const r = await db.query<Record<string, unknown>>(sql);
          out.push({ ok: true, rows: r.rows, affected: r.affectedRows ?? 0 });
        } catch (e) {
          out.push({ ok: false, error: (e as Error).message, code: undefined });
          break;
        }
      }
    } finally {
      await db.exec('rollback');
    }
    return out;
  };

  it('a banned account can not be deleted until the server has recorded its ban hash', async () => {
    const o = await asAuth([banB, `delete from auth.users where id = '${ID.b}'`]);
    expect(errorOf(o[1]!)).toMatch(/ban_hash_required/);
  });

  it('the database keeps exactly the hash the server sent, and computes none itself', async () => {
    const o = await asAuth([
      banB,
      `select public.prepare_account_deletion('${ID.b}', '${HASH}')`,
      `delete from auth.users where id = '${ID.b}'`,
      `select email_hash, banned_until from public.ban_records`,
    ]);
    expect(o.slice(0, 3).every((x) => x.ok)).toBe(true);
    expect(rowsOf(o[3]!)).toEqual([{ email_hash: HASH, banned_until: null }]);
    const sha = await as(
      db,
      'service',
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('app', 'public') and p.prosrc ilike '%sha256%'`,
    );
    expect(rowsOf(sha)).toEqual([]);
  });

  it('a sign-up whose email hash is on the list is refused', async () => {
    const prep = `insert into public.ban_records (email_hash) values ('${HASH}');
      insert into auth.users (id) values ('${ID.fresh}');
      insert into public.signup_email_checks (user_id, email_hash) values ('${ID.fresh}', '${HASH}');`;
    const jwt = JSON.stringify({ sub: ID.fresh, role: 'authenticated' });
    let err = '';
    await db.exec('begin');
    try {
      await db.exec(
        prep +
          `set local role authenticated; select set_config('request.jwt.claims', '${jwt}', true);`,
      );
      await db.query(`select public.complete_sign_up('back_again', '1980-01-01')`);
    } catch (e) {
      err = (e as Error).message;
    } finally {
      await db.exec('rollback');
    }
    expect(err).toMatch(/banned/);
  });

  it('a sign-up the server has not checked is refused', async () => {
    const jwt = JSON.stringify({ sub: ID.fresh, role: 'authenticated' });
    let err = '';
    await db.exec('begin');
    try {
      await db.exec(
        `insert into auth.users (id) values ('${ID.fresh}'); set local role authenticated; select set_config('request.jwt.claims', '${jwt}', true);`,
      );
      await db.query(`select public.complete_sign_up('unchecked', '1980-01-01')`);
    } catch (e) {
      err = (e as Error).message;
    } finally {
      await db.exec('rollback');
    }
    expect(err).toMatch(/email_not_checked/);
  });
});

describe('S3. notification links: no control or space characters', () => {
  const add = (link: string) =>
    as(
      db,
      'service',
      `insert into public.notifications (user_id, kind, title, link) values ('${ID.a}', 'system', 'x', ${link})`,
    );
  it('refuses a tab, newline or carriage return after the slash, and a backslash', async () => {
    for (const l of [
      `E'/\\t/evil.example.org'`,
      `E'/\\n/evil.example.org'`,
      `E'/\\r/evil.example.org'`,
      `E'/\\\\evil.example.org'`,
      `'/ /evil'`,
    ]) {
      expect((await add(l)).ok, l).toBe(false);
    }
    expect((await add(`'/play?x=1'`)).ok).toBe(true);
  });
});

describe('S4. the audit log takes a fixed shape; a mistyped date of birth has a way back', () => {
  const log = (details: string) =>
    as(
      db,
      'service',
      `insert into public.admin_audit_log (admin_id, action, details) values ('${ID.admin}', 'switch', '${details}')`,
    );

  it('refuses free text and unknown keys', async () => {
    expect((await log('{"note": "spoke to the player"}')).ok).toBe(false);
    expect((await log('{"switch_key": "Has spaces and words"}')).ok).toBe(false);
    expect((await log('{"ids": ["not-an-id"]}')).ok).toBe(false);
    expect((await log('{"count": {"nested": 1}}')).ok).toBe(false);
  });

  it('takes ids, counts, switch keys and values', async () => {
    expect(
      (await log(`{"switch_key": "community", "enabled": true, "count": 3, "ids": ["${ID.a}"]}`))
        .ok,
    ).toBe(true);
  });

  it("an admin clears a sign-in's under-14 refusal, and it is logged", async () => {
    const prep = `insert into public.signup_refusals (user_id, reason) values ('${ID.c}', 'too_young');`;
    const o = await asMany(
      db,
      'service',
      [
        `select public.clear_signup_refusal('${ID.admin}', '${ID.c}')`,
        `select 1 from public.signup_refusals where user_id = '${ID.c}'`,
        `select action, target_id from public.admin_audit_log where action = 'clear_signup_refusal'`,
      ],
      prep,
    );
    expect(o[0]!.ok).toBe(true);
    expect(count(o[1]!)).toBe(0);
    expect(rowsOf(o[2]!)).toEqual([{ action: 'clear_signup_refusal', target_id: ID.c }]);
    const notAdmin = await as(
      db,
      'service',
      `select public.clear_signup_refusal('${ID.a}', '${ID.c}')`,
      prep,
    );
    expect(errorOf(notAdmin)).toMatch(/admin/);
  });
});

describe('N1. helpers the browser can run answer only what the caller may know', () => {
  const ask = async (who: Who, sql: string) => first(await as(db, who, `select ${sql} as v`)).v;

  it("blocked_between answers only for the caller's own blocks", async () => {
    expect(await ask('a', `app.blocked_between('${ID.b}', '${ID.c}')`)).toBe(false);
    expect(await ask('b', `app.blocked_between('${ID.b}', '${ID.c}')`)).toBe(true);
  });

  it('is_member says nothing to a visitor or an under-16 account', async () => {
    expect(await ask('anon', `app.is_member('${ID.a}')`)).toBe(false);
    expect(await ask('u16', `app.is_member('${ID.a}')`)).toBe(false);
    expect(await ask('b', `app.is_member('${ID.a}')`)).toBe(true);
  });

  it('group membership and ownership answer only about the caller', async () => {
    expect(await ask('c', `app.is_group_member('${ID.group}', '${ID.b}')`)).toBe(false);
    expect(await ask('c', `app.is_group_owner('${ID.group}', '${ID.a}')`)).toBe(false);
    expect(await ask('b', `app.is_group_member('${ID.group}', '${ID.b}')`)).toBe(true);
  });

  it("a post's author is told only to someone who may see the post", async () => {
    expect(await ask('c', `app.post_author('${ID.postB}')`)).toBeNull();
    expect(await ask('a', `app.post_author('${ID.postB}')`)).toBe(ID.b);
  });

  it('the browser can no longer run is_restricted or post_row_visible', async () => {
    expect(errorOf(await as(db, 'a', `select app.is_restricted('${ID.b}')`))).toMatch(
      /permission denied/,
    );
    expect(
      errorOf(await as(db, 'a', `select app.post_row_visible('${ID.b}', 'public', null, null)`)),
    ).toMatch(/permission denied/);
  });
});

describe('N2. deleting an account clears its Stripe customer id and farm names', () => {
  it('leaves no cus_ id in Stripe events and no farm name on the boards', async () => {
    const o = await asMany(
      db,
      'service',
      [
        `select stripe_customer_id from public.stripe_events where id = 'evt_TESTseed0001'`,
        `select count(*)::int as n from public.leaderboard_entries where user_id is null and farm_name is not null`,
      ],
      `delete from auth.users where id = '${ID.b}';`,
    );
    expect(first(o[0]!)).toEqual({ stripe_customer_id: null });
    expect(first(o[1]!)).toEqual({ n: 0 });
  });
});

describe('N3. an avatar file is never changed in place', () => {
  it('the player may not update an avatar object, only delete and upload', async () => {
    const o = await as(
      db,
      'a',
      `update storage.objects set metadata = '{"v": 2}' where name = '${ID.a}/me.png'`,
    );
    expect(passed(o)).toBe(false);
  });
});

describe('N4. an unlisted push host is refused with a code the screens can word', () => {
  it('says push_host_not_allowed', async () => {
    const o = await as(
      db,
      'a',
      `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ('${ID.a}', 'https://fcm.googleapis.com/fcm/send/x', 'k', 'a')`,
    );
    expect(errorOf(o)).toMatch(/^push_host_not_allowed:/);
  });
});

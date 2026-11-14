import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMUNITY_SWITCHES,
  ID,
  as,
  freshDb,
  passed,
  rowsOf,
  switchesSql,
  type Outcome,
} from './harness';

// Stage 4: the database side of the security review of the community (20261115001000) and the
// Stage 4 tables. Each review test was written first and seen to fail before its migration.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(switchesSql(COMMUNITY_SWITCHES, true));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const count = (o: Outcome): number => (o.ok ? o.rows.length : -1);
const first = (o: Outcome): Record<string, unknown> => rowsOf(o)[0] ?? {};
const privateA = `update public.profiles set privacy_profile = 'private' where user_id = '${ID.a}';`;

describe('review 1: staff see the community as any member does', () => {
  it('a moderator and an admin do not find an under-16 profile', async () => {
    for (const who of ['mod', 'admin'] as const) {
      expect(
        count(
          await as(db, who, `select 1 from public.public_profiles where user_id = '${ID.u16}'`),
        ),
        who,
      ).toBe(0);
    }
  });

  it("staff get a private profile's card without its details", async () => {
    const prep = `${privateA} update public.profiles set bio = 'secret' where user_id = '${ID.a}';`;
    for (const who of ['mod', 'admin'] as const) {
      expect(
        first(
          await as(
            db,
            who,
            `select details_visible, bio from public.public_profiles where user_id = '${ID.a}'`,
            prep,
          ),
        ),
      ).toEqual({ details_visible: false, bio: null });
    }
  });
});

describe("review 2: a private profile's posts are its author's alone", () => {
  it('nobody else sees them, a follower and staff included; the author does', async () => {
    const sql = `select 1 from public.posts where id = '${ID.postA}'`;
    expect(count(await as(db, 'b', sql))).toBe(1);
    for (const who of ['b', 'c', 'mod', 'admin'] as const) {
      expect(count(await as(db, who, sql, privateA)), who).toBe(0);
    }
    expect(count(await as(db, 'a', sql, privateA))).toBe(1);
  });

  it('nor its comments or likes through the post', async () => {
    expect(
      count(
        await as(db, 'b', `select 1 from public.likes where post_id = '${ID.postA}'`, privateA),
      ),
    ).toBe(0);
    expect(
      first(await as(db, 'b', `select app.like_count_post('${ID.postA}') as n`, privateA)).n,
    ).toBe(0);
  });
});

describe('review 3: only the server stores a photo', () => {
  it('no browser role may insert into storage, the owner of the folder included', async () => {
    for (const bucket of ['avatars', 'post-photos', 'group-photos']) {
      for (const who of ['a', 'admin', 'anon'] as const) {
        const folder = bucket === 'group-photos' ? ID.group : ID.a;
        expect(
          passed(
            await as(
              db,
              who,
              `insert into storage.objects (bucket_id, name) values ('${bucket}', '${folder}/x.jpg')`,
            ),
          ),
          `${who} ${bucket}`,
        ).toBe(false);
      }
    }
  });
});

describe('review 4: a database limit on photos', () => {
  it('counts each new photo row and each avatar change against the photo rates', async () => {
    const o = await as(
      db,
      'a',
      `update public.profiles set avatar_path = '${ID.a}/new.png' where user_id = '${ID.a}' returning 1`,
    );
    expect(o.ok).toBe(true);
    const full = `insert into public.rate_limit_hits (action, subject, window_start, hits)
      values ('photo_day', '${ID.a}', to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), 1000);`;
    const refused = await as(
      db,
      'a',
      `update public.profiles set avatar_path = '${ID.a}/new2.png' where user_id = '${ID.a}'`,
      full,
    );
    expect(refused.ok).toBe(false);
    const viaServer = await as(
      db,
      'service',
      `update public.profiles set avatar_path = '${ID.a}/new3.png' where user_id = '${ID.a}' returning 1`,
      full,
    );
    expect(viaServer.ok).toBe(true);
  });
});

describe('the word filter checks text only when it changes', () => {
  it('a moderator can remove a post written before its word was blocked', async () => {
    // Ava's seed post says "Good rain overnight".
    const prep = `insert into public.word_filter (term) values ('rain');`;
    const o = await as(
      db,
      'service',
      `update public.posts set removed_at = now() where id = '${ID.postA}' returning 1`,
      prep,
    );
    expect(o.ok).toBe(true);
    // Writing the word again is still refused.
    const edit = await as(
      db,
      'a',
      `update public.posts set body = 'more rain' where id = '${ID.postA}'`,
      prep,
    );
    expect(edit.ok).toBe(false);
  });
});

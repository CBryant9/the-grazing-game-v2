import 'server-only';
import { DISTRICTS, DISTRICT_IDS } from '@gg/shared';
import type { AuthDeps } from '../auth/accounts';
import type { SqlClient, SqlRunner } from '../db/sql';
import { isUuid } from './data';
import { CommunityError } from './errors';
import { removeFiles } from './photos';
import { LINK_KINDS, REPORT_REASONS, TextError, field, safeUrl, type LinkKind } from './text';

/**
 * What a signed-in player changes in the community. Every function takes `tx`, a connection
 * running AS THE PLAYER, so the database's rules apply to each statement (who may insert, update
 * or delete, blocks both ways, the word filter on posts, comments and profile text, the rate
 * limits). The checks here are about what the database can not say for itself: the shape and
 * length of what was typed (cleaned in text.ts), and plain messages in place of a bare refusal.
 * An id from the browser is never trusted: a post, comment or person is looked up through the
 * player's own view first, and a row they may not see is "not found".
 */

const NOT_FOUND_PERSON = 'That person was not found.';
const NOT_FOUND_POST = 'That post was not found.';

function bad(message: string): never {
  throw new CommunityError(400, message);
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

export function uuid(v: unknown, what: string): string {
  if (!isUuid(v)) bad(`That ${what} was not sent properly.`);
  return v;
}

/**
 * The word filter on text the database does not check itself (extra profile fields and links).
 * Posts, comments, display names, bios, towns and farm names are checked by the database's own
 * triggers and refused with the `word_filter` hint.
 */
export async function wordsRefused(
  sql: SqlClient | SqlRunner,
  texts: (string | null)[],
): Promise<void> {
  for (const t of texts) {
    if (!t) continue;
    const r = await sql.query<{ hit: boolean }>('select app.blocked_word_in($1) as hit', [t]);
    if (r.rows[0]?.hit) {
      throw new CommunityError(
        400,
        'Some of that text can not be used here. Change the wording and try again.',
        'word_filter',
      );
    }
  }
}

// ------------------------------------------------------------------ people

/** A member by username, as this player may see them (a blocked, hidden or unknown name is "not found"). */
export async function resolveMember(tx: SqlRunner, username: unknown): Promise<string> {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    throw new CommunityError(404, NOT_FOUND_PERSON);
  }
  const r = await tx.query<{ user_id: string }>(
    'select user_id from public.public_profiles where lower(username) = lower($1)',
    [username],
  );
  const id = r.rows[0]?.user_id;
  if (!id) throw new CommunityError(404, NOT_FOUND_PERSON);
  return id;
}

// ------------------------------------------------------------------ profile

const SIZE_BANDS = ['under_100', '100_500', '500_2000', '2000_10000', 'over_10000'];
const PRIVACY = ['public', 'followers', 'private'];
const FARM_VIEW = ['public', 'followers', 'off'];

function oneOf<T extends string>(v: unknown, list: readonly T[], what: string): T {
  if (typeof v !== 'string' || !(list as readonly string[]).includes(v)) bad(`Choose ${what}.`);
  return v as T;
}
function yearOrNull(v: unknown, what: string): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n =
    typeof v === 'number' ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 1930 || n > 2100) bad(`Enter a year for ${what}, like 2019.`);
  return n;
}

export async function updateProfile(
  deps: AuthDeps,
  /** Runs the writes as the player. The checks come first, on their own, so no connection is held while they run. */
  run: <T>(work: (tx: SqlRunner) => Promise<T>) => Promise<T>,
  me: string,
  b: Record<string, unknown>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [me];
  const set = (column: string, value: unknown): void => {
    vals.push(value);
    sets.push(`${column} = $${vals.length}`);
  };
  const extraText: (string | null)[] = [];
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(b, k);

  if (has('displayName'))
    set('display_name', field(b.displayName, 'display name', 50, { blankRefused: true }));
  if (has('bio')) set('bio', field(b.bio, 'bio', 500, { multiline: true }));
  if (has('town')) set('town', field(b.town, 'town or district name', 60));
  if (has('enterprise')) {
    const v = field(b.enterprise, 'enterprise', 60);
    extraText.push(v);
    set('enterprise', v);
  }
  if (has('farmRole')) {
    const v = field(b.farmRole, 'role', 60);
    extraText.push(v);
    set('farm_role', v);
  }
  if (has('realFarmName')) set('real_farm_name', field(b.realFarmName, 'farm name', 80));
  if (has('district')) {
    if (b.district === null || b.district === '') {
      set('district', null);
      set('state', null);
    } else {
      const d = oneOf(b.district, DISTRICT_IDS, 'a district');
      set('district', d);
      set('state', DISTRICTS[d].state);
    }
  }
  if (has('farms')) {
    if (b.farms !== null && typeof b.farms !== 'boolean') bad('Choose yes or no for farming.');
    set('farms', b.farms);
  }
  if (has('farmSizeBand')) {
    set(
      'farm_size_band',
      b.farmSizeBand === null || b.farmSizeBand === ''
        ? null
        : oneOf(b.farmSizeBand, SIZE_BANDS, 'a farm size'),
    );
  }
  if (has('yearsFarming')) {
    if (b.yearsFarming === null || b.yearsFarming === '') set('years_farming', null);
    else {
      const n = typeof b.yearsFarming === 'number' ? b.yearsFarming : Number(b.yearsFarming);
      if (!Number.isInteger(n) || n < 0 || n > 90)
        bad('Years farming is a whole number from 0 to 90.');
      set('years_farming', n);
    }
  }
  if (has('privacyProfile'))
    set('privacy_profile', oneOf(b.privacyProfile, PRIVACY, 'who can see your profile'));
  if (has('privacyFarmView'))
    set('privacy_farm_view', oneOf(b.privacyFarmView, FARM_VIEW, 'who can see your farm'));
  if (has('tickerOptIn')) {
    if (typeof b.tickerOptIn !== 'boolean') bad('Choose on or off for the activity ticker.');
    set('ticker_opt_in', b.tickerOptIn);
  }

  // Lists are checked in full before anything is written.
  let links: { kind: LinkKind; url: string }[] | null = null;
  if (has('links')) {
    const raw = b.links;
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      bad('The links were not sent properly.');
    links = [];
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!(LINK_KINDS as readonly string[]).includes(k))
        bad('That kind of link is not on the list.');
      if (v === '' || v === null || v === undefined) continue;
      const url = safeUrl(v);
      if (!url) bad('Links must start with https:// and be a real web address.');
      links.push({ kind: k as LinkKind, url });
      // The word filter reads a link's words too (the parts between the dots and slashes).
      extraText.push(url.replace(/[^a-z0-9]+/gi, ' '));
    }
  }
  let experience:
    | {
        role: string;
        enterprise: string | null;
        place: string | null;
        from: number | null;
        to: number | null;
      }[]
    | null = null;
  if (has('experience')) {
    if (!Array.isArray(b.experience) || b.experience.length > 10) bad('Add up to 10 jobs.');
    experience = (b.experience as Record<string, unknown>[]).map((e) => {
      const from = yearOrNull(e?.from, 'the start year');
      const to = yearOrNull(e?.to, 'the end year');
      if (from !== null && to !== null && to < from) bad('A job can not end before it started.');
      const row = {
        role: field(e?.role, 'job title', 80, { required: true })!,
        enterprise: field(e?.enterprise, 'enterprise', 80),
        place: field(e?.place, 'place', 80),
        from,
        to,
      };
      extraText.push(row.role, row.enterprise, row.place);
      return row;
    });
  }
  let education: { course: string; provider: string | null; year: number | null }[] | null = null;
  if (has('education')) {
    if (!Array.isArray(b.education) || b.education.length > 10) bad('Add up to 10 courses.');
    education = (b.education as Record<string, unknown>[]).map((e) => {
      const row = {
        course: field(e?.course, 'course name', 120, { required: true })!,
        provider: field(e?.provider, 'provider', 120),
        year: yearOrNull(e?.year, 'the course'),
      };
      extraText.push(row.course, row.provider);
      return row;
    });
  }
  let hideTicker: boolean | null = null;
  if (has('hideTicker')) {
    if (typeof b.hideTicker !== 'boolean') bad('Choose on or off for hiding the ticker.');
    hideTicker = b.hideTicker;
  }

  await wordsRefused(deps.sql, extraText);

  await run(async (tx) => {
    if (sets.length)
      await tx.query(`update public.profiles set ${sets.join(', ')} where user_id = $1`, vals);
    if (hideTicker !== null) {
      await tx.query('update public.account_private set hide_ticker = $2 where user_id = $1', [
        me,
        hideTicker,
      ]);
    }
    if (links) {
      await tx.query('delete from public.profile_links where user_id = $1', [me]);
      let pos = 0;
      for (const l of links) {
        await tx.query(
          'insert into public.profile_links (user_id, kind, url, position) values ($1, $2, $3, $4)',
          [me, l.kind, l.url, pos++],
        );
      }
    }
    if (experience) {
      await tx.query('delete from public.profile_experience where user_id = $1', [me]);
      for (const e of experience) {
        await tx.query(
          `insert into public.profile_experience (user_id, role, enterprise, place, from_year, to_year)
         values ($1, $2, $3, $4, $5, $6)`,
          [me, e.role, e.enterprise, e.place, e.from, e.to],
        );
      }
    }
    if (education) {
      await tx.query('delete from public.profile_education where user_id = $1', [me]);
      for (const e of education) {
        await tx.query(
          'insert into public.profile_education (user_id, course_name, provider, year) values ($1, $2, $3, $4)',
          [me, e.course, e.provider, e.year],
        );
      }
    }
  });
}

// ------------------------------------------------------------------ follows and blocks

export type FollowAction = 'follow' | 'unfollow' | 'accept' | 'decline' | 'remove';

/** Returns what the follow is now: `accepted`, `pending` or `none`. */
export async function followAction(
  tx: SqlRunner,
  me: string,
  action: FollowAction,
  username: unknown,
): Promise<'accepted' | 'pending' | 'none'> {
  const other = await resolveMember(tx, username);
  if (other === me) bad('You can not do that to yourself.');
  switch (action) {
    case 'follow': {
      try {
        await tx.query(
          `insert into public.follows (follower_id, followee_id) values ($1, $2)
           on conflict (follower_id, followee_id) do nothing`,
          [me, other],
        );
      } catch (e) {
        const err = e as { code?: string; message?: string };
        if (err.code === '42501' && /private/i.test(err.message ?? '')) {
          throw new CommunityError(
            403,
            'That profile is private. It can not be followed.',
            'private',
          );
        }
        throw e;
      }
      const r = await tx.query<{ status: 'accepted' | 'pending' }>(
        'select status from public.follows where follower_id = $1 and followee_id = $2',
        [me, other],
      );
      return r.rows[0]?.status ?? 'none';
    }
    case 'unfollow':
      await tx.query('delete from public.follows where follower_id = $1 and followee_id = $2', [
        me,
        other,
      ]);
      return 'none';
    case 'accept': {
      const r = await tx.query(
        `update public.follows set status = 'accepted'
          where followee_id = $1 and follower_id = $2 and status = 'pending'`,
        [me, other],
      );
      if (r.rowCount === 0) throw new CommunityError(404, 'That request was not found.');
      return 'accepted';
    }
    case 'decline':
    case 'remove': {
      // Either side may end a follow. Declining a request and removing a follower are the same delete.
      await tx.query('delete from public.follows where followee_id = $1 and follower_id = $2', [
        me,
        other,
      ]);
      return 'none';
    }
  }
}

export async function blockAction(
  tx: SqlRunner,
  me: string,
  action: 'block' | 'unblock',
  target: { username?: unknown; userId?: unknown },
): Promise<void> {
  if (action === 'unblock') {
    // A blocked person is hidden from the blocker too, so an unblock names the id from the blocked list.
    const id = uuid(target.userId, 'person');
    await tx.query('delete from public.blocks where blocker_id = $1 and blocked_id = $2', [me, id]);
    return;
  }
  const other = await resolveMember(tx, target.username);
  if (other === me) bad('You can not block yourself.');
  await tx.query(
    `insert into public.blocks (blocker_id, blocked_id) values ($1, $2)
     on conflict (blocker_id, blocked_id) do nothing`,
    [me, other],
  );
}

// ------------------------------------------------------------------ posts

/**
 * The id of the row this request just inserted. `insert ... returning` is not used for rows the
 * player's read rule asks a helper function about (the helper reads the table with the query's own
 * snapshot, which does not hold the new row yet, so the database refuses the return). Every
 * request is its own transaction and makes one row, and `created_at` is the transaction's clock, so
 * "made by me at this instant" is that row.
 */
async function justMade(
  tx: SqlRunner,
  table: 'posts' | 'comments',
  owner: 'author_id',
  me: string,
): Promise<string> {
  const r = await tx.query<{ id: string }>(
    `select id from public.${table} where ${owner} = $1 and created_at = now() order by id limit 1`,
    [me],
  );
  if (!r.rows[0])
    throw new CommunityError(500, 'Something went wrong on the server. Nothing was changed.');
  return r.rows[0].id;
}

export async function createPost(
  tx: SqlRunner,
  me: string,
  b: Record<string, unknown>,
): Promise<{ id: string }> {
  const body = field(b.body, 'post', 2000, { required: true, multiline: true })!;
  const link = linkOf(b.link);
  const visibility = b.visibility === 'followers' ? 'followers' : 'public';
  if (b.visibility !== undefined && b.visibility !== 'public' && b.visibility !== 'followers') {
    bad('Choose who can see the post.');
  }
  const group = b.groupId === undefined || b.groupId === null ? null : uuid(b.groupId, 'group');
  await tx.query(
    `insert into public.posts (author_id, body, link_url, visibility, group_id)
     values ($1, $2, $3, $4, $5)`,
    [me, body, link, visibility, group],
  );
  return { id: await justMade(tx, 'posts', 'author_id', me) };
}

function linkOf(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const u = safeUrl(v);
  if (!u) bad('A link must start with https:// and be a real web address.');
  return u;
}

export async function editPost(
  tx: SqlRunner,
  me: string,
  b: Record<string, unknown>,
): Promise<void> {
  const id = uuid(b.id, 'post');
  const own = await tx.query<{ kind: string; removed_at: string | null }>(
    'select kind, removed_at from public.posts where id = $1 and author_id = $2',
    [id, me],
  );
  const row = own.rows[0];
  if (!row) throw new CommunityError(404, NOT_FOUND_POST);
  if (row.removed_at)
    throw new CommunityError(409, 'That post was removed and can not be changed.');
  if (row.kind === 'day_card') bad('A day card can not be edited.');
  const body = field(b.body, 'post', 2000, { required: true, multiline: true })!;
  const visibility = b.visibility === 'followers' ? 'followers' : 'public';
  const r = await tx.query(
    `update public.posts set body = $2, link_url = $3, visibility = $4
      where id = $1 and author_id = $5 and removed_at is null`,
    [id, body, linkOf(b.link), visibility, me],
  );
  if (r.rowCount === 0) throw new CommunityError(404, NOT_FOUND_POST);
}

/** Delete the player's own post. A post a moderator removed stays for the record: it can not be deleted. */
export async function deletePost(tx: SqlRunner, me: string, id: unknown): Promise<string[]> {
  const postId = uuid(id, 'post');
  const own = await tx.query<{ removed_at: string | null }>(
    'select removed_at from public.posts where id = $1 and author_id = $2',
    [postId, me],
  );
  const row = own.rows[0];
  if (!row) throw new CommunityError(404, NOT_FOUND_POST);
  if (row.removed_at) {
    throw new CommunityError(
      409,
      'That post was removed by a moderator. It stays on record and can not be deleted.',
    );
  }
  const photos = await tx.query<{ storage_path: string }>(
    'select storage_path from public.post_photos where post_id = $1',
    [postId],
  );
  const r = await tx.query(
    'delete from public.posts where id = $1 and author_id = $2 and removed_at is null',
    [postId, me],
  );
  if (r.rowCount === 0) throw new CommunityError(404, NOT_FOUND_POST);
  return photos.rows.map((p) => p.storage_path);
}

export async function afterPostDeleted(paths: string[]): Promise<void> {
  await removeFiles('post-photos', paths);
}

/** Take one photo off the player's own post. */
export async function deletePostPhoto(tx: SqlRunner, me: string, id: unknown): Promise<string> {
  const photo = uuid(id, 'photo');
  const r = await tx.query<{ storage_path: string }>(
    `select ph.storage_path from public.post_photos ph
       join public.posts p on p.id = ph.post_id
      where ph.id = $1 and p.author_id = $2`,
    [photo, me],
  );
  const row = r.rows[0];
  if (!row) throw new CommunityError(404, 'That photo was not found.');
  await tx.query('delete from public.post_photos where id = $1', [photo]);
  return row.storage_path;
}

// ------------------------------------------------------------------ comments and likes

async function visiblePost(tx: SqlRunner, id: string): Promise<void> {
  const r = await tx.query('select 1 from public.posts where id = $1 and removed_at is null', [id]);
  if (r.rowCount === 0) throw new CommunityError(404, NOT_FOUND_POST);
}

export async function createComment(
  tx: SqlRunner,
  me: string,
  b: Record<string, unknown>,
): Promise<{ id: string }> {
  const post = uuid(b.postId, 'post');
  await visiblePost(tx, post);
  const body = field(b.body, 'comment', 1000, { required: true, multiline: true })!;
  const parent =
    b.parentId === undefined || b.parentId === null ? null : uuid(b.parentId, 'comment');
  await tx.query(
    `insert into public.comments (post_id, author_id, parent_id, body) values ($1, $2, $3, $4)`,
    [post, me, parent, body],
  );
  return { id: await justMade(tx, 'comments', 'author_id', me) };
}

export async function editComment(
  tx: SqlRunner,
  me: string,
  b: Record<string, unknown>,
): Promise<void> {
  const id = uuid(b.id, 'comment');
  const body = field(b.body, 'comment', 1000, { required: true, multiline: true })!;
  const r = await tx.query(
    'update public.comments set body = $2 where id = $1 and author_id = $3 and removed_at is null',
    [id, body, me],
  );
  if (r.rowCount === 0) throw new CommunityError(404, 'That comment was not found.');
}

export async function deleteComment(tx: SqlRunner, me: string, id: unknown): Promise<void> {
  const cid = uuid(id, 'comment');
  const own = await tx.query<{ removed_at: string | null }>(
    'select removed_at from public.comments where id = $1 and author_id = $2',
    [cid, me],
  );
  if (!own.rows[0]) throw new CommunityError(404, 'That comment was not found.');
  if (own.rows[0].removed_at) {
    throw new CommunityError(409, 'That comment was removed by a moderator. It stays on record.');
  }
  await tx.query('delete from public.comments where id = $1 and author_id = $2', [cid, me]);
}

export async function likeAction(
  tx: SqlRunner,
  me: string,
  action: 'like' | 'unlike',
  target: unknown,
  id: unknown,
): Promise<void> {
  if (target !== 'post' && target !== 'comment') bad('That was not sent properly.');
  const tid = uuid(id, target);
  const column = target === 'post' ? 'post_id' : 'comment_id';
  if (action === 'unlike') {
    await tx.query(`delete from public.likes where user_id = $1 and ${column} = $2`, [me, tid]);
    return;
  }
  // The like rule needs the thing to be visible and not across a block. Say "not found" if not.
  const seen = await tx.query(
    target === 'post'
      ? 'select 1 from public.posts where id = $1 and removed_at is null'
      : 'select 1 from public.comments where id = $1 and removed_at is null',
    [tid],
  );
  if (seen.rowCount === 0)
    throw new CommunityError(
      404,
      target === 'post' ? NOT_FOUND_POST : 'That comment was not found.',
    );
  await tx.query(
    `insert into public.likes (user_id, ${column}) values ($1, $2) on conflict do nothing`,
    [me, tid],
  );
}

// ------------------------------------------------------------------ reports

/** Report a post, comment or profile. A target the reporter can not see is "not found". */
export async function report(tx: SqlRunner, me: string, b: Record<string, unknown>): Promise<void> {
  const type = b.target;
  if (type !== 'post' && type !== 'comment' && type !== 'profile') bad('Choose what to report.');
  const reason = oneOf(
    b.reason,
    REPORT_REASONS.map((r) => r.id),
    'a reason',
  );
  const details = field(b.details, 'details', 1000, { multiline: true });
  let target: string;
  if (type === 'profile') target = await resolveMember(tx, b.username);
  else {
    target = uuid(b.id, type);
    const seen = await tx.query(
      type === 'post'
        ? 'select 1 from public.posts where id = $1'
        : 'select 1 from public.comments where id = $1',
      [target],
    );
    if (seen.rowCount === 0)
      throw new CommunityError(
        404,
        type === 'post' ? NOT_FOUND_POST : 'That comment was not found.',
      );
  }
  if (type === 'profile' && target === me) bad('You can not report yourself.');
  // One open report each: a second tap says thanks, and does not add a copy for a moderator to read.
  // (The rules show a player only their own reports, and the column grant leaves out `reporter_id`.)
  const again = await tx.query(
    `select 1 from public.reports where target_type = $1 and target_id = $2 and status = 'open'`,
    [type, target],
  );
  if (again.rowCount > 0) return;
  await tx.query(
    `insert into public.reports (reporter_id, target_type, target_id, reason, details)
     values ($1, $2, $3, $4, $5)`,
    [me, type, target, reason, details],
  );
}

export { TextError };

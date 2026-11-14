import 'server-only';
import type { SqlClient, SqlRunner } from '../db/sql';
import { safeHref } from './text';
import type {
  Card,
  CommentView,
  FeedTab,
  Page,
  PersonCard,
  PhotoView,
  PostView,
} from '@/lib/community/types';
export { FEED_TABS } from '@/lib/community/types';
export type {
  Author,
  Card,
  CommentView,
  FeedTab,
  Page,
  PersonCard,
  PhotoView,
  PostView,
} from '@/lib/community/types';

/**
 * What the community pages read. Every function takes `tx`, a connection that is running AS THE
 * SIGNED-IN PLAYER (`asUser`), so the database's row level security decides what is returned:
 * blocks hide both ways, a private profile gives only its card, a followers-only post goes only to
 * followers, a removed post goes only to its author, a photo that has not passed the check
 * is the author's alone, and an account under 16 never appears. The server adds no second set of
 * rules here that could drift from the database's; it only asks.
 *
 * The two exceptions are marked: the blocked list and username search read through the server's
 * own connection with the viewer's id checked in the query (`app.can_find_profile_for`).
 */

export const PAGE_SIZE = 20;

// ------------------------------------------------------------------ cursors

/** A cursor names the last row seen by its time and id. It is only ever compared, never run. */
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function encodeCursor(ts: string, id: string): string {
  return Buffer.from(`${ts}|${id}`).toString('base64url');
}
export function decodeCursor(c: unknown): { ts: string; id: string } | null {
  if (typeof c !== 'string' || c.length === 0 || c.length > 120) return null;
  try {
    const [ts, id] = Buffer.from(c, 'base64url').toString('utf8').split('|');
    return ts && id && TS.test(ts) && UUID.test(id) ? { ts, id } : null;
  } catch {
    return null;
  }
}

const TS_SQL = `to_char(%T% at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const ts = (col: string): string => TS_SQL.replace('%T%', col);

// ------------------------------------------------------------------ posts

const TAB_FILTER: Record<Exclude<FeedTab, 'friends'>, string> = {
  everyone: `p.group_id is null and p.visibility = 'public'`,
  groups: `p.group_id in (select m.group_id from public.group_members m where m.user_id = $1)`,
};

interface PostRow {
  id: string;
  author_id: string;
  kind: PostView['kind'];
  body: string | null;
  link_url: string | null;
  card: unknown;
  farm_day: number | null;
  visibility: PostView['visibility'];
  group_id: string | null;
  edited_at: string | null;
  removed_at: string | null;
  created_ts: string;
  username: string | null;
  display_name: string | null;
  has_avatar: boolean | null;
  likes: number;
  comments: number;
  liked: boolean;
}

const POST_SELECT = `
  p.id, p.author_id, p.kind, p.body, p.link_url, p.card, p.farm_day, p.visibility, p.group_id,
  ${ts('p.edited_at')} as edited_at, p.removed_at, ${ts('p.created_at')} as created_ts,
  pp.username, pp.display_name, (pp.avatar_path is not null) as has_avatar,
  app.like_count_post(p.id) as likes,
  (select count(*)::int from public.comments c where c.post_id = p.id and c.removed_at is null) as comments,
  exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = $1) as liked`;

/** For the review tests: the post columns read (like counts come from one safe count each). */
export const postSelectSql = POST_SELECT;

/**
 * The Friends tab: each followed author's own newest posts first (the `posts_author_feed` index),
 * then the newest of those. It never walks the whole posts table for someone who follows one quiet
 * account. The database's rules still decide each row.
 */
export const friendsSql = `select ${POST_SELECT}
       from (select f.followee_id from public.follows f
              where f.follower_id = $1 and f.status = 'accepted') a
       cross join lateral (
         select q.* from public.posts q
          where q.author_id = a.followee_id and q.group_id is null and q.removed_at is null
            and ($2::timestamptz is null or (q.created_at, q.id) < ($2::timestamptz, $3::uuid))
          order by q.created_at desc, q.id desc
          limit $4) p
       left join public.public_profiles pp on pp.user_id = p.author_id
      order by p.created_at desc, p.id desc
      limit $4`;

/** A stored card is checked on the way out, so only the plain shape ever reaches a page. */
export function readCard(raw: unknown): Card | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== 1 || (c.kind !== 'farm' && c.kind !== 'day') || typeof c.title !== 'string') {
    return null;
  }
  if (!Array.isArray(c.facts)) return null;
  const facts: Card['facts'] = [];
  for (const f of c.facts.slice(0, 12)) {
    if (!f || typeof f !== 'object') continue;
    const { label, value } = f as Record<string, unknown>;
    if (typeof value !== 'string') continue;
    facts.push({
      label: typeof label === 'string' ? label.slice(0, 60) : null,
      value: value.slice(0, 200),
    });
  }
  return { v: 1, kind: c.kind, title: c.title.slice(0, 120), facts };
}

async function attachPhotos(tx: SqlRunner, posts: PostView[]): Promise<void> {
  if (posts.length === 0) return;
  const r = await tx.query<{ id: string; post_id: string; moderation_status: PhotoView['status'] }>(
    `select id, post_id, moderation_status from public.post_photos
      where post_id = any($1::uuid[]) order by position`,
    [posts.map((p) => p.id)],
  );
  const by = new Map(posts.map((p) => [p.id, p]));
  for (const row of r.rows)
    by.get(row.post_id)?.photos.push({ id: row.id, status: row.moderation_status });
}

function toPost(row: PostRow, me: string): PostView {
  const removed = row.removed_at !== null;
  return {
    id: row.id,
    kind: row.kind,
    // A removed post's words are not sent to anyone, its author included.
    body: removed ? null : row.body,
    linkUrl: removed ? null : row.link_url,
    linkHref: removed ? null : safeHref(row.link_url),
    card: removed ? null : readCard(row.card),
    farmDay: row.farm_day,
    visibility: row.visibility,
    groupId: row.group_id,
    createdAt: row.created_ts,
    editedAt: row.edited_at,
    removed,
    mine: row.author_id === me,
    author: {
      id: row.author_id,
      username: row.username ?? 'Former player',
      displayName: row.display_name,
      hasAvatar: Boolean(row.has_avatar),
    },
    likes: row.likes,
    comments: row.comments,
    liked: row.liked,
    photos: [],
  };
}

export async function feedPage(
  tx: SqlRunner,
  me: string,
  tab: FeedTab,
  cursor: string | null,
): Promise<Page<PostView>> {
  const c = decodeCursor(cursor);
  if (tab === 'friends') {
    const r = await tx.query<PostRow>(friendsSql, [
      me,
      c?.ts ?? null,
      c?.id ?? null,
      PAGE_SIZE + 1,
    ]);
    return finishPage(tx, r.rows, me);
  }
  const r = await tx.query<PostRow & { ts: string }>(
    `select ${POST_SELECT}
       from public.posts p
       left join public.public_profiles pp on pp.user_id = p.author_id
      where p.removed_at is null
        and ${TAB_FILTER[tab]}
        and ($2::timestamptz is null or (p.created_at, p.id) < ($2::timestamptz, $3::uuid))
      order by p.created_at desc, p.id desc
      limit $4`,
    [me, c?.ts ?? null, c?.id ?? null, PAGE_SIZE + 1],
  );
  return finishPage(tx, r.rows, me);
}

async function finishPage(tx: SqlRunner, rows: PostRow[], me: string): Promise<Page<PostView>> {
  const more = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE).map((r) => toPost(r, me));
  await attachPhotos(tx, items);
  const last = items[items.length - 1];
  return { items, next: more && last ? encodeCursor(last.createdAt, last.id) : null };
}

/** One author's posts, newest first. Their own removed posts show as removed to them. */
export async function postsBy(
  tx: SqlRunner,
  me: string,
  author: string,
  cursor: string | null,
  /** "My profile as others see it": only public posts, none in a group, none removed. */
  asStranger = false,
): Promise<Page<PostView>> {
  const c = decodeCursor(cursor);
  const r = await tx.query<PostRow>(
    `select ${POST_SELECT}
       from public.posts p
       left join public.public_profiles pp on pp.user_id = p.author_id
      where p.author_id = $5
        and (p.removed_at is null or (p.author_id = $1 and not ${asStranger ? 'true' : 'false'}))
        and (not ${asStranger ? 'true' : 'false'} or (p.visibility = 'public' and p.group_id is null))
        and ($2::timestamptz is null or (p.created_at, p.id) < ($2::timestamptz, $3::uuid))
      order by p.created_at desc, p.id desc
      limit $4`,
    [me, c?.ts ?? null, c?.id ?? null, PAGE_SIZE + 1, author],
  );
  return finishPage(tx, r.rows, me);
}

export async function getPost(tx: SqlRunner, me: string, id: string): Promise<PostView | null> {
  if (!isUuid(id)) return null;
  const r = await tx.query<PostRow>(
    `select ${POST_SELECT}
       from public.posts p
       left join public.public_profiles pp on pp.user_id = p.author_id
      where p.id = $2`,
    [me, id],
  );
  const row = r.rows[0];
  if (!row) return null;
  const post = toPost(row, me);
  await attachPhotos(tx, [post]);
  return post;
}

export const COMMENT_PAGE = 30;
/** Replies shown under a comment before "Show more replies". */
export const REPLIES_SHOWN = 5;
/** Replies shown when one comment's thread is opened. */
export const THREAD_MAX = 200;

interface CommentRow {
  id: string;
  parent_id: string | null;
  body: string;
  created_ts: string;
  edited_at: string | null;
  removed_at: string | null;
  author_id: string;
  username: string | null;
  display_name: string | null;
  has_avatar: boolean | null;
  likes: number;
  liked: boolean;
}

const COMMENT_SELECT = `
  c.id, c.parent_id, c.body, ${ts('c.created_at')} as created_ts, ${ts('c.edited_at')} as edited_at,
  c.removed_at, c.author_id, pp.username, pp.display_name, (pp.avatar_path is not null) as has_avatar,
  app.like_count_comment(c.id) as likes,
  exists (select 1 from public.likes l where l.comment_id = c.id and l.user_id = $1) as liked`;

function toComment(r: CommentRow, me: string, moreReplies = false): CommentView {
  const removed = r.removed_at !== null;
  return {
    moreReplies,
    id: r.id,
    parentId: r.parent_id,
    body: removed ? null : r.body,
    createdAt: r.created_ts,
    editedAt: r.edited_at,
    removed,
    mine: r.author_id === me,
    author: {
      id: r.author_id,
      username: r.username ?? 'Former player',
      displayName: r.display_name,
      hasAvatar: Boolean(r.has_avatar),
    },
    likes: r.likes,
    liked: r.liked,
  };
}

/**
 * Top-level comments, oldest first, a page at a time, each with its first few replies (one level).
 * A comment with more replies than that is marked, and the page links to its thread. `thread`
 * (a top-level comment's id) gives that one comment with up to THREAD_MAX replies.
 */
export async function commentsPage(
  tx: SqlRunner,
  me: string,
  post: string,
  cursor: string | null,
  thread: string | null = null,
): Promise<Page<CommentView>> {
  const c = decodeCursor(cursor);
  const one = thread !== null && isUuid(thread) ? thread : null;
  const top = await tx.query<CommentRow>(
    `select ${COMMENT_SELECT}
       from public.comments c
       left join public.public_profiles pp on pp.user_id = c.author_id
      where c.post_id = $2 and c.parent_id is null
        and ($6::uuid is null or c.id = $6::uuid)
        and (c.removed_at is null or c.author_id = $1)
        and ($3::timestamptz is null or (c.created_at, c.id) > ($3::timestamptz, $4::uuid))
      order by c.created_at, c.id
      limit $5`,
    [me, post, c?.ts ?? null, c?.id ?? null, COMMENT_PAGE + 1, one],
  );
  const more = top.rows.length > COMMENT_PAGE;
  const parents = top.rows.slice(0, COMMENT_PAGE);
  const shown = one ? THREAD_MAX : REPLIES_SHOWN;
  const replies = parents.length
    ? await tx.query<CommentRow & { rn: number }>(
        `select * from (
           select ${COMMENT_SELECT},
                  row_number() over (partition by c.parent_id order by c.created_at, c.id)::int as rn
             from public.comments c
             left join public.public_profiles pp on pp.user_id = c.author_id
            where c.parent_id = any($2::uuid[])
              and (c.removed_at is null or c.author_id = $1)) x
          where x.rn <= $3
          order by x.created_ts, x.id`,
        [me, parents.map((p) => p.id), shown + 1],
      )
    : { rows: [] as (CommentRow & { rn: number })[] };
  const items: CommentView[] = [];
  for (const p of parents) {
    const mine = replies.rows.filter((r) => r.parent_id === p.id);
    items.push(toComment(p, me, mine.length > shown));
    for (const r of mine.slice(0, shown)) items.push(toComment(r, me));
  }
  const last = parents[parents.length - 1];
  return { items, next: more && last ? encodeCursor(last.created_ts, last.id) : null };
}

// ------------------------------------------------------------------ profiles

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  hasAvatar: boolean;
  /** The card is always visible to a member. The details only when privacy allows. */
  detailsVisible: boolean;
  privacy: 'public' | 'followers' | 'private';
  bio: string | null;
  town: string | null;
  district: string | null;
  state: string | null;
  farms: boolean | null;
  enterprise: string | null;
  sizeBand: string | null;
  sizeHa: number | null;
  realFarmName: string | null;
  yearsFarming: number | null;
  farmRole: string | null;
  joined: string;
}

export interface ProfileExtras {
  links: { kind: string; url: string; href: string | null }[];
  experience: {
    id: string;
    role: string;
    enterprise: string | null;
    place: string | null;
    from: number | null;
    to: number | null;
  }[];
  education: {
    id: string;
    course: string;
    provider: string | null;
    year: number | null;
    verified: boolean;
  }[];
}

interface ProfileRow {
  user_id: string;
  username: string;
  display_name: string | null;
  has_avatar: boolean;
  details_visible: boolean;
  privacy_profile: Profile['privacy'];
  bio: string | null;
  town: string | null;
  district: string | null;
  state: string | null;
  farms: boolean | null;
  enterprise: string | null;
  farm_size_band: string | null;
  farm_size_ha: string | null;
  real_farm_name: string | null;
  years_farming: number | null;
  farm_role: string | null;
  created_at: string;
}

const PROFILE_SELECT = `user_id, username, display_name, (avatar_path is not null) as has_avatar,
  details_visible, privacy_profile, bio, town, district, state, farms, enterprise, farm_size_band,
  farm_size_ha, real_farm_name, years_farming, farm_role, created_at`;

function toProfile(r: ProfileRow): Profile {
  return {
    id: r.user_id,
    username: r.username,
    displayName: r.display_name,
    hasAvatar: r.has_avatar,
    detailsVisible: r.details_visible,
    privacy: r.privacy_profile,
    bio: r.bio,
    town: r.town,
    district: r.district,
    state: r.state,
    farms: r.farms,
    enterprise: r.enterprise,
    sizeBand: r.farm_size_band,
    sizeHa: r.farm_size_ha === null ? null : Number(r.farm_size_ha),
    realFarmName: r.real_farm_name,
    yearsFarming: r.years_farming,
    farmRole: r.farm_role,
    joined: r.created_at,
  };
}

/** A member's profile as the signed-in player may see it, or null (not there, blocked, or under 16: all the same). */
export async function profileByUsername(tx: SqlRunner, username: string): Promise<Profile | null> {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;
  const r = await tx.query<ProfileRow>(
    `select ${PROFILE_SELECT} from public.public_profiles where lower(username) = lower($1)`,
    [username],
  );
  return r.rows[0] ? toProfile(r.rows[0]) : null;
}

export async function extrasOf(tx: SqlRunner, user: string): Promise<ProfileExtras> {
  const [links, exp, edu] = await Promise.all([
    tx.query<{ kind: string; url: string }>(
      'select kind, url from public.profile_links where user_id = $1 order by position, kind',
      [user],
    ),
    tx.query<{
      id: string;
      role: string;
      enterprise: string | null;
      place: string | null;
      from_year: number | null;
      to_year: number | null;
    }>(
      `select id, role, enterprise, place, from_year, to_year from public.profile_experience
        where user_id = $1 order by coalesce(to_year, 9999) desc, from_year desc nulls last limit 20`,
      [user],
    ),
    tx.query<{
      id: string;
      course_name: string;
      provider: string | null;
      year: number | null;
      verified: boolean;
    }>(
      `select id, course_name, provider, year, verified from public.profile_education
        where user_id = $1 order by year desc nulls last limit 20`,
      [user],
    ),
  ]);
  return {
    links: links.rows.map((l) => ({ kind: l.kind, url: l.url, href: safeHref(l.url) })),
    experience: exp.rows.map((e) => ({
      id: e.id,
      role: e.role,
      enterprise: e.enterprise,
      place: e.place,
      from: e.from_year,
      to: e.to_year,
    })),
    education: edu.rows.map((e) => ({
      id: e.id,
      course: e.course_name,
      provider: e.provider,
      year: e.year,
      verified: e.verified,
    })),
  };
}

export interface MyProfile extends Profile {
  avatarStatus: 'none' | 'pending' | 'approved' | 'rejected';
  farmView: 'public' | 'followers' | 'off';
  tickerOptIn: boolean;
  hideTicker: boolean;
  extras: ProfileExtras;
}

/** The signed-in player's own profile, with the settings only they see. */
export async function myProfile(tx: SqlRunner, me: string): Promise<MyProfile | null> {
  const r = await tx.query<
    ProfileRow & {
      avatar_status: MyProfile['avatarStatus'];
      privacy_farm_view: MyProfile['farmView'];
      ticker_opt_in: boolean;
      hide_ticker: boolean;
    }
  >(
    `select p.user_id, p.username, p.display_name, (p.avatar_path is not null) as has_avatar,
            true as details_visible, p.privacy_profile, p.bio, p.town, p.district, p.state, p.farms,
            p.enterprise, p.farm_size_band, p.farm_size_ha, p.real_farm_name, p.years_farming,
            p.farm_role, p.created_at, p.avatar_status, p.privacy_farm_view, p.ticker_opt_in,
            a.hide_ticker
       from public.profiles p
       join public.account_private a on a.user_id = p.user_id
      where p.user_id = $1`,
    [me],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    ...toProfile(row),
    avatarStatus: row.avatar_status,
    farmView: row.privacy_farm_view,
    tickerOptIn: row.ticker_opt_in,
    hideTicker: row.hide_ticker,
    extras: await extrasOf(tx, me),
  };
}

// ------------------------------------------------------------------ follows

export interface Relation {
  /** My follow of them: none, a request waiting, or following. */
  following: 'none' | 'pending' | 'accepted';
  /** They follow me. */
  followsMe: boolean;
}

export async function relationTo(tx: SqlRunner, me: string, other: string): Promise<Relation> {
  const r = await tx.query<{ follower_id: string; status: string }>(
    `select follower_id, status from public.follows
      where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)`,
    [me, other],
  );
  const mine = r.rows.find((x) => x.follower_id === me);
  return {
    following: mine ? (mine.status as 'pending' | 'accepted') : 'none',
    followsMe: r.rows.some((x) => x.follower_id === other && x.status === 'accepted'),
  };
}

export async function counts(
  tx: SqlRunner,
  user: string,
): Promise<{ followers: number; following: number }> {
  const r = await tx.query<{ followers: number; following: number }>(
    `select (select count(*)::int from public.follows where followee_id = $1 and status = 'accepted') as followers,
            (select count(*)::int from public.follows where follower_id = $1 and status = 'accepted') as following`,
    [user],
  );
  return r.rows[0] ?? { followers: 0, following: 0 };
}

interface CardRow {
  user_id: string;
  username: string;
  display_name: string | null;
  has_avatar: boolean;
  district: string | null;
  ts?: string;
}

const toCard = (r: CardRow): PersonCard => ({
  id: r.user_id,
  username: r.username,
  displayName: r.display_name,
  hasAvatar: r.has_avatar,
  district: r.district,
});

/** Followers or following of a profile, newest first, a page at a time (only accepted follows, as the database shows them). */
export async function connections(
  tx: SqlRunner,
  user: string,
  list: 'followers' | 'following',
  cursor: string | null,
): Promise<Page<PersonCard>> {
  const c = decodeCursor(cursor);
  const [near, far] =
    list === 'followers' ? ['followee_id', 'follower_id'] : ['follower_id', 'followee_id'];
  const r = await tx.query<CardRow & { ts: string; fid: string }>(
    `select pp.user_id, pp.username, pp.display_name, (pp.avatar_path is not null) as has_avatar,
            pp.district, ${ts('f.created_at')} as ts, pp.user_id as fid
       from public.follows f
       join public.public_profiles pp on pp.user_id = f.${far}
      where f.${near} = $1 and f.status = 'accepted'
        and ($2::timestamptz is null or (f.created_at, pp.user_id) < ($2::timestamptz, $3::uuid))
      order by f.created_at desc, pp.user_id desc
      limit $4`,
    [user, c?.ts ?? null, c?.id ?? null, PAGE_SIZE + 1],
  );
  const more = r.rows.length > PAGE_SIZE;
  const rows = r.rows.slice(0, PAGE_SIZE);
  const last = rows[rows.length - 1];
  return { items: rows.map(toCard), next: more && last ? encodeCursor(last.ts, last.fid) : null };
}

/** Follow requests waiting for me to answer, and requests I sent that are still waiting. Only the two people see a request. */
export async function requests(
  tx: SqlRunner,
  me: string,
): Promise<{ incoming: PersonCard[]; outgoing: PersonCard[] }> {
  const q = async (mine: string, theirs: string): Promise<PersonCard[]> => {
    const r = await tx.query<CardRow>(
      `select pp.user_id, pp.username, pp.display_name, (pp.avatar_path is not null) as has_avatar, pp.district
         from public.follows f
         join public.public_profiles pp on pp.user_id = f.${theirs}
        where f.${mine} = $1 and f.status = 'pending'
        order by f.created_at desc limit 50`,
      [me],
    );
    return r.rows.map(toCard);
  };
  return {
    incoming: await q('followee_id', 'follower_id'),
    outgoing: await q('follower_id', 'followee_id'),
  };
}

// ------------------------------------------------------------------ search and blocks

export const SEARCH_MIN = 2;
export const SEARCH_MAX = 20;
export const SEARCH_LIMIT = 20;

/** A username search term: letters, digits and underscores only, so it can never carry a wildcard. */
export function searchTerm(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const t = q.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]+$/.test(t) && t.length >= SEARCH_MIN && t.length <= SEARCH_MAX ? t : null;
}

/**
 * Find members by the start of a username. Bounded (2 to 20 letters, 20 results, prefix only so
 * the username index is used). It reads through the server's own connection and asks the
 * database's own helper whether THIS viewer may find each person (`app.can_find_profile_for`: a
 * member, no block either way), plus `app.member_raw` so an account under 16 is never found, an
 * admin viewer included. The underscore is escaped, because it is a wildcard in LIKE.
 */
export async function searchPeople(
  sql: SqlClient,
  viewer: string,
  term: string,
): Promise<PersonCard[]> {
  const like = `${term.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  const r = await sql.query<CardRow>(
    `select p.user_id, p.username, p.display_name,
            (p.avatar_path is not null and p.avatar_status = 'approved') as has_avatar, p.district
       from public.profiles p
      where lower(p.username) like $1 escape '\\'
        and p.user_id <> $2
        and app.member_raw(p.user_id)
        and app.can_find_profile_for($2, p.user_id)
      order by lower(p.username)
      limit ${SEARCH_LIMIT}`,
    [like, viewer],
  );
  return r.rows.map(toCard);
}

/** The people I have blocked. Only the blocker ever sees a block: the id is the session's. */
export async function blockedBy(
  sql: SqlClient,
  me: string,
): Promise<{ id: string; username: string }[]> {
  const r = await sql.query<{ user_id: string; username: string }>(
    `select p.user_id, p.username from public.blocks b
       join public.profiles p on p.user_id = b.blocked_id
      where b.blocker_id = $1 order by b.created_at desc limit 200`,
    [me],
  );
  return r.rows.map((x) => ({ id: x.user_id, username: x.username }));
}

/** My farms, for the Share my farm picker (the player's own rows only). */
export async function myFarms(
  tx: SqlRunner,
): Promise<{ id: string; name: string; mode: string; day: number }[]> {
  const r = await tx.query<{ id: string; name: string; mode: string; current_day: number }>(
    `select id, name, mode, current_day from public.farms
      where owner_id = app.uid() and status = 'active' order by started_at desc limit 20`,
  );
  return r.rows.map((f) => ({ id: f.id, name: f.name, mode: f.mode, day: f.current_day }));
}

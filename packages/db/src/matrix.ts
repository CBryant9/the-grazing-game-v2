/**
 * The access matrix: for every table in `public`, what each kind of caller
 * may do. Each cell is run by matrix.test.ts, and coverage.test.ts fails if
 * a table exists that is not listed here.
 *
 * Run with the community, feed, groups, ticker, farm viewing and
 * leaderboard switches ON, so the under-16 refusals come from the age rule,
 * not from a switch. Each insert is "a row for myself" (a visitor tries to
 * write as A, the server writes for A). Select, update and delete aim at a
 * row that belongs to A unless the note says otherwise.
 */
import { ID, type Who } from './harness';

export type SqlFor = string | ((me: string, who: Who) => string);

export interface Op {
  sql: SqlFor;
  /** Who should get through. Everyone else must be refused. */
  pass: readonly Who[];
  /** Run first, as the database owner, inside the same rolled-back transaction. */
  prep?: SqlFor;
  /** Override the id a caller acts for in this op. */
  me?: Partial<Record<Who, string>>;
}

export interface TableSpec {
  select: Op;
  insert: Op;
  update: Op;
  delete: Op;
}

const SERVER: readonly Who[] = ['service'];
const ALL: readonly Who[] = ['anon', 'a', 'b', 'u16', 'admin', 'service'];
const ADMIN_READ: readonly Who[] = ['admin', 'service'];
const OWNER: readonly Who[] = ['a', 'service'];
/** Adults in the community (A, B and the admin) and the server. */
const MEMBERS: readonly Who[] = ['a', 'b', 'admin', 'service'];
const PLAYERS_AND_SERVER: readonly Who[] = ['a', 'b', 'u16', 'admin', 'service'];

/** A table only the server touches: no browser role, not even an admin. */
function serverOnly(
  table: string,
  where: string,
  insert: SqlFor,
  set: string,
  prep?: SqlFor,
): TableSpec {
  return {
    select: { sql: `select 1 from public.${table} where ${where}`, pass: SERVER, prep },
    insert: { sql: insert, pass: SERVER },
    update: { sql: `update public.${table} set ${set} where ${where}`, pass: SERVER, prep },
    delete: { sql: `delete from public.${table} where ${where}`, pass: SERVER, prep },
  };
}

/** Admins read; only the server writes. */
function adminRead(table: string, where: string, insert: SqlFor, set: string): TableSpec {
  return {
    select: { sql: `select 1 from public.${table} where ${where}`, pass: ADMIN_READ },
    insert: { sql: insert, pass: SERVER },
    update: { sql: `update public.${table} set ${set} where ${where}`, pass: SERVER },
    delete: { sql: `delete from public.${table} where ${where}`, pass: SERVER },
  };
}

const other = (me: string): string => (me === ID.b ? ID.a : ID.b);

export const MATRIX: Record<string, TableSpec> = {
  // ------------------------------------------------------------ accounts
  account_status: {
    select: {
      sql: `select 1 from public.account_status where user_id = '${ID.a}'`,
      pass: ['a', 'admin', 'service'],
    },
    insert: {
      prep: (me) => `delete from public.account_status where user_id = '${me}';`,
      sql: (me) => `insert into public.account_status (user_id, role) values ('${me}', 'admin')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.account_status set role = 'admin' where user_id = '${ID.a}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.account_status where user_id = '${ID.a}'`, pass: SERVER },
  },
  account_private: {
    select: { sql: `select 1 from public.account_private where user_id = '${ID.a}'`, pass: OWNER },
    insert: {
      prep: (me) => `delete from public.account_private where user_id = '${me}';`,
      sql: (me) =>
        `insert into public.account_private (user_id, date_of_birth) values ('${me}', '1990-01-01')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.account_private set hide_ticker = true where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.account_private where user_id = '${ID.a}'`, pass: SERVER },
  },
  profiles: {
    select: {
      sql: `select 1 from public.profiles where user_id = '${ID.a}'`,
      pass: ['a', 'admin', 'service'],
    },
    insert: {
      prep: (me) => `delete from public.profiles where user_id = '${me}';`,
      sql: (me) =>
        `insert into public.profiles (user_id, username) values ('${me}', 'someone_new')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.profiles set bio = 'New bio' where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.profiles where user_id = '${ID.a}'`, pass: SERVER },
  },
  profile_links: {
    select: { sql: `select 1 from public.profile_links where user_id = '${ID.a}'`, pass: MEMBERS },
    insert: {
      sql: (me) =>
        `insert into public.profile_links (user_id, kind, url) values ('${me}', 'instagram', 'https://example.org/i')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.profile_links set url = 'https://example.org/new' where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.profile_links where user_id = '${ID.a}'`, pass: OWNER },
  },
  profile_experience: {
    select: {
      sql: `select 1 from public.profile_experience where user_id = '${ID.a}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.profile_experience (user_id, role) values ('${me}', 'Jackaroo')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.profile_experience set place = 'Walcha' where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.profile_experience where user_id = '${ID.a}'`, pass: OWNER },
  },
  profile_education: {
    select: {
      sql: `select 1 from public.profile_education where user_id = '${ID.a}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.profile_education (user_id, course_name) values ('${me}', 'TAFE Certificate III')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.profile_education set year = 2016 where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.profile_education where user_id = '${ID.a}'`, pass: OWNER },
  },
  farm_showcase_photos: {
    select: {
      sql: `select 1 from public.farm_showcase_photos where user_id = '${ID.a}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.farm_showcase_photos (user_id, storage_path) values ('${me}', '${me}/new.jpg')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.farm_showcase_photos set caption = 'New' where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: {
      sql: `delete from public.farm_showcase_photos where user_id = '${ID.a}'`,
      pass: OWNER,
    },
  },
  guest_sessions: serverOnly(
    'guest_sessions',
    `id = '${ID.guest}'`,
    `insert into public.guest_sessions (token_hash) values ('${'cd'.repeat(32)}')`,
    'last_seen_at = now()',
  ),
  signup_refusals: serverOnly(
    'signup_refusals',
    `user_id = '${ID.c}'`,
    (me) => `insert into public.signup_refusals (user_id, reason) values ('${me}', 'too_young')`,
    'updated_at = now()',
    `insert into public.signup_refusals (user_id, reason) values ('${ID.c}', 'too_young');`,
  ),
  ban_records: serverOnly(
    'ban_records',
    `email_hash = '${'ef'.repeat(32)}'`,
    `insert into public.ban_records (email_hash) values ('${'ab'.repeat(32)}')`,
    'banned_until = now()',
    `insert into public.ban_records (email_hash) values ('${'ef'.repeat(32)}');`,
  ),
  farm_limits: {
    select: { sql: `select 1 from public.farm_limits where tier = 'free'`, pass: ALL },
    insert: {
      prep: `delete from public.farm_limits where tier = 'guest' and mode = 'daily';`,
      sql: `insert into public.farm_limits (tier, mode, max_active) values ('guest', 'daily', 3)`,
      pass: SERVER,
    },
    update: {
      sql: `update public.farm_limits set max_active = 9 where tier = 'free'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.farm_limits where tier = 'free'`, pass: SERVER },
  },

  // ---------------------------------------------------------------- game
  farms: {
    select: {
      sql: `select 1 from public.farms where id = '${ID.farmA}'`,
      pass: ['a', 'admin', 'service'],
    },
    insert: {
      sql: (
        me,
      ) => `insert into public.farms (owner_id, mode, name, district, size, size_ha, enterprise, start_type, difficulty, engine_version)
        values ('${me}', 'fast', 'New farm', 'nsw', 'small', 300, 'grazing', 'running', 'easy', '0.12.1')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.farms set name = 'Renamed' where id = '${ID.farmA}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.farms where id = '${ID.farmA}'`, pass: SERVER },
  },
  // The engine's save: the server only. Not even the farm's owner can read it.
  farm_saves: {
    ...serverOnly('farm_saves', `farm_id = '${ID.farmA}'`, '', `farm_version = 'v9'`),
    insert: {
      prep: `delete from public.farm_saves where farm_id = '${ID.farmA}';`,
      sql: `insert into public.farm_saves (farm_id, stored_format, save_format, engine_version, save, setup, farm_version)
        values ('${ID.farmA}', 3, 8, '0.12.1', '{}', '{}', 'v2')`,
      pass: SERVER,
    },
  },
  farm_days: {
    select: { sql: `select 1 from public.farm_days where farm_id = '${ID.farmA}'`, pass: OWNER },
    insert: {
      sql: `insert into public.farm_days (farm_id, day, game_date) values ('${ID.farmA}', 2, '2026-11-02')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.farm_days set more = 1 where farm_id = '${ID.farmA}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.farm_days where farm_id = '${ID.farmA}'`, pass: SERVER },
  },
  farm_snapshots: {
    select: {
      sql: `select 1 from public.farm_snapshots where farm_id = '${ID.farmA}'`,
      pass: OWNER,
    },
    insert: {
      sql: `insert into public.farm_snapshots (farm_id, day, game_date, storage_path) values ('${ID.farmA}', 2, '2026-11-02', 'x/2.json.gz')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.farm_snapshots set bytes = 10 where farm_id = '${ID.farmA}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.farm_snapshots where farm_id = '${ID.farmA}'`,
      pass: SERVER,
    },
  },
  // Append only, for the server too: written once, never changed or removed.
  farm_actions: {
    ...serverOnly(
      'farm_actions',
      `farm_id = '${ID.farmA}'`,
      `insert into public.farm_actions (farm_id, seq, game_day, action, ok) values ('${ID.farmA}', 2, 1, '{}', true)`,
      'ok = false',
    ),
    update: {
      sql: `update public.farm_actions set ok = false where farm_id = '${ID.farmA}'`,
      pass: [],
    },
    delete: { sql: `delete from public.farm_actions where farm_id = '${ID.farmA}'`, pass: [] },
  },
  farm_scores: {
    select: {
      sql: `select 1 from public.farm_scores where farm_id = '${ID.farmA}'`,
      pass: ['a', 'admin', 'service'],
    },
    insert: {
      prep: `delete from public.farm_scores where farm_id = '${ID.farmA}';`,
      sql: `insert into public.farm_scores (farm_id, grazier_score) values ('${ID.farmA}', 999)`,
      pass: SERVER,
    },
    update: {
      sql: `update public.farm_scores set grazier_score = 999 where farm_id = '${ID.farmA}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.farm_scores where farm_id = '${ID.farmA}'`, pass: SERVER },
  },
  challenges: {
    select: {
      sql: `select id from public.challenges where id = '${ID.challengePublic}'`,
      pass: ALL,
    },
    insert: {
      sql: `insert into public.challenges (kind, name, seed, starts_at) values ('fast_challenge', 'New', 1, now())`,
      pass: SERVER,
    },
    update: {
      sql: `update public.challenges set name = 'Renamed' where id = '${ID.challengePublic}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.challenges where id = '${ID.challengePublic}'`,
      pass: SERVER,
    },
  },
  challenge_entries: {
    select: {
      sql: `select 1 from public.challenge_entries where user_id = '${ID.a}'`,
      pass: ['a', 'admin', 'service'],
    },
    insert: {
      sql: `insert into public.challenge_entries (challenge_id, farm_id, user_id) values ('${ID.challengePublic}', '${ID.dailyA}', '${ID.a}')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.challenge_entries set updated_at = now() where user_id = '${ID.a}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.challenge_entries where user_id = '${ID.a}'`, pass: SERVER },
  },
  leaderboard_entries: serverOnly(
    'leaderboard_entries',
    `user_id = '${ID.a}'`,
    (
      me,
    ) => `insert into public.leaderboard_entries (farm_id, user_id, board, mode, district, size, start_type, enterprise, period, period_key, score, farm_name)
      values ('${ID.farmA}', '${me}', 'grazier', 'fast', 'nsw', 'medium', 'running', 'grazing', 'week', '2026-W46', 1000, 'Kooringa')`,
    'score = 99999',
  ),

  // ----------------------------------------------------------- community
  follows: {
    // A follows B. B is the one followed.
    select: {
      sql: `select 1 from public.follows where follower_id = '${ID.a}' and followee_id = '${ID.b}'`,
      pass: MEMBERS,
    },
    insert: {
      prep: (me) =>
        `delete from public.follows where follower_id = '${me}' and followee_id = '${other(me)}';`,
      sql: (me) =>
        `insert into public.follows (follower_id, followee_id) values ('${me}', '${other(me)}')`,
      pass: MEMBERS,
    },
    update: {
      prep: `update public.follows set status = 'pending' where follower_id = '${ID.a}' and followee_id = '${ID.b}';`,
      sql: `update public.follows set status = 'accepted' where follower_id = '${ID.a}' and followee_id = '${ID.b}'`,
      pass: ['b', 'service'],
    },
    delete: {
      sql: `delete from public.follows where follower_id = '${ID.a}' and followee_id = '${ID.b}'`,
      pass: ['a', 'b', 'service'],
    },
  },
  blocks: {
    // Ben has blocked Cara.
    select: {
      sql: `select 1 from public.blocks where blocker_id = '${ID.b}'`,
      pass: ['b', 'service'],
    },
    insert: {
      sql: (me) =>
        `insert into public.blocks (blocker_id, blocked_id) values ('${me}', '${me === ID.b ? ID.a : ID.c}')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.blocks set updated_at = now() where blocker_id = '${ID.b}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.blocks where blocker_id = '${ID.b}'`,
      pass: ['b', 'service'],
    },
  },
  groups: {
    // Ava's private group; Ben is a member.
    select: { sql: `select id from public.groups where id = '${ID.group}'`, pass: MEMBERS },
    insert: {
      sql: (me) =>
        `insert into public.groups (name, visibility, owner_id) values ('Another group', 'public', '${me}')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.groups set description = 'New' where id = '${ID.group}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.groups where id = '${ID.group}'`, pass: OWNER },
  },
  group_members: {
    // Ben's membership of Ava's group.
    select: {
      sql: `select 1 from public.group_members where group_id = '${ID.group}' and user_id = '${ID.b}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.group_members (group_id, user_id) values ('${ID.group}', '${me}')`,
      me: { service: ID.c, b: ID.c },
      pass: SERVER,
    },
    update: {
      sql: `update public.group_members set joined_at = now() where user_id = '${ID.b}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.group_members where group_id = '${ID.group}' and user_id = '${ID.b}'`,
      pass: ['a', 'b', 'service'],
    },
  },
  posts: {
    select: { sql: `select 1 from public.posts where id = '${ID.postA}'`, pass: MEMBERS },
    insert: {
      sql: (me) => `insert into public.posts (author_id, body) values ('${me}', 'Hello')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.posts set body = 'Edited' where id = '${ID.postA}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.posts where id = '${ID.postA}'`, pass: OWNER },
  },
  post_photos: {
    select: {
      sql: `select 1 from public.post_photos where id = '${ID.photoApproved}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.post_photos (post_id, storage_path, position) values ('${me === ID.b ? ID.postB : ID.postA}', '${me}/p3.jpg', 3)`,
      pass: ['a', 'b', 'service'],
    },
    update: {
      sql: `update public.post_photos set checked_at = now() where id = '${ID.photoApproved}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.post_photos where id = '${ID.photoApproved}'`, pass: OWNER },
  },
  comments: {
    // Ben's comment on Ava's post.
    select: { sql: `select 1 from public.comments where id = '${ID.commentB}'`, pass: MEMBERS },
    insert: {
      sql: (me) =>
        `insert into public.comments (post_id, author_id, body) values ('${ID.postA}', '${me}', 'Nice')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.comments set body = 'Edited' where id = '${ID.commentB}'`,
      pass: ['b', 'service'],
    },
    delete: {
      sql: `delete from public.comments where id = '${ID.commentB}'`,
      pass: ['b', 'service'],
    },
  },
  likes: {
    // Ben's like on Ava's post.
    select: {
      sql: `select 1 from public.likes where user_id = '${ID.b}' and post_id = '${ID.postA}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.likes (user_id, post_id) values ('${me}', '${me === ID.b ? ID.postB : ID.postA}')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.likes set updated_at = now() where user_id = '${ID.b}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.likes where user_id = '${ID.b}' and post_id = '${ID.postA}'`,
      pass: ['b', 'service'],
    },
  },
  activity_events: {
    select: {
      sql: `select 1 from public.activity_events where user_id = '${ID.a}'`,
      pass: MEMBERS,
    },
    insert: {
      sql: (me) =>
        `insert into public.activity_events (user_id, kind, text) values ('${me}', 'note', 'Built 1 km of fence')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.activity_events set text = 'Changed' where user_id = '${ID.a}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.activity_events where user_id = '${ID.a}'`, pass: SERVER },
  },
  reports: {
    // Ben's report.
    select: {
      sql: `select id from public.reports where id = '${ID.reportB}'`,
      pass: ['b', 'admin', 'service'],
    },
    insert: {
      sql: (me) =>
        `insert into public.reports (reporter_id, target_type, target_id, reason) values ('${me}', 'post', '${ID.postA}', 'spam')`,
      pass: MEMBERS,
    },
    update: {
      sql: `update public.reports set status = 'dismissed' where id = '${ID.reportB}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.reports where id = '${ID.reportB}'`, pass: SERVER },
  },
  moderation_actions: {
    select: {
      sql: `select 1 from public.moderation_actions where user_id = '${ID.a}'`,
      pass: ADMIN_READ,
    },
    insert: {
      sql: (me) =>
        `insert into public.moderation_actions (user_id, action) values ('${me}', 'note')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.moderation_actions set reason = 'x' where user_id = '${ID.a}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.moderation_actions where user_id = '${ID.a}'`,
      pass: SERVER,
    },
  },
  word_filter: adminRead(
    'word_filter',
    `term = 'badword'`,
    `insert into public.word_filter (term) values ('another')`,
    `kind = 'flag'`,
  ),

  // -------------------------------------------------------------- system
  feature_switches: {
    select: {
      sql: `select key, enabled from public.feature_switches where key = 'community'`,
      pass: ALL,
    },
    insert: {
      sql: `insert into public.feature_switches (key) values ('new_switch')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.feature_switches set enabled = true where key = 'ads'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.feature_switches where key = 'ads'`, pass: SERVER },
  },
  site_settings: {
    select: {
      sql: `select key, value from public.site_settings where key = 'announcement'`,
      pass: ALL,
    },
    insert: {
      sql: `insert into public.site_settings (key, value) values ('new_setting', '1')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.site_settings set value = '2' where key = 'announcement'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.site_settings where key = 'announcement'`, pass: SERVER },
  },
  admin_audit_log: {
    select: { sql: `select 1 from public.admin_audit_log where action = 'seed'`, pass: ADMIN_READ },
    insert: {
      sql: (me) =>
        `insert into public.admin_audit_log (admin_id, action) values ('${me}', 'switch_on')`,
      pass: SERVER,
    },
    // Append only, for the server too.
    update: {
      sql: `update public.admin_audit_log set action = 'changed' where action = 'seed'`,
      pass: [],
    },
    delete: { sql: `delete from public.admin_audit_log where action = 'seed'`, pass: [] },
  },
  rate_limit_rules: serverOnly(
    'rate_limit_rules',
    `action = 'post'`,
    `insert into public.rate_limit_rules (action, max_count, window_seconds) values ('new_action', 1, 60)`,
    'max_count = 1',
  ),
  rate_limit_hits: serverOnly(
    'rate_limit_hits',
    `subject = 'seed-subject'`,
    `insert into public.rate_limit_hits (action, subject, window_start) values ('post', 'other-subject', now())`,
    'hits = 9',
    `insert into public.rate_limit_hits (action, subject, window_start, hits) values ('post', 'seed-subject', now(), 1);`,
  ),
  notifications: {
    select: { sql: `select 1 from public.notifications where user_id = '${ID.a}'`, pass: OWNER },
    insert: {
      sql: (me) =>
        `insert into public.notifications (user_id, kind, title) values ('${me}', 'system', 'Hello')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.notifications set read_at = now() where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.notifications where user_id = '${ID.a}'`, pass: OWNER },
  },
  notification_settings: {
    select: {
      sql: `select 1 from public.notification_settings where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    insert: {
      prep: (me) => `delete from public.notification_settings where user_id = '${me}';`,
      sql: (me) =>
        `insert into public.notification_settings (user_id, reminder_time) values ('${me}', '06:30')`,
      pass: PLAYERS_AND_SERVER,
    },
    update: {
      sql: `update public.notification_settings set reminder_time = '06:00' where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: {
      sql: `delete from public.notification_settings where user_id = '${ID.a}'`,
      pass: OWNER,
    },
  },
  notification_prefs: {
    select: {
      sql: `select 1 from public.notification_prefs where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    insert: {
      sql: (me) =>
        `insert into public.notification_prefs (user_id, kind) values ('${me}', 'challenge')`,
      pass: PLAYERS_AND_SERVER,
    },
    update: {
      sql: `update public.notification_prefs set push = false where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    delete: { sql: `delete from public.notification_prefs where user_id = '${ID.a}'`, pass: OWNER },
  },
  push_subscriptions: {
    select: {
      sql: `select 1 from public.push_subscriptions where user_id = '${ID.a}'`,
      pass: OWNER,
    },
    insert: {
      sql: (me, who) =>
        `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret) values ('${me}', 'https://web.push.apple.com/${who}', 'k', 'a')`,
      pass: PLAYERS_AND_SERVER,
    },
    update: {
      sql: `update public.push_subscriptions set device = 'Laptop' where user_id = '${ID.a}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.push_subscriptions where user_id = '${ID.a}'`, pass: OWNER },
  },
  push_service_hosts: serverOnly(
    'push_service_hosts',
    `host = 'push.apple.com'`,
    `insert into public.push_service_hosts (host, source_url) values ('push.example.org', 'https://example.org/')`,
    'include_subdomains = false',
  ),
  weather_daily: serverOnly(
    'weather_daily',
    `district = 'nsw'`,
    `insert into public.weather_daily (district, date, rain_mm) values ('cq', '2026-11-01', 0)`,
    'rain_mm = 1',
  ),
  price_daily: serverOnly(
    'price_daily',
    `indicator = 'sample_indicator'`,
    `insert into public.price_daily (indicator, date, cents_per_kg) values ('other_indicator', '2026-11-01', 1)`,
    'cents_per_kg = 2',
  ),
  daily_counts: adminRead(
    'daily_counts',
    `metric = 'signups'`,
    `insert into public.daily_counts (day, metric) values ('2026-11-02', 'signups')`,
    'count = 4',
  ),

  // --------------------------------------------------------------- money
  ad_slots: {
    select: {
      sql: `select slot_id, enabled from public.ad_slots where slot_id = 'pc_farm_rail'`,
      pass: ALL,
    },
    insert: { sql: `insert into public.ad_slots (slot_id) values ('new_slot')`, pass: SERVER },
    update: {
      sql: `update public.ad_slots set enabled = true where slot_id = 'pc_farm_rail'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.ad_slots where slot_id = 'landing_sponsors'`, pass: SERVER },
  },
  sponsors: adminRead(
    'sponsors',
    `name = 'Sample sponsor'`,
    `insert into public.sponsors (name) values ('New')`,
    `notes = 'x'`,
  ),
  campaigns: adminRead(
    'campaigns',
    `name = 'House ad'`,
    `insert into public.campaigns (is_house_ad, name, starts_at) values (true, 'New', now())`,
    'weight = 2',
  ),
  ad_creatives: adminRead(
    'ad_creatives',
    `headline = 'Sample house ad'`,
    `insert into public.ad_creatives (campaign_id, kind) select id, 'text' from public.campaigns limit 1`,
    `body = 'x'`,
  ),
  campaign_slots: adminRead(
    'campaign_slots',
    `slot_id = 'pc_farm_rail'`,
    `insert into public.campaign_slots (campaign_id, slot_id) select id, 'pc_banner' from public.campaigns limit 1`,
    'updated_at = now()',
  ),
  ad_events: adminRead(
    'ad_events',
    `slot_id = 'pc_farm_rail'`,
    `insert into public.ad_events (slot_id, kind) values ('pc_banner', 'view')`,
    `kind = 'click'`,
  ),
  ad_daily: adminRead(
    'ad_daily',
    `slot_id = 'pc_farm_rail'`,
    `insert into public.ad_daily (day, slot_id, kind) values ('2026-11-02', 'pc_banner', 'view')`,
    'count = 5',
  ),
  products: {
    // Every product starts inactive: only admins and the server see them until then.
    select: { sql: `select 1 from public.products where id = 'farm_pack'`, pass: ADMIN_READ },
    insert: {
      sql: `insert into public.products (id, name, kind, price_cents) values ('new_product', 'New', 'pack', 100)`,
      pass: SERVER,
    },
    update: {
      sql: `update public.products set price_cents = 1 where id = 'farm_pack'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.products where id = 'keep_going_fast'`, pass: SERVER },
  },
  purchases: {
    // Ben's purchase.
    select: {
      sql: `select id from public.purchases where id = '${ID.purchaseB}'`,
      pass: ['b', 'admin', 'service'],
    },
    insert: {
      sql: (me) =>
        `insert into public.purchases (user_id, product_id, amount_cents, status) values ('${me}', 'farm_pack', 0, 'paid')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.purchases set status = 'refunded' where id = '${ID.purchaseB}'`,
      pass: SERVER,
    },
    delete: { sql: `delete from public.purchases where id = '${ID.purchaseB}'`, pass: SERVER },
  },
  account_entitlements: {
    // What Ben owns.
    select: {
      sql: `select 1 from public.account_entitlements where user_id = '${ID.b}'`,
      pass: ['b', 'admin', 'service'],
    },
    insert: {
      sql: (me) =>
        `insert into public.account_entitlements (user_id, entitlement) values ('${me}', 'no_ads')`,
      pass: SERVER,
    },
    update: {
      sql: `update public.account_entitlements set revoked_at = now() where user_id = '${ID.b}'`,
      pass: SERVER,
    },
    delete: {
      sql: `delete from public.account_entitlements where user_id = '${ID.b}'`,
      pass: SERVER,
    },
  },
  stripe_customers: serverOnly(
    'stripe_customers',
    `user_id = '${ID.b}'`,
    (me) =>
      `insert into public.stripe_customers (user_id, stripe_customer_id) values ('${me}', 'cus_TESTnew')`,
    `stripe_customer_id = 'cus_TESTchanged'`,
  ),
  stripe_events: serverOnly(
    'stripe_events',
    `id = 'evt_TESTseed0001'`,
    `insert into public.stripe_events (id, type, object_id) values ('evt_TESTnew', 'x', 'cs_test_new')`,
    'processed_at = now()',
  ),
};

/** The views in `public` and who may read them (tested in rules.test.ts). */
export const VIEWS = ['leaderboard_rows', 'public_farms', 'public_profiles'] as const;

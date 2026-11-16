import 'server-only';
import { REPORT_REASONS } from '../community/text';
import type { SqlClient, SqlRunner } from '../db/sql';
import { AdminError } from './errors';
import { activeAdmin } from './gate';
import { SUSPEND_DAYS } from './info';
import { audit, isUuid, userAction, type UserActionDeps } from './store';

/**
 * Moderation (PRD 9.9 and 11.3): the queue of open reports and what a moderator can do with each.
 *
 * Every action is ONE transaction: the content change, the report's resolution, the
 * `moderation_actions` row, the notice to the author and the admin audit row. If any of them fails
 * (the audit write included) nothing changes. The browser sends only a report id and an action.
 * What the report is about, and who wrote it, is read from the database inside the transaction.
 */

export const QUEUE_PAGE = 10;

const iso = (v: unknown): string => new Date(v as string).toISOString();

export type TargetType = 'post' | 'comment' | 'profile' | 'group';

export interface AuthorHistory {
  userId: string;
  username: string | null;
  /** Moderator actions already taken on this account, newest first (at most five). */
  actions: { action: string; at: string }[];
  actionCount: number;
  removedPosts: number;
  removedComments: number;
  /** Other reports still open about this author's content or profile. */
  openAboutAuthor: number;
}

export interface QueueItem {
  id: string;
  createdAt: string;
  reason: string;
  reasonLabel: string;
  details: string | null;
  /** Null when the report came from the word filter. */
  reporter: string | null;
  targetType: TargetType;
  targetId: string;
  /** Open reports on this same target, this one included. */
  openOnTarget: number;
  /** Plain text of the content as it stands now. */
  content: {
    gone: boolean;
    removed: boolean;
    title: string;
    text: string | null;
    context: string | null;
  };
  author: AuthorHistory | null;
  /** The actions that make sense for this target. */
  can: { remove: boolean; account: boolean };
}

export interface Queue {
  items: QueueItem[];
  total: number;
  page: number;
  hasNext: boolean;
}

const reasonLabel = (id: string): string => REPORT_REASONS.find((r) => r.id === id)?.label ?? id;
const reasonWords = (id: string): string => reasonLabel(id).toLowerCase();
const clip = (s: string | null, n: number): string | null =>
  s === null ? null : s.length > n ? `${s.slice(0, n)}...` : s;

interface Target {
  gone: boolean;
  removed: boolean;
  title: string;
  text: string | null;
  context: string | null;
  authorId: string | null;
}

/** The content a report is about, as it stands now, and who owns it. */
async function readTarget(tx: SqlRunner, type: TargetType, id: string): Promise<Target> {
  const gone: Target = {
    gone: true,
    removed: false,
    title: 'This content no longer exists.',
    text: null,
    context: null,
    authorId: null,
  };
  if (type === 'post') {
    const r = await tx.query<{
      body: string | null;
      kind: string;
      author_id: string;
      username: string;
      removed_at: string | null;
      group_name: string | null;
    }>(
      `select p.body, p.kind, p.author_id, a.username, p.removed_at, g.name as group_name
         from public.posts p
         join public.profiles a on a.user_id = p.author_id
         left join public.groups g on g.id = p.group_id
        where p.id = $1`,
      [id],
    );
    const p = r.rows[0];
    if (!p) return gone;
    return {
      gone: false,
      removed: p.removed_at !== null,
      title: `Post by @${p.username}`,
      text: p.body ?? `(a ${p.kind.replace(/_/g, ' ')} card with no text)`,
      context: p.group_name ? `In the group ${p.group_name}.` : null,
      authorId: p.author_id,
    };
  }
  if (type === 'comment') {
    const r = await tx.query<{
      body: string;
      author_id: string;
      username: string;
      removed_at: string | null;
      post_body: string | null;
      post_author: string;
    }>(
      `select c.body, c.author_id, a.username, c.removed_at, p.body as post_body, pa.username as post_author
         from public.comments c
         join public.profiles a on a.user_id = c.author_id
         join public.posts p on p.id = c.post_id
         join public.profiles pa on pa.user_id = p.author_id
        where c.id = $1`,
      [id],
    );
    const c = r.rows[0];
    if (!c) return gone;
    return {
      gone: false,
      removed: c.removed_at !== null,
      title: `Comment by @${c.username}`,
      text: c.body,
      context: `On a post by @${c.post_author}: ${clip(c.post_body, 200) ?? '(no text)'}`,
      authorId: c.author_id,
    };
  }
  if (type === 'profile') {
    const r = await tx.query<{
      username: string;
      display_name: string | null;
      bio: string | null;
      town: string | null;
    }>('select username, display_name, bio, town from public.profiles where user_id = $1', [id]);
    const p = r.rows[0];
    if (!p) return gone;
    const parts = [
      p.display_name ? `Name: ${p.display_name}` : null,
      p.bio ? `Bio: ${p.bio}` : null,
      p.town ? `Town: ${p.town}` : null,
    ].filter((x): x is string => x !== null);
    return {
      gone: false,
      removed: false,
      title: `Profile of @${p.username}`,
      text: parts.length ? parts.join('\n') : '(no name, bio or town)',
      context: null,
      authorId: id,
    };
  }
  const r = await tx.query<{
    name: string;
    description: string | null;
    owner_id: string | null;
    owner: string | null;
  }>(
    `select g.name, g.description, g.owner_id, o.username as owner
       from public.groups g left join public.profiles o on o.user_id = g.owner_id
      where g.id = $1`,
    [id],
  );
  const g = r.rows[0];
  if (!g) return gone;
  return {
    gone: false,
    removed: false,
    title: `Group ${g.name}`,
    text: g.description ?? '(no description)',
    context: g.owner ? `Owner: @${g.owner}` : 'This group has no owner.',
    authorId: g.owner_id,
  };
}

async function history(tx: SqlRunner, userId: string): Promise<AuthorHistory> {
  const [who, acts, removed, open] = await Promise.all([
    tx.query<{ username: string }>('select username from public.profiles where user_id = $1', [
      userId,
    ]),
    tx.query<{ action: string; created_at: string; n: number }>(
      `select action, created_at, count(*) over ()::int as n
         from public.moderation_actions
        where user_id = $1 and action <> 'note'
        order by created_at desc, id limit 5`,
      [userId],
    ),
    tx.query<{ posts: number; comments: number }>(
      `select (select count(*) from public.posts where author_id = $1 and removed_at is not null)::int as posts,
              (select count(*) from public.comments where author_id = $1 and removed_at is not null)::int as comments`,
      [userId],
    ),
    tx.query<{ n: number }>(
      `select count(*)::int as n from public.reports r
        where r.status = 'open' and (
          (r.target_type = 'profile' and r.target_id = $1)
          or (r.target_type = 'post' and r.target_id in (select id from public.posts where author_id = $1))
          or (r.target_type = 'comment' and r.target_id in (select id from public.comments where author_id = $1)))`,
      [userId],
    ),
  ]);
  return {
    userId,
    username: who.rows[0]?.username ?? null,
    actions: acts.rows.map((a) => ({ action: a.action, at: iso(a.created_at) })),
    actionCount: acts.rows[0]?.n ?? 0,
    removedPosts: removed.rows[0]?.posts ?? 0,
    removedComments: removed.rows[0]?.comments ?? 0,
    openAboutAuthor: open.rows[0]?.n ?? 0,
  };
}

/** How many reports are open: the count on the Moderation item in the admin menu. */
export async function openReportCount(sql: SqlRunner): Promise<number> {
  const r = await sql.query<{ n: number }>(
    `select count(*)::int as n from public.reports where status = 'open'`,
  );
  return Number(r.rows[0]?.n ?? 0);
}

/** Open reports, oldest first, with the content, its context and the author's history. */
export async function listQueue(sql: SqlClient, pageNo: number): Promise<Queue> {
  const page = Number.isInteger(pageNo) && pageNo >= 1 && pageNo <= 100_000 ? pageNo : 1;
  const rows = await sql.query<{
    id: string;
    created_at: string;
    reason: string;
    details: string | null;
    reporter: string | null;
    target_type: TargetType;
    target_id: string;
    on_target: number;
    total: number;
  }>(
    `select r.id, r.created_at, r.reason, r.details, rp.username as reporter,
            r.target_type, r.target_id,
            (select count(*)::int from public.reports o
              where o.status = 'open' and o.target_type = r.target_type and o.target_id = r.target_id) as on_target,
            (select count(*)::int from public.reports where status = 'open') as total
       from public.reports r
       left join public.profiles rp on rp.user_id = r.reporter_id
      where r.status = 'open'
      order by r.created_at, r.id
      limit $1 offset $2`,
    [QUEUE_PAGE + 1, (page - 1) * QUEUE_PAGE],
  );
  const shown = rows.rows.slice(0, QUEUE_PAGE);
  const items: QueueItem[] = [];
  for (const r of shown) {
    const t = await readTarget(sql, r.target_type, r.target_id);
    items.push({
      id: r.id,
      createdAt: iso(r.created_at),
      reason: r.reason,
      reasonLabel: reasonLabel(r.reason),
      details: r.details,
      reporter: r.reporter,
      targetType: r.target_type,
      targetId: r.target_id,
      openOnTarget: r.on_target,
      content: {
        gone: t.gone,
        removed: t.removed,
        title: t.title,
        text: t.text,
        context: t.context,
      },
      author: t.authorId ? await history(sql, t.authorId) : null,
      can: { remove: r.target_type !== 'group' && !t.gone, account: t.authorId !== null },
    });
  }
  return {
    items,
    total: shown.length ? (rows.rows[0]?.total ?? 0) : 0,
    page,
    hasNext: rows.rows.length > QUEUE_PAGE,
  };
}

// ---------------------------------------------------------------- acting on a report

export type ReportAction =
  | { action: 'remove' }
  | { action: 'keep' }
  | { action: 'warn' }
  | { action: 'suspend'; days: number }
  | { action: 'ban' };

export function parseReportAction(body: Record<string, unknown>): ReportAction {
  switch (body.action) {
    case 'remove':
    case 'keep':
    case 'warn':
    case 'ban':
      return { action: body.action };
    case 'suspend':
      if (!SUSPEND_DAYS.some((d) => d === body.days)) {
        throw new AdminError(400, 'Choose one of the suspension lengths on the list.');
      }
      return { action: 'suspend', days: body.days as number };
    default:
      throw new AdminError(400, 'That is not something a moderator can do here.');
  }
}

/** The audit action name for each action: a fixed set, no free text. */
export const AUDIT_NAME = {
  remove: 'report_remove',
  keep: 'report_dismiss',
  warn: 'report_warn',
  suspend: 'report_suspend',
  ban: 'report_ban',
} as const;

const KINDS: Record<TargetType, string> = {
  post: 'post',
  comment: 'comment',
  profile: 'profile',
  group: 'group',
};

function notice(
  act: ReportAction,
  type: TargetType,
  reason: string,
): { title: string; body: string } | null {
  const given = `Reason given: ${reasonWords(reason)}.`;
  switch (act.action) {
    case 'remove':
      if (type === 'profile') {
        return {
          title: 'A moderator cleared your bio and display name',
          body: `A moderator cleared your bio and display name. ${given}`,
        };
      }
      return {
        title: `A moderator removed your ${KINDS[type]}`,
        body: `A moderator removed your ${KINDS[type]}. ${given}`,
      };
    case 'warn':
      return {
        title: 'A moderator has sent you a warning',
        body: `A moderator reviewed a report about your ${KINDS[type]} and is warning you. ${given}`,
      };
    case 'suspend':
      return {
        title: 'Your account is suspended',
        body: `A moderator suspended your account for ${act.days} ${act.days === 1 ? 'day' : 'days'}. ${given}`,
      };
    case 'ban':
      return {
        title: 'Your account is banned',
        body: `A moderator banned your account. ${given}`,
      };
    case 'keep':
      return null;
  }
}

const DB_ACTION = {
  remove: 'removed',
  keep: 'kept',
  warn: 'warned',
  suspend: 'suspended',
  ban: 'banned',
} as const;

/**
 * One action on one open report. Rules, all checked on the server inside the transaction:
 * - Only an admin in good standing, looked up again here.
 * - The report must still be open. What it is about is read from the report row, not from the browser.
 * - Every open report on the same target is resolved with it.
 * - The author is told plainly. A dismissal tells nobody.
 * - The audit row is written in the same transaction. If that fails nothing changes.
 */
export async function actOnReport(
  sql: SqlClient,
  adminId: string,
  reportId: unknown,
  act: ReportAction,
  deps: UserActionDeps = {},
): Promise<{ note?: string }> {
  if (!isUuid(reportId)) throw new AdminError(400, 'That is not a report id.');
  let note: string | undefined;
  await sql.transaction(async (tx) => {
    if (!(await activeAdmin(tx, adminId, true))) {
      throw new AdminError(403, 'You can not do that now.');
    }
    const rep = await tx.query<{
      target_type: TargetType;
      target_id: string;
      reason: string;
      status: string;
    }>(
      'select target_type, target_id, reason, status from public.reports where id = $1 for update',
      [reportId],
    );
    const r = rep.rows[0];
    if (!r) throw new AdminError(404, 'That report was not found.');
    if (r.status !== 'open') throw new AdminError(409, 'That report has been dealt with already.');
    const target = await readTarget(tx, r.target_type, r.target_id);
    const authorId = target.authorId;
    if (act.action === 'remove') {
      if (r.target_type === 'group') {
        throw new AdminError(
          409,
          'A group can not be removed here. Keep the report or warn the owner.',
        );
      }
      if (target.gone) throw new AdminError(409, 'That content no longer exists.');
    }
    if (act.action !== 'keep' && !authorId) {
      throw new AdminError(409, 'There is no account behind that content to act on.');
    }
    // Content first: a refusal here leaves everything else untouched.
    if (act.action === 'remove') {
      try {
        if (r.target_type === 'post' || r.target_type === 'comment') {
          const table = r.target_type === 'post' ? 'posts' : 'comments';
          await tx.query(
            `update public.${table} set removed_at = coalesce(removed_at, now()),
                   removed_by = coalesce(removed_by, $2) where id = $1`,
            [r.target_id, adminId],
          );
        } else {
          await tx.query(
            'update public.profiles set bio = null, display_name = null where user_id = $1',
            [r.target_id],
          );
        }
      } catch (e) {
        // The database checks the word list on every change to a row, so text that holds a word
        // blocked since it was written can not be saved in any way, a removal included.
        if ((e as { hint?: string }).hint === 'word_filter') {
          throw new AdminError(
            409,
            'That text holds a word that is blocked now, so the database will not save any change to it. Take the word off the Word filter list, remove the content, then add the word back. Nothing was changed.',
          );
        }
        throw e;
      }
    }
    // Suspending and banning go through the Users page code, joined to this transaction.
    if (act.action === 'suspend' || act.action === 'ban') {
      const joined: SqlClient = { query: (t, p) => tx.query(t, p), transaction: (fn) => fn(tx) };
      const out = await userAction(
        joined,
        adminId,
        authorId,
        act.action === 'suspend' ? { action: 'suspend', days: act.days } : { action: 'ban' },
        deps,
      );
      note = out.note;
    }
    // The open reports on this target are all resolved by this one decision.
    const closed = await tx.query(
      `update public.reports
          set status = $4, moderator_id = $3, action = $5, resolved_at = now()
        where target_type = $1 and target_id = $2 and status = 'open'`,
      [
        r.target_type,
        r.target_id,
        adminId,
        act.action === 'keep' ? 'dismissed' : 'actioned',
        DB_ACTION[act.action],
      ],
    );
    if (act.action === 'remove' || act.action === 'warn') {
      await tx.query(
        `insert into public.moderation_actions (user_id, moderator_id, report_id, action, reason)
         values ($1, $2, $3, $4, $5)`,
        [authorId, adminId, reportId, DB_ACTION[act.action], r.reason],
      );
    } else if (act.action === 'suspend' || act.action === 'ban') {
      // `userAction` wrote the row in this transaction. Tie it to the report.
      await tx.query(
        `update public.moderation_actions set report_id = $1, reason = $5
          where user_id = $2 and moderator_id = $3 and action = $4
            and report_id is null and created_at = now()`,
        [reportId, authorId, adminId, DB_ACTION[act.action], r.reason],
      );
    }
    const say = notice(act, r.target_type, r.reason);
    if (say && authorId) {
      await tx.query(
        `insert into public.notifications (user_id, kind, title, body) values ($1, 'system', $2, $3)`,
        [authorId, say.title, say.body],
      );
    }
    await audit(tx, adminId, AUDIT_NAME[act.action], 'report', reportId, {
      count: closed.rowCount,
    });
  });
  return note ? { note } : {};
}

// ---------------------------------------------------------------- the word filter

export interface WordRow {
  id: string;
  term: string;
  kind: 'block' | 'flag';
  createdAt: string;
}

export async function listWords(sql: SqlClient): Promise<WordRow[]> {
  const r = await sql.query<{
    id: string;
    term: string;
    kind: 'block' | 'flag';
    created_at: string;
  }>('select id, term, kind, created_at from public.word_filter order by term');
  return r.rows.map((w) => ({
    id: w.id,
    term: w.term,
    kind: w.kind,
    createdAt: iso(w.created_at),
  }));
}

export const WORD_SHAPE = /^[a-z0-9]+( [a-z0-9]+)*$/;

/** A term as the table wants it: lower-case letters, digits and single spaces, 2 to 60 characters. */
export function parseTerm(raw: unknown): string {
  if (typeof raw !== 'string') throw new AdminError(400, 'Type a word or phrase.');
  const term = raw.trim().toLowerCase();
  if (term.length < 2 || term.length > 60) {
    throw new AdminError(400, 'A word or phrase must be 2 to 60 characters.');
  }
  if (!WORD_SHAPE.test(term)) {
    throw new AdminError(
      400,
      'Use letters, numbers and single spaces only. No other marks, and no space at the start or end.',
    );
  }
  return term;
}

export async function addWord(
  sql: SqlClient,
  adminId: string,
  rawTerm: unknown,
  kind: unknown,
): Promise<{ id: string }> {
  const term = parseTerm(rawTerm);
  if (kind !== 'block' && kind !== 'flag') {
    throw new AdminError(400, 'Choose block or flag.');
  }
  let id = '';
  await sql.transaction(async (tx) => {
    if (!(await activeAdmin(tx, adminId, true))) {
      throw new AdminError(403, 'You can not do that now.');
    }
    const r = await tx.query<{ id: string }>(
      `insert into public.word_filter (term, kind, created_by) values ($1, $2, $3)
       on conflict (term) do nothing returning id`,
      [term, kind, adminId],
    );
    if (!r.rows[0]) throw new AdminError(409, 'That word or phrase is on the list already.');
    id = r.rows[0].id;
    await audit(tx, adminId, 'word_add', 'word_filter', id);
  });
  return { id };
}

export async function removeWord(sql: SqlClient, adminId: string, id: unknown): Promise<void> {
  if (!isUuid(id)) throw new AdminError(400, 'That is not a word id.');
  await sql.transaction(async (tx) => {
    if (!(await activeAdmin(tx, adminId, true))) {
      throw new AdminError(403, 'You can not do that now.');
    }
    const r = await tx.query('delete from public.word_filter where id = $1', [id]);
    if (r.rowCount === 0) throw new AdminError(404, 'That word is not on the list.');
    await audit(tx, adminId, 'word_remove', 'word_filter', id);
  });
}

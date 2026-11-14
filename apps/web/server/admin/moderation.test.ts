import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { setAuthDeps } from '../auth/deps';
import type { SqlClient, SqlRunner } from '../db/sql';
import {
  communityKit,
  cookieList,
  type Person,
  type RouteModule,
} from '../test-support/communityKit';

/**
 * Moderation (PRD 9.9 and 11.3): the report queue, the actions on a report, the word filter and
 * the report rate limit. The security tests come first: who may reach the routes, what the browser
 * is trusted with, and that a failed audit write changes nothing.
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
  usePathname: () => '/admin/moderation',
}));

const kit = communityKit(['community', 'feed_posts']);
const MOD = '/api/admin/moderation';
const WORDS = '/api/admin/words';

let mods: RouteModule;
let words: RouteModule;
async function load() {
  mods ??= (await import('@/app/api/admin/moderation/route')) as RouteModule;
  words ??= (await import('@/app/api/admin/words/route')) as RouteModule;
}
const act = async (who: Person | null, body: unknown, headers?: Record<string, string>) => {
  await load();
  return kit.call(mods, MOD, 'POST', who, body, { headers });
};
const word = async (who: Person | null, body: unknown, headers?: Record<string, string>) => {
  await load();
  return kit.call(words, WORDS, 'POST', who, body, { headers });
};
const errorOf = async (r: Response) => ((await r.json()) as { error: string }).error;

function failingAudit(sql: SqlClient): SqlClient {
  const wrap = (tx: SqlRunner): SqlRunner => ({
    query(text, params) {
      if (/insert into public\.admin_audit_log/.test(text))
        return Promise.reject(new Error('audit write failed'));
      return tx.query(text, params);
    },
  });
  return {
    query: (t, p) => wrap(sql).query(t, p),
    transaction: (fn) => sql.transaction((tx) => fn(wrap(tx))),
  };
}

async function postBy(who: Person, body: string): Promise<string> {
  const r = await kit.db.query<{ id: string }>(
    'insert into public.posts (author_id, body) values ($1, $2) returning id',
    [who.id, body],
  );
  return r.rows[0]!.id;
}
async function commentBy(who: Person, post: string, body: string): Promise<string> {
  const r = await kit.db.query<{ id: string }>(
    'insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id',
    [post, who.id, body],
  );
  return r.rows[0]!.id;
}
async function reportOn(
  type: 'post' | 'comment' | 'profile' | 'group',
  target: string,
  by: Person | null,
  reason = 'spam',
): Promise<string> {
  const r = await kit.db.query<{ id: string }>(
    `insert into public.reports (reporter_id, target_type, target_id, reason, details)
     values ($1, $2, $3, $4, 'it is spam') returning id`,
    [by?.id ?? null, type, target, reason],
  );
  return r.rows[0]!.id;
}
const reportRow = async (id: string) =>
  (
    await kit.db.query<{
      status: string;
      action: string | null;
      moderator_id: string | null;
      resolved_at: string | null;
    }>('select status, action, moderator_id, resolved_at from public.reports where id = $1', [id])
  ).rows[0]!;
const auditRows = async () =>
  (
    await kit.db.query<{ action: string; target_type: string; target_id: string; details: object }>(
      'select action, target_type, target_id, details from public.admin_audit_log order by id',
    )
  ).rows;
const notesFor = async (who: Person) =>
  (
    await kit.db.query<{ kind: string; title: string; body: string }>(
      'select kind, title, body from public.notifications where user_id = $1 order by created_at',
      [who.id],
    )
  ).rows;
const digest = async () =>
  JSON.stringify(
    (
      await kit.db.query(
        `select (select jsonb_agg(to_jsonb(t) order by id) from public.reports t) a,
                (select jsonb_agg(to_jsonb(t) order by id) from public.posts t) b,
                (select jsonb_agg(to_jsonb(t) order by id) from public.comments t) c,
                (select jsonb_agg(to_jsonb(t) order by user_id) from public.profiles t) d,
                (select jsonb_agg(to_jsonb(t) order by user_id) from public.account_status t) e,
                (select count(*) from public.moderation_actions) f,
                (select count(*) from public.notifications) g,
                (select count(*) from public.word_filter) h,
                (select count(*) from public.admin_audit_log) i`,
      )
    ).rows,
  );

/** An admin, an author with a post, and a reporter, with one open report on the post. */
async function scene() {
  const admin = await kit.person('adm', { role: 'admin' });
  const pat = await kit.person('pat');
  const rae = await kit.person('rae');
  const post = await postBy(pat, 'Buy my cheap thing now');
  const report = await reportOn('post', post, rae);
  return { admin, pat, rae, post, report };
}

// ---------------------------------------------------------------- 1. who may reach the routes

describe('1. only an admin in good standing reaches moderation', () => {
  it('gives every other visitor the plain 404 from both routes and changes nothing', async () => {
    const s = await scene();
    const mod = await kit.person('modder', { role: 'moderator' });
    const kid = await kit.person('kiddo', { ageYears: 15 });
    const banned = await kit.person('banned', { role: 'admin', banned: true });
    const before = await digest();
    for (const who of [null, s.pat, mod, kid, banned]) {
      const name = who?.username ?? 'nobody';
      const a = await act(who, { reportId: s.report, action: 'remove' });
      expect(a.status, `moderation as ${name}`).toBe(404);
      expect(a.headers.get('x-robots-tag')).toBeNull();
      expect(await errorOf(a)).toBe('Not found.');
      const w = await word(who, { action: 'add', term: 'badword', kind: 'block' });
      expect(w.status, `words as ${name}`).toBe(404);
    }
    expect(await digest()).toBe(before);
  });

  it('answers 404 with no database keys', async () => {
    const s = await scene();
    setAuthDeps(null);
    expect((await act(s.admin, { reportId: s.report, action: 'keep' })).status).toBe(404);
    expect((await word(s.admin, { action: 'add', term: 'badword', kind: 'block' })).status).toBe(
      404,
    );
  });

  it('refuses a cross-site or non-JSON post from an admin', async () => {
    const s = await scene();
    const before = await digest();
    for (const headers of <Record<string, string>[]>[
      { origin: 'https://evil.example' },
      { 'sec-fetch-site': 'cross-site' },
      { 'content-type': 'text/plain' },
    ]) {
      expect((await act(s.admin, { reportId: s.report, action: 'remove' }, headers)).status).toBe(
        403,
      );
      expect(
        (await word(s.admin, { action: 'add', term: 'badword', kind: 'block' }, headers)).status,
      ).toBe(403);
    }
    expect(await digest()).toBe(before);
  });

  it('exports POST only', async () => {
    await load();
    expect(mods.GET).toBeUndefined();
    expect(words.GET).toBeUndefined();
  });

  it('a failed audit write rolls every action back and answers a plain 500', async () => {
    const s = await scene();
    const comment = await commentBy(s.pat, s.post, 'a comment');
    const cr = await reportOn('comment', comment, s.rae);
    const pr = await reportOn('profile', s.pat.id, s.rae);
    const gr = await reportOn(
      'group',
      (
        await kit.db.query<{ id: string }>(
          `insert into public.groups (name, owner_id) values ('Hill group', $1) returning id`,
          [s.pat.id],
        )
      ).rows[0]!.id,
      s.rae,
    );
    await kit.db.query('update public.profiles set bio = $2 where user_id = $1', [
      s.pat.id,
      'my bio',
    ]);
    const before = await digest();
    setAuthDeps({ ...kit.deps, sql: failingAudit(kit.deps.sql) });
    const cases: [string, Record<string, unknown>][] = [
      [s.report, { action: 'remove' }],
      [s.report, { action: 'keep' }],
      [s.report, { action: 'warn' }],
      [s.report, { action: 'suspend', days: 3 }],
      [s.report, { action: 'ban' }],
      [cr, { action: 'remove' }],
      [pr, { action: 'remove' }],
      [gr, { action: 'warn' }],
    ];
    for (const [id, body] of cases) {
      const res = await act(s.admin, { reportId: id, ...body });
      expect(res.status, JSON.stringify(body)).toBe(500);
      expect(await res.text()).not.toMatch(/audit write failed/);
    }
    expect(await digest()).toBe(before);
    const word1 = await word(s.admin, { action: 'add', term: 'badword', kind: 'block' });
    expect(word1.status).toBe(500);
    expect(await digest()).toBe(before);
  });

  it('a failed audit write leaves a word in place', async () => {
    const s = await scene();
    const w = await kit.db.query<{ id: string }>(
      `insert into public.word_filter (term, kind) values ('keepme', 'block') returning id`,
    );
    const before = await digest();
    setAuthDeps({ ...kit.deps, sql: failingAudit(kit.deps.sql) });
    expect((await word(s.admin, { action: 'remove', id: w.rows[0]!.id })).status).toBe(500);
    expect(await digest()).toBe(before);
  });
});

// ---------------------------------------------------------------- 2. what the browser may say

describe('2. the browser is trusted with a report id and an action only', () => {
  it('acts on what the report says it is about, not on ids in the body', async () => {
    const s = await scene();
    const other = await postBy(s.rae, 'a different post');
    const res = await act(s.admin, {
      reportId: s.report,
      action: 'remove',
      targetId: other,
      targetType: 'profile',
      userId: s.rae.id,
      id: other,
    });
    expect(res.status).toBe(200);
    const rows = await kit.db.query<{ id: string; removed_at: string | null }>(
      'select id, removed_at from public.posts',
    );
    expect(rows.rows.find((r) => r.id === s.post)!.removed_at).not.toBeNull();
    expect(rows.rows.find((r) => r.id === other)!.removed_at).toBeNull();
    expect(await notesFor(s.rae)).toHaveLength(0);
  });

  it('refuses a bad id, an unknown report, a bad action and a bad suspension length', async () => {
    const s = await scene();
    const before = await digest();
    expect((await act(s.admin, { reportId: 'nope', action: 'keep' })).status).toBe(400);
    expect((await act(s.admin, { action: 'keep' })).status).toBe(400);
    expect(
      (await act(s.admin, { reportId: '11111111-1111-4111-8111-111111111111', action: 'keep' }))
        .status,
    ).toBe(404);
    expect((await act(s.admin, { reportId: s.report, action: 'delete_everything' })).status).toBe(
      400,
    );
    expect((await act(s.admin, { reportId: s.report, action: 'suspend', days: 99 })).status).toBe(
      400,
    );
    expect((await act(s.admin, { reportId: s.report, action: 'suspend' })).status).toBe(400);
    expect(await digest()).toBe(before);
  });

  it('a report that has been dealt with can not be acted on again', async () => {
    const s = await scene();
    expect((await act(s.admin, { reportId: s.report, action: 'keep' })).status).toBe(200);
    const again = await act(s.admin, { reportId: s.report, action: 'ban' });
    expect(again.status).toBe(409);
    expect(await errorOf(again)).toMatch(/already/);
    const st = await kit.db.query(
      'select 1 from public.account_status where banned_at is not null',
    );
    expect(st.rows).toHaveLength(0);
  });

  it('a moderator who is not an admin can not act even with a real report id', async () => {
    const s = await scene();
    const mod = await kit.person('modder', { role: 'moderator' });
    expect((await act(mod, { reportId: s.report, action: 'remove' })).status).toBe(404);
    expect((await reportRow(s.report)).status).toBe('open');
  });
});

// ---------------------------------------------------------------- 3. each action

describe('3. each action resolves the report, is audited and tells the author', () => {
  it('remove a post: hides it, resolves the report, records, audits and notifies', async () => {
    const s = await scene();
    const res = await act(s.admin, { reportId: s.report, action: 'remove' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const p = await kit.db.query<{ removed_at: string | null; removed_by: string | null }>(
      'select removed_at, removed_by from public.posts where id = $1',
      [s.post],
    );
    expect(p.rows[0]!.removed_at).not.toBeNull();
    expect(p.rows[0]!.removed_by).toBe(s.admin.id);
    expect(await reportRow(s.report)).toMatchObject({
      status: 'actioned',
      action: 'removed',
      moderator_id: s.admin.id,
    });
    expect((await reportRow(s.report)).resolved_at).not.toBeNull();
    const m = await kit.db.query<{ action: string; user_id: string; report_id: string }>(
      'select action, user_id, report_id from public.moderation_actions',
    );
    expect(m.rows).toEqual([{ action: 'removed', user_id: s.pat.id, report_id: s.report }]);
    expect(await auditRows()).toEqual([
      {
        action: 'report_remove',
        target_type: 'report',
        target_id: s.report,
        details: { count: 1 },
      },
    ]);
    const n = await notesFor(s.pat);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ kind: 'system' });
    expect(n[0]!.body).toBe('A moderator removed your post. Reason given: spam.');
    expect(await notesFor(s.rae)).toHaveLength(0);
  });

  it('remove a comment', async () => {
    const s = await scene();
    const c = await commentBy(s.pat, s.post, 'rude comment');
    const r = await reportOn('comment', c, s.rae, 'abuse');
    expect((await act(s.admin, { reportId: r, action: 'remove' })).status).toBe(200);
    const row = await kit.db.query<{ removed_at: string | null; removed_by: string }>(
      'select removed_at, removed_by from public.comments where id = $1',
      [c],
    );
    expect(row.rows[0]!.removed_at).not.toBeNull();
    expect(row.rows[0]!.removed_by).toBe(s.admin.id);
    expect((await reportRow(r)).status).toBe('actioned');
    expect((await notesFor(s.pat))[0]!.body).toBe(
      'A moderator removed your comment. Reason given: abuse or bullying.',
    );
    // The post itself is untouched.
    const p = await kit.db.query(
      'select 1 from public.posts where id = $1 and removed_at is null',
      [s.post],
    );
    expect(p.rows).toHaveLength(1);
  });

  it('remove a profile clears the bio and display name and keeps the account', async () => {
    const s = await scene();
    await kit.db.query(
      `update public.profiles set bio = 'my bio', display_name = 'Pat Smith' where user_id = $1`,
      [s.pat.id],
    );
    const r = await reportOn('profile', s.pat.id, s.rae, 'impersonation');
    expect((await act(s.admin, { reportId: r, action: 'remove' })).status).toBe(200);
    const p = await kit.db.query<{
      bio: string | null;
      display_name: string | null;
      username: string;
    }>('select bio, display_name, username from public.profiles where user_id = $1', [s.pat.id]);
    expect(p.rows[0]).toEqual({ bio: null, display_name: null, username: 'pat' });
    expect((await notesFor(s.pat))[0]!.body).toMatch(
      /^A moderator cleared your bio and display name\./,
    );
  });

  it('a group has no remove: it is refused and the report stays open', async () => {
    const s = await scene();
    const g = await kit.db.query<{ id: string }>(
      `insert into public.groups (name, owner_id) values ('Hill group', $1) returning id`,
      [s.pat.id],
    );
    const r = await reportOn('group', g.rows[0]!.id, s.rae);
    const res = await act(s.admin, { reportId: r, action: 'remove' });
    expect(res.status).toBe(409);
    expect((await reportRow(r)).status).toBe('open');
    // Warn works on a group and goes to its owner.
    expect((await act(s.admin, { reportId: r, action: 'warn' })).status).toBe(200);
    expect((await notesFor(s.pat))[0]!.body).toMatch(/your group/);
    expect((await reportRow(r)).action).toBe('warned');
  });

  it('keep dismisses the report, writes no action row, tells nobody, and is audited as a dismissal', async () => {
    const s = await scene();
    expect((await act(s.admin, { reportId: s.report, action: 'keep' })).status).toBe(200);
    expect(await reportRow(s.report)).toMatchObject({
      status: 'dismissed',
      action: 'kept',
      moderator_id: s.admin.id,
    });
    const p = await kit.db.query(
      'select 1 from public.posts where id = $1 and removed_at is null',
      [s.post],
    );
    expect(p.rows).toHaveLength(1);
    expect((await kit.db.query('select 1 from public.moderation_actions')).rows).toHaveLength(0);
    expect(await notesFor(s.pat)).toHaveLength(0);
    expect((await auditRows()).map((a) => a.action)).toEqual(['report_dismiss']);
  });

  it('a report from the word filter (no reporter) can be kept', async () => {
    const s = await scene();
    const r = await reportOn('post', s.post, null, 'other');
    expect((await act(s.admin, { reportId: r, action: 'keep' })).status).toBe(200);
    expect((await reportRow(r)).status).toBe('dismissed');
  });

  it('warn leaves the content, records a warning, audits and notifies', async () => {
    const s = await scene();
    expect((await act(s.admin, { reportId: s.report, action: 'warn' })).status).toBe(200);
    expect(await reportRow(s.report)).toMatchObject({ status: 'actioned', action: 'warned' });
    const p = await kit.db.query(
      'select 1 from public.posts where id = $1 and removed_at is null',
      [s.post],
    );
    expect(p.rows).toHaveLength(1);
    const m = await kit.db.query<{ action: string; report_id: string }>(
      'select action, report_id from public.moderation_actions',
    );
    expect(m.rows).toEqual([{ action: 'warned', report_id: s.report }]);
    expect((await auditRows()).map((a) => a.action)).toEqual(['report_warn']);
    expect((await notesFor(s.pat))[0]!.title).toBe('A moderator has sent you a warning');
  });

  it('suspend uses the Users page code: ends sessions, writes both audit rows, ties the action to the report', async () => {
    const s = await scene();
    const res = await act(s.admin, { reportId: s.report, action: 'suspend', days: 7 });
    expect(res.status).toBe(200);
    const st = await kit.db.query<{ suspended_until: string | null }>(
      'select suspended_until from public.account_status where user_id = $1',
      [s.pat.id],
    );
    const days = (new Date(st.rows[0]!.suspended_until!).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
    expect(await reportRow(s.report)).toMatchObject({ status: 'actioned', action: 'suspended' });
    const m = await kit.db.query<{
      action: string;
      report_id: string | null;
      until: string | null;
    }>('select action, report_id, until from public.moderation_actions');
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]).toMatchObject({ action: 'suspended', report_id: s.report });
    expect(m.rows[0]!.until).not.toBeNull();
    expect((await auditRows()).map((a) => a.action).sort()).toEqual([
      'report_suspend',
      'user_suspend',
    ]);
    expect((await notesFor(s.pat))[0]!.body).toMatch(
      /^A moderator suspended your account for 7 days\. Reason given: spam\./,
    );
  });

  it('ban uses the Users page code and ties the action to the report', async () => {
    const s = await scene();
    expect((await act(s.admin, { reportId: s.report, action: 'ban' })).status).toBe(200);
    const st = await kit.db.query<{ banned_at: string | null }>(
      'select banned_at from public.account_status where user_id = $1',
      [s.pat.id],
    );
    expect(st.rows[0]!.banned_at).not.toBeNull();
    expect(await reportRow(s.report)).toMatchObject({ status: 'actioned', action: 'banned' });
    const m = await kit.db.query<{ action: string; report_id: string | null }>(
      'select action, report_id from public.moderation_actions',
    );
    expect(m.rows).toEqual([{ action: 'banned', report_id: s.report }]);
    expect((await auditRows()).map((a) => a.action).sort()).toEqual(['report_ban', 'user_ban']);
    expect((await notesFor(s.pat))[0]!.title).toBe('Your account is banned');
  });

  it('an admin can not suspend or ban their own account through a report, and nothing changes', async () => {
    const s = await scene();
    const mine = await postBy(s.admin, 'admin post');
    const r = await reportOn('post', mine, s.rae);
    const before = await digest();
    for (const body of [{ action: 'ban' }, { action: 'suspend', days: 1 }]) {
      const res = await act(s.admin, { reportId: r, ...body });
      expect(res.status).toBe(409);
    }
    expect(await digest()).toBe(before);
  });

  it('one action closes every open report on the same content, and not those on other content', async () => {
    const s = await scene();
    const amy = await kit.person('amy');
    const second = await reportOn('post', s.post, amy, 'abuse');
    const otherPost = await postBy(s.pat, 'another post');
    const elsewhere = await reportOn('post', otherPost, amy);
    expect((await act(s.admin, { reportId: s.report, action: 'remove' })).status).toBe(200);
    expect((await reportRow(second)).status).toBe('actioned');
    expect((await reportRow(elsewhere)).status).toBe('open');
    expect((await auditRows())[0]!.details).toEqual({ count: 2 });
  });
});

// ---------------------------------------------------------------- 4. the word filter

describe('4. the word filter editor', () => {
  it('adds and removes a term, each audited without the word', async () => {
    const s = await scene();
    const add = await word(s.admin, { action: 'add', term: '  Bad Word  ', kind: 'flag' });
    expect(add.status).toBe(200);
    const rows = await kit.db.query<{ id: string; term: string; kind: string; created_by: string }>(
      'select id, term, kind, created_by from public.word_filter',
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ term: 'bad word', kind: 'flag', created_by: s.admin.id });
    const id = rows.rows[0]!.id;
    expect((await word(s.admin, { action: 'remove', id })).status).toBe(200);
    expect((await kit.db.query('select 1 from public.word_filter')).rows).toHaveLength(0);
    const audit = await auditRows();
    expect(audit.map((a) => [a.action, a.target_type, a.target_id])).toEqual([
      ['word_add', 'word_filter', id],
      ['word_remove', 'word_filter', id],
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/bad word/);
  });

  it('refuses terms the table would refuse, and a repeat, with a plain message', async () => {
    const s = await scene();
    const bad: unknown[] = [
      '',
      'a',
      'x'.repeat(61),
      'bad!word',
      'two  spaces',
      'tab\tword',
      'café',
      'bad_word',
      42,
      null,
      ['bad'],
    ];
    for (const term of bad) {
      const res = await word(s.admin, { action: 'add', term, kind: 'block' });
      expect(res.status, JSON.stringify(term)).toBe(400);
    }
    expect((await word(s.admin, { action: 'add', term: 'okay', kind: 'maybe' })).status).toBe(400);
    expect((await word(s.admin, { action: 'add', term: 'okay' })).status).toBe(400);
    expect((await word(s.admin, { action: 'remove', id: 'nope' })).status).toBe(400);
    expect(
      (await word(s.admin, { action: 'remove', id: '11111111-1111-4111-8111-111111111111' }))
        .status,
    ).toBe(404);
    expect((await word(s.admin, { action: 'rename' })).status).toBe(400);
    expect((await kit.db.query('select 1 from public.word_filter')).rows).toHaveLength(0);
    expect((await auditRows()).length).toBe(0);
    expect((await word(s.admin, { action: 'add', term: 'ok to add', kind: 'block' })).status).toBe(
      200,
    );
    const dup = await word(s.admin, { action: 'add', term: 'OK to add', kind: 'flag' });
    expect(dup.status).toBe(409);
    expect(await errorOf(dup)).toMatch(/on the list already/);
    expect((await kit.db.query('select 1 from public.word_filter')).rows).toHaveLength(1);
  });

  it('a block term refuses new text and a flag term opens a report', async () => {
    const s = await scene();
    expect((await word(s.admin, { action: 'add', term: 'zzblock', kind: 'block' })).status).toBe(
      200,
    );
    expect((await word(s.admin, { action: 'add', term: 'zzflag', kind: 'flag' })).status).toBe(200);
    await expect(postBy(s.pat, 'this has zzblock in it')).rejects.toThrow(/word_filter/);
    const flagged = await postBy(s.pat, 'this has zzflag in it');
    const r = await kit.db.query(
      `select 1 from public.reports where target_id = $1 and reporter_id is null`,
      [flagged],
    );
    expect(r.rows).toHaveLength(1);
  });
});

describe('4b. content written before a term was blocked', () => {
  it('can still be removed: the word filter checks text only when it changes (20261115002000)', async () => {
    const s = await scene();
    await kit.db.query(`insert into public.word_filter (term, kind) values ('cheap', 'block')`);
    const res = await act(s.admin, { reportId: s.report, action: 'remove' });
    expect(res.status).toBe(200);
    const r = await kit.db.query<{ removed: boolean }>(
      'select removed_at is not null as removed from public.posts where id = $1',
      [s.post],
    );
    expect(r.rows[0]!.removed).toBe(true);
  });
});

// ---------------------------------------------------------------- 5. the pages

type PageFn = (p: unknown) => Promise<unknown>;
const pageOf = async (load: () => Promise<unknown>): Promise<PageFn> =>
  ((await load()) as { default: PageFn }).default;
const props = (search: Record<string, string> = {}, params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve(search),
});
const html = (out: unknown) => renderToStaticMarkup(out as never);

describe('5. the admin pages', () => {
  it('show the queue to an admin, with content, context, counts and the author history', async () => {
    const s = await scene();
    const amy = await kit.person('amy');
    await reportOn('post', s.post, amy, 'abuse');
    const c = await commentBy(s.rae, s.post, 'a comment on pat post');
    await reportOn('comment', c, amy);
    // An earlier removal of Pat's, so the history shows.
    const old = await postBy(s.pat, 'old post');
    await kit.db.query('update public.posts set removed_at = now() where id = $1', [old]);
    await kit.db.query(
      `insert into public.moderation_actions (user_id, moderator_id, action) values ($1, $2, 'warned')`,
      [s.pat.id, s.admin.id],
    );
    state.cookie = s.admin.cookie;
    const Page = await pageOf(() => import('@/app/admin/moderation/page'));
    const out = html(await Page(props()));
    expect(out).toContain('Buy my cheap thing now');
    expect(out).toContain('a comment on pat post');
    expect(out).toContain('On a post by @pat');
    expect(out).toContain('2 open reports on this');
    expect(out).toContain('3 open reports.');
    expect(out).toContain('1 past action');
    expect(out).toContain('warned');
    expect(out).toContain('1 post and');
    expect(out).toContain('Reported');
    expect(out).toContain('by @rae');
    expect(out).not.toContain(String.fromCharCode(0x2014));
  });

  it('page through the queue oldest first', async () => {
    const s = await scene();
    for (let i = 0; i < 11; i++) {
      const p = await postBy(s.pat, `queued post number ${i}`);
      await kit.db.query(
        `insert into public.reports (reporter_id, target_type, target_id, reason, created_at)
         values (null, 'post', $1, 'spam', now() - interval '1 day' + ($2 || ' seconds')::interval)`,
        [p, String(i)],
      );
    }
    state.cookie = s.admin.cookie;
    const Page = await pageOf(() => import('@/app/admin/moderation/page'));
    const first = html(await Page(props()));
    expect(first).toContain('queued post number 0');
    expect(first).not.toContain('Buy my cheap thing now');
    expect(first).toContain('Older');
    const second = html(await Page(props({ page: '2' })));
    expect(second).toContain('Buy my cheap thing now');
    expect(second).toContain('Newer');
    // A bad page number falls back to the first.
    expect(html(await Page(props({ page: '-4' })))).toContain('queued post number 0');
  });

  it('say so when no reports are open, and list the word filter for an admin', async () => {
    const s = await scene();
    await kit.db.query(`insert into public.word_filter (term, kind) values ('listed', 'flag')`);
    state.cookie = s.admin.cookie;
    await act(s.admin, { reportId: s.report, action: 'keep' });
    const Queue = await pageOf(() => import('@/app/admin/moderation/page'));
    expect(html(await Queue(props()))).toContain('No reports are open.');
    const Words = await pageOf(() => import('@/app/admin/words/page'));
    const out = html(await Words(props()));
    expect(out).toContain('listed');
    expect(out).toContain('Flag');
  });

  it('are not found for a signed-out visitor, a player, a moderator, an under-16 and a banned admin, and show nothing with no keys', async () => {
    const s = await scene();
    const mod = await kit.person('modder', { role: 'moderator' });
    const kid = await kit.person('kiddo', { ageYears: 15 });
    const banned = await kit.person('banned', { role: 'admin', banned: true });
    const Queue = await pageOf(() => import('@/app/admin/moderation/page'));
    const Words = await pageOf(() => import('@/app/admin/words/page'));
    for (const P of [Queue, Words]) {
      for (const who of [null, s.pat, mod, kid, banned]) {
        state.cookie = who?.cookie ?? '';
        await expect(P(props()), who?.username ?? 'nobody').rejects.toThrow('NEXT_NOT_FOUND');
      }
      setAuthDeps(null);
      state.cookie = '';
      expect(await P(props())).toBeNull();
      setAuthDeps(kit.deps);
    }
  });
});

// ---------------------------------------------------------------- 6. removed content on the community pages

describe('6. removed content', () => {
  it('shows "removed by a moderator" to the author and nothing to anyone else', async () => {
    const s = await scene();
    const comment = await commentBy(s.pat, s.post, 'secret comment words');
    const other = await postBy(s.rae, 'a visible post');
    const reply = await commentBy(s.rae, other, 'reply on other');
    const cr = await reportOn('comment', comment, s.rae);
    expect((await act(s.admin, { reportId: s.report, action: 'remove' })).status).toBe(200);
    expect((await act(s.admin, { reportId: cr, action: 'remove' })).status).toBe(200);
    const Post = await pageOf(() => import('@/app/community/post/[id]/page'));
    // The author sees that it was removed, never the words.
    state.cookie = s.pat.cookie;
    const mine = html(await Post(props({}, { id: s.post })));
    expect(mine).toContain('This post was removed by a moderator.');
    expect(mine).not.toContain('Buy my cheap thing now');
    // Anyone else gets not found for the post.
    state.cookie = s.rae.cookie;
    await expect(Post(props({}, { id: s.post }))).rejects.toThrow('NEXT_NOT_FOUND');
    // A removed comment on a visible post: shown as removed to its author, absent for others.
    const Feed = await pageOf(() => import('@/app/community/page'));
    expect(html(await Feed({ searchParams: Promise.resolve({ tab: 'everyone' }) }))).not.toContain(
      'Buy my cheap thing now',
    );
    await kit.db.query('update public.comments set post_id = $2 where id = $1', [comment, other]);
    void reply;
    state.cookie = s.pat.cookie;
    const authorView = html(await Post(props({}, { id: other })));
    expect(authorView).toContain('This comment was removed by a moderator.');
    expect(authorView).not.toContain('secret comment words');
    state.cookie = s.rae.cookie;
    const strangerView = html(await Post(props({}, { id: other })));
    expect(strangerView).not.toContain('secret comment words');
    expect(strangerView).not.toContain('This comment was removed by a moderator.');
    expect(strangerView).toContain('reply on other');
  });
});

// ---------------------------------------------------------------- 7. the report rate limit

describe('7. reporting too often is refused with a 429', () => {
  it('the database rule stops a new account after five reports a day', async () => {
    const rae = await kit.person('rae');
    const pat = await kit.person('pat');
    const report = (await import('@/app/api/community/report/route')) as RouteModule;
    const ids: string[] = [];
    for (let i = 0; i < 7; i++) ids.push(await postBy(pat, `post ${i}`));
    const codes: number[] = [];
    for (const id of ids) {
      const r = await kit.call(report, '/api/community/report', 'POST', rae, {
        target: 'post',
        id,
        reason: 'spam',
      });
      codes.push(r.status);
    }
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
    expect((await kit.db.query('select 1 from public.reports')).rows).toHaveLength(5);
  });

  it('the route limit stops an established account after ten a minute', async () => {
    const rae = await kit.person('rae');
    const pat = await kit.person('pat');
    await kit.db.query(
      `update public.profiles set created_at = now() - interval '30 days' where user_id = $1`,
      [rae.id],
    );
    const report = (await import('@/app/api/community/report/route')) as RouteModule;
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const id = await postBy(pat, `post ${i}`);
      const r = await kit.call(report, '/api/community/report', 'POST', rae, {
        target: 'post',
        id,
        reason: 'spam',
      });
      codes.push(r.status);
    }
    expect(codes.slice(0, 10).every((c) => c === 200)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
  });
});

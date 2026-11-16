import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  communityKit,
  cookieList,
  type Person,
  type RouteModule,
} from '../test-support/communityKit';

/*
 * Launch check (m5.5), flow 6: a post, a report on it from another account, and an admin removing
 * it from the queue. The writes go through the real route handlers; what each person sees is read
 * from the real pages, rendered as that person (the same set-up as admin/moderation.test.ts).
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
  usePathname: () => '/community',
}));

const kit = communityKit(['community', 'feed_posts']);

type PageFn = (props: unknown) => Promise<unknown>;
const pageOf = async (load: () => Promise<unknown>): Promise<PageFn> =>
  ((await load()) as { default: PageFn }).default;
const props = (params: Record<string, string> = {}) => ({
  params: Promise.resolve(params),
  searchParams: Promise.resolve({}),
});
const html = (out: unknown) => renderToStaticMarkup(out as never);

async function viewPost(who: Person, id: string): Promise<string> {
  state.cookie = who.cookie;
  const Post = await pageOf(() => import('@/app/community/post/[id]/page'));
  return html(await Post(props({ id })));
}

describe('launch flow 6: post, report, moderation', () => {
  it('a reported post is removed by an admin and then shows to no one but its author, as removed', async () => {
    const postRoute = (await import('@/app/api/community/post/route')) as RouteModule;
    const reportRoute = (await import('@/app/api/community/report/route')) as RouteModule;
    const modRoute = (await import('@/app/api/admin/moderation/route')) as RouteModule;
    const admin = await kit.person('launchadm', { role: 'admin' });
    const pat = await kit.person('launchpat');
    const rae = await kit.person('launchrae');
    const words = 'Cheap fencing wire, message me now';

    // Pat posts.
    const made = await kit.call(postRoute, '/api/community/post', 'POST', pat, {
      action: 'create',
      body: words,
    });
    expect(made.status).toBe(200);
    const postId = ((await made.json()) as { id: string }).id;
    expect(postId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await viewPost(rae, postId)).toContain(words);

    // Rae reports it.
    const reported = await kit.call(reportRoute, '/api/community/report', 'POST', rae, {
      target: 'post',
      id: postId,
      reason: 'spam',
    });
    expect(reported.status).toBe(200);
    const open = await kit.db.query<{ id: string }>(
      `select id from public.reports where target_type = 'post' and target_id = $1 and status = 'open'`,
      [postId],
    );
    expect(open.rows).toHaveLength(1);
    const reportId = open.rows[0]!.id;

    // The admin sees it in the queue.
    state.cookie = admin.cookie;
    const Queue = await pageOf(() => import('@/app/admin/moderation/page'));
    expect(html(await Queue(props()))).toContain(words);

    // A player can not act on the report; the admin removes the post.
    expect(
      (
        await kit.call(modRoute, '/api/admin/moderation', 'POST', rae, {
          reportId,
          action: 'remove',
        })
      ).status,
    ).toBe(404);
    const removed = await kit.call(modRoute, '/api/admin/moderation', 'POST', admin, {
      reportId,
      action: 'remove',
    });
    expect(removed.status).toBe(200);
    const report = await kit.db.query<{ status: string; action: string | null }>(
      'select status, action from public.reports where id = $1',
      [reportId],
    );
    expect(report.rows[0]).toEqual({ status: 'actioned', action: 'removed' });
    const audit = await kit.db.query<{ action: string }>(
      'select action from public.admin_audit_log order by id',
    );
    expect(audit.rows.map((r) => r.action)).toContain('report_remove');

    // Rae gets not found. Pat sees that it was removed, never the words.
    await expect(viewPost(rae, postId)).rejects.toThrow('NEXT_NOT_FOUND');
    const mine = await viewPost(pat, postId);
    expect(mine).toContain('This post was removed by a moderator.');
    expect(mine).not.toContain(words);
    // The feed leaves it out for everyone.
    state.cookie = rae.cookie;
    const Feed = await pageOf(() => import('@/app/community/page'));
    expect(html(await Feed({ searchParams: Promise.resolve({ tab: 'everyone' }) }))).not.toContain(
      words,
    );
    // Pat is told.
    const notes = await kit.db.query<{ body: string }>(
      'select body from public.notifications where user_id = $1',
      [pat.id],
    );
    expect(notes.rows.map((n) => n.body)).toContain(
      'A moderator removed your post. Reason given: spam.',
    );
  }, 180_000);
});

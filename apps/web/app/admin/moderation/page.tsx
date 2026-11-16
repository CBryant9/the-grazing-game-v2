import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { when } from '@/components/admin/format';
import { ReportActions } from '@/components/admin/ReportActions';
import { requireAdmin } from '@/server/admin/page';
import { listQueue } from '@/server/admin/moderation';

export const dynamic = 'force-dynamic';

type Params = { page?: string | string[] };
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

const ACTION_WORDS: Record<string, string> = {
  removed: 'content removed',
  warned: 'warned',
  suspended: 'suspended',
  banned: 'banned',
  unbanned: 'ban lifted',
};

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const page = await requireAdmin();
  if (!page) return null;
  const sp = await searchParams;
  const q = await listQueue(page.deps.sql, Number.parseInt(one(sp.page), 10) || 1);
  return (
    <>
      <h1 className={styles.h1}>Moderation</h1>
      <p className={styles.lede}>
        Open reports, oldest first. Each shows the content as it stands now, its context and the
        author&apos;s history. An action closes every open report on the same content and is
        recorded in the audit log. The author is told what happened, except when a report is kept.
      </p>
      <p className={styles.muted} role="status">
        {q.total === 0
          ? 'No reports are open.'
          : `${q.total} open ${q.total === 1 ? 'report' : 'reports'}.`}{' '}
        <Link href="/admin/words">Word filter</Link>
      </p>
      {q.items.map((r) => (
        <div key={r.id} className={styles.card}>
          <div className={styles.rowhead}>
            <span className={styles.name}>{r.content.title}</span>
            <span className={styles.chip}>{r.reasonLabel}</span>
            {r.openOnTarget > 1 && (
              <span className={`${styles.chip} ${styles.warn}`}>
                {r.openOnTarget} open reports on this
              </span>
            )}
            {r.content.removed && <span className={styles.chip}>Already removed</span>}
          </div>
          <p className={styles.muted}>
            Reported {when(r.createdAt)} by {r.reporter ? `@${r.reporter}` : 'the word filter'}.
          </p>
          {r.details && <p>Reporter&apos;s note: {r.details}</p>}
          {r.content.text && (
            <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{r.content.text}</p>
          )}
          {r.content.context && <p className={styles.muted}>{r.content.context}</p>}
          {r.author && (
            <p className={styles.muted}>
              Author history: {r.author.actionCount}{' '}
              {r.author.actionCount === 1 ? 'past action' : 'past actions'}
              {r.author.actions.length > 0 &&
                ` (${r.author.actions
                  .map((a) => `${ACTION_WORDS[a.action] ?? a.action} ${when(a.at)}`)
                  .join('; ')})`}
              . {r.author.removedPosts} {r.author.removedPosts === 1 ? 'post' : 'posts'} and{' '}
              {r.author.removedComments} {r.author.removedComments === 1 ? 'comment' : 'comments'}{' '}
              removed. {r.author.openAboutAuthor} open{' '}
              {r.author.openAboutAuthor === 1 ? 'report' : 'reports'} about their content.
            </p>
          )}
          <ReportActions
            reportId={r.id}
            targetType={r.targetType}
            canRemove={r.can.remove}
            canAct={r.can.account}
          />
        </div>
      ))}
      {(q.page > 1 || q.hasNext) && (
        <div className={styles.pager}>
          {q.page > 1 && <Link href={`/admin/moderation?page=${q.page - 1}`}>Newer</Link>}
          {q.hasNext && <Link href={`/admin/moderation?page=${q.page + 1}`}>Older</Link>}
        </div>
      )}
    </>
  );
}

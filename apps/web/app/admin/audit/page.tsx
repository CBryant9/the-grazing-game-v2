import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import { actionWords, auditActions, describeAudit, listAudit } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

type Params = { action?: string | string[]; admin?: string | string[]; page?: string | string[] };
const one = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? '') : (v ?? '');

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const page = await requireAdmin();
  if (!page) return null;
  const sp = await searchParams;
  const action = one(sp.action).slice(0, 80);
  const admin = one(sp.admin).slice(0, 64);
  const pageNo = Number.parseInt(one(sp.page), 10) || 1;
  const [log, actions] = await Promise.all([
    listAudit(page.deps.sql, {
      action: action || undefined,
      admin: admin || undefined,
      page: pageNo,
    }),
    auditActions(page.deps.sql),
  ]);
  const link = (n: number): string => {
    const q = new URLSearchParams();
    if (action) q.set('action', action);
    if (admin) q.set('admin', admin);
    q.set('page', String(n));
    return `/admin/audit?${q.toString()}`;
  };
  return (
    <>
      <h1 className={styles.h1}>Audit log</h1>
      <p className={styles.lede}>
        Every admin change, newest first. Read only: nobody can change or remove a row. A row names
        the thing changed by its id and holds only numbers, switch names and on or off. It never
        holds words typed by an admin.
      </p>
      <form method="get" className={styles.inline}>
        <div className={styles.field}>
          <label htmlFor="action">Action</label>
          <select id="action" name="action" defaultValue={action}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {actionWords(a)}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="admin">Admin (username or id)</label>
          <input
            id="admin"
            name="admin"
            type="search"
            defaultValue={admin}
            maxLength={64}
            autoComplete="off"
          />
        </div>
        <div className={styles.btnrow}>
          <button type="submit" className={styles.primary}>
            Filter
          </button>
        </div>
      </form>
      {log.rows.length === 0 ? (
        <p className={styles.muted} role="status">
          Nothing in the log matches.
        </p>
      ) : (
        <div className={`${styles.card} ${styles.tablewrap}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Admin</th>
                <th scope="col">Action</th>
                <th scope="col">What it was done to</th>
              </tr>
            </thead>
            <tbody>
              {log.rows.map((r) => (
                <tr key={r.id}>
                  <td>{when(r.at)}</td>
                  <td>{r.admin ?? 'a removed account'}</td>
                  <td>{actionWords(r.action)}</td>
                  <td className={styles.mono}>{describeAudit(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className={styles.pager} aria-label="Pages of the log">
        {log.page > 1 && (
          <Link href={link(log.page - 1)} prefetch={false}>
            Newer
          </Link>
        )}
        <span className={styles.muted}>Page {log.page}</span>
        {log.hasNext && (
          <Link href={link(log.page + 1)} prefetch={false}>
            Older
          </Link>
        )}
      </nav>
    </>
  );
}

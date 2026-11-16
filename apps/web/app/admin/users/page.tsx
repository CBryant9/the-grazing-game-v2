import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import { searchUsers } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const page = await requireAdmin();
  if (!page) return null;
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 64) ?? '';
  const results = q.trim() ? await searchUsers(page.deps.sql, q) : null;
  return (
    <>
      <h1 className={styles.h1}>Users</h1>
      <p className={styles.lede}>
        Find an account by username (the start of it is enough) or by its id. There is no search by
        email address, and no date of birth or email is shown anywhere here.
      </p>
      <form method="get" className={styles.inline} role="search">
        <div className={styles.field}>
          <label htmlFor="q">Username or id (at least 2 characters)</label>
          <input id="q" name="q" type="search" defaultValue={q} maxLength={64} autoComplete="off" />
        </div>
        <div className={styles.btnrow}>
          <button type="submit" className={styles.primary}>
            Search
          </button>
        </div>
      </form>
      {results && results.length === 0 && (
        <p className={styles.muted} role="status">
          No accounts matched. Try the start of a username, or paste an id.
        </p>
      )}
      {results && results.length > 0 && (
        <div className={`${styles.card} ${styles.tablewrap}`}>
          <table className={styles.table}>
            <caption className={styles.muted}>
              {results.length === 25 ? 'The first 25 matches' : `${results.length} found`}
            </caption>
            <thead>
              <tr>
                <th scope="col">Username</th>
                <th scope="col">Role</th>
                <th scope="col">Status</th>
                <th scope="col">Joined</th>
              </tr>
            </thead>
            <tbody>
              {results.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/users/${u.id}`} prefetch={false}>
                      {u.username}
                    </Link>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.state}</td>
                  <td>{when(u.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

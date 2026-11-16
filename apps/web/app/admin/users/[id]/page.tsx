import { notFound } from 'next/navigation';
import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { UserControls } from '@/components/admin/UserControls';
import { when } from '@/components/admin/format';
import { requireAdmin } from '@/server/admin/page';
import { userDetail } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

const WORDS: Record<string, string> = {
  suspended: 'suspended',
  banned: 'banned',
  unbanned: 'ban or suspension lifted',
  removed: 'content removed',
  warned: 'warned',
  note: 'note',
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const page = await requireAdmin();
  if (!page) return null;
  const { id } = await params;
  const u = await userDetail(page.deps.sql, id);
  if (!u) notFound();
  const isSelf = u.id === page.admin.userId;
  return (
    <>
      <p>
        <Link href="/admin/users" prefetch={false}>
          Back to users
        </Link>
      </p>
      <h1 className={styles.h1}>{u.username ?? 'No profile'}</h1>
      <section className={styles.card} aria-labelledby="facts">
        <h2 id="facts" className={styles.h2}>
          Account
        </h2>
        <dl className={styles.dl}>
          <dt>Id</dt>
          <dd className={styles.mono}>{u.id}</dd>
          <dt>Status</dt>
          <dd>
            {u.state}
            {u.suspendedUntil ? `, until ${when(u.suspendedUntil)}` : ''}
          </dd>
          <dt>Role</dt>
          <dd>{u.role ?? 'none'}</dd>
          <dt>Joined</dt>
          <dd>{u.joined ? when(u.joined) : 'sign-up not finished'}</dd>
          <dt>Farms</dt>
          <dd>
            {u.farms.daily} Daily, {u.farms.fast} Fast
          </dd>
          <dt>Last seen</dt>
          <dd>{u.lastSeen ? when(u.lastSeen) : 'no farm opened'}</dd>
          <dt>Under 16</dt>
          <dd>{u.underSixteen === null ? 'not known' : u.underSixteen ? 'Yes' : 'No'}</dd>
          {u.refusedUnder14 && (
            <>
              <dt>Sign-up</dt>
              <dd>Refused as under 14</dd>
            </>
          )}
        </dl>
      </section>
      <section className={styles.card} aria-labelledby="actions">
        <h2 id="actions" className={styles.h2}>
          Actions
        </h2>
        <UserControls
          userId={u.id}
          isSelf={isSelf}
          hasProfile={u.username !== null}
          state={u.state}
          role={u.role}
          refusedUnder14={u.refusedUnder14}
        />
      </section>
      <section className={`${styles.card} ${styles.tablewrap}`} aria-labelledby="hist">
        <h2 id="hist" className={styles.h2}>
          Moderation history
        </h2>
        {u.history.length === 0 ? (
          <p className={styles.muted}>Nothing recorded.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">What</th>
                <th scope="col">Until</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {u.history.map((h, i) => (
                <tr key={`${h.at}-${i}`}>
                  <td>{when(h.at)}</td>
                  <td>{WORDS[h.action] ?? h.action}</td>
                  <td>{h.until ? when(h.until) : ''}</td>
                  <td>{h.by ?? 'a removed account'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

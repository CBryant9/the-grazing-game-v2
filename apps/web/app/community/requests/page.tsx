import { Act } from '@/components/community/Act';
import { Empty, PersonRow, SubNav } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import { asUser } from '@/server/auth/accounts';
import { requests } from '@/server/community/data';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const { me, deps } = await requireMember();
  const { incoming, outgoing } = await asUser(deps.sql, me.userId, (tx) => requests(tx, me.userId));
  return (
    <>
      <h1 className={`px ${styles.title}`}>Follow requests</h1>
      <SubNav here="requests" />
      <section aria-labelledby="in-title" className={styles.stack}>
        <h2 id="in-title" className={`px ${styles.h2}`}>
          People asking to follow you
        </h2>
        {incoming.length === 0 ? (
          <Empty>No requests waiting.</Empty>
        ) : (
          <ul className={styles.people}>
            {incoming.map((p) => (
              <PersonRow key={p.id} p={p}>
                <span className={styles.row}>
                  <Act
                    path="/api/community/follow"
                    body={{ action: 'accept', username: p.username }}
                    label="Accept"
                    tone="coral"
                  />
                  <Act
                    path="/api/community/follow"
                    body={{ action: 'decline', username: p.username }}
                    label="Decline"
                  />
                </span>
              </PersonRow>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="out-title" className={styles.stack}>
        <h2 id="out-title" className={`px ${styles.h2}`}>
          Requests you sent
        </h2>
        {outgoing.length === 0 ? (
          <Empty>None waiting.</Empty>
        ) : (
          <ul className={styles.people}>
            {outgoing.map((p) => (
              <PersonRow key={p.id} p={p}>
                <Act
                  path="/api/community/follow"
                  body={{ action: 'unfollow', username: p.username }}
                  label="Cancel request"
                />
              </PersonRow>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

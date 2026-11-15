import Link from 'next/link';
import { Act } from '@/components/community/Act';
import { Empty } from '@/components/community/Parts';
import { GroupForm, JoinForm } from '@/components/community/GroupTools';
import styles from '@/components/community/community.module.css';
import { asUser } from '@/server/auth/accounts';
import { groupLists, publicChallenges } from '@/server/community/groups';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

/** Your groups, public groups to join, joining by code, starting a group, and the public challenges (PRD 9.6, 11.6). */
export default async function Page() {
  const { me, deps } = await requireMember('groups');
  const { lists, challenges } = await asUser(deps.sql, me.userId, async (tx) => ({
    lists: await groupLists(tx),
    challenges: await publicChallenges(tx),
  }));
  return (
    <>
      <h1 className={`px ${styles.title}`}>Groups</h1>
      <section aria-labelledby="mine" className={styles.stack}>
        <h2 id="mine" className={`px ${styles.h2}`}>
          Your groups
        </h2>
        {lists.mine.length === 0 ? (
          <Empty>You are not in a group yet.</Empty>
        ) : (
          <ul className={styles.list}>
            {lists.mine.map((g) => (
              <li key={g.id}>
                <Link href={`/community/groups/${g.id}`}>{g.name}</Link> ({g.members} member
                {g.members === 1 ? '' : 's'}
                {g.role === 'owner' ? ', you own it' : ''})
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="join" className={styles.stack}>
        <h2 id="join" className={`px ${styles.h2}`}>
          Join a group
        </h2>
        <JoinForm />
        {lists.open.length > 0 && (
          <ul className={styles.list}>
            {lists.open.map((g) => (
              <li key={g.id} className={styles.row}>
                <span>
                  <Link href={`/community/groups/${g.id}`}>{g.name}</Link> ({g.members})
                </span>
                <Act
                  path="/api/community/group"
                  body={{ action: 'join', groupId: g.id }}
                  label="Join"
                  tone="coral"
                />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="start" className={styles.stack}>
        <h2 id="start" className={`px ${styles.h2}`}>
          Start a group
        </h2>
        <GroupForm />
      </section>
      {challenges.length > 0 && (
        <section aria-labelledby="ch" className={styles.stack}>
          <h2 id="ch" className={`px ${styles.h2}`}>
            Challenges for everyone
          </h2>
          <ul className={styles.list}>
            {challenges.map((c) => (
              <li key={c.id} className={styles.row}>
                <span>
                  {c.name} ({c.kind === 'daily_league' ? 'Daily league' : 'Fast Farm challenge'}
                  {c.endsAt ? `, ends ${c.endsAt}` : ''})
                </span>
                <Link href={`/leaderboards?challenge=${c.id}`} className="btn ghost">
                  Board
                </Link>
                {c.open && !c.entered && (
                  <Act
                    path="/api/community/challenge"
                    body={{ action: 'enter', challengeId: c.id }}
                    label="Enter"
                    tone="coral"
                    after="/play"
                  />
                )}
                {c.entered && <span className={styles.hint}>You are in it.</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

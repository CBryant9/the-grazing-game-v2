import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { ChallengeForm, OwnerForm } from '@/components/community/GroupTools';
import { requireAdmin } from '@/server/admin/page';
import { challengeResults, listChallenges, ownerlessGroups } from '@/server/admin/challenges';

export const dynamic = 'force-dynamic';

/** Challenges and leagues (PRD 11.6): make one, end one, see entries and results; groups with no owner. */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ results?: string }>;
}) {
  const page = await requireAdmin();
  if (!page) return null;
  const q = (await searchParams) ?? {};
  const [list, orphans] = await Promise.all([
    listChallenges(page.deps.sql),
    ownerlessGroups(page.deps.sql),
  ]);
  const results = q.results ? await challengeResults(page.deps.sql, q.results) : null;
  return (
    <>
      <h1 className={styles.h1}>Challenges</h1>
      <p className={styles.lede}>
        A Fast Farm challenge gives everyone the same farm and the same seed. A Daily league starts
        everyone on the same farm on the same day (it opens when Daily Farms do). The seed is made
        here and never shown to players.
      </p>
      <div className={styles.card}>
        <h2>Make a challenge</h2>
        <ChallengeForm path="/api/admin/challenges" />
      </div>
      <div className={styles.card}>
        <h2>All challenges</h2>
        {list.length === 0 ? (
          <p className={styles.muted}>None yet.</p>
        ) : (
          <ul>
            {list.map((c) => (
              <li key={c.id}>
                <b>{c.name}</b> (
                {c.kind === 'daily_league' ? 'Daily league' : 'Fast Farm challenge'}
                {c.groupName ? `, group ${c.groupName}` : ', public'}), from {c.startsAt}
                {c.endsAt ? ` to ${c.endsAt}` : ''}, {c.entries} entr{c.entries === 1 ? 'y' : 'ies'}
                . <a href={`/admin/challenges?results=${c.id}`}>Results</a>
                {c.open && (
                  <ConfirmAction
                    endpoint="/api/admin/challenges"
                    body={{ action: 'end', challengeId: c.id }}
                    label="End it now"
                    explain={`End ${c.name} now? Farms already in it keep their rows.`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {results && (
        <div className={styles.card}>
          <h2>Results</h2>
          {results.length === 0 ? (
            <p className={styles.muted}>No farm in it has finished a year yet.</p>
          ) : (
            <ol>
              {results.map((r, i) => (
                <li key={i}>
                  {r.username}
                  {r.farm ? `, ${r.farm}` : ''}: {r.score} ({r.days} days)
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      <div className={styles.card}>
        <h2>Groups with no owner</h2>
        {orphans.length === 0 ? (
          <p className={styles.muted}>Every group has an owner.</p>
        ) : (
          <ul>
            {orphans.map((g) => (
              <li key={g.id}>
                {g.name} ({g.members} members).
                <OwnerForm groupId={g.id} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

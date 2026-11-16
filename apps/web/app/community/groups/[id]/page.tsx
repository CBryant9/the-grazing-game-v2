import { AdSlot } from '@/components/ads/AdSlot';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BoardTable } from '@/components/boards/BoardTable';
import { Act } from '@/components/community/Act';
import { Composer } from '@/components/community/Composer';
import { ChallengeForm, GroupForm } from '@/components/community/GroupTools';
import { Empty, More, PostCard } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import { asUser, featureSwitches } from '@/server/auth/accounts';
import { parseBoardQuery, readBoard } from '@/server/boards/read';
import { BOARD_LABELS } from '@/server/boards/score';
import { groupPosts } from '@/server/community/data';
import { groupDetail } from '@/server/community/groups';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

/**
 * One group (PRD 9.6): its members, its board (the members' farms, all time, or one of its
 * challenges), its feed and challenges. The owner also gets the invite code and the owner's tools.
 * A private group is not found by anyone who is not in it (the database says so).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cursor?: string; challenge?: string; board?: string }>;
}) {
  const { me, deps } = await requireMember('groups');
  const { id } = await params;
  const q = await searchParams;
  const switches = await featureSwitches(deps.sql);
  const data = await asUser(deps.sql, me.userId, async (tx) => {
    const g = await groupDetail(tx, id);
    if (!g) return null;
    if (!g.role) return { g, board: null, posts: null, query: null };
    const query = parseBoardQuery({ board: q.board, challenge: q.challenge });
    if (query.challenge && !g.challenges.some((c) => c.id === query.challenge)) {
      query.challenge = null;
    }
    // The group board: the members' farms. A challenge board: the challenge's own farms.
    if (!query.challenge) query.group = id;
    return {
      g,
      query,
      board: switches.leaderboards ? await readBoard(tx, query) : null,
      posts: switches.feed_posts ? await groupPosts(tx, me.userId, id, q.cursor ?? null) : null,
    };
  });
  if (!data) notFound();
  const { g, board, posts, query } = data;
  const owner = g.role === 'owner';
  return (
    <>
      <h1 className={`px ${styles.title}`}>{g.name}</h1>
      <p>
        <Link href="/community/groups">All groups</Link>
      </p>
      <section className={styles.card} aria-label="About the group">
        {g.description && <p className={styles.body}>{g.description}</p>}
        <p className={styles.hint}>
          {g.visibility === 'public'
            ? 'Public group.'
            : 'Private group: join with the invite code.'}{' '}
          {g.members} member{g.members === 1 ? '' : 's'}.
        </p>
        {g.ownerless && (
          <p className={styles.hint} role="status">
            This group has no owner. Members can still read and post. An admin can give it an owner.
          </p>
        )}
        {owner && g.inviteCode && (
          <p>
            Invite code: <code>{g.inviteCode}</code>
          </p>
        )}
        <div className={styles.row}>
          {!g.role && g.visibility === 'public' && (
            <Act
              path="/api/community/group"
              body={{ action: 'join', groupId: g.id }}
              label="Join"
              tone="coral"
            />
          )}
          {g.role === 'member' && (
            <Act
              path="/api/community/group"
              body={{ action: 'leave', groupId: g.id }}
              label="Leave the group"
              confirm="Leave this group?"
              after="/community/groups"
            />
          )}
          {owner && (
            <Act
              path="/api/community/group"
              body={{ action: 'delete', groupId: g.id }}
              label="Delete the group"
              confirm="Delete this group, its posts and its challenges? This can not be undone."
              tone="danger"
              after="/community/groups"
            />
          )}
        </div>
      </section>
      {g.role && (
        <section aria-labelledby="mem" className={styles.stack}>
          <h2 id="mem" className={`px ${styles.h2}`}>
            Members
          </h2>
          <ul className={styles.list}>
            {g.memberList.map((m) => (
              <li key={m.userId} className={styles.row}>
                <span>
                  {m.username}
                  {m.role === 'owner' ? ' (owner)' : ''}
                </span>
                {owner && m.role !== 'owner' && (
                  <>
                    <Act
                      path="/api/community/group"
                      body={{ action: 'remove', groupId: g.id, username: m.username }}
                      label="Remove"
                      confirm={`Remove @${m.username} from the group?`}
                    />
                    <Act
                      path="/api/community/group"
                      body={{ action: 'handover', groupId: g.id, username: m.username }}
                      label="Make owner"
                      confirm={`Hand the group to @${m.username}? You stay as a member.`}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {board && query && (
        <section aria-labelledby="board" className={styles.stack}>
          <h2 id="board" className={`px ${styles.h2}`}>
            {query.challenge
              ? `Challenge board: ${g.challenges.find((c) => c.id === query.challenge)?.name ?? ''}`
              : 'Group board'}
          </h2>
          <p className={styles.hint}>
            {BOARD_LABELS[query.board].name}, in {BOARD_LABELS[query.board].unit}. Every member sees
            the same board.
          </p>
          <BoardTable
            rows={board.rows}
            mine={board.mine}
            unit={BOARD_LABELS[query.board].unit}
            links
          />
        </section>
      )}
      {g.role && (
        <section aria-labelledby="chal" className={styles.stack}>
          <h2 id="chal" className={`px ${styles.h2}`}>
            Challenges
          </h2>
          {g.challenges.length > 0 && <AdSlot id="challenge_sponsor" screen="challenge" />}
          {g.challenges.length === 0 ? (
            <Empty>No challenges yet.</Empty>
          ) : (
            <ul className={styles.list}>
              {g.challenges.map((c) => (
                <li key={c.id} className={styles.row}>
                  <span>
                    {c.name} ({c.kind === 'daily_league' ? 'Daily league' : 'Fast Farm challenge'}
                    {c.endsAt ? `, ends ${c.endsAt}` : ''})
                  </span>
                  <Link href={`/community/groups/${g.id}?challenge=${c.id}`} className="btn ghost">
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
          )}
          {owner && <ChallengeForm path="/api/community/group" groupId={g.id} />}
        </section>
      )}
      {owner && (
        <section aria-labelledby="edit" className={styles.stack}>
          <h2 id="edit" className={`px ${styles.h2}`}>
            Change the group
          </h2>
          <GroupForm group={g} />
        </section>
      )}
      {posts && (
        <section aria-labelledby="gp" className={styles.stack}>
          <h2 id="gp" className={`px ${styles.h2}`}>
            Group posts
          </h2>
          <Composer groupId={g.id} />
          {posts.items.length === 0 ? (
            <Empty>No posts yet.</Empty>
          ) : (
            posts.items.map((p) => <PostCard key={p.id} post={p} />)
          )}
          {posts.next && <More href={`/community/groups/${g.id}?cursor=${posts.next}`} />}
        </section>
      )}
    </>
  );
}

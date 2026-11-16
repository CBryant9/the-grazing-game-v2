import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Act } from '@/components/community/Act';
import { Empty, More, PersonRow, SubNav } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import { asUser } from '@/server/auth/accounts';
import { connections, profileByUsername } from '@/server/community/data';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; list: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { me, deps } = await requireMember();
  const { username, list } = await params;
  if (list !== 'followers' && list !== 'following') notFound();
  const q = await searchParams;
  const data = await asUser(deps.sql, me.userId, async (tx) => {
    const p = await profileByUsername(tx, username);
    if (!p) return null;
    // The database shows an accepted follow only when both profiles are visible to this member.
    return {
      p,
      page: p.detailsVisible ? await connections(tx, p.id, list, q.cursor ?? null) : null,
    };
  });
  if (!data) notFound();
  const { p, page } = data;
  const mine = p.id === me.userId;
  return (
    <>
      <h1 className={`px ${styles.title}`}>
        {list === 'followers' ? 'Followers' : 'Following'}: @{p.username}
      </h1>
      <SubNav here={mine ? 'me' : 'people'} />
      <p>
        <Link href={`/community/u/${p.username}`}>Back to the profile</Link>
      </p>
      {!page ? (
        <Empty>This list is not shown for this profile.</Empty>
      ) : page.items.length === 0 ? (
        <Empty>{list === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</Empty>
      ) : (
        <ul className={styles.people}>
          {page.items.map((person) => (
            <PersonRow key={person.id} p={person}>
              {mine && list === 'followers' && (
                <Act
                  path="/api/community/follow"
                  body={{ action: 'remove', username: person.username }}
                  label="Remove"
                  confirm={`Remove @${person.username} from your followers?`}
                />
              )}
              {mine && list === 'following' && (
                <Act
                  path="/api/community/follow"
                  body={{ action: 'unfollow', username: person.username }}
                  label="Unfollow"
                />
              )}
            </PersonRow>
          ))}
        </ul>
      )}
      {page?.next && <More href={`/community/u/${p.username}/${list}?cursor=${page.next}`} />}
    </>
  );
}

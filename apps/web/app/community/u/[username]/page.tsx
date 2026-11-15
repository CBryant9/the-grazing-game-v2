import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DISTRICTS, type DistrictId } from '@gg/shared';
import { Act } from '@/components/community/Act';
import { Avatar, Empty, More, PostCard, SubNav } from '@/components/community/Parts';
import { ReportButton } from '@/components/community/PostTools';
import styles from '@/components/community/community.module.css';
import { asUser, featureSwitches } from '@/server/auth/accounts';
import {
  counts,
  extrasOf,
  postsBy,
  profileByUsername,
  relationTo,
  type Profile,
} from '@/server/community/data';
import { requireMember } from '@/server/community/page';
import { farmsToView } from '@/server/community/farmview';

export const dynamic = 'force-dynamic';

const BANDS: Record<string, string> = {
  under_100: 'Under 100 ha',
  '100_500': '100 to 500 ha',
  '500_2000': '500 to 2,000 ha',
  '2000_10000': '2,000 to 10,000 ha',
  over_10000: 'Over 10,000 ha',
};
const LINK_NAMES: Record<string, string> = {
  website: 'Website',
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

function Facts({ p }: { p: Profile }) {
  const rows: [string, string][] = [];
  if (p.realFarmName) rows.push(['Farm', p.realFarmName]);
  if (p.town || p.district) {
    rows.push([
      'Where',
      [p.town, p.district ? DISTRICTS[p.district as DistrictId]?.name : null]
        .filter(Boolean)
        .join(', '),
    ]);
  }
  if (p.farms !== null) rows.push(['Farms', p.farms ? 'Yes' : 'No']);
  if (p.enterprise) rows.push(['Enterprise', p.enterprise]);
  if (p.sizeBand) rows.push(['Size', BANDS[p.sizeBand] ?? '']);
  if (p.yearsFarming !== null) rows.push(['Years farming', String(p.yearsFarming)]);
  if (p.farmRole) rows.push(['Role', p.farmRole]);
  if (rows.length === 0) return null;
  return (
    <dl className={styles.kv}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string; view?: string }>;
}) {
  const { me, deps } = await requireMember();
  const { username } = await params;
  const q = await searchParams;
  const data = await asUser(deps.sql, me.userId, async (tx) => {
    const p = await profileByUsername(tx, username);
    if (!p) return null;
    const mine = p.id === me.userId;
    const asStranger = mine && q.view === 'public';
    // As another member sees it: details only when the profile is public.
    const detailsVisible = asStranger ? p.privacy === 'public' : p.detailsVisible;
    return {
      p,
      mine,
      asStranger,
      detailsVisible,
      relation: mine ? null : await relationTo(tx, me.userId, p.id),
      extras: detailsVisible ? await extrasOf(tx, p.id) : null,
      count: detailsVisible ? await counts(tx, p.id) : null,
      // The owner's farms this member may look at (the database's own view says which).
      farms: detailsVisible && !mine ? await farmsToView(tx, p.id) : [],
      posts: detailsVisible
        ? await postsBy(tx, me.userId, p.id, q.cursor ?? null, asStranger)
        : null,
    };
  });
  if (!data) notFound();
  const { p, mine, asStranger, detailsVisible, relation, extras, count, posts, farms } = data;
  const showFeed = (await featureSwitches(deps.sql)).feed_posts;
  return (
    <>
      <SubNav here={mine ? 'me' : 'people'} />
      {asStranger && (
        <p className={styles.card} role="status">
          This is how your profile looks to other members.{' '}
          <Link href={`/community/u/${p.username}`}>Back to your profile</Link>
        </p>
      )}
      <section className={styles.card} aria-labelledby="pname">
        <div className={styles.profilehead}>
          <Avatar who={{ id: p.id, username: p.username, hasAvatar: p.hasAvatar }} size={72} />
          <div>
            <h1 id="pname" className={styles.pname}>
              {p.displayName ?? p.username}
            </h1>
            <span className={styles.handle}>@{p.username}</span>
            {relation?.followsMe && <span className={styles.handle}> · Follows you</span>}
          </div>
        </div>
        {!detailsVisible && (
          <p className={styles.hint} role="status">
            {p.privacy === 'private'
              ? 'This profile is private.'
              : 'This profile is for followers only. Ask to follow to see more.'}
          </p>
        )}
        {detailsVisible && p.bio && <p className={styles.body}>{p.bio}</p>}
        {detailsVisible && <Facts p={p} />}
        {count && (
          <p className={styles.row}>
            <Link href={`/community/u/${p.username}/followers`} className="btn ghost">
              {count.followers} follower{count.followers === 1 ? '' : 's'}
            </Link>
            <Link href={`/community/u/${p.username}/following`} className="btn ghost">
              {count.following} following
            </Link>
          </p>
        )}
        {farms.length > 0 && (
          <p className={styles.row}>
            {farms.map((f) => (
              <Link key={f.id} href={`/community/farm/${f.id}`} className="btn ghost">
                Their farm today
              </Link>
            ))}
          </p>
        )}
        {mine && !asStranger && (
          <p className={styles.row}>
            <Link href="/community/me" className="btn coral">
              Edit your profile
            </Link>
            <Link href={`/community/u/${p.username}?view=public`} className="btn ghost">
              See it as others see it
            </Link>
          </p>
        )}
        {relation && (
          <div className={styles.row}>
            {relation.following === 'accepted' && (
              <Act
                path="/api/community/follow"
                body={{ action: 'unfollow', username: p.username }}
                label="Following"
                working="Working..."
              />
            )}
            {relation.following === 'pending' && (
              <Act
                path="/api/community/follow"
                body={{ action: 'unfollow', username: p.username }}
                label="Requested. Tap to cancel"
              />
            )}
            {relation.following === 'none' && p.privacy !== 'private' && (
              <Act
                path="/api/community/follow"
                body={{ action: 'follow', username: p.username }}
                label={p.privacy === 'followers' ? 'Ask to follow' : 'Follow'}
                tone="coral"
              />
            )}
            {relation.followsMe && (
              <Act
                path="/api/community/follow"
                body={{ action: 'remove', username: p.username }}
                label="Remove follower"
                confirm={`Remove @${p.username} from your followers?`}
              />
            )}
            <Act
              path="/api/community/block"
              body={{ action: 'block', username: p.username }}
              label="Block"
              confirm={`Block @${p.username}? You will not see each other, and any follow between you ends.`}
              tone="danger"
              after="/community"
            />
            <ReportButton target="profile" username={p.username} />
          </div>
        )}
      </section>
      {extras &&
        (extras.links.length > 0 ||
          extras.experience.length > 0 ||
          extras.education.length > 0) && (
          <section className={styles.card} aria-label="More about them">
            {extras.links.length > 0 && (
              <>
                <h2 className={`px ${styles.h2}`}>Links</h2>
                <ul className={styles.list}>
                  {extras.links.map((l) => (
                    <li key={l.kind}>
                      {LINK_NAMES[l.kind] ?? l.kind}:{' '}
                      {l.href ? (
                        <a href={l.href} target="_blank" rel="noopener noreferrer nofollow ugc">
                          {l.url}
                        </a>
                      ) : (
                        l.url
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {extras.experience.length > 0 && (
              <>
                <h2 className={`px ${styles.h2}`}>Experience</h2>
                <ul className={styles.list}>
                  {extras.experience.map((e) => (
                    <li key={e.id}>
                      {[e.role, e.enterprise, e.place].filter(Boolean).join(', ')}
                      {e.from || e.to ? ` (${e.from ?? ''} to ${e.to ?? 'now'})` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {extras.education.length > 0 && (
              <>
                <h2 className={`px ${styles.h2}`}>Courses</h2>
                <ul className={styles.list}>
                  {extras.education.map((e) => (
                    <li key={e.id}>
                      {[e.course, e.provider].filter(Boolean).join(', ')}
                      {e.year ? ` (${e.year})` : ''}
                      {e.verified ? ' (confirmed by the provider)' : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      {posts && showFeed && (
        <section aria-label="Posts" className={styles.stack}>
          <h2 className={`px ${styles.h2}`}>Posts</h2>
          {posts.items.length === 0 ? (
            <Empty>No posts yet.</Empty>
          ) : (
            posts.items.map((post) => <PostCard key={post.id} post={post} />)
          )}
          {posts.next && (
            <More
              href={`/community/u/${p.username}?cursor=${posts.next}${asStranger ? '&view=public' : ''}`}
            />
          )}
        </section>
      )}
    </>
  );
}

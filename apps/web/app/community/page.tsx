import { Fragment } from 'react';
import { AdSlot } from '@/components/ads/AdSlot';
import { Composer, ShareFarm } from '@/components/community/Composer';
import { Empty, More, PostCard, SubNav, Tabs } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import { asUser, featureSwitches } from '@/server/auth/accounts';
import { feedPage, myFarms, type FeedTab } from '@/server/community/data';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

const TABS: FeedTab[] = ['friends', 'everyone', 'groups'];
/** A sponsored post after every this many posts (mockup H, and the admin's slot list). */
const SPONSORED_EVERY = 8;
const EMPTY: Record<FeedTab, string> = {
  friends:
    'Nothing here yet. Follow people to see what they did on their Daily Farm each day. Find them under Find people.',
  everyone: 'No posts yet. Be the first to share something.',
  groups: 'You are not in a group with any posts yet.',
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; cursor?: string }>;
}) {
  const { me, deps } = await requireMember();
  const q = await searchParams;
  const tab: FeedTab = TABS.includes(q.tab as FeedTab) ? (q.tab as FeedTab) : 'friends';
  const switches = await featureSwitches(deps.sql);
  if (!switches.feed_posts) {
    return (
      <>
        <h1 className={`px ${styles.title}`}>Community</h1>
        <SubNav here="feed" />
        <Empty>The feed is not open yet. You can still find people and set up your profile.</Empty>
      </>
    );
  }
  const { page, farms } = await asUser(deps.sql, me.userId, async (tx) => ({
    page: await feedPage(tx, me.userId, tab, q.cursor ?? null),
    farms: q.cursor ? [] : await myFarms(tx),
  }));
  return (
    <>
      <h1 className={`px ${styles.title}`}>Community</h1>
      <SubNav here="feed" />
      {/* PC: the feed, and a 340 px right column for the side ads (mockup H). The column is kept
          only while ads are on, so the feed does not jump when the slot fills in. */}
      <div className={styles.cols} data-side={switches.ads ? '' : undefined}>
        <div className={styles.feed}>
          {!q.cursor && <Composer />}
          {!q.cursor && <ShareFarm farms={farms} />}
          <Tabs tab={tab} />
          {page.items.length === 0 ? (
            <Empty>{EMPTY[tab]}</Empty>
          ) : (
            <div className={styles.stack}>
              {page.items.map((p, i) => (
                <Fragment key={p.id}>
                  <PostCard post={p} />
                  {/* A sponsored post after every eighth, marked as an ad (PRD 10.1, mockup H). */}
                  {(i + 1) % SPONSORED_EVERY === 0 && (
                    <AdSlot id="feed_sponsored" screen="community" />
                  )}
                </Fragment>
              ))}
            </div>
          )}
          {page.next && <More href={`/community?tab=${tab}&cursor=${page.next}`} />}
        </div>
        {/* PC only (the slot has no phone size): the community side cards. */}
        <aside className={styles.side} aria-label="Sponsors">
          <AdSlot id="pc_community_side" screen="community" />
        </aside>
      </div>
    </>
  );
}

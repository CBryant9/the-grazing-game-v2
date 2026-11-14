import { ImageResponse } from 'next/og';
import { SHARE_SIZE } from '@/lib/shareImage';
import { getPost, isUuid } from '@/server/community/data';
import { CommunityError, communityRoute } from '@/server/community/route';

export const dynamic = 'force-dynamic';

const NAVY = '#070d19';
const PANEL = '#111a2e';
const CREAM = '#f3e7cf';
const CORAL = '#ef8478';
const MUTED = '#a9b3c9';

/**
 * A picture of a post to save or share (BUILD_PLAN 4.3). Only a public post that is not in a group
 * and not removed, only the plain facts on it (its card, or its first words), and only for a member
 * the database lets see it. A followers-only post, a group post, a removed one, or one across a block
 * is a plain 404. It carries the author's username and nothing from the save.
 */
export const GET = communityRoute({ name: 'share-image', max: 20, method: 'GET' }, async (ctx) => {
  const id = ctx.url.searchParams.get('post');
  if (!isUuid(id)) throw new CommunityError(404, 'Not found.');
  const post = await ctx.run((tx) => getPost(tx, ctx.me.userId, id));
  if (!post || post.removed || post.visibility !== 'public' || post.groupId) {
    throw new CommunityError(404, 'Not found.');
  }
  const heading = post.card ? post.card.title : `@${post.author.username}`;
  const lines = post.card
    ? post.card.facts.slice(0, 6).map((f) => (f.label ? `${f.label}: ${f.value}` : f.value))
    : [(post.body ?? '').slice(0, 220)];
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: NAVY,
        color: CREAM,
        padding: 64,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            letterSpacing: 6,
            color: CORAL,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          The Grazing Game
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 24,
            fontSize: heading.length > 26 ? 66 : 88,
            lineHeight: 1.05,
            fontWeight: 800,
          }}
        >
          {heading}
        </div>
        <div style={{ display: 'flex', marginTop: 12, fontSize: 28, color: MUTED }}>
          {post.card ? `Shared by @${post.author.username}` : 'Posted on The Grazing Game'}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: PANEL,
          borderRadius: 14,
          padding: 28,
          fontSize: 34,
          lineHeight: 1.35,
        }}
      >
        {lines.map((l, i) => (
          <div key={i} style={{ display: 'flex' }}>
            {l}
          </div>
        ))}
      </div>
    </div>,
    { ...SHARE_SIZE },
  );
});

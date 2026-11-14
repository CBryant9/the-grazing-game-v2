import { communityRoute } from '@/server/community/route';
import { shareFarm } from '@/server/community/share';

export const dynamic = 'force-dynamic';

/** Share my farm: a post with a card of facts the server builds from the player's own farm, fixed at posting time. */
export const POST = communityRoute({ name: 'share', max: 6, part: 'feed_posts' }, (ctx) =>
  shareFarm(ctx.deps, ctx.me.userId, ctx.body),
);

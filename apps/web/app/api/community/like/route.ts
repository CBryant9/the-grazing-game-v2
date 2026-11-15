import { CommunityError, communityRoute } from '@/server/community/route';
import { notifyLike } from '@/server/community/notices';
import { likeAction } from '@/server/community/write';

export const dynamic = 'force-dynamic';

/** Like or unlike a post or comment the player may see. */
export const POST = communityRoute({ name: 'like', max: 90, part: 'feed_posts' }, async (ctx) => {
  const action = ctx.body.action;
  if (action !== 'like' && action !== 'unlike') {
    throw new CommunityError(400, 'That was not sent properly.');
  }
  await ctx.run((tx) => likeAction(tx, ctx.me.userId, action, ctx.body.target, ctx.body.id));
  if (action === 'like' && ctx.body.target === 'post') {
    await notifyLike(ctx.deps, ctx.me, String(ctx.body.id));
  }
  return { ok: true };
});

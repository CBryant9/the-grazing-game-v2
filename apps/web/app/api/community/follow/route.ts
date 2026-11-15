import { CommunityError, communityRoute } from '@/server/community/route';
import { idOfUsername, notifyFollow } from '@/server/community/notices';
import { followAction, type FollowAction } from '@/server/community/write';

export const dynamic = 'force-dynamic';

const ACTIONS: readonly FollowAction[] = ['follow', 'unfollow', 'accept', 'decline', 'remove'];

/** Follow, unfollow, answer a request, or remove a follower. The person is named by username and found through the player's own view. */
export const POST = communityRoute({ name: 'follow', max: 40 }, async (ctx) => {
  const action = ctx.body.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) {
    throw new CommunityError(400, 'That was not sent properly.');
  }
  const status = await ctx.run((tx) =>
    followAction(tx, ctx.me.userId, action as FollowAction, ctx.body.username),
  );
  if (action === 'follow' && status === 'accepted') {
    const followee = await idOfUsername(ctx.deps, ctx.body.username);
    if (followee) await notifyFollow(ctx.deps, ctx.me, followee);
  }
  return { status };
});

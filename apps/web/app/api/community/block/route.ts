import { CommunityError, communityRoute } from '@/server/community/route';
import { blockAction } from '@/server/community/write';

export const dynamic = 'force-dynamic';

/** Block or unblock someone. A block ends any follow between the two, both ways, and hides each from the other. */
export const POST = communityRoute({ name: 'block', max: 20 }, async (ctx) => {
  const action = ctx.body.action;
  if (action !== 'block' && action !== 'unblock') {
    throw new CommunityError(400, 'That was not sent properly.');
  }
  await ctx.run((tx) =>
    blockAction(tx, ctx.me.userId, action, {
      username: ctx.body.username,
      userId: ctx.body.userId,
    }),
  );
  return { ok: true };
});

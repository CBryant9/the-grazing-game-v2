import { communityRoute } from '@/server/community/route';
import { report } from '@/server/community/write';

export const dynamic = 'force-dynamic';

/** Report a post, comment or profile the player can see, with one of the listed reasons. */
export const POST = communityRoute({ name: 'report', max: 10 }, async (ctx) => {
  await ctx.run((tx) => report(tx, ctx.me.userId, ctx.body));
  return { ok: true };
});

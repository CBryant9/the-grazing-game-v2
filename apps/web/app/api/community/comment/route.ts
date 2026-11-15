import { CommunityError, communityRoute } from '@/server/community/route';
import { createComment, deleteComment, editComment } from '@/server/community/write';

export const dynamic = 'force-dynamic';

/** Comment on a post the player may see (one level of replies), edit or delete their own comment. */
export const POST = communityRoute(
  { name: 'comment', max: 40, part: 'feed_posts' },
  async (ctx) => {
    switch (ctx.body.action) {
      case 'create':
        return ctx.run((tx) => createComment(tx, ctx.me.userId, ctx.body));
      case 'edit':
        await ctx.run((tx) => editComment(tx, ctx.me.userId, ctx.body));
        return { ok: true };
      case 'delete':
        await ctx.run((tx) => deleteComment(tx, ctx.me.userId, ctx.body.id));
        return { ok: true };
      default:
        throw new CommunityError(400, 'That was not sent properly.');
    }
  },
);

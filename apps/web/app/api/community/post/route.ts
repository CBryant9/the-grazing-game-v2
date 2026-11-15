import { CommunityError, communityRoute } from '@/server/community/route';
import { afterPostDeleted, createPost, deletePost, editPost } from '@/server/community/write';

export const dynamic = 'force-dynamic';

/** Write, edit or delete the player's own post. A post a moderator removed can not be deleted by its author. */
export const POST = communityRoute({ name: 'post', max: 30, part: 'feed_posts' }, async (ctx) => {
  switch (ctx.body.action) {
    case 'create':
      return ctx.run((tx) => createPost(tx, ctx.me.userId, ctx.body));
    case 'edit':
      await ctx.run((tx) => editPost(tx, ctx.me.userId, ctx.body));
      return { ok: true };
    case 'delete': {
      const paths = await ctx.run((tx) => deletePost(tx, ctx.me.userId, ctx.body.id));
      await afterPostDeleted(paths);
      return { ok: true };
    }
    default:
      throw new CommunityError(400, 'That was not sent properly.');
  }
});

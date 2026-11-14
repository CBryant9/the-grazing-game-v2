import { CommunityError, communityRoute } from '@/server/community/route';
import { addPostPhoto, bodyLimitFor, LIMITS, removeFiles } from '@/server/community/photos';
import { deletePostPhoto } from '@/server/community/write';
import { isUuid } from '@/server/community/data';

export const dynamic = 'force-dynamic';

/** Add a photo to the player's own post (up to four), or take one off. A new photo waits for the image check. */
export const POST = communityRoute(
  { name: 'post-photo', max: 20, part: 'feed_posts', bodyLimit: bodyLimitFor(LIMITS.post) },
  async (ctx) => {
    if (ctx.body.action === 'remove') {
      const path = await ctx.run((tx) => deletePostPhoto(tx, ctx.me.userId, ctx.body.id));
      await removeFiles('post-photos', [path]);
      return { ok: true };
    }
    if (ctx.body.action !== 'add' || !isUuid(ctx.body.postId)) {
      throw new CommunityError(400, 'That was not sent properly.');
    }
    return addPostPhoto(ctx.deps, ctx.me.userId, ctx.body.postId, ctx.body.data);
  },
);

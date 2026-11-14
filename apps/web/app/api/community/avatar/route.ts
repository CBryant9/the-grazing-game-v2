import { bodyLimitFor, clearAvatar, LIMITS, setAvatar } from '@/server/community/photos';
import { CommunityError, communityRoute } from '@/server/community/route';

export const dynamic = 'force-dynamic';

/**
 * Set or take away the profile photo. The picture arrives as base64 in a JSON body, is cleaned
 * and stored by the server in the player's own folder, and waits for the image check.
 */
export const POST = communityRoute(
  { name: 'avatar', max: 6, bodyLimit: bodyLimitFor(LIMITS.avatar) },
  async (ctx) => {
    if (ctx.body.action === 'clear') {
      await clearAvatar(ctx.deps, ctx.me.userId);
      return { ok: true };
    }
    if (ctx.body.action !== 'set') throw new CommunityError(400, 'That was not sent properly.');
    return setAvatar(ctx.deps, ctx.me.userId, ctx.body.data);
  },
);

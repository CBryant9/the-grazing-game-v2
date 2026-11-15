import { isUuid } from '@/server/community/data';
import { servePhoto } from '@/server/community/photos';
import { CommunityError, communityRoute } from '@/server/community/route';

export const dynamic = 'force-dynamic';

/**
 * A photo, only once it has passed the check. `k=post&id=<photo id>` or `k=avatar&id=<account id>`.
 * Anything else, a photo still waiting, one the viewer may not see (a block, a private profile, a
 * followers-only post) and one that does not exist are all the same plain 404.
 */
export const GET = communityRoute({ name: 'photo', max: 600, method: 'GET' }, async (ctx) => {
  const k = ctx.url.searchParams.get('k');
  const id = ctx.url.searchParams.get('id');
  if ((k !== 'post' && k !== 'avatar') || !isUuid(id)) throw new CommunityError(404, 'Not found.');
  const photo = await servePhoto(ctx.deps, ctx.me.userId, k, id);
  if (!photo) throw new CommunityError(404, 'Not found.');
  return new Response(photo.bytes as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': photo.mime,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Disposition': 'inline',
    },
  });
});

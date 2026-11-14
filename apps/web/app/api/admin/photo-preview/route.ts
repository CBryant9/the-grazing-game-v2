import { adminRoute, AdminError } from '@/server/admin/route';
import { isUuid } from '@/server/admin/store';
import { queuedPhoto } from '@/server/community/photos';

export const dynamic = 'force-dynamic';

/**
 * A photo waiting in the manual queue, as an image for the admin page (in place of a data address
 * of up to 6 MB in the page). Admins only, by the same gate as every admin route; only a photo
 * still waiting; only a real picture of the type its name says. Anything else is a plain 404.
 */
export const GET = adminRoute({ name: 'photo-preview', max: 240, method: 'GET' }, async (ctx) => {
  const kind = ctx.url.searchParams.get('kind');
  const row = ctx.url.searchParams.get('row');
  if ((kind !== 'post_photo' && kind !== 'avatar') || !isUuid(row)) {
    throw new AdminError(404, 'Not found.');
  }
  const photo = await queuedPhoto(ctx.deps.sql, kind, row);
  if (!photo) throw new AdminError(404, 'Not found.');
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

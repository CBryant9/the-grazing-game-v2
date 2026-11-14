import { adminRoute, AdminError } from '@/server/admin/route';
import { isUuid } from '@/server/admin/store';
import { reviewPhoto } from '@/server/community/adminPhotos';

export const dynamic = 'force-dynamic';

/**
 * Approve or reject one photo in the manual queue. The page sends back the exact file it showed
 * (its id, change time and version); the database approves only that file (`approve_photo`).
 */
export const POST = adminRoute({ name: 'photos', max: 60 }, async (ctx) => {
  const b = ctx.body;
  if (b.kind !== 'post_photo' && b.kind !== 'avatar')
    throw new AdminError(400, 'That was not sent properly.');
  if (b.decision !== 'approve' && b.decision !== 'reject') {
    throw new AdminError(400, 'That was not sent properly.');
  }
  if (!isUuid(b.row) || !isUuid(b.objectId))
    throw new AdminError(400, 'That was not sent properly.');
  if (
    typeof b.updatedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(b.updatedAt)
  ) {
    throw new AdminError(400, 'That was not sent properly.');
  }
  const version = typeof b.version === 'string' && b.version.length <= 100 ? b.version : null;
  await reviewPhoto(ctx.deps.sql, ctx.admin.userId, {
    kind: b.kind,
    row: b.row,
    objectId: b.objectId,
    updatedAt: b.updatedAt,
    version,
    decision: b.decision,
  });
  return { ok: true };
});

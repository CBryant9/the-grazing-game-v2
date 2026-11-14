import { adminRoute } from '@/server/admin/route';
import { setSetting } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

/** Change one site setting. The value is parsed and checked again here. Audited in the same transaction. */
export const POST = adminRoute({ name: 'settings', max: 30, bodyLimit: 48 * 1024 }, async ({ admin, deps, body }) => {
  await setSetting(deps.sql, admin.userId, body.key, body.value);
  return { ok: true };
});

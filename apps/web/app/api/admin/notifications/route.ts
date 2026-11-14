import { adminRoute } from '@/server/admin/route';
import { setPaused } from '@/server/notify/admin';

export const dynamic = 'force-dynamic';

/** Pause or resume all notification sending. Audited in the same transaction. */
export const POST = adminRoute(
  { name: 'notifications', max: 20 },
  async ({ admin, deps, body }) => {
    const out = await setPaused(deps.sql, admin.userId, body.paused);
    return { ok: true, changed: out.changed };
  },
);

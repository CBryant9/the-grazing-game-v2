import { adminRoute } from '@/server/admin/route';
import { ADMIN_BODY_LIMIT, runAdAction } from '@/server/ads/adminActions';

export const dynamic = 'force-dynamic';

/**
 * Every admin change to ads: slots, sponsors, campaigns, creatives and uploads. Through the admin
 * gate, the shared CSRF rule and the admin limits, and each change is audited in the same step.
 */
export const POST = adminRoute(
  { name: 'ads', max: 60, bodyLimit: ADMIN_BODY_LIMIT },
  async ({ admin, deps, body }) => runAdAction(deps.sql, admin.userId, body),
);

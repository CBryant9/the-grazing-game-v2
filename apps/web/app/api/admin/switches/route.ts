import { adminRoute } from '@/server/admin/route';
import { setSwitch } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

/** Turn one feature switch on or off. Audited in the same transaction. */
export const POST = adminRoute({ name: 'switches', max: 30 }, async ({ admin, deps, body }) => {
  const out = await setSwitch(deps.sql, admin.userId, body.key, body.enabled);
  return { ok: true, changed: out.changed };
});

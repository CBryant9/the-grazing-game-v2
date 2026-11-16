import { adminRoute } from '@/server/admin/route';
import { parseUserAction, userAction } from '@/server/admin/store';

export const dynamic = 'force-dynamic';

/** One admin action on one account: suspend, ban, lift, change role, clear a refusal, sign out everywhere. */
export const POST = adminRoute({ name: 'users', max: 30 }, async ({ admin, deps, body }) => {
  const act = parseUserAction(body);
  const out = await userAction(deps.sql, admin.userId, body.userId, act, {
    emailOf: (id) => deps.provider.emailOf(id),
    pepper: deps.pepper,
  });
  return out.note ? { ok: true, note: out.note } : { ok: true };
});

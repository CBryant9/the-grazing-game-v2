import { notifyRoute } from '@/server/notify/route';
import { turnEverythingOff } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/** One tap: every type off for push and email. */
export const POST = notifyRoute({ name: 'off', max: 20, write: true }, async ({ user, nd }) => {
  await nd.sql.transaction((tx) => turnEverythingOff(tx, user.id));
  return { ok: true };
});

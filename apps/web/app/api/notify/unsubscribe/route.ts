import { notifyRoute } from '@/server/notify/route';
import { removeMyDevice } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/** Remove one device (by its id, or by the short code of this browser's own address). */
export const POST = notifyRoute(
  { name: 'unsubscribe', max: 30, write: true },
  async ({ user, nd, body }) => {
    const removed = await removeMyDevice(nd.sql, user.id, body);
    return { ok: true, removed };
  },
);

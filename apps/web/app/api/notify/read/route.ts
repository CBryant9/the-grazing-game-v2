import { notifyRoute } from '@/server/notify/route';
import { markRead } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/** Mark some messages (`ids`) or all of them (`all: true`) as read. */
export const POST = notifyRoute(
  { name: 'read', max: 60, write: true },
  async ({ user, nd, body }) => {
    return { ok: true, changed: await markRead(nd.sql, user.id, body) };
  },
);

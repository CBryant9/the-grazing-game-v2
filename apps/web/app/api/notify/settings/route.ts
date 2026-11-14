import { notifyRoute } from '@/server/notify/route';
import { setSettings } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/** The reminder time, the later reminder, quiet hours and the time zone for them. */
export const POST = notifyRoute(
  { name: 'settings', max: 30, write: true },
  async ({ user, nd, body }) => {
    await setSettings(nd.sql, user.id, body);
    return { ok: true };
  },
);

import { capabilities } from '@/server/notify/deps';
import { notifyRoute } from '@/server/notify/route';
import { setPref } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/** Turn push or email on or off for one type. */
export const POST = notifyRoute(
  { name: 'prefs', max: 60, write: true },
  async ({ user, nd, body }) => {
    const caps = await capabilities(nd);
    await setPref(nd.sql, user.id, body, caps.email);
    return { ok: true };
  },
);

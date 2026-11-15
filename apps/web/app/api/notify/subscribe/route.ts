import { GameError } from '@/server/game/game';
import { capabilities } from '@/server/notify/deps';
import { notifyRoute } from '@/server/notify/route';
import { addDevice, parseDevice } from '@/server/notify/store';

export const dynamic = 'force-dynamic';

/**
 * Save this browser as a device. The database checks the push service's host against its own
 * allow-list and refuses any other, and this answers that in plain words.
 */
export const POST = notifyRoute(
  { name: 'subscribe', max: 20, write: true },
  async ({ user, nd, body }) => {
    const caps = await capabilities(nd);
    if (!caps.push) throw new GameError(409, 'Notifications are not available right now.');
    const device = parseDevice(body);
    return { ok: true, ...(await addDevice(nd.sql, user.id, device)) };
  },
);

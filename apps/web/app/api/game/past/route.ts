import { GameError, gameServer } from '@/server/game/game';
import { route } from '@/server/game/http';
import type { PastDayWire, PastDaysResponse } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

/**
 * The farm on a past day, read only. `?day=N` gives that day's map and paddock figures; with no
 * `day` it lists the days that have a picture kept (newest first). Nothing here changes the farm.
 */
export const GET = route(
  { name: 'past', renew: true },
  async ({ req, sessionId }): Promise<PastDayWire | PastDaysResponse> => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    const params = new URL(req.url).searchParams;
    const days = params.getAll('day');
    if (days.length === 0) return { days: await gameServer().pastDays(sessionId) };
    if (days.length > 1 || !/^\d{1,9}$/.test(days[0]!)) {
      throw new GameError(400, 'That day is not valid.');
    }
    return gameServer().pastDay(sessionId, Number(days[0]));
  },
);

import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseVersion } from '@/server/game/request';

export const dynamic = 'force-dynamic';

/** Next day: the day runs and the new one starts at first light. Refused if the farm changed since it was shown. */
export const POST = route(
  { name: 'day', write: true, max: 30, renew: true },
  async ({ req, sessionId }) => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    return gameServer().endDay(sessionId, parseVersion(await readJson(req)));
  },
);

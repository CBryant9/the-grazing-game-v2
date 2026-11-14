import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseActionRequest } from '@/server/game/request';

export const dynamic = 'force-dynamic';

/** The job card for a job: time, cost and the light left after it. Nothing changes. */
export const POST = route(
  { name: 'preview', write: true, renew: true },
  async ({ req, sessionId }) => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    return gameServer().preview(sessionId, parseActionRequest(await readJson(req)));
  },
);

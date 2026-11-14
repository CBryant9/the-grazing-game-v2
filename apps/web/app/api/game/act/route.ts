import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseActionRequest } from '@/server/game/request';

export const dynamic = 'force-dynamic';

/** Do a job. Returns what happened, or the plain reason it was refused, with the new snapshot. */
export const POST = route({ name: 'act', write: true }, async ({ req, sessionId }) => {
  if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
  return gameServer().act(sessionId, parseActionRequest(await readJson(req)));
});

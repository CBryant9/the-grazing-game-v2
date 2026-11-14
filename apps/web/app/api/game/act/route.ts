import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseActionRequest, parseRequestId, parseVersion } from '@/server/game/request';

export const dynamic = 'force-dynamic';

/**
 * Do a job. Returns what happened, or the plain reason it was refused, with
 * the new snapshot. The request names the farm version the card was shown
 * on and a one-use id, so a job is never done on a farm that changed since,
 * and never done twice.
 */
export const POST = route({ name: 'act', write: true }, async ({ req, sessionId }) => {
  if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
  const body = await readJson(req);
  return gameServer().act(sessionId, parseActionRequest(body), {
    version: parseVersion(body),
    requestId: parseRequestId(body),
  });
});

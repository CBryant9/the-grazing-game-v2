import { GameError, gameServer } from '@/server/game/game';
import { route } from '@/server/game/http';
import { parseBefore } from '@/server/game/request';

export const dynamic = 'force-dynamic';

/**
 * The Scores and Diary panels: the year so far, the finished years and a page
 * of the diary. `?before=<day>` asks for diary days older than that day.
 */
export const GET = route({ name: 'record', renew: true }, async ({ req, sessionId }) => {
  const before = parseBefore(new URL(req.url).searchParams);
  if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
  return gameServer().record(sessionId, before);
});

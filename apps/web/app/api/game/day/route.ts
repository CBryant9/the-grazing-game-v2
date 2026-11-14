import { GameError, gameServer } from '@/server/game/game';
import { route } from '@/server/game/http';

export const dynamic = 'force-dynamic';

/** Next day: the day runs and the new one starts at first light. */
export const POST = route({ name: 'day', write: true, max: 30 }, async ({ sessionId }) => {
  if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
  return gameServer().endDay(sessionId);
});

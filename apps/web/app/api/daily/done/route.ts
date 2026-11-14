import { GameError, gameServer } from '@/server/game/game';
import { route } from '@/server/game/http';
import type { FarmResponse } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

/** "Done for today" on a Daily Farm: a fact on the farm card. Nothing is skipped and nothing is closed. */
export const POST = route(
  { name: 'daily-done', write: true, max: 20 },
  async ({ sessionId }): Promise<FarmResponse> => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    return { snapshot: await gameServer().dailyDone(sessionId) };
  },
);

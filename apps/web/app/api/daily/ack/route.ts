import { GameError, gameServer } from '@/server/game/game';
import { route } from '@/server/game/http';
import type { FarmResponse } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

/** The player has seen the catch-up on a Daily Farm: the missed days and the worker report are cleared. */
export const POST = route(
  { name: 'daily-ack', write: true, max: 20 },
  async ({ sessionId }): Promise<FarmResponse> => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    return { snapshot: await gameServer().dailyAck(sessionId) };
  },
);

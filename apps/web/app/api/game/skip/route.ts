import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import type { SkipRequestLength } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

const LENGTHS: readonly SkipRequestLength[] = ['week', 'month', 'year'];

/** Skip a week, a month or a year. Stops early for the reasons the engine gives. */
export const POST = route({ name: 'skip', write: true, max: 10 }, async ({ req, sessionId }) => {
  if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
  const body = (await readJson(req)) as Record<string, unknown> | null;
  const length = body?.length;
  if (typeof length !== 'string' || !LENGTHS.includes(length as SkipRequestLength)) {
    throw new GameError(400, 'Choose a week, a month or a year.');
  }
  return gameServer().skip(sessionId, length as SkipRequestLength, body?.anyway === true);
});

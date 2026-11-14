import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';

export const dynamic = 'force-dynamic';

/** The player opened the inbox: say how far they have read. Returns the new snapshot. */
export const POST = route({ name: 'inbox', write: true }, async ({ req, sessionId }) => {
  if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
  const body = await readJson(req);
  const upTo =
    typeof body === 'object' && body !== null ? (body as { upTo?: unknown }).upTo : undefined;
  if (typeof upTo !== 'number' || !Number.isInteger(upTo) || upTo < 0 || upTo > 2 ** 31) {
    throw new GameError(400, 'Say which message you have read up to.');
  }
  return { snapshot: await gameServer().markRead(sessionId, upTo) };
});

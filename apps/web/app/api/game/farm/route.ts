import { BROKEN_MESSAGE, GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseSetup } from '@/server/game/setup';
import type { FarmResponse } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

/** The session's farm as a snapshot, null when it has none, or a plain message when it can't be opened. */
export const GET = route({ name: 'farm' }, async ({ sessionId }): Promise<FarmResponse> => {
  if (!sessionId) return { snapshot: null };
  const snap = await gameServer().snapshot(sessionId, true);
  return snap === 'broken' ? { snapshot: null, broken: BROKEN_MESSAGE } : { snapshot: snap };
});

/** Create the session's farm from the setup choices. */
export const POST = route(
  { name: 'create', mint: true, write: true, max: 10 },
  async ({ req, sessionId }): Promise<FarmResponse> => {
    const parsed = parseSetup(await readJson(req));
    if (!parsed.ok) throw new GameError(400, parsed.message);
    return { snapshot: await gameServer().create(sessionId!, parsed.value) };
  },
);

/** Throw the session's farm away, to start another. A farm that can't be opened is kept aside. */
export const DELETE = route(
  { name: 'remove', write: true, max: 10 },
  async ({ sessionId }): Promise<FarmResponse> => {
    if (sessionId) await gameServer().remove(sessionId);
    return { snapshot: null };
  },
);

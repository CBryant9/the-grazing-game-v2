import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseVersion } from '@/server/game/request';
import type { SkipRequestLength } from '@/lib/game/types';
import { trackServer } from '@/server/analytics/collect';

export const dynamic = 'force-dynamic';

const LENGTHS: readonly SkipRequestLength[] = ['week', 'month', 'year'];

/** Skip a week, a month or a year. Stops early for the reasons the engine gives. */
export const POST = route(
  { name: 'skip', write: true, max: 10, renew: true },
  async ({ req, sessionId, player }) => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    const body = (await readJson(req)) as Record<string, unknown> | null;
    const length = body?.length;
    if (typeof length !== 'string' || !LENGTHS.includes(length as SkipRequestLength)) {
      throw new GameError(400, 'Choose a week, a month or a year.');
    }
    const out = await gameServer().skip(
      sessionId,
      length as SkipRequestLength,
      body?.anyway === true,
      parseVersion(body),
    );
    // Analytics (m5.3): the length asked for, in days.
    await trackServer(req, player.user?.id ?? null, 'skip_used', {
      mode: 'fast',
      days: length === 'week' ? 7 : length === 'month' ? 30 : 365,
    });
    return out;
  },
);

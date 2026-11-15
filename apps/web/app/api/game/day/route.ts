import { GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseVersion } from '@/server/game/request';
import { endedDays, trackServer } from '@/server/analytics/collect';

export const dynamic = 'force-dynamic';

/** Next day: the day runs and the new one starts at first light. Refused if the farm changed since it was shown. */
export const POST = route(
  { name: 'day', write: true, max: 30, renew: true },
  async ({ req, sessionId, player }) => {
    if (!sessionId) throw new GameError(404, 'There is no farm yet. Set one up first.');
    const out = await gameServer().endDay(sessionId, parseVersion(await readJson(req)));
    // Analytics (m5.3): a Fast Farm day (a Daily Farm never ends its day here).
    if (!('reason' in out && out.reason === 'stale')) {
      await trackServer(req, player.user?.id ?? null, 'day_completed', { mode: 'fast' });
    }
    const ended = endedDays(out);
    if (ended !== null) {
      await trackServer(req, player.user?.id ?? null, 'farm_ended', { mode: 'fast', days: ended });
    }
    return out;
  },
);

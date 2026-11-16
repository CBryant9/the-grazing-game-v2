import { myData } from '@/server/auth/accounts';
import { authRoute, requireUser } from '@/server/auth/route';

export const dynamic = 'force-dynamic';

/**
 * Download my data: a JSON file the database builds (`export_my_data`). It holds everything kept
 * about the player except the engine's save and the action log, which hold the game's rules
 * (docs/DATABASE.md). It is only ever the signed-in player's own, and is never cached.
 */
export const GET = authRoute(
  { name: 'data', max: 6, windowMs: 600_000, by: 'session' },
  async (ctx) => {
    const { deps, user } = await requireUser(ctx);
    const data = await myData(deps, user.id);
    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="grazing-game-my-data.json"',
      },
    });
  },
);

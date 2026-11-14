import { authDeps } from '@/server/auth/deps';
import { BROKEN_MESSAGE, GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { parseSetup } from '@/server/game/setup';
import { FARM_COOKIE, newFarm } from '@/server/player';
import { clearCookieText, cookieText } from '@/server/security';
import type { FarmResponse } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

/**
 * The open farm as a snapshot, null when there is none, or a plain message when it can't be
 * opened. An account with more than one farm and none chosen gets the list to pick from.
 */
export const GET = route(
  { name: 'farm', renew: true },
  async ({ sessionId, player }): Promise<FarmResponse> => {
    if (player.mustPick && player.user) {
      return {
        snapshot: null,
        pick: await gameServer().farms({ kind: 'user', id: player.user.id }, null),
      };
    }
    if (!sessionId) return { snapshot: null };
    const snap = await gameServer().snapshot(sessionId, true);
    return snap === 'broken' ? { snapshot: null, broken: BROKEN_MESSAGE } : { snapshot: snap };
  },
);

/**
 * Start a farm from the setup choices. A signed-in account (sign-up finished) gets an account
 * farm, up to its limit. Anyone else gets the guest's one farm, as before.
 */
export const POST = route(
  { name: 'create', mint: true, write: true, max: 10 },
  async ({ req, sessionId, player, setCookies }): Promise<FarmResponse> => {
    const parsed = parseSetup(await readJson(req));
    if (!parsed.ok) throw new GameError(400, parsed.message);
    const deps = authDeps();
    // A finished account starts an account farm. Anyone else (a visitor, a sign-in not finished,
    // one refused as under 14) starts the guest's one farm.
    if (player.user && player.signedUp && deps) {
      const farm = newFarm();
      const snapshot = await gameServer().create(farm.key, parsed.value, {
        kind: 'user',
        id: player.user.id,
      });
      setCookies.push(cookieText(req, FARM_COOKIE, farm.id, 0).replace('; Max-Age=0', ''));
      return { snapshot };
    }
    return { snapshot: await gameServer().create(sessionId!, parsed.value) };
  },
);

/** Throw the open farm away, to start another. A farm that can't be opened is kept aside. */
export const DELETE = route(
  { name: 'remove', write: true, max: 10 },
  async ({ req, sessionId, player, setCookies }): Promise<FarmResponse> => {
    if (sessionId) await gameServer().remove(sessionId);
    if (player.user) setCookies.push(clearCookieText(req, FARM_COOKIE));
    return { snapshot: null };
  },
);

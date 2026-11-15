import { authDeps } from '@/server/auth/deps';
import { farmLimits, fastLimits, featureSwitches } from '@/server/auth/accounts';
import { BROKEN_MESSAGE, GameError, gameServer } from '@/server/game/game';
import { readJson, route } from '@/server/game/http';
import { FARM_COOKIE } from '@/server/player';
import { clearCookieText, cookieText } from '@/server/security';
import type { FarmResponse, FarmsResponse } from '@/lib/game/types';

export const dynamic = 'force-dynamic';

const FARM_ID = /^[0-9a-f]{32}$/;
const NEED_SIGN_IN = 'Sign in to keep more than one farm.';

async function listFor(userId: string, currentId: string | null): Promise<FarmsResponse> {
  const deps = authDeps();
  const farms = await gameServer().farms({ kind: 'user', id: userId }, currentId);
  const { limit, going } = deps ? await fastLimits(deps, userId) : { limit: 0, going: 0 };
  // With Daily Farm switched off its slots are not offered.
  const dailyOn = deps ? (await featureSwitches(deps.sql)).daily_farm : false;
  const daily = deps && dailyOn ? await farmLimits(deps, userId, 'daily') : { limit: 0, going: 0 };
  return { farms, limit, going, dailyLimit: daily.limit, dailyGoing: daily.going, signedIn: true };
}

const owns = async (userId: string, id: string): Promise<boolean> =>
  (await gameServer().farms({ kind: 'user', id: userId }, null)).some((f) => f.id === id);

/** The account's farms for the picker. A guest has one farm and no picker. */
export const GET = route({ name: 'farms' }, async ({ player }): Promise<FarmsResponse> => {
  if (!player.user) {
    return { farms: [], limit: 1, going: 0, dailyLimit: 0, dailyGoing: 0, signedIn: false };
  }
  return listFor(player.user.id, player.farmId);
});

/** Open one of the account's farms (`{ id }`), or go back to the picker (`{ id: null }`). */
export const POST = route(
  { name: 'farms-open', write: true, readOnlyOk: true, max: 20 },
  async ({ req, player, setCookies }): Promise<FarmResponse | { ok: true }> => {
    if (!player.user) throw new GameError(401, NEED_SIGN_IN);
    const body = (await readJson(req)) as { id?: unknown } | null;
    if (body?.id === null) {
      setCookies.push(clearCookieText(req, FARM_COOKIE));
      return { ok: true };
    }
    const id = body?.id;
    if (typeof id !== 'string' || !FARM_ID.test(id)) throw new GameError(400, 'Choose a farm.');
    // Only a farm the account owns can be opened: the list is the account's own.
    if (!(await owns(player.user.id, id))) throw new GameError(404, 'That farm was not found.');
    setCookies.push(cookieText(req, FARM_COOKIE, id, 0).replace('; Max-Age=0', ''));
    const snap = await gameServer().snapshot(`farm:${id}`, true);
    return snap === 'broken' ? { snapshot: null, broken: BROKEN_MESSAGE } : { snapshot: snap };
  },
);

/** Delete one of the account's farms (`{ id }`). The browser confirms first; this can not be undone. */
export const DELETE = route(
  { name: 'farms-delete', write: true, max: 10 },
  async ({ req, player, setCookies }): Promise<FarmsResponse> => {
    if (!player.user) throw new GameError(401, NEED_SIGN_IN);
    const body = (await readJson(req)) as { id?: unknown } | null;
    const id = body?.id;
    if (typeof id !== 'string' || !FARM_ID.test(id)) throw new GameError(400, 'Choose a farm.');
    if (!(await owns(player.user.id, id))) throw new GameError(404, 'That farm was not found.');
    await gameServer().remove(`farm:${id}`);
    if (player.farmId === id) setCookies.push(clearCookieText(req, FARM_COOKIE));
    return listFor(player.user.id, player.farmId === id ? null : player.farmId);
  },
);

import 'server-only';
import type { SetupOptions } from '../../lib/game/types';
import { dailyOffer } from '../daily/offer';
import { logFailure } from '../logging';
import { FARM_COOKIE, type Player } from '../player';
import { SESSION_COOKIE } from './http';
import { setupOptions } from './setup';
import { sheepSwitchOn } from './switches';

/** A visitor with no cookies: no account and no farm. */
const NEW_VISITOR: Player = {
  user: null,
  key: null,
  farmId: null,
  mustPick: false,
  signedUp: false,
  farmCount: 0,
  guestSession: null,
};

/** Any cookie that could lead to a farm: the guest session, the open farm, or a sign-in. */
const mayHaveFarm = (name: string): boolean =>
  name === SESSION_COOKIE || name === FARM_COOKIE || name.startsWith('sb-');

/**
 * The setup choices to draw in the page's HTML (m8, the /play speed fix), or null.
 *
 * A request that carries none of the game's cookies can have no farm, so the server already knows
 * the first screen is setup. Drawing it in the HTML means the largest paint does not wait for the
 * scripts, then the farm request, then the setup request (LESSONS W5). The browser still asks for
 * the farm once it is running, as before, and moves to whatever the answer says. Any cookie, or
 * any failure here: null, and the page loads as before.
 */
export async function firstSetup(cookies: { name: string }[]): Promise<SetupOptions | null> {
  if (cookies.some((c) => mayHaveFarm(c.name))) return null;
  try {
    return { ...setupOptions(await sheepSwitchOn()), daily: await dailyOffer(NEW_VISITOR) };
  } catch (e) {
    logFailure({ route: 'play-page', reason: 'first_setup' }, e);
    return null;
  }
}

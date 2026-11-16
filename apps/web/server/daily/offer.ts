import 'server-only';
import type { DailyOffer } from '../../lib/game/types';
import { farmLimits, featureSwitches } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { DAILY_NEEDS_ACCOUNT, DAILY_NO_DATABASE, DAILY_SWITCHED_OFF } from '../game/game';
import type { Player } from '../player';
import { sqlFromEnv } from '../db/sql';
import { devLocalDaily } from './runtime';

/** The line setup shows while Daily Farm runs on farm files in development (GG_DEV_LOCAL_DAILY). */
export const DAILY_DEV_LOCAL =
  'Development copy: this Daily Farm is kept in a farm file on this computer, with no database. Each night runs when you next open the farm.';

/** The line setup shows when there is a database but sign-in is not set up, so nobody can hold a Daily Farm. */
export const DAILY_NO_SIGN_IN =
  'Daily Farm needs an account, and sign-in is not set up on this copy of the game yet. Fast Farm is ready to play now.';

/** What setup says about Daily Farm for this player. Facts, in plain words. */
export async function dailyOffer(player: Player): Promise<DailyOffer> {
  const deps = authDeps();
  const off = (text: string): DailyOffer => ({ state: 'off', text, limit: 0, going: 0 });
  // No database: no accounts and nowhere to keep a Daily Farm, unless the development setting is on.
  if (!deps) {
    if (sqlFromEnv()) return off(DAILY_NO_SIGN_IN);
    return devLocalDaily()
      ? { state: 'open', text: DAILY_DEV_LOCAL, limit: 1, going: 0 }
      : off(DAILY_NO_DATABASE);
  }
  if (!(await featureSwitches(deps.sql)).daily_farm) return off(DAILY_SWITCHED_OFF);
  if (!player.user || !player.signedUp) {
    return { state: 'guest', text: DAILY_NEEDS_ACCOUNT, limit: 0, going: 0 };
  }
  const { limit, going } = await farmLimits(deps, player.user.id, 'daily');
  if (going >= limit) {
    return {
      state: 'full',
      text: `You have ${going} of the ${limit} Daily Farms this account can have. Finish or delete one to start another.`,
      limit,
      going,
    };
  }
  return {
    state: 'open',
    text: `One game day for each real day, in your time zone. You have ${going} of ${limit} Daily Farms.`,
    limit,
    going,
  };
}

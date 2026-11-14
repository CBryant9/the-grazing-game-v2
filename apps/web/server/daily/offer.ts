import 'server-only';
import type { DailyOffer } from '../../lib/game/types';
import { farmLimits, featureSwitches } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { COMING_MESSAGE, DAILY_NEEDS_ACCOUNT } from '../game/game';
import type { Player } from '../player';

/** What setup says about Daily Farm for this player. Facts, in plain words. */
export async function dailyOffer(player: Player): Promise<DailyOffer> {
  const deps = authDeps();
  const coming: DailyOffer = { state: 'coming', text: COMING_MESSAGE, limit: 0, going: 0 };
  // No database means no accounts and no Daily Farm. The same plain "coming" state as the switch being off.
  if (!deps || !(await featureSwitches(deps.sql)).daily_farm) return coming;
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

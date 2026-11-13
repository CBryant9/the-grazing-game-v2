/**
 * Acting on a farm WITHOUT the farm clock. For calibration and tests only.
 *
 * In the game every job takes time: the player drives to it, it uses
 * today's light, and what does not fit carries over (docs/MODEL.md,
 * section 9). The calibration suites and the MVP comparisons were written
 * before jobs took time, and their figures depend on a farm being set up
 * all at once on day 0: a whole fence, a trough, a mob bought and put
 * straight in. This is the one way to do that.
 *
 * It is the only place that sets `ActionEnv.instant`. Engine code may not
 * import test support (the lint rule in eslint.config.mjs), and
 * `src/day/instantPath.test.ts` checks that nothing else in the repo sets
 * the flag. A player can't reach it: it is not part of an action, and the
 * server builds the `env` itself.
 */

import type { ActionEnv } from '../src/actions/apply';
import type { Action, ActionResult } from '../src/actions/types';
import { applyAction } from '../src/day/act';
import type { FarmState } from '../src/sim/state';

/** Do a whole action at once: no travel, no job time, no daylight limit, nothing left in progress. */
export function applyInstantly(farm: FarmState, action: Action, env: ActionEnv = {}): ActionResult {
  return applyAction(farm, action, { ...env, instant: true });
}

/**
 * Acting on a farm WITHOUT the farm clock. For calibration and tests only.
 *
 * In the game every job takes time and uses today's light, and a job that
 * does not fit is refused (docs/MODEL.md, section 9). The calibration suites and the MVP comparisons were written
 * before jobs took time, and their figures depend on a farm being set up
 * all at once on day 0: a whole fence, a trough, a mob bought and put
 * straight in. This is the one way to do that.
 *
 * It reaches the instant path by importing `applyInstant` from the
 * engine's own file. That function is not exported from the engine's
 * index, engine code may not import it or this file (the lint rules in
 * eslint.config.mjs), and the public `applyAction` has no switch for it:
 * `src/day/instantPath.test.ts` holds all three. A player can't reach it.
 */

import { applyInstant, type ActionEnv } from '../src/actions/apply';
import type { Action, ActionResult } from '../src/actions/types';
import type { FarmState } from '../src/sim/state';

/** Do a whole action at once: no job time and no daylight limit. */
export function applyInstantly(farm: FarmState, action: Action, env: ActionEnv = {}): ActionResult {
  return applyInstant(farm, action, env);
}

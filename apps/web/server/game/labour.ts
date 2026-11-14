import 'server-only';
import type { Action, FarmState } from '@gg/engine';
import { edgesOf } from './build';

/**
 * Checking the workforce actions a browser asks for: hiring and letting
 * go, ordering a fencing team and cancelling it. The browser is never
 * trusted: every number is a whole number in range and the line is checked
 * like any other. The browser can not say whether the farm's hands help the
 * team: the server decides from the farm (PRD 5.11, "The player's hands can
 * help them"), so a card can only show what will happen.
 */

const int = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null;

/** The hire, let go, order and cancel actions. Null when the request is not well formed. */
export function parseLabourAction(a: Record<string, unknown>, farm?: FarmState): Action | null {
  switch (a.type) {
    case 'hireHand': {
      const person = int(a.person, 0, 1e9);
      return person === null ? null : { type: 'hireHand', person };
    }
    case 'letHandGo': {
      const hand = int(a.hand, 0, 1e9);
      return hand === null ? null : { type: 'letHandGo', hand };
    }
    case 'orderContractFence': {
      const edges = edgesOf(a.edges);
      if (!edges || (a.team !== 1 && a.team !== 2)) return null;
      return {
        type: 'orderContractFence',
        edges,
        team: a.team,
        handsHelp: (farm?.labour?.hands.length ?? 0) > 0,
      };
    }
    case 'cancelContractFence': {
      const run = int(a.run, 0, 1e9);
      return run === null ? null : { type: 'cancelContractFence', run };
    }
    default:
      return null;
  }
}

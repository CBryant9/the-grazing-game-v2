/**
 * The growth phase of one square, as a plain description.
 *
 * This is the MVP's phaseOf (docs/MODEL.md, section 1, Phase labels). It
 * describes what is there. It never says whether the grazing was right.
 */

import type { PastureState } from './state';

export type PhaseId =
  | 'bare'
  | 'veryShortGreen'
  | 'veryShort'
  | 'goneToHead'
  | 'hayedOff'
  | 'phase1'
  | 'phase2'
  | 'phase3';

/** The wording shown for each phase, as in the MVP. */
export const PHASE_LABELS: Readonly<Record<PhaseId, string>> = {
  bare: 'Bare: losing ground cover',
  veryShortGreen: 'Very short, green',
  veryShort: 'Very short',
  goneToHead: 'Gone to head: tall, rank, stale',
  hayedOff: 'Hayed off, dormant',
  phase1: 'Phase 1, short regrowth',
  phase2: 'Phase 2, leafy, best quality',
  phase3: 'Phase 3, maturing, losing quality',
};

/** The phase of square `i`. The checks run in this order; the first that fits wins. */
export function phaseOf(state: PastureState, i: number): PhaseId {
  const g = state.G[i]!;
  const a = state.A[i]!;
  const B = g + state.D[i]!;
  const x = state.X[i]!;
  if (B < 450) return 'bare';
  if (B < 1000 && x < 0.55) return g > B * 0.5 ? 'veryShortGreen' : 'veryShort';
  if (x > 0.55) return 'goneToHead';
  if (g < 200) return 'hayedOff';
  if (g < 900) return 'phase1';
  if (a < 45 && g < 2600) return 'phase2';
  return 'phase3';
}

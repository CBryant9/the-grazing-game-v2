import { isLineTool, type BuildState } from './build';

/**
 * The step chip on the map while building: where the player is up to and
 * exactly what to do next, in plain words. Pure, so it can be tested
 * without a screen. Facts and instructions only, never praise or blame.
 */
export interface BuildGuide {
  /** The steps of this kind of job, in order: three short words. */
  steps: readonly string[];
  /** The step the player is on, 0 to 2. */
  at: number;
  /** What to do next, one short sentence. */
  text: string;
}

export const LINE_STEPS = ['Draw', 'Check', 'Build'] as const;
export const TAP_STEPS = ['Tap', 'Check', 'Confirm'] as const;

/** What the chip says to start a line, for each line tool. */
export const LINE_START: Record<'fence' | 'pipe', string> = {
  fence: 'Drag along the grid from a fence or a corner.',
  pipe: 'Drag across squares from the bore, a trough, a hub or pipe.',
};

/**
 * The chip for a build state. `help` is the tool's own help line from the
 * server, used for the first step of a tap tool. Null when no chip shows:
 * no tool, the job is done (its card shows the result), or a fallen fence's
 * card, which needs no tool.
 */
export function buildGuide(b: BuildState | null, help: string): BuildGuide | null {
  if (!b || b.phase === 'done' || b.tool === 'fix') return null;
  if (isLineTool(b.tool)) {
    const steps = LINE_STEPS;
    if (b.drawing) return { steps, at: 0, text: 'Let go to see the cost.' };
    switch (b.phase) {
      case 'pick':
        return { steps, at: 0, text: b.message ?? LINE_START[b.tool] };
      case 'previewing':
        return { steps, at: 1, text: 'Checking the cost.' };
      case 'blocked':
        return {
          steps,
          at: 1,
          text: 'The card says why it cannot be built. Drag again to change the line, or Cancel.',
        };
      case 'confirm':
        return {
          steps,
          at: 2,
          text: `Check the card, then press ${b.team ? 'Order the team' : 'Build it'}. Drag from either end to change the line.`,
        };
      case 'applying':
        return { steps, at: 2, text: 'Building.' };
    }
  }
  const steps = TAP_STEPS;
  if (b.moving) {
    return {
      steps,
      at: 0,
      text:
        b.moving.kind === 'hub'
          ? 'Tap the fence corner to move it to.'
          : 'Tap the square to move it to.',
    };
  }
  if (b.choice) return { steps, at: 1, text: 'Pick what to do with it on the card.' };
  switch (b.phase) {
    case 'pick':
      return { steps, at: 0, text: b.message ?? help };
    case 'previewing':
      return { steps, at: 1, text: 'Checking.' };
    case 'blocked':
      return { steps, at: 1, text: 'The card says why. Tap something else, or OK.' };
    case 'confirm':
      return {
        steps,
        at: 2,
        text: b.picked ? `Check the card, then press ${b.picked.confirm}.` : 'Check the card.',
      };
    case 'applying':
      return { steps, at: 2, text: 'Working.' };
  }
  return null;
}

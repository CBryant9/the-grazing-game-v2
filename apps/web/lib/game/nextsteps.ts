import { sidesOf } from './build';
import type { BuildToolId, Snapshot, TodoWire } from './types';

/**
 * What to do next, made obvious (Claudia, 19 Nov 2026: "the navigation and
 * knowing what to do needs to be more obvious, visual and easier to
 * navigate"). Pure functions, so they can be tested without a screen.
 *
 * - First steps: a farm with no stock water, one big paddock or no stock
 *   gets one plain fact each, with a button that takes the player straight
 *   there (the tool picked and the map framed, or the right tab).
 * - Where a thing to do goes: the tool and the spot on the map that a
 *   Things to do row's button opens.
 *
 * Facts only, never praise or blame, and each can be put away.
 */

/** Where a button takes the player: a build tool (with a square to frame), or a tab. */
export type NextGo =
  { kind: 'tool'; tool: BuildToolId; square: number | null } | { kind: 'tab'; tab: 'market' };

export interface NextStep {
  key: 'water' | 'paddocks' | 'stock';
  text: string;
  button: string;
  go: NextGo;
}

/** The farm, as far as the first steps read it. */
export type FirstStepFarm = Pick<Snapshot, 'paddocks' | 'mobs' | 'view'>;

/** The first steps this farm shows, leaving out the ones put away. Empty for a farm that has them all. */
export function firstSteps(farm: FirstStepFarm, off: readonly string[] = []): NextStep[] {
  const out: NextStep[] = [];
  const { paddocks, mobs, view } = farm;
  if (paddocks.length > 0 && paddocks.every((p) => p.water === 'none')) {
    out.push({
      key: 'water',
      text: 'No paddock has stock water yet. Water starts at the bore.',
      button: 'Put in a trough',
      go: { kind: 'tool', tool: 'trough', square: view.water.bore },
    });
  }
  if (paddocks.length === 1) {
    out.push({
      key: 'paddocks',
      text: `The whole farm is one paddock of ${Math.round(paddocks[0]!.ha).toLocaleString('en-AU')} ha.`,
      button: 'Draw a fence',
      go: { kind: 'tool', tool: 'fence', square: null },
    });
  }
  if (mobs.length === 0) {
    out.push({
      key: 'stock',
      text: 'There is no stock on the farm yet.',
      button: 'Open the market',
      go: { kind: 'tab', tab: 'market' },
    });
  }
  return out.filter((s) => !off.includes(s.key));
}

/** The square in the paddock a mob is in, or null (yards, a lot, or a mob not found). */
export function mobSquare(farm: Pick<Snapshot, 'paddocks'>, mob: number): number | null {
  return farm.paddocks.find((p) => p.mobs.includes(mob))?.cell ?? null;
}

/**
 * A second button for a Things to do row, where one helps: a mob with no
 * water gets "Put in a trough", with the trough tool picked and the map on
 * its paddock. Null for the rest (their own button already does the job).
 */
export function todoGo(
  farm: Pick<Snapshot, 'paddocks'>,
  item: { key: string; mob?: number | null },
): { button: string; go: NextGo } | null {
  if (item.key.startsWith('no-water:') && item.mob != null) {
    return {
      button: 'Put in a trough',
      go: { kind: 'tool', tool: 'trough', square: mobSquare(farm, item.mob) },
    };
  }
  return null;
}

/** The square to frame for a fence segment: the square beside it on the farm. */
export function edgeSquare(edge: TodoWire['edge']): number | null {
  if (!edge) return null;
  const [a, b] = sidesOf(edge);
  return b >= 0 ? b : a >= 0 ? a : null;
}

// ---- Keeping first steps put away, in the browser

/** The key the first steps put away are kept under in localStorage. */
export const FIRST_OFF_KEY = 'gg-first-off';

/** Read the first steps put away. Anything that is not a list of step keys gives none. */
export function parseFirstOff(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const x: unknown = JSON.parse(raw);
    return Array.isArray(x) ? x.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * How each kind of line is drawn apart from its colour. A line must be
 * told apart without colour (colour-blind players: pink, lilac and blue
 * run close under protanopia and deuteranopia), so every kind has a pattern
 * of its own. The contractor's fence is the only one with cross ticks.
 *
 * - `solid`: one steady line (permanent and electric fence, pipe, a gate rail).
 * - `dashed`: a line cut into dashes (tape).
 * - `sag`: a line that dips to the ground between posts (a fence that is down).
 * - `ticks`: a solid line crossed by short bars at an even spacing, like
 *   sleepers on a railway (the contractor's fence, built).
 * - `dashed-ticks`: the same bars along a dashed line (the contractor's fence,
 *   still to build).
 * - `mesh`: a solid line with a fine zigzag worked along it, like the diamonds
 *   of wire netting (sheep netting). Zoomed in the zigzag crosses itself
 *   between two wires, so the diamonds show.
 */
export type LinePattern = 'solid' | 'dashed' | 'sag' | 'ticks' | 'dashed-ticks' | 'mesh';

export type LineStyleId =
  | 'permanent'
  | 'electric'
  | 'tape'
  | 'pipe'
  | 'fenceDown'
  | 'netting'
  | 'contractBuilt'
  | 'contractLeft';

export const LINE_PATTERN: Record<LineStyleId, LinePattern> = {
  permanent: 'solid',
  electric: 'solid',
  tape: 'dashed',
  pipe: 'solid',
  fenceDown: 'sag',
  netting: 'mesh',
  contractBuilt: 'ticks',
  contractLeft: 'dashed-ticks',
};

/** The text tag on a team's fence, said in words so colour is never the only cue. */
export const CONTRACT_TAG = 'Team fence';

/** Cross ticks along the contractor's fence: spacing and length, in screen pixels at every zoom. */
export const TICK = { spacingPx: 13, lengthPx: 11 } as const;

/**
 * The mesh on sheep netting zoomed out, in screen pixels: how far the zigzag
 * swings either side of the line, how far apart its turns are, and how thick
 * its dark stroke is. Zoomed in the mesh is sized in squares (see map.ts).
 */
export const MESH = { swingPx: 1.25, stepPx: 3.6, widthPx: 1.1 } as const;

/** Pixels per square from which the "Team fence" tag is drawn: wide enough to read. */
export const CONTRACT_TAG_MIN_PX = 30;

/** Distances along a line of `lengthPx` where a tick goes, evenly spaced and centred in each space. */
export function tickOffsets(lengthPx: number, spacingPx: number = TICK.spacingPx): number[] {
  const out: number[] = [];
  for (let s = spacingPx / 2; s < lengthPx; s += spacingPx) out.push(s);
  return out;
}

/**
 * Paddocks a player can pick, outlined on the map while a tool asks for a
 * paddock (moving a mob, say). Pure, so it can be tested without PixiJS.
 */

/** A paddock that can be picked. `dry` is true where stock there would have no water. */
export interface PickablePaddock {
  paddock: number;
  dry: boolean;
}

/** One outline to draw: a light one for a paddock that can be picked, a red one where there is no water. */
export interface PickableDraw {
  paddock: number;
  kind: 'pick' | 'dry';
}

/**
 * The outlines for a list of pickable paddocks. A paddock that is already
 * drawn as the highlight is left out, so it is not drawn twice. Repeats
 * count once. A null list draws nothing.
 */
export function pickableDraws(
  list: readonly PickablePaddock[] | null,
  highlight: number | null,
): PickableDraw[] {
  if (!list) return [];
  const seen = new Set<number>();
  const out: PickableDraw[] = [];
  for (const p of list) {
    if (p.paddock === highlight || seen.has(p.paddock)) continue;
    seen.add(p.paddock);
    out.push({ paddock: p.paddock, kind: p.dry ? 'dry' : 'pick' });
  }
  return out;
}

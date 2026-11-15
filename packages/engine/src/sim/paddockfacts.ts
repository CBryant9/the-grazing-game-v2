/**
 * Small facts for the screens (m8, the stock book and feed pass): how long
 * each empty paddock has rested, and last night's rain. The reads change
 * nothing; `markStocked` keeps the record the rest days are read from.
 */

import { GRID_N } from '../grid';
import { NEVER_GRAZED } from '../pasture/state';
import { areaIdOf, realSourcesOf, surveyOf, type SourceEnv } from './derived';
import type { FarmState } from './state';

/**
 * Record that stock spent `day` on these squares (`FarmState.stockedOn`). The record is made
 * the first time it is needed, from the squares' last hard grazing (`PastureState.lastG`), so a
 * farm saved before it existed starts from what the pasture knew. A record only: no rule reads it.
 */
export function markStocked(farm: FarmState, cells: readonly number[], day: number): void {
  let rec = farm.stockedOn;
  if (!rec) {
    rec = new Int32Array(GRID_N);
    rec.set(farm.pasture.lastG);
    farm.stockedOn = rec;
  }
  for (const i of cells) rec[i] = day;
}

/**
 * Days each paddock has had no stock on it, by paddock id: whole days since
 * the last day cattle or sheep spent on its grazing area (`FarmState.stockedOn`;
 * before the farm's first night, the last hard grazing, `PastureState.lastG`).
 * Null for a paddock with stock on its grazing area now, and for one with no
 * grazing on record.
 */
export function paddockRestDays(farm: FarmState): Map<number, number | null> {
  const survey = surveyOf(farm);
  const { topology } = survey;
  const stocked = new Set<number>();
  for (const m of farm.mobs) if (m.animals.length) stocked.add(areaIdOf(survey, m));
  for (const m of farm.sheep?.mobs ?? []) if (m.sheep.length) stocked.add(areaIdOf(survey, m));
  const lastG = farm.stockedOn ?? farm.pasture.lastG;
  const out = new Map<number, number | null>();
  for (const pd of topology.paddocks) {
    const areaId = topology.areaOf[pd.cells[0]!]!;
    if (stocked.has(areaId)) {
      out.set(pd.id, null);
      continue;
    }
    let last = NEVER_GRAZED;
    for (const i of pd.cells) if (lastG[i]! > last) last = lastG[i]!;
    // The tick of day d grazes and sets lastG = d; the morning after, the paddock has rested 0 days.
    out.set(pd.id, last === NEVER_GRAZED ? null : Math.max(0, farm.day - 1 - last));
  }
  return out;
}

/**
 * Rain on the last day that ran (last night), mm, from the real weather. Null
 * on a farm with random seasons, which has no rain figure, and on day 0.
 */
export function lastRainMm(farm: FarmState, env: SourceEnv = {}): number | null {
  if (farm.day <= 0) return null;
  const real = realSourcesOf(farm, env);
  return real ? real.seasons.rainOn(farm.day - 1) : null;
}

/**
 * Reads the web server needs, each reusing the engine's own code so the
 * server never has to copy a rule (the screens review, 14 Nov 2026).
 *
 * These only read the farm. They return plain facts: dollars and counts.
 */

import { dayDiet } from '../cattle/simMob';
import { intakeOf } from '../cattle/graze';
import { SUPPLEMENTS, type Supplement } from '../data/feed';
import { portableResale } from '../money/costs';
import {
  keepSources,
  keepSurvey,
  landOf,
  realSourcesOf,
  surveyOf,
  type SourceEnv,
} from './derived';
import { cloneFarm, type FarmState } from './state';
import { placeFor, startOfDay } from './tick';

/** What each supplement would cost a mob today. */
export interface SupplementCost {
  mob: number;
  name: string;
  /** The supplement the mob is on now. */
  now: Supplement;
  /**
   * Dollars a day for each supplement, as today's tick would charge it. In
   * the feedlot every option is the ration's price: no supplement is fed
   * there. 'none' is 0 in a paddock.
   */
  perDay: Record<Supplement, number>;
  /**
   * What each supplement adds, per head a day, averaged over the cattle in the mob (calves left
   * out), on the same day's feed: kg DM of the supplement itself with its ME and CP, and the
   * change in pasture eaten against no supplement (a lick lifts it on feed low in protein, hay
   * and pellets take its place). All 0 for 'none', and in the feedlot.
   */
  adds: Record<Supplement, SupplementAdds>;
}

/** What a supplement adds, per head a day. */
export interface SupplementAdds {
  /** Supplement fed, kg DM a head a day. */
  kg: number;
  /** Its energy, ME MJ/kg DM, and crude protein %. 0 with none fed. */
  me: number;
  cp: number;
  /** Pasture eaten against no supplement, kg DM a head a day (negative: it eats less pasture). */
  pastureKg: number;
}

/**
 * What each supplement would cost each mob today, as the daily tick would
 * charge it: on the feed after today's growth, with the day's diet the
 * cattle step uses (`dayDiet`), so a mob on a plan that moves it more than
 * once a day is priced on the average of the day's stops. It is for the
 * cattle in the mob now: a drop weaned at the start of today's tick would
 * go at the calf's share until then.
 */
export function supplementCosts(farm: FarmState, env: SourceEnv = {}): SupplementCost[] {
  // A real-year farm needs its real data, as the tick does.
  realSourcesOf(farm, env);
  // Today's growth and crop events, on a copy, as the tick runs them before the cattle.
  const copy = cloneFarm(farm);
  keepSurvey(copy.layout, surveyOf(farm));
  keepSources(copy, farm);
  const { plantings } = startOfDay(copy, env, []);
  const survey = surveyOf(copy);
  const land = landOf(copy, survey, plantings);
  return copy.mobs.map((m) => {
    const place = placeFor(copy, survey, m);
    const lot = place.kind === 'lot';
    const { diet } = dayDiet(place, land);
    const perDay = {} as Record<Supplement, number>;
    const adds = {} as Record<Supplement, SupplementAdds>;
    const grown = m.animals.filter((a) => !a.dead && a.kind !== 'calf');
    const basePast = grown.map((a) => intakeOf(a, diet, 'none', lot).past);
    for (const s of SUPPLEMENTS) {
      let cost = 0;
      for (const a of m.animals) if (!a.dead) cost += intakeOf(a, diet, s, lot).cost;
      perDay[s] = cost;
      let kg = 0;
      let me = 0;
      let cp = 0;
      let past = 0;
      grown.forEach((a, i) => {
        const it = intakeOf(a, diet, s, lot);
        kg += it.sKg;
        me += it.sME * it.sKg;
        cp += it.sCP * it.sKg;
        past += it.past - basePast[i]!;
      });
      const n = grown.length;
      adds[s] =
        lot || s === 'none' || n === 0
          ? { kg: 0, me: 0, cp: 0, pastureKg: 0 }
          : {
              kg: kg / n,
              me: kg > 0 ? me / kg : 0,
              cp: kg > 0 ? cp / kg : 0,
              pastureKg: past / n,
            };
    }
    return { mob: m.id, name: m.name, now: m.supp, perDay, adds };
  });
}

/**
 * Dollars a portable trough gives back when it is removed (sold back), as
 * the `removePortable` action pays. Null if there is no portable trough
 * with that number.
 */
export function portableRefund(farm: FarmState, port: number): number | null {
  return farm.layout.water.ports.some((p) => p.id === port) ? portableResale() : null;
}

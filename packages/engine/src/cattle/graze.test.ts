import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import {
  AREAS,
  PASTURE_STATES,
  TROUGHS,
  areaOf,
  beast,
  expectSameGround,
  landOf,
  loadCattleMvp,
  paintArea,
  putCattleFarm,
  regAt,
  sampleBeasts,
  toEngine,
  type AreaName,
  type MvpDiet,
  type PastureStateName,
} from '../../test-support/cattle';
import {
  firstDifference,
  makeScenario,
  refreshPlantings,
  type Scenario,
} from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import { SUPPLEMENTS } from '../data/feed';
import { meFromDmd } from '../pasture/quality';
import {
  LOT_DIET,
  RESIDUAL,
  dietOf,
  grazeAlloc,
  intakeOf,
  type Diet,
  type PlantingGraze,
} from './graze';
import { emptyCattleTotals } from './types';

/*
 * Diet selection, intake and grazing against the MVP's own dietOf, intakeOf
 * and grazeAlloc. Both get the same farm. Every figure and every pasture
 * array must then be the same exactly. Nothing here uses a tolerance.
 */

const loaded = loadCattleMvp();
const { mvp } = loaded;
const AREA_NAMES = Object.keys(AREAS) as AreaName[];
const STATE_NAMES = Object.keys(PASTURE_STATES) as PastureStateName[];

/** Farm sizes from a small block to a station: squares of 0.25 ha to 48 ha. */
const FARM_SIZES = [260, 1040, 2000, 10400, 50000];

function farm(
  district: DistrictId,
  o: { farmHa?: number; landUses?: boolean; seed?: number; troughs?: readonly number[] } = {},
  paint?: (scn: Scenario) => void,
): Scenario {
  const scn = makeScenario(mvp as unknown as Mvp, {
    district,
    start: { year: 2023, month: 2 },
    day: 40,
    farmHa: o.farmHa ?? 2000,
    landUses: o.landUses,
    seed: o.seed,
  });
  paint?.(scn);
  putCattleFarm(mvp, scn, o.troughs);
  return scn;
}

const sameDiet = (mine: Diet, theirs: MvpDiet, where: string): void => {
  for (const key of ['dmd', 'cp', 'mass', 'avail', 'dist'] as const) {
    expect(
      Object.is(mine[key], theirs[key]),
      `${key} ${where}: ${mine[key]} / ${theirs[key]}`,
    ).toBe(true);
  }
};

describe('the diet a mob selects, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: every area, farm size, with and without water', (id) => {
    for (const farmHa of FARM_SIZES) {
      for (const landUses of [false, true]) {
        for (const troughs of [undefined, [TROUGHS.mid, TROUGHS.tiny], []]) {
          const scn = farm(id, { farmHa, landUses, troughs, seed: farmHa % 7 });
          const land = landOf(mvp, scn, refreshPlantings(mvp as unknown as Mvp, scn));
          for (const name of AREA_NAMES) {
            const reg = regAt(mvp, AREAS[name]);
            const m: { w?: Float32Array } = {};
            const theirs = mvp.dietOf(m, reg);
            const mine = dietOf(land, areaOf(reg));
            const where = `${id} ${farmHa} ha ${name}`;
            sameDiet(mine.diet, theirs, where);
            expect(firstDifference(mine.weights, m.w!), `weights ${where}`).toBeNull();
          }
        }
      }
    }
  });

  it.each(DISTRICT_IDS)('%s: areas that are all green, dry, rank, short or bare', (id) => {
    for (const state of STATE_NAMES) {
      const scn = farm(id, {}, (s) => AREA_NAMES.forEach((name) => paintArea(s, name, state)));
      const land = landOf(mvp, scn, null);
      for (const name of AREA_NAMES) {
        const reg = regAt(mvp, AREAS[name]);
        sameDiet(dietOf(land, areaOf(reg)).diet, mvp.dietOf({}, reg), `${id} ${state} ${name}`);
      }
    }
  });

  it('cattle favour feed near water, and walk further when that is where the feed is', () => {
    // 10,400 ha: each square is 316 m across. The trough is in the top right corner.
    const even = farm('cq', { farmHa: 10400 }, (s) => paintArea(s, 'big', 'green'));
    const reg = areaOf(regAt(mvp, AREAS.big));
    const nearWater = dietOf(landOf(mvp, even, null), reg).diet;
    // Now eat out everything within about 3 km of the trough.
    const far = farm('cq', { farmHa: 10400 }, (s) => {
      paintArea(s, 'big', 'green');
      for (const i of regAt(mvp, AREAS.big).cells) {
        const dx = (i % 40) - 39;
        const dy = Math.floor(i / 40);
        if (Math.hypot(dx, dy) < 10) {
          s.state.G[i] = 40;
          s.state.D[i] = 200;
        }
      }
    });
    const farOut = dietOf(landOf(mvp, far, null), reg).diet;
    expect(farOut.dist).toBeGreaterThan(nearWater.dist + 1000);
    expect(farOut.dist).toBeGreaterThan(3000);
    // On a 2,000 ha farm the same area is under 4 km across and the walk is short.
    const small = farm('cq', { farmHa: 2000 }, (s) => paintArea(s, 'big', 'green'));
    const smallArea = areaOf(regAt(mvp, AREAS.big));
    expect(dietOf(landOf(mvp, small, null), smallArea).diet.dist).toBeLessThan(2500);
    // With no water in the area there is no walk to count.
    const dry = farm('cq', { farmHa: 10400, troughs: [] }, (s) => paintArea(s, 'big', 'green'));
    expect(dietOf(landOf(mvp, dry, null), areaOf(regAt(mvp, AREAS.big))).diet.dist).toBe(0);
  });
});

/** Diets from poor dry feed to lush green, either side of each protein and quality step. */
const DIETS: Diet[] = [];
for (const dmd of [0.42, 0.44, 0.47, 0.5, 0.55, 0.62, 0.7, 0.715, 0.75, 0.8]) {
  for (const cp of [3, 5, 6.9, 7, 8.9, 9, 12, 20]) {
    for (const avail of [0.05, 0.4, 0.74, 0.76, 1]) {
      DIETS.push({ dmd, cp, avail, mass: avail * 2500, dist: avail * 4000 });
    }
  }
}

describe('intake, against the MVP', () => {
  const beasts = sampleBeasts().map((s, k) => beast(k + 1, s));

  it('is the same for every kind of animal on every diet and supplement', () => {
    let checked = 0;
    for (let k = 0; k < beasts.length; k++) {
      const b = beasts[k]!;
      const a = toEngine(b);
      // Every animal meets a spread of the diets, and every diet is used.
      for (let j = k % 7; j < DIETS.length; j += 7) {
        const diet = DIETS[j]!;
        for (const supp of SUPPLEMENTS) {
          const theirs = mvp.intakeOf(b, diet, supp, false);
          const mine = intakeOf(a, diet, supp, false);
          for (const key of ['past', 'sKg', 'sME', 'sCP', 'cost'] as const) {
            if (!Object.is(mine[key], theirs[key])) {
              expect.fail(`#${b.id} ${supp} diet ${j} ${key}: ${mine[key]} / ${theirs[key]}`);
            }
          }
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100000);
  });

  it('is the same in the feedlot', () => {
    // The MVP's lot diet. The DMD only matters for milk, and at 0.77 milk is
    // at its top rate, so the figure is pinned here.
    expect(LOT_DIET).toEqual({ dmd: 0.77, cp: 14, avail: 1, mass: 0, dist: 0 });
    for (const b of beasts) {
      const theirs = mvp.intakeOf(
        b,
        { dmd: 0.77, cp: 14, avail: 1, mass: 0, dist: 0 },
        'lot',
        true,
      );
      const mine = intakeOf(toEngine(b), LOT_DIET, 'none', true);
      for (const key of ['past', 'sKg', 'sME', 'sCP', 'cost'] as const) {
        if (!Object.is(mine[key], theirs[key])) {
          expect.fail(`#${b.id} lot ${key}: ${mine[key]} / ${theirs[key]}`);
        }
      }
    }
  });

  it('calves get 40% of the hay and pellet ration and of the lick cost', () => {
    const diet: Diet = { dmd: 0.5, cp: 5, avail: 0.9, mass: 2000, dist: 500 };
    const cow = toEngine(beast(1, { kind: 'cow', sex: 'F', wt: 450, age: 2000, cond: 3 }));
    const calf = toEngine(beast(2, { kind: 'calf', sex: 'F', wt: 120, age: 120, cond: 3 }));
    expect(intakeOf(cow, diet, 'hay', false).sKg).toBe(3);
    expect(intakeOf(calf, diet, 'hay', false).sKg).toBe(3 * 0.4);
    expect(intakeOf(cow, diet, 'pellet', false).sKg).toBe(2);
    expect(intakeOf(calf, diet, 'pellet', false).sKg).toBe(2 * 0.4);
    expect(intakeOf(cow, diet, 'lick', false).cost).toBe(0.15);
    expect(intakeOf(calf, diet, 'lick', false).cost).toBe(0.15 * 0.4);
  });

  it('low protein cuts intake on hay and pellets too, by the protein of the mix', () => {
    const steer = toEngine(beast(1, { kind: 'steer', sex: 'S', wt: 350, age: 500, cond: 3 }));
    const poor: Diet = { dmd: 0.5, cp: 3, avail: 0.9, mass: 2000, dist: 500 };
    const base = 350 * 0.027 * 0.62 * 0.9;
    // No supplement: the full penalty for CP 3.
    expect(intakeOf(steer, poor, 'none', false).past).toBeCloseTo(base * (1 - 4 * 0.05), 10);
    // Hay at CP 9 lifts the mix, but it is still under 7%, so some penalty stays.
    const hay = intakeOf(steer, poor, 'hay', false);
    const before = base - 0.5 * 3;
    const mix = (before * 3 + 3 * 9) / (before + 3);
    expect(mix).toBeLessThan(7);
    expect(hay.past).toBeCloseTo(before * (1 - (7 - mix) * 0.05), 10);
    // Lick removes the penalty and lifts intake instead.
    expect(intakeOf(steer, poor, 'lick', false).past).toBeCloseTo(base * 1.25, 10);
  });
});

describe('grazing the pasture, against the MVP', () => {
  /** Graze one area in both and compare what was supplied and the whole pasture. */
  function grazeBoth(
    scn: Scenario,
    name: AreaName,
    demand: number,
    head: number,
    landUses: boolean,
    where: string,
  ): number {
    const reg = regAt(mvp, AREAS[name]);
    const plantings = landUses ? refreshPlantings(mvp as unknown as Mvp, scn) : null;
    const land = landOf(mvp, scn, plantings);
    const cdBefore = mvp.S.CD.slice();
    const yBefore = mvp.S.Y.slice();
    const m = { animals: new Array<unknown>(head) };
    mvp.dietOf(m, reg);
    mvp.S.yr.eaten = 0;
    const theirs = mvp.grazeAlloc(m, reg, demand);

    const totals = emptyCattleTotals();
    const plantingGrazes: PlantingGraze[] = [];
    const area = areaOf(reg);
    const mine = grazeAlloc({
      land,
      area,
      weights: dietOf(land, area).weights,
      demand,
      head,
      day: scn.day,
      totals,
      plantingGrazes,
    });
    expect(Object.is(mine, theirs), `supplied ${where}: ${mine} / ${theirs}`).toBe(true);
    expect(totals.eaten).toBe(mvp.S.yr.eaten);
    expectSameGround(scn, mvp, where);

    // Planted squares: the engine's list, replayed through the MVP's own
    // cropGrazed from the same start, must leave the stand and the yield
    // where the MVP's graze left them.
    const cdAfter = mvp.S.CD.slice();
    const yAfter = mvp.S.Y.slice();
    mvp.S.CD.set(cdBefore);
    mvp.S.Y.set(yBefore);
    for (const g of plantingGrazes) {
      mvp.cropGrazed(mvp.FMAP.get(g.id)!, g.square, g.eaten, g.greenEaten, g.greenBefore);
    }
    expect(firstDifference(mvp.S.CD, cdAfter), `stand ${where}`).toBeNull();
    expect(firstDifference(mvp.S.Y, yAfter), `yield ${where}`).toBeNull();
    if (!landUses) expect(plantingGrazes.length).toBe(0);
    return mine;
  }

  /** Feed above the residual in an area, kg DM. */
  const feedOn = (scn: Scenario, name: AreaName): number => {
    let kg = 0;
    for (const i of regAt(mvp, AREAS[name]).cells) {
      kg += Math.max(0, scn.state.G[i]! + scn.state.D[i]! - RESIDUAL) * mvp.HA;
    }
    return kg;
  };

  it.each(DISTRICT_IDS)('%s: light to very heavy demand, graze after graze', (id) => {
    for (const farmHa of [260, 1040, 20000]) {
      const scn = farm(id, { farmHa, seed: 3 });
      for (const name of AREA_NAMES) {
        // Shares of the feed on offer. The last ones ask for more than is there.
        const shares = [0.001, 0.02, 0.2, 0.5, 0.9, 1.5, 4];
        shares.forEach((share, k) => {
          const demand = feedOn(scn, name) * share + 5;
          const head = [1, 10, 60, 300, 500, 2000, 5000][k]!;
          grazeBoth(scn, name, demand, head, false, `${id} ${farmHa} ha ${name} share ${share}`);
        });
        // Everything above the residual has gone.
        expect(feedOn(scn, name)).toBeLessThan(1);
      }
    }
  });

  it.each(DISTRICT_IDS)('%s: sown pasture, crops, fallow and stubble', (id) => {
    const scn = farm(id, { landUses: true, seed: 5 });
    let grazed = 0;
    for (const name of ['strip', 'mid', 'big'] as const) {
      for (const share of [0.03, 0.3, 0.8, 2]) {
        const demand = feedOn(scn, name) * share;
        grazed += grazeBoth(scn, name, demand, 200, true, `${id} ${name} share ${share}`);
      }
    }
    expect(grazed).toBeGreaterThan(0);
  });

  it.each(STATE_NAMES)('an area that is all %s', (state) => {
    for (const id of DISTRICT_IDS) {
      const scn = farm(id, { farmHa: 1040 }, (s) =>
        AREA_NAMES.forEach((name) => paintArea(s, name, state)),
      );
      for (const name of AREA_NAMES) {
        for (const head of [3, 500]) {
          grazeBoth(scn, name, head * 9, head, false, `${id} ${state} ${name} ${head} head`);
        }
      }
    }
  });

  it('500 head on 4 ha take it to the residual and are short', () => {
    // 1,040 ha farm: 1 ha squares, so the tiny area is 4 ha.
    const scn = farm('cq', { farmHa: 1040 }, (s) => paintArea(s, 'tiny', 'short'));
    expect(regAt(mvp, AREAS.tiny).ha).toBe(4);
    const onOffer = feedOn(scn, 'tiny');
    const demand = 500 * 9;
    const got = grazeBoth(scn, 'tiny', demand, 500, false, '500 on 4 ha');
    expect(got).toBeLessThan(demand);
    expect(got).toBeCloseTo(onOffer, 0);
    for (const i of regAt(mvp, AREAS.tiny).cells) {
      // What is left is at or under the residual: trampling took more dead.
      expect(scn.state.G[i]! + scn.state.D[i]!).toBeLessThanOrEqual(RESIDUAL + 0.01);
      expect(scn.state.lastG[i]).toBe(scn.day);
      expect(scn.state.graz[i]).toBe(1);
    }
  });

  it('a big mob on a small area knocks rank grass down; a light mob barely touches it', () => {
    const heavy = farm('cq', { farmHa: 1040 }, (s) => paintArea(s, 'small', 'rank'));
    const x0 = heavy.state.X[AREAS.small]!;
    grazeBoth(heavy, 'small', 16 * 2500, 400, false, 'heavy');
    const light = farm('cq', { farmHa: 1040 }, (s) => paintArea(s, 'small', 'rank'));
    grazeBoth(light, 'small', 5 * 9, 5, false, 'light');
    expect(heavy.state.X[AREAS.small]).toBeLessThan(x0 * 0.5);
    expect(light.state.X[AREAS.small]).toBeGreaterThan(x0 * 0.99);
  });

  it('on a very small area the trample rate is worked on a quarter hectare', () => {
    // 52 ha farm: 0.05 ha squares, so the tiny area is 0.2 ha.
    const scn = farm('nsw', { farmHa: 52 }, (s) => paintArea(s, 'tiny', 'rank'));
    expect(regAt(mvp, AREAS.tiny).ha).toBeCloseTo(0.2, 10);
    const d0 = scn.state.D[1]!;
    const g0 = scn.state.G[1]!;
    grazeBoth(scn, 'tiny', 9, 1, false, 'one head on 0.2 ha');
    // One beast on a quarter hectare is 4 a hectare: the full trample rate
    // of 16% of what was eaten, on top of the dead feed eaten.
    const eaten = g0 - scn.state.G[1]! + (d0 - scn.state.D[1]!);
    expect(eaten).toBeGreaterThan(1);
    expect(d0 - scn.state.D[1]!).toBeGreaterThan(0);
  });

  it('goes round again until less than 0.01 kg is still wanted', () => {
    // 52 ha farm: 0.05 ha squares. The first square of the tiny area has
    // 0.3 kg DM/ha above the residual, which is 0.015 kg. The demand is set
    // so that square is asked for 0.03 kg. The 0.015 kg it can't give is
    // more than 0.01 kg, so a second pass finds it on the other squares.
    const scn = farm('cq', { farmHa: 52 }, (s) => {
      paintArea(s, 'tiny', 'green');
      s.state.G[0] = 200;
      s.state.D[0] = 50.3;
    });
    const area = areaOf(regAt(mvp, AREAS.tiny));
    const w = dietOf(landOf(mvp, scn, null), area).weights;
    const demand = (0.03 * w.reduce((s, x) => s + x, 0)) / w[0]!;
    const got = grazeBoth(scn, 'tiny', demand, 2, false, 'second pass');
    expect(got).toBeCloseTo(demand, 6);
    expect(scn.state.G[0]! + scn.state.D[0]!).toBeLessThanOrEqual(RESIDUAL);
  });
});

describe('intake benchmarks (docs/CALIBRATION.md)', () => {
  // The diet a mob would select on a whole area of one kind of pasture.
  const dietOn = (id: DistrictId, state: PastureStateName): Diet => {
    const scn = farm(id, {}, (s) => paintArea(s, 'mid', state));
    return dietOf(landOf(mvp, scn, null), areaOf(regAt(mvp, AREAS.mid))).diet;
  };
  const share = (wt: number, diet: Diet, extra = {}): number => {
    const a = toEngine(beast(1, { kind: 'steer', sex: 'S', wt, age: 400, cond: 3, ...extra }));
    return intakeOf(a, diet, 'none', false).past / wt;
  };

  it.each(DISTRICT_IDS)('%s: green leafy feed, 2.5 to 3% of live weight under 300 kg', (id) => {
    const diet = dietOn(id, 'green');
    expect(meFromDmd(diet.dmd)).toBeGreaterThan(9);
    // Young cattle under 300 kg, where appetite is highest.
    for (const wt of [200, 250, 299]) {
      expect(share(wt, diet)).toBeGreaterThanOrEqual(0.025);
      expect(share(wt, diet)).toBeLessThanOrEqual(0.03);
    }
    // A cow of 450 kg with a calf on her is in the range too.
    const milking = share(450, diet, { kind: 'cow', sex: 'F', age: 2000, lact: 30, calf: 9 });
    expect(milking).toBeGreaterThanOrEqual(0.025);
    expect(milking).toBeLessThanOrEqual(0.03);
  });

  it.each(DISTRICT_IDS)('%s: dry stemmy feed, 1.5 to 2% of live weight under 300 kg', (id) => {
    const diet = dietOn(id, 'dry');
    expect(meFromDmd(diet.dmd)).toBeLessThan(7.5);
    for (const wt of [200, 250, 299]) {
      expect(share(wt, diet)).toBeGreaterThanOrEqual(0.015);
      expect(share(wt, diet)).toBeLessThanOrEqual(0.02);
    }
  });

  it('heavier cattle eat a smaller share, as the MVP has it (recorded in CALIBRATION.md)', () => {
    // The MVP's appetite steps down at 300 kg and at 450 kg, so heavier dry
    // stock sit under the benchmark ranges. Kept as it is; for calibration.
    for (const id of DISTRICT_IDS) {
      const green = dietOn(id, 'green');
      const dry = dietOn(id, 'dry');
      expect(share(350, green)).toBeGreaterThan(0.023);
      expect(share(350, green)).toBeLessThan(0.027);
      expect(share(500, green)).toBeGreaterThan(0.02);
      expect(share(500, green)).toBeLessThan(0.024);
      expect(share(350, dry)).toBeGreaterThan(0.014);
      expect(share(350, dry)).toBeLessThan(0.016);
      expect(share(500, dry)).toBeGreaterThan(0.0125);
      expect(share(500, dry)).toBeLessThan(0.014);
    }
  });

  it('a cow with a calf on her eats more than a dry cow', () => {
    const diet = dietOn('cq', 'dry');
    const dry = toEngine(beast(1, { kind: 'cow', sex: 'F', wt: 430, age: 2000, cond: 3 }));
    const wet = { ...dry, lact: 40, calf: 9 };
    expect(intakeOf(wet, diet, 'none', false).past).toBeGreaterThan(
      intakeOf(dry, diet, 'none', false).past * 1.2,
    );
  });
});

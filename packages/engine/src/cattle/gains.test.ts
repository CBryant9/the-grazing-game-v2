import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  AREAS,
  PASTURE_STATES,
  areaOf,
  beast,
  landOf,
  loadCattleMvp,
  paintArea,
  putCattleFarm,
  regAt,
  sampleBeasts,
  toEngine,
  whyText,
  type AreaName,
  type PastureStateName,
} from '../../test-support/cattle';
import { makeScenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import { CLASS_LABELS } from '../data/cattle';
import { SUPPLEMENTS } from '../data/feed';
import { gainOn, gainWhy, predictGains } from './gains';
import type { Diet } from './graze';
import { createCattleMob } from './types';

/*
 * Expected gains and the reasons for a loss, against the MVP's gainOn,
 * gainWhy and predictGains. The MVP wrote the reasons as a sentence. The
 * engine returns them as data, and the test puts them into the MVP's words
 * to compare.
 */

const { mvp } = loadCattleMvp();
vi.setConfig({ testTimeout: 60_000 });

const DIETS: Diet[] = [];
for (const dmd of [0.42, 0.47, 0.5, 0.56, 0.5644, 0.5645, 0.62, 0.7, 0.8]) {
  for (const cp of [3, 6.9, 7, 9, 14]) {
    for (const avail of [0.2, 0.74, 0.75, 1]) {
      for (const dist of [0, 1500, 2999, 3000, 6000]) {
        DIETS.push({ dmd, cp, avail, mass: avail * 2222.2, dist });
      }
    }
  }
}

describe('expected gains, against the MVP', () => {
  const beasts = sampleBeasts().map((s, k) => beast(k + 1, s));

  it('gain and reasons are the same for every kind of animal, diet and supplement', () => {
    let checked = 0;
    const reasons = new Set<string>();
    for (let k = 0; k < beasts.length; k++) {
      const b = beasts[k]!;
      const a = toEngine(b);
      for (let j = k % 11; j < DIETS.length; j += 11) {
        const diet = DIETS[j]!;
        const supp = SUPPLEMENTS[(k + j) % SUPPLEMENTS.length]!;
        const mine = gainOn(a, diet, supp);
        const theirs = mvp.gainOn(b, diet, supp);
        if (!Object.is(mine, theirs)) {
          expect.fail(`#${b.id} diet ${j} ${supp}: ${mine} / ${theirs}`);
        }
        const why = gainWhy(a, diet, supp);
        const text = mvp.gainWhy(b, diet, supp);
        if (whyText(why) !== text)
          expect.fail(`#${b.id} diet ${j} ${supp}: ${whyText(why)} / ${text}`);
        for (const w of why) reasons.add(w.reason);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50000);
    expect([...reasons].sort()).toEqual([
      'justShort',
      'latePregnancy',
      'lowMe',
      'lowProtein',
      'milking',
      'notEnoughFeed',
    ]);
  });

  it('milking cows at every weight, and at a condition below any the game allows', () => {
    // The milking reason gives her own upkeep in whole MJ, so it takes many
    // weights to pin the figures behind it. Condition under 0.33 reaches the
    // floor on milk by condition, which no cow in the game can.
    const good: Diet = { dmd: 0.7, cp: 14, avail: 1, mass: 2500, dist: 500 };
    const poor: Diet = { dmd: 0.5, cp: 9, avail: 1, mass: 2500, dist: 500 };
    let milking = 0;
    for (let wt = 380; wt <= 560; wt++) {
      for (const cond of [0.2, 2.5]) {
        for (const lact of [10, 150]) {
          const b = beast(wt, { kind: 'cow', sex: 'F', wt, age: 2000, cond, lact, calf: 9000 });
          const a = toEngine(b);
          for (const diet of [good, poor]) {
            expect(Object.is(gainOn(a, diet, 'none'), mvp.gainOn(b, diet, 'none'))).toBe(true);
            const why = gainWhy(a, diet, 'none');
            expect(whyText(why)).toBe(mvp.gainWhy(b, diet, 'none'));
            if (why.some((w) => w.reason === 'milking')) milking++;
          }
        }
      }
    }
    expect(milking).toBeGreaterThan(500);
  });

  it('gives at most two reasons, the most basic first', () => {
    const cow = toEngine(
      beast(1, {
        kind: 'cow',
        sex: 'F',
        wt: 430,
        age: 2000,
        cond: 2.5,
        lact: 30,
        calf: 2,
        preg: 200,
      }),
    );
    const poor: Diet = { dmd: 0.45, cp: 4, avail: 0.3, mass: 500, dist: 800 };
    expect(gainWhy(cow, poor, 'none').map((w) => w.reason)).toEqual(['notEnoughFeed', 'lowMe']);
    const plenty: Diet = { dmd: 0.5, cp: 4, avail: 0.9, mass: 2500, dist: 800 };
    expect(gainWhy(cow, plenty, 'none').map((w) => w.reason)).toEqual(['lowMe', 'lowProtein']);
    // A lick takes the protein reason away.
    expect(gainWhy(cow, plenty, 'lick').map((w) => w.reason)).toEqual(['lowMe', 'milking']);
    const good: Diet = { dmd: 0.68, cp: 12, avail: 0.9, mass: 2500, dist: 800 };
    expect(gainWhy(cow, good, 'none').map((w) => w.reason)).toEqual(['milking', 'latePregnancy']);
    const steer = toEngine(beast(3, { kind: 'steer', sex: 'S', wt: 300, age: 400, cond: 3 }));
    expect(gainWhy(steer, good, 'none').map((w) => w.reason)).toEqual(['justShort']);
  });

  it.each(DISTRICT_IDS)('%s: the forecast for each class in a mob is the same', (id) => {
    const states = Object.keys(PASTURE_STATES) as PastureStateName[];
    const areas = Object.keys(AREAS) as AreaName[];
    const scn = makeScenario(mvp as unknown as Mvp, {
      district: id,
      start: { year: 2023, month: 5 },
      farmHa: 5000,
    });
    areas.forEach((name, k) => paintArea(scn, name, states[k]!));
    putCattleFarm(mvp, scn);
    const land = landOf(mvp, scn, null);
    // A mixed mob: every sixth sample animal, so each class is in it.
    const animals = beasts.filter((_, k) => k % 6 === 0);
    for (const supp of SUPPLEMENTS) {
      const mob = createCattleMob(supp);
      mob.animals = animals.map(toEngine);
      for (const name of areas) {
        const reg = regAt(mvp, AREAS[name]);
        const theirs = mvp.predictGains({ animals, supp }, reg);
        const mine = predictGains(mob, land, areaOf(reg));
        expect(mine.length).toBe(theirs.length);
        expect(mine.length).toBeGreaterThanOrEqual(12);
        mine.forEach((g, k) => {
          const t = theirs[k]!;
          const where = `${id} ${name} ${supp} ${t.label}`;
          expect(CLASS_LABELS[g.cls], where).toBe(t.label);
          expect(g.n, where).toBe(t.n);
          expect(Object.is(g.gain, t.gain), `${where}: ${g.gain} / ${t.gain}`).toBe(true);
          expect(whyText(g.why), where).toBe(t.why);
        });
      }
    }
  });
});

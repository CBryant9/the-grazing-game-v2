import { describe, expect, it, vi } from 'vitest';
import { planFarm } from '../../test-support/plans';
import { atLastLight, busyFarm, setUp, work } from '../../test-support/workingDay';
import { dayDiet } from '../cattle/simMob';
import { intakeOf } from '../cattle/graze';
import { SUPPLEMENTS, type Supplement } from '../data/feed';
import { husbandryNow } from '../day/look';
import { areaWatered } from '../farm/water';
import { COSTS, PORTABLE_RESALE_SHARE } from '../money/costs';
import { createFarm } from './create';
import { grazingArea, landOf, plantingsNow, surveyOf } from './derived';
import { portableRefund, supplementCosts } from './reads';
import { cloneFarm, type FarmState } from './state';
import { placeFor, stepDay } from './tick';
import { farmView } from './view';

/*
 * Reads the web server needs, so it stops copying engine logic (the screens
 * review, 14 Nov 2026). Each must agree with what the tick and the actions
 * really do.
 */

vi.setConfig({ testTimeout: 600_000 });

const herdFarm = (): FarmState =>
  createFarm({
    seed: 21,
    district: 'cq',
    size: 'small',
    start: { year: 2023, month: 7 },
    startType: 'running',
    difficulty: 'medium',
  });

/** What the day's tick charged for feed, every mob together. */
function tickFeed(farm: FarmState): number {
  const f = cloneFarm(farm);
  const before = f.year.feed;
  const years = f.years.length;
  stepDay(f);
  // On the day the year closes, the day's feed is in the year just filed.
  return (f.years.length > years ? f.years.at(-1)!.feed : f.year.feed) - before;
}

/** A farm with every mob on one supplement. */
function allOn(farm: FarmState, s: Supplement): FarmState {
  const f = cloneFarm(farm);
  for (const m of f.mobs) m.supp = s;
  return f;
}

const sumOf = (farm: FarmState, s: Supplement): number =>
  supplementCosts(farm).reduce((t, c) => t + c.perDay[s], 0);

describe('what a supplement costs a mob a day', () => {
  it('for each supplement, it is what the day’s tick charges', () => {
    const farm = herdFarm();
    expect(farm.mobs.length).toBeGreaterThan(1);
    for (const s of SUPPLEMENTS) {
      const f = allOn(farm, s);
      expect(sumOf(f, s), s).toBeCloseTo(tickFeed(f), 9);
    }
    // And whatever the mob is on now, each option is priced.
    const costs = supplementCosts(farm);
    for (const c of costs) {
      expect(c.perDay.none).toBe(0);
      expect(c.perDay.hay).toBeGreaterThan(0);
      expect(c.perDay.pellet).toBeGreaterThan(c.perDay.hay);
      expect(c.now).toBe(farm.mobs.find((m) => m.id === c.mob)!.supp);
    }
  });

  it('every day of a year, lick included: priced on the feed after the day’s growth', () => {
    let farm = allOn(herdFarm(), 'lick');
    let checked = 0;
    let growthMattered = 0;
    for (let d = 0; d < 365; d++) {
      const weaningToday = farm.mobs.some((m) =>
        m.animals.some((a) => a.kind === 'calf' && a.age >= 279),
      );
      if (!weaningToday) {
        const charged = tickFeed(farm);
        expect(sumOf(farm, 'lick'), `day ${farm.day}`).toBeCloseTo(charged, 9);
        checked++;
        // Priced on the feed as it stood before the day's growth, lick would sometimes be wrong.
        const s = surveyOf(farm);
        const land = landOf(farm, s, plantingsNow(farm));
        let before = 0;
        for (const m of farm.mobs) {
          const { diet } = dayDiet(placeFor(farm, s, m), land);
          for (const a of m.animals) before += intakeOf(a, diet, 'lick', false).cost;
        }
        if (Math.abs(before - charged) > 1e-9) growthMattered++;
      }
      stepDay(farm);
      for (const m of farm.mobs) m.supp = 'lick';
      farm = cloneFarm(farm);
    }
    expect(checked).toBeGreaterThan(300);
    expect(growthMattered).toBeGreaterThan(0);
  });

  it('in the feedlot every option is the ration’s price', () => {
    const b = busyFarm();
    const f = work(b.farm, { type: 'moveMob', mob: b.steers, to: 'lot' }).farm;
    const c = supplementCosts(f).find((x) => x.mob === b.steers)!;
    const lot = c.perDay.none;
    expect(lot).toBeGreaterThan(0);
    for (const s of SUPPLEMENTS) expect(c.perDay[s]).toBe(lot);
  });

  it('a mob on a plan that moves more than once a day is priced on the day’s stops, not where it stands', () => {
    const p = planFarm('nsw');
    let farm = setUp(p.farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: p.stops[0]! },
    });
    const mob = farm.mobs[0]!.id;
    farm = setUp(farm, { type: 'setSupplement', mob, supp: 'lick' });
    farm = setUp(farm, {
      type: 'setPlan',
      mob,
      plan: { legs: [{ stops: p.stops, rule: { mode: 'days', every: 0.25 } }], after: 'repeat' },
    });
    // The first paddock young and green (high protein), the other three dead straw (low).
    const s = surveyOf(farm);
    const area = (c: number) => s.topology.areas[s.topology.areaOf[c]!]!;
    for (const i of area(p.stops[0]!).cells) {
      farm.pasture.G[i] = 2500;
      farm.pasture.D[i] = 100;
      farm.pasture.A[i] = 5;
      farm.pasture.X[i] = 0;
    }
    for (const c of p.stops.slice(1)) {
      for (const i of area(c).cells) {
        farm.pasture.G[i] = 0;
        farm.pasture.D[i] = 3000;
        farm.pasture.X[i] = 0.8;
      }
    }
    const read = supplementCosts(farm).find((x) => x.mob === mob)!;
    expect(read.perDay.lick).toBeCloseTo(tickFeed(farm), 9);
    // Priced on the paddock it stands in alone (the web server's copy), lick would look cheap:
    // the green feed there is over 9% protein, so only a fifth of the price is charged.
    const land = landOf(farm, s, plantingsNow(farm));
    const alone = dayDiet(
      { kind: 'paddock', area: grazingArea(s, s.topology.areaOf[p.stops[0]!]!) },
      land,
    ).diet;
    const naive = farm.mobs[0]!.animals.reduce(
      (t, a) => t + intakeOf(a, alone, 'lick', false).cost,
      0,
    );
    expect(naive).toBeLessThan(read.perDay.lick);
  });
});

describe('marking and weaning: how many, and whether it can be done now', () => {
  it('the counts are what the jobs do, and the reasons are the jobs’ own', () => {
    const b = busyFarm();
    const all = husbandryNow(b.farm);
    const cows = all.find((x) => x.mob === b.cows)!;
    const steers = all.find((x) => x.mob === b.steers)!;
    expect(cows.mark.canDo).toBe(true);
    expect(cows.wean.canDo).toBe(true);
    const marked = work(b.farm, { type: 'markCalves', mob: b.cows });
    const m = marked.events.find((e) => e.type === 'calves-marked');
    expect(m?.type === 'calves-marked' && m.count).toBe(cows.mark.count);
    const weaned = work(b.farm, { type: 'wean', mob: b.cows });
    const w = weaned.events.find((e) => e.type === 'weaned');
    expect(w?.type === 'weaned' && w.count).toBe(cows.wean.count);
    expect(cows.mark.count).toBe(6);
    expect(cows.wean.count).toBe(12);
    // Steers have no calves.
    expect(steers.mark).toMatchObject({
      count: 0,
      canDo: false,
      why: { reason: 'nothing-to-mark' },
    });
    expect(steers.wean).toMatchObject({
      count: 0,
      canDo: false,
      why: { reason: 'no-calves-to-wean' },
    });
    // Once marked there is nothing left to mark.
    const after = husbandryNow(marked.farm).find((x) => x.mob === b.cows)!;
    expect(after.mark).toMatchObject({ count: 0, canDo: false });
    // At last light nothing can start, and it says so.
    const late = husbandryNow(atLastLight(b.farm)).find((x) => x.mob === b.cows)!;
    expect(late.mark).toMatchObject({ count: 6, canDo: false, why: { reason: 'no-daylight' } });
    expect(late.wean.why!.message).toMatch(/last light/);
  });
});

describe('what a portable trough gives back', () => {
  it('is what removing it pays', () => {
    const b = busyFarm();
    const back = portableRefund(b.farm, b.port);
    expect(back).toBe(COSTS.portable * PORTABLE_RESALE_SHARE);
    const gone = work(b.farm, { type: 'removePortable', port: b.port }).farm;
    expect(gone.cash - b.farm.cash).toBe(back);
    expect(portableRefund(b.farm, 9999)).toBeNull();
  });
});

describe('whether a grazing area has water', () => {
  it('is the engine’s own `areaWatered`, the same as the map says', () => {
    const b = busyFarm();
    const s = surveyOf(b.farm);
    const view = farmView(b.farm);
    for (const a of view.areas) expect(areaWatered(s.points, a.id)).toBe(a.hasWater);
    expect(view.areas.length).toBeGreaterThan(2);
  });
});

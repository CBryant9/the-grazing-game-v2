import { describe, expect, it, vi } from 'vitest';
import { bareLayout, vRun } from '../../test-support/layouts';
import { seededRandom } from '../../test-support/mvp';
import {
  expectSameLayout,
  expectSameSurvey,
  loadMvpFarm,
  mvpNewGame,
  putLayout,
} from '../../test-support/mvpFarm';
import { dateAt } from '../calendar';
import { GRID_H, GRID_W } from '../grid';
import { rngStream } from '../rng';
import { surveyLayout, type FarmLayout } from './layout';
import { EDGE } from './topology';
import {
  PORTABLE_CAPACITY_L,
  PORTABLE_LOW_SHARE,
  drainPortables,
  waterNeedPerHead,
  waterSeasonFactor,
  type WaterEvent,
} from './water';

/*
 * Water use against the MVP's own waterUse.
 *
 * Mobs of known weights drink from portable troughs for months on end. The
 * level, the low-water flag and the day's use of every portable trough must
 * equal the MVP's exactly each day, and every MVP diary line about a trough
 * must have its matching event.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;
const START = { year: 2022, month: 9 };
mvpNewGame(
  loaded,
  { region: 'cq', year: START.year, month: START.month, ha: 4000 },
  seededRandom(3),
);

const cell = (x: number, y: number): number => y * GRID_W + x;

interface TestMob {
  anchor: number;
  weights: number[];
}

/** Put mobs of the given weights into the MVP. */
function putMobs(mobs: TestMob[]): void {
  mvp.S.mobs = mobs.map((m, k) => ({
    id: k + 1,
    name: `Mob ${k + 1}`,
    loc: 'pad',
    anchor: m.anchor,
    animals: m.weights.map((wt) => ({ wt, kind: 'steer' })),
    plan: null,
    supp: 'none',
  }));
}

/** The day's need of the stock in a grazing area, added up beast by beast as the MVP does. */
function needFor(areaOf: Int16Array, month: number): (areaId: number) => number {
  return (areaId) => {
    let need = 0;
    for (const mb of mvp.S.mobs) {
      if (mb.loc === 'pad' && areaOf[mb.anchor] === areaId) {
        for (const a of mb.animals) need += waterNeedPerHead(a.wt, month);
      }
    }
    return need;
  };
}

/** Run the days in both and compare. Returns every event the engine gave. */
function runDays(layout: FarmLayout, days: number, where: string): WaterEvent[] {
  const all: WaterEvent[] = [];
  let l = layout;
  for (let day = 0; day < days; day++) {
    mvp.S.day = day;
    const month = dateAt(START, day).month;
    const logBefore = mvp.S.log.length ? mvp.S.log[0] : null;
    const survey = surveyLayout(l);
    expectSameSurvey(survey, mvp, `before day ${day} ${where}`);
    mvp.waterUse();
    const r = drainPortables(
      l.water,
      survey.topology,
      survey.points,
      needFor(survey.topology.areaOf, month),
    );
    l = { ...l, water: r.water };
    expectSameLayout(l, mvp, `day ${day} ${where}`);

    // The MVP's diary lines about troughs since the last day, oldest first.
    const lines: string[] = [];
    for (const line of mvp.S.log) {
      if (line === logBefore) break;
      if (line.msg.startsWith('The portable trough')) lines.unshift(line.msg);
    }
    expect(r.events.length, `events on day ${day} ${where}`).toBe(lines.length);
    r.events.forEach((e, k) => {
      const line = lines[k]!;
      if (e.type === 'portable-empty') expect(line).toContain('is empty!');
      else {
        expect(line).toContain(`is down to ${e.pct}%, about ${e.daysLeft} days left`);
      }
    });
    expect(r.changed).toBe(r.events.some((e) => e.type === 'portable-empty'));
    all.push(...r.events);
  }
  // After the last day the watered squares still agree.
  expectSameSurvey(surveyLayout(l), mvp, `at the end ${where}`);
  return all;
}

describe('portable troughs drain, against the MVP', () => {
  it('several mobs and troughs over 150 days, summer into winter', { timeout: 60000 }, () => {
    const layout = bareLayout(4000);
    vRun(layout.fences, 10, 0, GRID_H, EDGE.permanent);
    vRun(layout.fences, 20, 0, GRID_H, EDGE.permanent);
    vRun(layout.fences, 30, 0, GRID_H, EDGE.permanent);
    layout.fences.vE[5 * (GRID_W + 1) + 30] = EDGE.gateOpen;
    const w = layout.water;
    w.troughs.push(cell(15, 13));
    const port = (id: number, c: number, level = PORTABLE_CAPACITY_L): void => {
      w.ports.push({ id, cell: c, level, warned: false, lastUse: 0 });
    };
    port(1, cell(3, 3)); // the only water in the first paddock
    port(2, cell(15, 3)); // shares the second paddock with a fixed trough
    port(3, cell(25, 3)); // two portables in the joined third and fourth paddocks
    port(4, cell(35, 20));
    port(5, cell(36, 21), 0); // already empty
    w.nextPortId = 6;
    putLayout(mvp, layout);
    const rng = rngStream(4, 'water-mobs');
    const weights = (n: number): number[] => Array.from({ length: n }, () => rng.range(180, 620));
    putMobs([
      { anchor: cell(4, 10), weights: weights(9) },
      { anchor: cell(14, 20), weights: weights(25) },
      { anchor: cell(26, 10), weights: weights(14) },
      { anchor: cell(37, 3), weights: weights(3) },
    ]);
    const events = runDays(layout, 150, 'mixed farm');
    // Every kind of event happened, each trough warned once and emptied once.
    const count = (type: string, id: number): number =>
      events.filter((e) => e.type === type && e.portId === id).length;
    for (const id of [1, 2, 3, 4]) {
      expect(count('portable-low', id), `low warning, trough ${id}`).toBe(1);
      expect(count('portable-empty', id), `empty, trough ${id}`).toBe(1);
    }
    expect(count('portable-low', 5) + count('portable-empty', 5)).toBe(0);
  });

  it('a big mob empties a trough in one day with no low-water warning first', () => {
    const layout = bareLayout(4000);
    layout.water.ports.push({ id: 1, cell: 5, level: 6000, warned: false, lastUse: 0 });
    putLayout(mvp, layout);
    putMobs([{ anchor: 9, weights: Array.from({ length: 200 }, () => 450) }]);
    const events = runDays(layout, 3, 'big mob');
    expect(events).toEqual([{ type: 'portable-empty', portId: 1, cell: 5 }]);
  });

  it('a trough with no stock near it keeps its water', () => {
    const layout = bareLayout(4000);
    vRun(layout.fences, 20, 0, GRID_H, EDGE.permanent);
    layout.water.ports.push({ id: 1, cell: 5, level: 1000, warned: false, lastUse: 0 });
    putLayout(mvp, layout);
    putMobs([{ anchor: 39, weights: [400, 500] }]);
    expect(runDays(layout, 5, 'no stock')).toEqual([]);
  });
});

describe('water need', () => {
  it('is 10% of live weight, 1.3 times in summer and 0.8 times in winter', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(waterSeasonFactor)).toEqual([
      1.3, 1.3, 1, 1, 1, 0.8, 0.8, 0.8, 1, 1, 1, 1.3,
    ]);
    expect(waterNeedPerHead(450, 3)).toBe(45);
    expect(waterNeedPerHead(450, 0)).toBe(450 * 0.1 * 1.3);
    expect(waterNeedPerHead(450, 6)).toBe(450 * 0.1 * 0.8);
  });

  it('a portable trough holds the MVP figure and warns under a quarter', () => {
    expect(PORTABLE_CAPACITY_L).toBe(mvp.PORT_CAP);
    expect(PORTABLE_CAPACITY_L * PORTABLE_LOW_SHARE).toBe(1500);
  });

  it('the warning goes out once, and again only after a refill', () => {
    const layout = bareLayout(4000);
    layout.water.ports.push({ id: 1, cell: 5, level: 1600, warned: false, lastUse: 0 });
    const survey = surveyLayout(layout);
    const need = (): number => 200;
    const a = drainPortables(layout.water, survey.topology, survey.points, need);
    expect(a.events).toEqual([{ type: 'portable-low', portId: 1, cell: 5, pct: 23, daysLeft: 7 }]);
    expect(a.water.ports[0]).toMatchObject({ level: 1400, warned: true, lastUse: 200 });
    // The input is not changed.
    expect(layout.water.ports[0]).toMatchObject({ level: 1600, warned: false });
    const b = drainPortables(a.water, survey.topology, survey.points, need);
    expect(b.events).toEqual([]);
    expect(b.changed).toBe(false);
  });
});

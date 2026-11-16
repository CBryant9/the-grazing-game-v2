import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import type { Action } from '../actions/types';
import type { SpeciesId } from '../data/species';
import { GRID_H, GRID_W } from '../grid';
import type { FarmState } from '../sim/state';
import { mobSummaries } from '../sim/summary';
import { stepDay } from '../sim/tick';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { boxCells, boxEdges, cellAt, openFarm } from '../../test-support/wholeFarm';

/*
 * Crops (docs/CALIBRATION.md, Benchmarks), in the average year:
 *
 *   Barley yield, Central West    about 2.5 t/ha
 *   Wheat yield, Central West     about 2.4 to 3 t/ha
 *   Steers on oats                ME about 10.7, CP about 18%, about 1.4 kg a day
 *
 * "About" is read as within 20% for the barley, within the range for the
 * wheat, and for the oats: ME within 0.4, CP within 2 points, and gain
 * within 0.2 kg a day.
 *
 * PROPOSED, WAITING ON CLAUDIA (docs/CALIBRATION.md, the 1.3 entry): the
 * oats figures are held for the fortnight straight after lock-up (days 120
 * to 134 after sowing). That is the one stretch where the model gives the
 * benchmark's figures. The benchmark does not say which stage it is for.
 * Younger oats is better feed than the benchmark (ME 11.4, CP 21%), and it
 * falls away as the crop runs up to head.
 */

vi.setConfig({ testTimeout: 600_000 });

const env = { seasons: AVERAGE_YEAR };

function must(farm: FarmState, action: Action): FarmState {
  const done = applyInstantly(farm, action, env);
  if (!done.ok) throw new Error(`${action.type} was refused: ${done.message}`);
  return done.farm;
}

/**
 * A mixed farm, two thirds arable with nothing in the rotation yet, and no
 * old fence line across it.
 */
function mixedFarm(district: DistrictId, month: number, seed: number): FarmState {
  return openFarm(district, {
    seed,
    start: { year: 2023, month },
    mixed: { arablePct: 65, croppedPct: 0 },
  });
}

/** The top-left square of a box of arable squares, `size` across, clear of the bore. */
function arableBox(farm: FarmState, size: number): { x: number; y: number } {
  const bore = farm.layout.water.bore;
  for (let y = 1; y + size < GRID_H - 1; y++) {
    for (let x = 1; x + size < GRID_W - 1; x++) {
      const cells = boxCells(x, y, x + size - 1, y + size - 1);
      if (cells.every((i) => farm.crops.arable[i] === 1 && i !== bore)) return { x, y };
    }
  }
  throw new Error('No box of arable land on this farm.');
}

/** Sow a grain crop, leave it alone, harvest it the day it is ready. Returns t/ha. */
function grainYield(district: DistrictId, species: SpeciesId, month: number, seed: number): number {
  let farm = mixedFarm(district, month, seed);
  const at = arableBox(farm, 6);
  const sown = applyInstantly(
    farm,
    { type: 'sow', species, cells: boxCells(at.x, at.y, at.x + 5, at.y + 5) },
    env,
  );
  if (!sown.ok) throw new Error(sown.message);
  farm = sown.farm;
  const event = sown.events.find((e) => e.type === 'sown');
  if (!event || event.type !== 'sown' || event.skipped > 0)
    throw new Error('Not all of it was sown.');
  for (let d = 0; d < 300; d++) {
    const ready = stepDay(farm, env).events.some(
      (e) => e.type === 'crop' && e.event.type === 'harvest-ready',
    );
    if (!ready) continue;
    const done = applyInstantly(farm, { type: 'harvest', field: event.fieldId }, env);
    if (!done.ok) throw new Error(done.message);
    const harvested = done.events.find((e) => e.type === 'harvested');
    if (harvested && harvested.type === 'harvested') return harvested.tha;
  }
  throw new Error('The crop was never ready.');
}

describe('grain yields in the average year, Central West NSW', () => {
  const SEEDS = [1, 2, 3];

  it('barley sown in May or June yields about 2.5 t/ha', () => {
    for (const month of [4, 5]) {
      for (const seed of SEEDS) {
        const tha = grainYield('cw', 'barley', month, seed);
        expect(tha, `month ${month} seed ${seed}`).toBeGreaterThanOrEqual(2.0);
        expect(tha, `month ${month} seed ${seed}`).toBeLessThanOrEqual(3.0);
      }
    }
  });

  it('wheat sown from March to May yields 2.4 to 3 t/ha', () => {
    for (const month of [2, 3, 4]) {
      for (const seed of SEEDS) {
        const tha = grainYield('cw', 'wheat', month, seed);
        expect(tha, `month ${month} seed ${seed}`).toBeGreaterThanOrEqual(2.4);
        expect(tha, `month ${month} seed ${seed}`).toBeLessThanOrEqual(3.0);
      }
    }
  });
});

describe('steers on oats in the average year, Central West NSW', () => {
  // A 36 ha paddock of oats sown in March, fenced, with a trough. Thirty
  // weaner steers go on when it is established (day 50) and stay.
  let farm = mixedFarm('cw', 2, 1);
  const at = arableBox(farm, 12);
  const cells = boxCells(at.x, at.y, at.x + 11, at.y + 11);
  farm = must(farm, { type: 'sow', species: 'oats', cells });
  farm = must(farm, {
    type: 'buildFence',
    edges: boxEdges(at.x, at.y, at.x + 11, at.y + 11),
    fence: 'permanent',
  });
  // Pipe from the bore to the corner of the oats, and a trough on it.
  const bore = farm.layout.water.bore;
  const bx = bore % GRID_W;
  const by = Math.floor(bore / GRID_W);
  const pipe = new Set<number>();
  for (let x = Math.min(bx, at.x); x <= Math.max(bx, at.x); x++) pipe.add(cellAt(x, by));
  for (let y = Math.min(by, at.y); y <= Math.max(by, at.y); y++) pipe.add(cellAt(at.x, y));
  pipe.delete(bore);
  farm = must(farm, { type: 'layPipe', cells: [...pipe] });
  farm = must(farm, { type: 'placeTrough', cell: cellAt(at.x, at.y) });
  for (let d = 0; d < 50; d++) stepDay(farm, env);
  farm = must(farm, {
    type: 'buyCattle',
    cls: 'weanerSteer',
    qty: 30,
    to: { cell: cellAt(at.x + 5, at.y + 5) },
  });
  if (mobSummaries(farm).some((m) => !m.hasWater)) {
    throw new Error('The oats paddock has no water.');
  }

  const weight = (): number =>
    farm.mobs[0]!.animals.reduce((s, a) => s + a.wt, 0) / farm.mobs[0]!.animals.length;

  /** Run to a farm day and return the diet and the gain over the stretch. */
  function runTo(day: number): { me: number; cp: number; gain: number; fill: number } {
    const days = day - farm.day;
    const w0 = weight();
    let me = 0;
    let cp = 0;
    let fill = 1;
    for (let d = 0; d < days; d++) {
      stepDay(farm, env);
      const st = farm.mobs[0]!.st!;
      me += st.me / days;
      cp += st.cp / days;
      fill = Math.min(fill, st.f);
    }
    return { me, cp, gain: (weight() - w0) / days, fill };
  }

  const settling = runTo(64);
  const young = runTo(106);
  runTo(120);
  const afterLockUp = runTo(134);
  const heading = runTo(162);

  it('keeps the steers on the oats, with all the feed they want', () => {
    expect(farm.mobs).toHaveLength(1);
    expect(farm.mobs[0]!.animals.length).toBeGreaterThanOrEqual(28);
    for (const stretch of [settling, young, afterLockUp, heading]) {
      expect(stretch.fill).toBeGreaterThan(0.99);
    }
  });

  it('gives a diet of about ME 10.7 in the fortnight after lock-up', () => {
    expect(afterLockUp.me).toBeGreaterThan(10.3);
    expect(afterLockUp.me).toBeLessThan(11.1);
  });

  it('gives a diet of about 18% crude protein in the fortnight after lock-up', () => {
    expect(afterLockUp.cp).toBeGreaterThan(16);
    expect(afterLockUp.cp).toBeLessThan(20);
  });

  it('puts on about 1.4 kg a day in the fortnight after lock-up', () => {
    expect(afterLockUp.gain).toBeGreaterThan(1.2);
    expect(afterLockUp.gain).toBeLessThan(1.6);
  });

  it('is better feed while it is young, and poorer as it runs up to head', () => {
    expect(young.me).toBeGreaterThan(afterLockUp.me);
    expect(young.cp).toBeGreaterThan(afterLockUp.cp);
    expect(young.gain).toBeGreaterThan(1.2);
    expect(young.gain).toBeLessThan(1.7);
    expect(heading.me).toBeLessThan(afterLockUp.me);
    expect(heading.cp).toBeLessThan(afterLockUp.cp);
    expect(heading.gain).toBeLessThan(afterLockUp.gain);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import {
  across,
  busyFarm,
  cell,
  down,
  farmWithCropReady,
  setUp,
  toSaleDay,
  withLightLeft,
  work,
} from '../../test-support/workingDay';
import type { Action, JobCard } from '../actions/types';
import { JOB_TIMES, type JobFigure } from '../data/jobTimes';
import { EDGE, cloneFences, setEdge } from '../farm/topology';
import { GRID_N, GRID_W } from '../grid';
import { LAND } from '../pasture/state';
import { createFarm } from '../sim/create';
import type { FarmState } from '../sim/state';
import { previewAction } from './act';
import { clockView } from './look';

/*
 * How long each job takes (PRD 5.4). Every figure is written out here, so
 * a change to the table fails a test. A job's time is its work only: there
 * is no driving. Squares are 50 m (260 ha).
 */

vi.setConfig({ testTimeout: 600_000 });

const still = (): FarmState => openFarm('nsw');

/** The job card for a job on a farm, done. */
const card = (farm: FarmState, action: Action): JobCard => work(farm, action).job;

/** Minutes of work in a job that is done in one go, from its card. */
function minutes(farm: FarmState, action: Action): number {
  const c = card(farm, action);
  expect(c.outcome).toBe('done');
  expect(c.endsAt - c.startsAt).toBe(c.workMin);
  return c.workMin;
}

describe('the table of job times', () => {
  // Every figure, written out, with the mark the PRD gives it.
  const PRD: Record<string, [number, 'decided' | 'proposed' | 'builder']> = {
    permanentFenceMPerDay: [500, 'decided'],
    electricFenceMPerHour: [1000, 'proposed'],
    tapeMPerHour: [3000, 'proposed'],
    pipeMPerHour: [400, 'proposed'],
    gateMin: [60, 'proposed'],
    gateOpenShutMin: [0, 'builder'],
    troughMin: [180, 'proposed'],
    portableTroughMin: [30, 'proposed'],
    moveMobSettleMin: [15, 'proposed'],
    moveMobMinPer100Head: [1, 'proposed'],
    musterBaseMin: [30, 'proposed'],
    musterMinPer200Ha: [60, 'proposed'],
    feedOutMin: [30, 'proposed'],
    feedRunMinPerMob: [5, 'proposed'],
    weanBaseMin: [30, 'proposed'],
    weanMinPerHead: [0.5, 'proposed'],
    markMinPerCalf: [2, 'proposed'],
    pregTestMinPerCow: [1, 'proposed'],
    sellBaseMin: [60, 'proposed'],
    sellMinPer10Head: [1, 'proposed'],
    buyOnlineMin: [30, 'proposed'],
  };
  const table: Record<string, JobFigure> = JOB_TIMES;

  it('holds every job time, each with the mark the PRD gives it', () => {
    expect(Object.keys(table).sort()).toEqual(Object.keys(PRD).sort());
    for (const [name, [value, status]] of Object.entries(PRD)) {
      expect(table[name]!.value, name).toBe(value);
      expect(table[name]!.status, name).toBe(status);
      expect(table[name]!.from.length, name).toBeGreaterThan(8);
    }
  });

  it('has no travel, no saleyard trip, no contractor wait, no walking pace and one kind of gate', () => {
    // Taken out by Claudia on 14 Nov 2026. They must not come back by accident.
    for (const gone of [
      'travelKmH',
      'saleyardBuyMin',
      'contractorDays',
      'walkKmH',
      'wireGateUseMin',
    ]) {
      expect(gone in table, gone).toBe(false);
    }
    expect(table.gateMin!.value).toBe(60);
  });

  it('the one figure Claudia has decided is marked decided, and no others', () => {
    const decided = Object.entries(table)
      .filter(([, f]) => f.status === 'decided')
      .map(([name]) => name);
    expect(decided).toEqual(['permanentFenceMPerDay']);
  });

  it('every figure is in docs/DATA.md with its mark', () => {
    const doc = readFileSync(new URL('../../../../docs/DATA.md', import.meta.url), 'utf8');
    const at = doc.indexOf('## Job times');
    expect(at).toBeGreaterThan(0);
    const section = doc.slice(at, doc.indexOf('\n## ', at + 5));
    const MARK = { decided: 'Decided', proposed: 'Proposed', builder: 'Builder' } as const;
    for (const [name, f] of Object.entries(table)) {
      const row = section.split('\n').find((line) => line.includes('`' + name + '`'));
      expect(row, `${name} is missing from DATA.md, Job times`).toBeDefined();
      expect(row, name).toContain(MARK[f.status]);
      expect(row, name).toContain(String(f.value).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    }
  });
});

describe('fence, tape and pipe', () => {
  it('permanent fence: a whole day of light builds 500 m, on your own', () => {
    const farm = still();
    // 10 squares of 50 m is 500 m: the whole day, done at last light.
    const day = card(farm, { type: 'buildFence', edges: across(10, 5, 14), fence: 'permanent' });
    expect(day.outcome).toBe('done');
    expect(day.workMin).toBeCloseTo(day.dayMin, 6);
    expect(day.leftAfterMin).toBeCloseTo(0, 6);
    expect(day.usesRestOfDay).toBe(true);
    // One square more does not fit: 500 m is built and the last square is not.
    const more = card(farm, { type: 'buildFence', edges: across(10, 5, 15), fence: 'permanent' });
    expect(more.outcome).toBe('part');
    expect(more.line!.fits.metres).toBe(500);
    expect(more.line!.doesNotFit.metres).toBe(50);
  });

  it('permanent fence: half a day builds 250 m, and time on other jobs comes off it', () => {
    const farm = still();
    const half = withLightLeft(farm, clockView(farm).dayMin / 2);
    const done = card(half, { type: 'buildFence', edges: across(10, 5, 9), fence: 'permanent' });
    expect(done.outcome).toBe('done');
    expect(done.leftAfterMin).toBeCloseTo(0, 6);
    const part = card(half, { type: 'buildFence', edges: across(10, 5, 14), fence: 'permanent' });
    expect(part.line!.fits.metres).toBe(250);
    // After a 3 hour trough, the day has 500 m less 3 hours' share of it: on this
    // 12 h 17 m day that is 377 m, so 7 whole squares.
    const b = busyFarm();
    const later = work(b.farm, { type: 'placeTrough', cell: b.pipedCell }).farm;
    const rest = card(later, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    expect(500 * (1 - 180 / rest.dayMin)).toBeGreaterThan(350);
    expect(500 * (1 - 180 / rest.dayMin)).toBeLessThan(400);
    expect(rest.line!.fits.metres).toBe(350);
  });

  it('permanent fence: 500 m a day in the shortest days and the longest', () => {
    const winter = openFarm('wv', { size: 260, start: { year: 2023, month: 5 } });
    const summer = openFarm('cq', { size: 260, start: { year: 2023, month: 11 } });
    const job: Action = { type: 'buildFence', edges: across(10, 3, 30), fence: 'permanent' };
    expect(card(winter, job).line!.fits.metres).toBe(500);
    expect(card(summer, job).line!.fits.metres).toBe(500);
  });

  it('electric fence goes up at 1 km an hour', () => {
    // 20 squares of 50 m is 1,000 m.
    expect(
      minutes(still(), { type: 'buildFence', edges: across(10, 5, 24), fence: 'electric' }),
    ).toBeCloseTo(60, 9);
  });

  it('tape is put out at 3 km an hour, and rolled up at the same pace', () => {
    const farm = still();
    const out = work(farm, { type: 'buildFence', edges: across(10, 5, 24), fence: 'tape' });
    expect(out.job.workMin).toBeCloseTo(20, 9);
    expect(minutes(out.farm, { type: 'rollUpTape', edge: across(10, 9, 9)[0]! })).toBeCloseTo(
      20,
      9,
    );
  });

  it('poly pipe is laid at 400 m an hour', () => {
    // 8 squares of 50 m is 400 m.
    const cells = [3, 4, 5, 6, 7, 8, 9, 10].map((x) => cell(x, 4));
    expect(minutes(still(), { type: 'layPipe', cells })).toBeCloseTo(60, 9);
  });

  it("builder's rule: pulling a fence down takes as long as putting it up", () => {
    let farm = still();
    farm = setUp(farm, { type: 'buildFence', edges: across(10, 5, 24), fence: 'electric' });
    farm = setUp(farm, { type: 'buildFence', edges: across(14, 5, 14), fence: 'permanent' });
    expect(minutes(farm, { type: 'removeFence', edges: across(10, 5, 24) })).toBeCloseTo(60, 9);
    const perm = card(farm, { type: 'removeFence', edges: across(14, 5, 14) });
    expect(perm.workMin).toBeCloseTo(perm.dayMin, 6);
    // A gate in the run comes out in the hour it took to hang.
    const gated = setUp(farm, { type: 'placeGate', edge: across(10, 7, 7)[0]! });
    // 19 squares of electric at 1 km an hour, and a gate: 57 minutes and 60.
    expect(minutes(gated, { type: 'removeFence', edges: across(10, 5, 24) })).toBeCloseTo(117, 9);
  });

  it('a knocked-down segment goes back up at the pace of its kind', () => {
    let farm = still();
    farm = setUp(farm, { type: 'buildFence', edges: across(10, 5, 9), fence: 'electric' });
    farm = setUp(farm, { type: 'buildFence', edges: across(14, 5, 9), fence: 'tape' });
    const fences = cloneFences(farm.layout.fences);
    setEdge(fences, across(10, 6, 6)[0]!, EDGE.electricDown);
    setEdge(fences, across(14, 6, 6)[0]!, EDGE.tapeDown);
    farm.layout = { ...farm.layout, fences };
    // 50 m of electric at 1 km an hour is 3 minutes. 50 m of tape at 3 km an hour is 1.
    expect(minutes(farm, { type: 'fixFence', edge: across(10, 6, 6)[0]! })).toBeCloseTo(3, 9);
    expect(minutes(farm, { type: 'fixFence', edge: across(14, 6, 6)[0]! })).toBeCloseTo(1, 9);
  });

  it('only the new fence is work: a gate and fence of the same kind in the run take no time', () => {
    let farm = still();
    farm = setUp(farm, { type: 'buildFence', edges: across(10, 5, 9), fence: 'electric' });
    farm = setUp(farm, { type: 'placeGate', edge: across(10, 7, 7)[0]! });
    // Squares 3 to 12: 5 to 9 are fenced or gated already, so 5 squares are new. 250 m is 15 minutes.
    const c = card(farm, { type: 'buildFence', edges: across(10, 3, 12), fence: 'electric' });
    expect(c.line!.fits.pieces.length).toBe(5);
    expect(c.line!.fits.metres).toBe(250);
    expect(c.workMin).toBeCloseTo(15, 9);
    // Drawing the same square twice does not build it twice.
    const twice = [...across(12, 3, 6), ...across(12, 3, 6)];
    expect(
      card(farm, { type: 'buildFence', edges: twice, fence: 'electric' }).line!.fits.pieces.length,
    ).toBe(4);
  });

  it('the card adds up: time, metres and pieces', () => {
    const farm = still();
    const edges = [...across(10, 5, 24), ...down(25, 10, 14)];
    const c = card(farm, { type: 'buildFence', edges, fence: 'electric' });
    expect(c.line!.fits.pieces).toEqual(edges.map((edge) => ({ edge })));
    expect(c.line).toMatchObject({
      fits: { metres: 1250 },
      doesNotFit: { pieces: [], metres: 0 },
    });
    expect(c.workMin).toBeCloseTo(75, 9);
    expect(c.totalWorkMin).toBeCloseTo(75, 9);
    expect(c.parts).toEqual([{ what: 'build', minutes: c.totalWorkMin }]);
    expect(c.fitsToday).toBe(true);
    expect(c.notToday).toBeUndefined();
  });
});

describe('gates and water', () => {
  it('a swing gate takes an hour to hang, and an hour to take out', () => {
    const b = busyFarm();
    expect(minutes(b.farm, { type: 'placeGate', edge: b.tape })).toBe(60);
    expect(minutes(b.farm, { type: 'removeGate', edge: b.gate })).toBe(60);
  });

  it('opening or shutting a gate takes none of the day', () => {
    const b = busyFarm();
    expect(minutes(b.farm, { type: 'setGate', edge: b.gate, open: true })).toBe(0);
  });

  it('a trough with fittings takes 3 hours: to put in, to move, or to take out', () => {
    const b = busyFarm();
    expect(minutes(b.farm, { type: 'placeTrough', cell: b.pipedCell })).toBe(180);
    expect(minutes(b.farm, { type: 'moveTrough', from: b.trough, to: b.pipedCell })).toBe(180);
    expect(minutes(b.farm, { type: 'removeTrough', cell: b.trough })).toBe(180);
  });

  it('a water hub on a fence line is a trough: 3 hours in, 3 hours out', () => {
    const b = busyFarm();
    expect(minutes(b.farm, { type: 'removeHub', vertex: b.hub })).toBe(180);
    const bare = work(b.farm, { type: 'removeHub', vertex: b.hub }).farm;
    expect(minutes(bare, { type: 'placeFenceHub', vertex: b.hub })).toBe(180);
  });

  it('a water hub on a square is a trough and an hour for each gate', () => {
    const b = busyFarm();
    // A piped square in the open with no trough: a trough and four gates.
    const [bx, by] = [
      b.farm.layout.water.bore % GRID_W,
      Math.floor(b.farm.layout.water.bore / GRID_W),
    ];
    const open = cell(bx, by + (b.pipedCell > b.farm.layout.water.bore ? 2 : -2));
    const hub = card(b.farm, { type: 'placeSquareHub', cell: open });
    expect(hub.parts).toEqual([
      { what: 'trough', minutes: 180 },
      { what: 'gate', minutes: 240 },
    ]);
    expect(hub.workMin).toBe(420);
    // On a square that has its trough, the gates alone.
    const gatesOnly = card(b.farm, { type: 'placeSquareHub', cell: b.trough });
    expect(gatesOnly.parts[0]).toEqual({ what: 'trough', minutes: 0 });
    expect(gatesOnly.workMin).toBe(240);
  });

  it('a portable trough takes 30 minutes to set up, move, refill or take away', () => {
    const b = busyFarm();
    expect(minutes(b.farm, { type: 'placePortable', cell: b.openCell })).toBe(30);
    expect(minutes(b.farm, { type: 'movePortable', port: b.port, cell: b.openCell })).toBe(30);
    expect(minutes(b.farm, { type: 'refillPortable', port: b.port })).toBe(30);
    expect(minutes(b.farm, { type: 'removePortable', port: b.port })).toBe(30);
  });
});

describe('stock work, done where the mob is', () => {
  it('moving a mob: 15 minutes and a minute for each 100 head. Pick the paddock, done', () => {
    const b = busyFarm();
    const move = card(b.farm, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    // 40 steers. No route and no walking time.
    expect(move.parts).toEqual([
      { what: 'settle', minutes: 15 },
      { what: 'head', minutes: 0.4 },
    ]);
    expect(move.workMin).toBeCloseTo(15.4, 9);
    // 250 head: 15 + 2.5.
    const big = setUp(b.farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 210,
      to: { mob: b.steers },
    });
    expect(minutes(big, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } })).toBeCloseTo(
      17.5,
      9,
    );
    expect(minutes(big, { type: 'moveMob', mob: b.steers, to: 'lot' })).toBeCloseTo(17.5, 9);
  });

  it('moving part of a mob: 15 minutes for the mob they come from, and a minute for each 100 moved', () => {
    const b = busyFarm();
    const some = card(b.farm, {
      type: 'moveCattle',
      picks: [{ mob: b.steers, cls: 'yearlingSteer', qty: 20 }],
      to: { cell: b.emptyCell },
    });
    expect(some.workMin).toBeCloseTo(15.2, 9);
  });

  it('husbandry has no muster: the size of the paddock does not change the time', () => {
    const b = busyFarm();
    // The cows' paddock is 6 squares by 6: 36 squares of a quarter hectare, 9 ha.
    const mark = card(b.farm, { type: 'markCalves', mob: b.cows });
    expect(mark.parts.some((p) => (p.what as string) === 'muster')).toBe(false);
    expect(mark.workMin).toBeCloseTo(2 * 12, 9);
    // The same mob on 2,080 ha takes the same: 30 minutes and half a minute a head.
    const wide = openFarm('nsw', { size: 2080 });
    const stocked = setUp(wide, {
      type: 'buyCattle',
      cls: 'cowCalf',
      qty: 4,
      to: { cell: wide.layout.water.bore },
    });
    for (const a of stocked.mobs[0]!.animals) if (a.kind === 'calf') a.age = 120;
    const wean = previewAction(stocked, { type: 'wean', mob: stocked.mobs[0]!.id, to: 'lot' });
    if (!wean.ok) throw new Error(wean.message);
    const head = stocked.mobs[0]!.animals.length;
    expect(wean.card.workMin).toBeCloseTo(30 + 0.5 * head, 6);
  });

  it('weaning: 30 minutes, and half a minute a head', () => {
    const b = busyFarm();
    // 12 cows and 12 calves.
    const wean = card(b.farm, { type: 'wean', mob: b.cows });
    expect(wean.parts).toEqual([
      { what: 'draft-and-load', minutes: 30 },
      { what: 'head', minutes: 12 },
    ]);
    // 30 + 0.5 x 24 head = 42 minutes. 12 cows and 12 calves are 24 head.
    expect(wean.workMin).toBeCloseTo(30 + 0.5 * 24, 9);
  });

  it('marking: 2 minutes for every calf at foot', () => {
    const b = busyFarm();
    // 12 calves are handled. 6 are bull calves and get marked.
    const done = work(b.farm, { type: 'markCalves', mob: b.cows });
    expect(done.events.find((e) => e.type === 'calves-marked')).toMatchObject({ count: 6 });
    expect(done.job.parts).toEqual([{ what: 'head', minutes: 24 }]);
    // 2 min x 12 calves = 24 minutes.
    expect(done.job.workMin).toBeCloseTo(2 * 12, 9);
    // With the heifer calves gone from the mob, only the bull calves are left to count.
    const m = b.farm.mobs.find((x) => x.id === b.cows)!;
    m.animals = m.animals.filter((a) => a.kind !== 'calf' || a.sex === 'M');
    expect(work(b.farm, { type: 'markCalves', mob: b.cows }).job.parts[0]).toEqual({
      what: 'head',
      minutes: 12,
    });
  });

  it('selling: an hour, and a minute for each 10 head', () => {
    const b = busyFarm();
    // The steers run on two paddocks joined by a fence that is down: 72 squares, 18 ha.
    const sale = card(b.farm, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 });
    expect(sale.parts).toEqual([
      { what: 'draft-and-load', minutes: 60 },
      { what: 'head', minutes: 1 },
    ]);
    // Calves at foot are loaded too: 3 cows and 3 calves is 6 head.
    const cows = card(b.farm, { type: 'sellClass', cls: 'cow', qty: 3 });
    expect(cows.parts[1]).toEqual({ what: 'head', minutes: 0.6 });
    // A class sold out of two mobs has no muster for either: 60 + 1 x (head / 10).
    const ids = b.farm.mobs
      .flatMap((m) => m.animals.filter((a) => a.kind !== 'calf'))
      .map((a) => a.id);
    const all = card(b.farm, { type: 'sellAnimals', ids });
    expect(all.parts[0]!.minutes).toBe(60);
    // Calves at foot go with their dams, so every head on the farm is loaded.
    const head = b.farm.mobs.reduce((n, m) => n + m.animals.length, 0);
    expect(all.workMin).toBeCloseTo(60 + head / 10, 9);
    // Stock in the feedlot take the same.
    const lot = setUp(b.farm, { type: 'moveMob', mob: b.steers, to: 'lot' });
    const fromLot = card(lot, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 });
    expect(fromLot.parts[0]).toEqual({ what: 'draft-and-load', minutes: 60 });
    expect(fromLot.workMin).toBeCloseTo(61, 9);
  });

  it('stock in the yards take the same, and nothing is walked there', () => {
    const b = busyFarm();
    const m = b.farm.mobs.find((x) => x.id === b.steers)!;
    m.where = { kind: 'yards' };
    const sale = card(b.farm, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 });
    expect(sale.parts[0]).toEqual({ what: 'draft-and-load', minutes: 60 });
    // Marking the cows in their paddock is done there, not by a trip to the yards.
    const mark = card(b.farm, { type: 'markCalves', mob: b.cows });
    expect(mark.workMin).toBeCloseTo(2 * 12, 9);
    const cows = b.farm.mobs.find((x) => x.id === b.cows)!;
    expect(work(b.farm, { type: 'markCalves', mob: b.cows }).farm.mobs[0]!.where).toEqual(
      cows.where,
    );
  });

  it('switching a supplement on or off takes none of the daylight', () => {
    const b = busyFarm();
    const fed = work(b.farm, { type: 'setSupplement', mob: b.steers, supp: 'hay' });
    expect(fed.job.outcome).toBe('free');
    expect(fed.job.workMin).toBe(0);
    expect(fed.farm.clock.used).toBe(b.farm.clock.used);
    const off = work(fed.farm, { type: 'setSupplement', mob: b.steers, supp: 'none' });
    expect(off.job.outcome).toBe('free');
    expect(off.farm.clock.used).toBe(fed.farm.clock.used);
  });
});

describe('what takes none of the day', () => {
  const mixedFarm = (): FarmState =>
    createFarm({
      seed: 4,
      district: 'cw',
      size: 'small',
      start: { year: 2022, month: 5 },
      startType: 'scratch',
      mixed: { arablePct: 40, croppedPct: 50 },
      difficulty: 'easy',
      money: { ...PLENTY },
    });

  it('buying: there is no trip to the saleyard', () => {
    const b = busyFarm();
    // Cattle are bought on a sale day, and arrive in the yards at first light the next day.
    const buy = work(toSaleDay(b.farm), { type: 'buyCattle', cls: 'yearSteer', qty: 5 });
    expect(buy.job.outcome).toBe('free');
    expect(buy.job.workMin).toBe(0);
    expect(buy.job.parts).toEqual([]);
    expect(buy.farm.clock.used).toBe(0);
    expect(buy.job.costToday).toBeGreaterThan(1000);
    expect(buy.events.map((e) => e.type)).toEqual(['cattle-on-the-way']);
  });

  it('sowing happens at once: it costs money and none of the day, with no contractor to wait for', () => {
    const farm = mixedFarm();
    const fallow: number[] = [];
    for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) fallow.push(i);
    const sown = work(farm, { type: 'sow', species: 'barley', cells: fallow });
    expect(sown.job.outcome).toBe('free');
    expect(sown.job.workMin).toBe(0);
    expect(sown.farm.clock.used).toBe(0);
    expect(sown.farm.crops.fields.length).toBe(farm.crops.fields.length + 1);
    expect(sown.job.costToday).toBeCloseTo(farm.cash - sown.farm.cash, 9);
    expect(sown.job.costToday).toBeGreaterThan(0);
    expect(sown.events.map((e) => e.type)).toEqual(['sown']);
  });

  it('harvest happens at once: the grain is banked the day it is asked for', () => {
    const ready = farmWithCropReady(mixedFarm);
    const done = work(ready.farm, { type: 'harvest', field: ready.field });
    expect(done.job.outcome).toBe('free');
    expect(done.farm.clock.used).toBe(0);
    expect(done.farm.year.grain).toBeGreaterThan(ready.farm.year.grain);
    expect(done.events.map((e) => e.type)).toEqual(['harvested']);
    // It is exactly the harvest the crop calibration uses: done off the clock, the farm is the same.
    const instant = setUp(ready.farm, { type: 'harvest', field: ready.field });
    expect(done.farm.cash).toBe(instant.cash);
    expect(done.farm.year.grain).toBe(instant.year.grain);
  });
});

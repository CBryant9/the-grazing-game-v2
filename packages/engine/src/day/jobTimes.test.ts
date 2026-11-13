import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { openFarm } from '../../test-support/wholeFarm';
import {
  across,
  busyFarm,
  cell,
  down,
  setUp,
  turnedDown,
  withLightLeft,
  work,
} from '../../test-support/workingDay';
import type { Action, JobCard } from '../actions/types';
import { JOB_TIMES, type JobFigure } from '../data/jobTimes';
import { EDGE, cloneFences, setEdge } from '../farm/topology';
import { GRID_W } from '../grid';
import { homesteadPoint } from '../sim/clock';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { previewAction } from './act';
import { clockView } from './look';

/*
 * How long each job takes (PRD 5.4). Every figure is written out here, so
 * a change to the table fails a test. The farms have travel switched off,
 * so the time on the card is the work alone. Squares are 50 m (260 ha).
 */

vi.setConfig({ testTimeout: 600_000 });

const NO_TRAVEL = { work: { travel: false } } as const;
const still = (): FarmState => openFarm('nsw', NO_TRAVEL);

/** The job card for a job on a farm, done. */
const card = (farm: FarmState, action: Action): JobCard => work(farm, action).job;

/** Minutes of work in a job, from its card. No travel on these farms. */
function minutes(farm: FarmState, action: Action): number {
  const c = card(farm, action);
  expect(c.travelMin).toBe(0);
  expect(c.homeMin).toBe(0);
  expect(c.outcome).toBe('done');
  return c.workMin;
}

describe('the table of job times', () => {
  // Every figure, written out, with the mark the PRD gives it.
  const PRD: Record<string, [number, 'decided' | 'proposed' | 'builder']> = {
    travelKmH: [25, 'decided'],
    permanentFenceMPerDay: [500, 'decided'],
    electricFenceMPerHour: [1000, 'proposed'],
    tapeMPerHour: [3000, 'proposed'],
    pipeMPerHour: [400, 'proposed'],
    'gateMin.swing': [60, 'proposed'],
    'gateMin.wire': [30, 'proposed'],
    'gateMin.tapeHandle': [5, 'proposed'],
    wireGateUseMin: [5, 'proposed'],
    gateOpenShutMin: [0, 'builder'],
    troughMin: [180, 'proposed'],
    portableTroughMin: [30, 'proposed'],
    moveMobSettleMin: [15, 'proposed'],
    moveMobMinPer100Head: [1, 'proposed'],
    walkKmH: [1.5, 'decided'],
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
    saleyardBuyMin: [360, 'proposed'],
    buyOnlineMin: [30, 'proposed'],
    contractorDays: [3, 'builder'],
  };

  /** Every figure in the engine's table, by name. */
  function figures(): Record<string, JobFigure> {
    const out: Record<string, JobFigure> = {};
    for (const [name, v] of Object.entries(JOB_TIMES)) {
      if ('value' in v) out[name] = v;
      else for (const [kind, f] of Object.entries(v)) out[`${name}.${kind}`] = f;
    }
    return out;
  }

  it('holds every figure in PRD 5.4, each with the mark the PRD gives it', () => {
    const table = figures();
    expect(Object.keys(table).sort()).toEqual(Object.keys(PRD).sort());
    for (const [name, [value, status]] of Object.entries(PRD)) {
      expect(table[name]!.value, name).toBe(value);
      expect(table[name]!.status, name).toBe(status);
      expect(table[name]!.from.length, name).toBeGreaterThan(8);
    }
  });

  it('the three figures Claudia has decided are marked decided, and no others', () => {
    const decided = Object.entries(figures())
      .filter(([, f]) => f.status === 'decided')
      .map(([name]) => name)
      .sort();
    expect(decided).toEqual(['permanentFenceMPerDay', 'travelKmH', 'walkKmH']);
  });

  it('every figure is in docs/DATA.md with its mark', () => {
    const doc = readFileSync(new URL('../../../../docs/DATA.md', import.meta.url), 'utf8');
    const at = doc.indexOf('## Job times');
    expect(at).toBeGreaterThan(0);
    const section = doc.slice(at, doc.indexOf('\n## ', at + 5));
    const MARK = { decided: 'Decided', proposed: 'Proposed', builder: 'Builder' } as const;
    for (const [name, f] of Object.entries(figures())) {
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
    // One square more does not fit: 500 m today and the rest tomorrow.
    const more = card(farm, { type: 'buildFence', edges: across(10, 5, 15), fence: 'permanent' });
    expect(more.outcome).toBe('part');
    expect(more.line!.metresToday).toBeCloseTo(500, 6);
    expect(more.line!.piecesToday).toBe(10);
    expect(more.moreDays).toBe(1);
  });

  it('permanent fence: half a day builds 250 m, and time on other jobs comes off it', () => {
    const farm = still();
    const half = withLightLeft(farm, clockView(farm).dayMin / 2);
    const done = card(half, { type: 'buildFence', edges: across(10, 5, 9), fence: 'permanent' });
    expect(done.outcome).toBe('done');
    expect(done.leftAfterMin).toBeCloseTo(0, 6);
    const part = card(half, { type: 'buildFence', edges: across(10, 5, 14), fence: 'permanent' });
    expect(part.line!.metresToday).toBeCloseTo(250, 6);
    // After a 3 hour trough, the day's fence is 500 m less 3 hours' share of the day.
    const b = busyFarm(NO_TRAVEL);
    const later = work(b.farm, { type: 'placeTrough', cell: b.pipedCell }).farm;
    const rest = card(later, { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' });
    expect(rest.line!.metresToday).toBeCloseTo(500 * (1 - 180 / rest.dayMin), 6);
  });

  it('permanent fence: 500 m a day in the shortest days and the longest', () => {
    const winter = openFarm('wv', { size: 260, start: { year: 2023, month: 5 }, ...NO_TRAVEL });
    const summer = openFarm('cq', { size: 260, start: { year: 2023, month: 11 }, ...NO_TRAVEL });
    const job: Action = { type: 'buildFence', edges: across(10, 3, 30), fence: 'permanent' };
    expect(card(winter, job).line!.metresToday).toBeCloseTo(500, 6);
    expect(card(summer, job).line!.metresToday).toBeCloseTo(500, 6);
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
});

describe('gates and water', () => {
  it('a swing gate takes an hour to hang, and an hour to take out', () => {
    const b = busyFarm(NO_TRAVEL);
    expect(minutes(b.farm, { type: 'placeGate', edge: b.tape })).toBe(60);
    expect(minutes(b.farm, { type: 'removeGate', edge: b.gate })).toBe(60);
  });

  it('opening or shutting a gate takes no time once you are there', () => {
    const b = busyFarm(NO_TRAVEL);
    expect(minutes(b.farm, { type: 'setGate', edge: b.gate, open: true })).toBe(0);
    // With travel on, it is the drive and nothing more.
    const far = busyFarm();
    const c = card(far.farm, { type: 'setGate', edge: far.gate, open: true });
    expect(c.workMin).toBe(0);
    expect(c.travelMin).toBeGreaterThan(0);
    expect(c.endsAt - c.startsAt).toBeCloseTo(c.travelMin, 9);
  });

  it('a trough with fittings takes 3 hours: to put in, to move, or to take out', () => {
    const b = busyFarm(NO_TRAVEL);
    expect(minutes(b.farm, { type: 'placeTrough', cell: b.pipedCell })).toBe(180);
    expect(minutes(b.farm, { type: 'moveTrough', from: b.trough, to: b.pipedCell })).toBe(180);
    expect(minutes(b.farm, { type: 'removeTrough', cell: b.trough })).toBe(180);
  });

  it('a water hub on a fence line is a trough: 3 hours in, 3 hours out', () => {
    const b = busyFarm(NO_TRAVEL);
    expect(minutes(b.farm, { type: 'removeHub', vertex: b.hub })).toBe(180);
    const bare = work(b.farm, { type: 'removeHub', vertex: b.hub }).farm;
    const next = withLightLeft(bare, 400);
    expect(minutes(next, { type: 'placeFenceHub', vertex: b.hub })).toBe(180);
  });

  it('a water hub on a square is a trough and an hour for each gate', () => {
    const b = busyFarm(NO_TRAVEL);
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
    const s = surveyOf(b.farm);
    expect(s.topology.paddockOf[b.trough]).toBeGreaterThanOrEqual(0);
    const gatesOnly = card(b.farm, { type: 'placeSquareHub', cell: b.trough });
    expect(gatesOnly.parts[0]).toEqual({ what: 'trough', minutes: 0 });
    expect(gatesOnly.workMin).toBe(240);
  });

  it('a portable trough takes 30 minutes to set up, move, refill or take away', () => {
    const b = busyFarm(NO_TRAVEL);
    expect(minutes(b.farm, { type: 'placePortable', cell: b.openCell })).toBe(30);
    expect(minutes(b.farm, { type: 'movePortable', port: b.port, cell: b.openCell })).toBe(30);
    expect(minutes(b.farm, { type: 'refillPortable', port: b.port })).toBe(30);
    expect(minutes(b.farm, { type: 'removePortable', port: b.port })).toBe(30);
  });
});

describe('stock work', () => {
  it('moving a mob: 15 minutes and a minute for each 100 head', () => {
    const b = busyFarm(NO_TRAVEL);
    const move = card(b.farm, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    // 40 steers.
    expect(move.parts).toEqual([
      { what: 'settle', minutes: 15 },
      { what: 'head', minutes: 0.4 },
      // Walking the route through gates comes with the next part of the milestone.
      { what: 'walk', minutes: 0 },
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
    const b = busyFarm(NO_TRAVEL);
    const some = card(b.farm, {
      type: 'moveCattle',
      picks: [{ mob: b.steers, cls: 'yearlingSteer', qty: 20 }],
      to: { cell: b.emptyCell },
    });
    expect(some.workMin).toBeCloseTo(15.2, 9);
  });

  it('a muster is 30 minutes and an hour for each 200 ha', () => {
    const b = busyFarm(NO_TRAVEL);
    // The cows' paddock is 6 squares by 6: 36 squares of a quarter hectare, 9 ha.
    const mark = card(b.farm, { type: 'markCalves', mob: b.cows });
    expect(mark.parts[0]!.what).toBe('muster');
    expect(mark.parts[0]!.minutes).toBeCloseTo(30 + (60 * 9) / 200, 9);
    // A mob on 2,000 ha takes 30 minutes and 10 hours.
    const wide = openFarm('nsw', { size: 2080, ...NO_TRAVEL });
    const stocked = setUp(wide, {
      type: 'buyCattle',
      cls: 'cowCalf',
      qty: 4,
      to: { cell: wide.layout.water.bore },
    });
    for (const a of stocked.mobs[0]!.animals) if (a.kind === 'calf') a.age = 120;
    const muster = previewAction(stocked, { type: 'wean', mob: stocked.mobs[0]!.id, to: 'lot' });
    if (!muster.ok) throw new Error(muster.message);
    expect(muster.card.parts[0]!.minutes).toBeCloseTo(30 + (60 * 2080) / 200, 6);
  });

  it('weaning: the muster, 30 minutes, and half a minute a head', () => {
    const b = busyFarm(NO_TRAVEL);
    // 12 cows and 12 calves.
    const wean = card(b.farm, { type: 'wean', mob: b.cows });
    expect(wean.parts).toEqual([
      { what: 'muster', minutes: 30 + (60 * 9) / 200 },
      { what: 'yard-work', minutes: 30 },
      { what: 'head', minutes: 12 },
    ]);
    expect(wean.workMin).toBeCloseTo(32.7 + 30 + 12, 9);
  });

  it('marking: the muster and 2 minutes a calf', () => {
    const b = busyFarm(NO_TRAVEL);
    // 6 bull calves.
    const done = work(b.farm, { type: 'markCalves', mob: b.cows });
    expect(done.events.find((e) => e.type === 'calves-marked')).toMatchObject({ count: 6 });
    expect(done.job.workMin).toBeCloseTo(32.7 + 12, 9);
  });

  it('selling: the muster, an hour, and a minute for each 10 head', () => {
    const b = busyFarm(NO_TRAVEL);
    // The steers run on two paddocks joined by a fence that is down: 72 squares, 18 ha.
    const sale = card(b.farm, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 });
    expect(sale.parts).toEqual([
      { what: 'muster', minutes: 30 + (60 * 18) / 200 },
      { what: 'yard-work', minutes: 60 },
      { what: 'head', minutes: 1 },
    ]);
    // Calves at foot are loaded too: 3 cows and 3 calves is 6 head.
    const cows = card(b.farm, { type: 'sellClass', cls: 'cow', qty: 3 });
    expect(cows.parts[2]).toEqual({ what: 'head', minutes: 0.6 });
    // A class sold out of two mobs musters both.
    const ids = b.farm.mobs
      .flatMap((m) => m.animals.filter((a) => a.kind !== 'calf'))
      .map((a) => a.id);
    const all = card(b.farm, { type: 'sellAnimals', ids });
    expect(all.parts[0]!.minutes).toBeCloseTo(30 + (60 * 9) / 200 + 30 + (60 * 18) / 200, 9);
    // Stock in the feedlot are in hand: no muster.
    const lot = setUp(b.farm, { type: 'moveMob', mob: b.steers, to: 'lot' });
    const fromLot = card(lot, { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 });
    expect(fromLot.parts[0]).toEqual({ what: 'muster', minutes: 0 });
    expect(fromLot.workMin).toBeCloseTo(61, 9);
  });

  it('feeding lick or hay to a mob takes 30 minutes, and taking them off it takes none', () => {
    const b = busyFarm(NO_TRAVEL);
    const fed = work(b.farm, { type: 'setSupplement', mob: b.steers, supp: 'hay' });
    expect(fed.job.workMin).toBe(30);
    expect(fed.job.parts).toEqual([{ what: 'feed-out', minutes: 30 }]);
    const off = work(fed.farm, { type: 'setSupplement', mob: b.steers, supp: 'none' });
    expect(off.job.outcome).toBe('free');
    expect(off.farm.clock.used).toBe(fed.farm.clock.used);
  });

  it('a trip to the saleyard to buy takes 6 hours, travel included, and ends at the homestead', () => {
    const b = busyFarm();
    const out = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    expect(out.clock.at).not.toEqual(homesteadPoint(out));
    const buy = work(out, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 5,
      to: { cell: b.emptyCell },
    });
    expect(buy.job.workMin).toBe(360);
    expect(buy.job.travelMin).toBe(0);
    expect(buy.job.parts).toEqual([{ what: 'saleyard', minutes: 360 }]);
    expect(buy.farm.clock.at).toEqual(homesteadPoint(buy.farm));
  });

  it('the saleyard trip is one day or not at all: with under 6 hours of light it is refused', () => {
    const b = busyFarm(NO_TRAVEL);
    const job: Action = { type: 'buyCattle', cls: 'yearSteer', qty: 5, to: { cell: b.emptyCell } };
    expect(work(withLightLeft(b.farm, 360.01), job).job.outcome).toBe('done');
    const no = turnedDown(withLightLeft(b.farm, 359.9), job);
    expect(no.reason).toBe('not-enough-daylight');
    expect(no.message).toBe(
      'A trip to the saleyards takes 6 h 0 m. There is 6 h 0 m of light left today.',
    );
    const late = turnedDown(withLightLeft(b.farm, 130), job);
    expect(late.message).toBe(
      'A trip to the saleyards takes 6 h 0 m. There is 2 h 10 m of light left today.',
    );
    // Nothing was bought and no job was left in progress.
    expect(previewAction(withLightLeft(b.farm, 130), job)).toEqual(late);
  });
});

describe('a line with fence already in it', () => {
  it('only the new fence is work: a gate and fence of the same kind in the run take no time', () => {
    let farm = still();
    farm = setUp(farm, { type: 'buildFence', edges: across(10, 5, 9), fence: 'electric' });
    farm = setUp(farm, { type: 'placeGate', edge: across(10, 7, 7)[0]! });
    // Squares 3 to 12: 5 to 9 are fenced or gated already, so 5 squares are new. 250 m is 15 minutes.
    const c = card(farm, { type: 'buildFence', edges: across(10, 3, 12), fence: 'electric' });
    expect(c.line).toEqual({ metres: 250, metresToday: 250, pieces: 5, piecesToday: 5 });
    expect(c.workMin).toBeCloseTo(15, 9);
    // Drawing the same square twice does not build it twice.
    const twice = [...across(12, 3, 6), ...across(12, 3, 6)];
    expect(card(farm, { type: 'buildFence', edges: twice, fence: 'electric' }).line!.pieces).toBe(
      4,
    );
  });
});

describe('a line of mixed work', () => {
  it('the card adds up: time, metres and pieces', () => {
    const farm = still();
    const edges = [...across(10, 5, 24), ...down(25, 10, 14)];
    const c = card(farm, { type: 'buildFence', edges, fence: 'electric' });
    expect(c.line).toEqual({ metres: 1250, metresToday: 1250, pieces: 25, piecesToday: 25 });
    expect(c.workMin).toBeCloseTo(75, 9);
    expect(c.totalWorkMin).toBeCloseTo(75, 9);
    expect(c.parts).toEqual([{ what: 'build', minutes: c.totalWorkMin }]);
    expect(c.doneShare).toBe(1);
    expect(c.moreDays).toBe(0);
    expect(c.fitsToday).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  act,
  actWith,
  boxEdges,
  cellAt,
  farCorner,
  openFarm,
  refused,
  twoPaddockFarm,
} from '../../test-support/wholeFarm';
import { cloneFences, EDGE, getEdge, hEdge, setEdge, vEdge, type EdgeRef } from '../farm/topology';
import { vertexId } from '../farm/water';
import { GRID_W } from '../grid';
import { segmentCost } from '../money/costs';
import { infraInPlace, netWorth, netWorthParts, tapeOwned } from '../money/worth';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import { cloneFarm, type FarmState } from '../sim/state';
import { applyInstantly } from '../../test-support/instant';
import type { Action } from './types';

/*
 * Fences, gates and water as actions: what each job costs, what it adds to
 * net worth, and what comes off when it is removed. On the 260 ha farm used
 * here a square is 50 m across, so a segment of permanent fence is $350,
 * electric $180, tape $45 and pipe $240.
 */

vi.setConfig({ testTimeout: 600_000 });

const boreXY = (farm: FarmState): [number, number] => [
  farm.layout.water.bore % GRID_W,
  (farm.layout.water.bore / GRID_W) | 0,
];
/** A run of `n` segments along the top of the farm's far corner, away from the bore. */
function run(farm: FarmState, n: number, row = 0): EdgeRef[] {
  const [x0, y0] = farCorner(farm);
  return Array.from({ length: n }, (_, k) => hEdge(y0 + 2 + row, x0 + k));
}
const withRoom = (farm: FarmState, room: number): FarmState => {
  const f = cloneFarm(farm);
  f.cash = f.overdraft + room;
  return f;
};
const count = (farm: FarmState, code: number): number =>
  [...farm.layout.fences.hE, ...farm.layout.fences.vE].filter((v) => v === code).length;

describe('the price of a segment on this farm', () => {
  it('is $350, $180, $45 and $240', () => {
    const side = openFarm('nsw').layout.scale.sideM;
    expect(side).toBe(50);
    expect([
      segmentCost('permanent', side),
      segmentCost('electric', side),
      segmentCost('tape', side),
      segmentCost('pipe', side),
    ]).toEqual([350, 180, 45, 240]);
  });
});

describe('permanent fence', () => {
  it('costs $7 a metre, and 80% of it counts in net worth while it stands', () => {
    const farm = openFarm('nsw');
    const worth = netWorth(farm);
    expect(infraInPlace(farm)).toBe(0);
    const out = actWith(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'permanent' });
    const f = out.farm;
    expect(farm.cash - f.cash).toBe(1400);
    expect(f.year.infra).toBe(1400);
    expect(f.year.running).toBe(0);
    expect(Object.values(f.ledger.edges)).toEqual([350, 350, 350, 350]);
    expect(infraInPlace(f)).toBe(1400);
    expect(netWorth(f)).toBe(worth - 1400 + 0.8 * 1400);
    expect(netWorthParts(f)).toEqual({
      cash: f.cash,
      stock: 0,
      infrastructure: 1120,
      total: f.cash + 1120,
    });
    expect(out.events).toEqual([
      {
        type: 'layout-job',
        job: 'buildFence',
        cost: 1400,
        detail: {
          fence: 'permanent',
          segments: 4,
          metres: 200,
          tapeFromRollM: 0,
          tapeNewM: 0,
          energiserBought: false,
          paddocksBefore: 1,
          paddocksAfter: 1,
        },
      },
    ]);
    expect(f.energiser).toBe(false);
  });

  it('only new segments are charged, and a line that is already there is refused', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'permanent' });
    expect(
      refused(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'permanent' }).reason,
    ).toBe('nothing-to-build');
    const cash = farm.cash;
    farm = act(farm, { type: 'buildFence', edges: run(farm, 7), fence: 'permanent' });
    expect(cash - farm.cash).toBe(3 * 350);
    expect(infraInPlace(farm)).toBe(7 * 350);
  });

  it('pulling it down is free, and what was spent on it comes off net worth', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 6), fence: 'permanent' });
    const worth = netWorth(farm);
    const out = actWith(farm, { type: 'removeFence', edges: run(farm, 2) });
    expect(out.farm.cash).toBe(farm.cash);
    expect(infraInPlace(out.farm)).toBe(4 * 350);
    expect(netWorth(out.farm)).toBe(worth - 0.8 * 2 * 350);
    expect(Object.keys(out.farm.ledger.edges).length).toBe(4);
    expect(out.events[0]).toMatchObject({
      type: 'layout-job',
      job: 'removeFence',
      cost: 0,
      detail: { segments: 2, metres: 100, tapeToRollM: 0 },
    });
    const none = act(out.farm, { type: 'removeFence', edges: run(farm, 6) });
    expect(infraInPlace(none)).toBe(0);
    expect(none.ledger.edges).toEqual({});
    expect(refused(none, { type: 'removeFence', edges: run(farm, 6) }).reason).toBe(
      'nothing-to-remove',
    );
  });
});

describe('electric fence and the energiser', () => {
  it('the first electric fence buys the energiser, once', () => {
    let farm = openFarm('nsw');
    const first = actWith(farm, { type: 'buildFence', edges: run(farm, 3), fence: 'electric' });
    expect(farm.cash - first.farm.cash).toBe(3 * 180 + 900);
    expect(first.farm.energiser).toBe(true);
    expect(first.farm.ledger.energiser).toBe(900);
    expect(first.events[0]).toMatchObject({ cost: 1440, detail: { energiserBought: true } });
    expect(infraInPlace(first.farm)).toBe(1440);
    farm = first.farm;
    const second = actWith(farm, { type: 'buildFence', edges: run(farm, 5, 1), fence: 'electric' });
    expect(farm.cash - second.farm.cash).toBe(5 * 180);
    expect(second.farm.ledger.energiser).toBe(900);
    expect(second.events[0]).toMatchObject({ cost: 900, detail: { energiserBought: false } });
    // Pulling all the electric fence down leaves the energiser on the books.
    const none = act(second.farm, {
      type: 'removeFence',
      edges: [...run(farm, 3), ...run(farm, 5, 1)],
    });
    expect(infraInPlace(none)).toBe(900);
  });

  it('a farm that came with electric fence already has one, and is not charged', () => {
    let farm: FarmState;
    for (let seed = 1; ; seed++) {
      farm = createFarm({
        seed,
        district: 'nsw',
        size: 'small',
        start: { year: 2023, month: 8 },
        startType: 'running',
        difficulty: 'easy',
      });
      if (farm.energiser) break;
    }
    expect(farm.ledger.energiser).toBe(0);
    const cash = farm.cash;
    const each = segmentCost('electric', farm.layout.scale.sideM);
    const out = actWith(farm, {
      type: 'buildFence',
      edges: [hEdge(2, 1), hEdge(2, 2)],
      fence: 'electric',
    });
    expect(cash - out.farm.cash).toBe(2 * each);
    expect(out.events.find((e) => e.type === 'layout-job')).toMatchObject({
      detail: { energiserBought: false },
    });
    expect(out.farm.ledger.energiser).toBe(0);
  });

  it('permanent fence and tape never buy an energiser (the MVP charged one on tape)', () => {
    for (const fence of ['permanent', 'tape'] as const) {
      const farm = openFarm('nsw');
      const f = act(farm, { type: 'buildFence', edges: run(farm, 3), fence });
      expect(f.energiser).toBe(false);
      expect(f.ledger.energiser).toBe(0);
      expect(farm.cash - f.cash).toBe(3 * (fence === 'tape' ? 45 : 350));
    }
  });
});

describe('temporary tape', () => {
  it('new tape costs 90c a metre and nothing else (the MVP added $10 and an energiser)', () => {
    const farm = openFarm('nsw');
    const out = actWith(farm, { type: 'buildFence', edges: run(farm, 5), fence: 'tape' });
    const f = out.farm;
    expect(farm.cash - f.cash).toBe(5 * 45);
    expect(f.year.infra).toBe(225);
    expect(f.year.running).toBe(0);
    expect(f.layout.tapeOnRoll).toBe(0);
    expect(f.ledger.edges).toEqual({});
    expect(tapeOwned(f)).toBe(5);
    expect(infraInPlace(f)).toBe(225);
    expect(out.events[0]).toMatchObject({
      cost: 225,
      detail: { fence: 'tape', segments: 5, tapeNewM: 250, tapeFromRollM: 0 },
    });
  });

  it('rolling it up costs $10, and running out tape from the roll costs $10', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 5), fence: 'tape' });
    const up = actWith(farm, { type: 'rollUpTape', edge: run(farm, 5)[3]! });
    let f = up.farm;
    expect(farm.cash - f.cash).toBe(10);
    expect(f.year.running).toBe(10);
    expect(f.layout.tapeOnRoll).toBe(5);
    expect(count(f, EDGE.tape)).toBe(0);
    // The tape is still the farm's, on the roll.
    expect(infraInPlace(f)).toBe(225);
    expect(up.events[0]).toMatchObject({
      job: 'rollUpTape',
      cost: 10,
      detail: { segments: 5, tapeToRollM: 250, tapeOnRollM: 250 },
    });

    // Three segments back out, all off the roll: the $10 fee and no new tape.
    let cash = f.cash;
    const out = actWith(f, { type: 'buildFence', edges: run(farm, 3, 1), fence: 'tape' });
    f = out.farm;
    expect(cash - f.cash).toBe(10);
    expect(f.year.running).toBe(20);
    expect(f.year.infra).toBe(225);
    expect(f.layout.tapeOnRoll).toBe(2);
    expect(out.events[0]).toMatchObject({ cost: 10, detail: { tapeFromRollM: 150, tapeNewM: 0 } });

    // Four more: two off the roll and two new. The fee, plus the new tape.
    cash = f.cash;
    const more = actWith(f, { type: 'buildFence', edges: run(farm, 4, 2), fence: 'tape' });
    f = more.farm;
    expect(cash - f.cash).toBe(10 + 2 * 45);
    expect(f.year.running).toBe(30);
    expect(f.year.infra).toBe(225 + 90);
    expect(f.layout.tapeOnRoll).toBe(0);
    expect(tapeOwned(f)).toBe(7);
    expect(infraInPlace(f)).toBe(7 * 45);
  });

  it('rolling up takes the whole straight run, and is refused where there is no tape', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 6), fence: 'tape' });
    farm = act(farm, { type: 'buildFence', edges: run(farm, 2, 3), fence: 'permanent' });
    const f = act(farm, { type: 'rollUpTape', edge: run(farm, 6)[0]! });
    expect(f.layout.tapeOnRoll).toBe(6);
    expect(refused(f, { type: 'rollUpTape', edge: run(farm, 6)[0]! }).reason).toBe('not-tape');
    expect(refused(f, { type: 'rollUpTape', edge: run(farm, 2, 3)[0]! }).reason).toBe('not-tape');
    // Pulling tape down as part of a longer run costs the same $10.
    const both = act(farm, { type: 'removeFence', edges: [...run(farm, 6), ...run(farm, 2, 3)] });
    expect(farm.cash - both.cash).toBe(10);
    expect(both.layout.tapeOnRoll).toBe(6);
  });

  it('the $10 to roll up comes straight off the account, even at the overdraft limit', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 3), fence: 'tape' });
    const tight = withRoom(farm, 0);
    const f = act(tight, { type: 'rollUpTape', edge: run(farm, 3)[0]! });
    expect(f.cash).toBe(tight.overdraft - 10);
  });

  it('tape under a new fence, or under a gate, is gone, and so is its worth', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'tape' });
    expect(infraInPlace(farm)).toBe(4 * 45);
    const over = act(farm, { type: 'buildFence', edges: run(farm, 3), fence: 'permanent' });
    expect(tapeOwned(over)).toBe(1);
    expect(over.layout.tapeOnRoll).toBe(0);
    expect(infraInPlace(over)).toBe(45 + 3 * 350);
    const gate = act(farm, { type: 'placeGate', edge: run(farm, 4)[1]! });
    expect(tapeOwned(gate)).toBe(3);
    expect(infraInPlace(gate)).toBe(3 * 45 + 450);
  });
});

describe('gates and repairs', () => {
  it('a gate costs $450 and takes the place of one fence segment', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'permanent' });
    const edge = run(farm, 4)[2]!;
    const out = actWith(farm, { type: 'placeGate', edge });
    const f = out.farm;
    expect(farm.cash - f.cash).toBe(450);
    expect(f.year.infra).toBe(4 * 350 + 450);
    expect(getEdge(f.layout.fences, edge)).toBe(EDGE.gateShut);
    expect(infraInPlace(f)).toBe(3 * 350 + 450);
    expect(out.events[0]).toMatchObject({ job: 'placeGate', cost: 450 });
    // Opening and shutting it is free.
    const open = act(f, { type: 'setGate', edge, open: true });
    expect(open.cash).toBe(f.cash);
    expect(getEdge(open.layout.fences, edge)).toBe(EDGE.gateOpen);
    // Taking it out is free and leaves a gap. What was spent on it comes off.
    const gone = act(open, { type: 'removeGate', edge });
    expect(gone.cash).toBe(f.cash);
    expect(getEdge(gone.layout.fences, edge)).toBe(EDGE.none);
    expect(infraInPlace(gone)).toBe(3 * 350);
  });

  it('gates only go in a standing fence, never in the boundary', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 2), fence: 'permanent' });
    const edge = run(farm, 2)[0]!;
    const f = act(farm, { type: 'placeGate', edge });
    expect(refused(f, { type: 'placeGate', edge }).reason).toBe('gate-already-there');
    expect(refused(f, { type: 'placeGate', edge: hEdge(0, 5) }).reason).toBe('gate-on-boundary');
    expect(refused(f, { type: 'placeGate', edge: hEdge(13, 20) }).reason).toBe('gate-needs-fence');
    expect(refused(f, { type: 'removeGate', edge: run(farm, 2)[1]! }).reason).toBe('no-gate-there');
    expect(refused(f, { type: 'setGate', edge: run(farm, 2)[1]!, open: true }).reason).toBe(
      'no-gate-there',
    );
    expect(refused(f, { type: 'placeGate', edge: { line: 'h', index: 99999 } }).reason).toBe(
      'off-the-farm',
    );
  });

  it('putting a knocked-down fence back up costs $25', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 3), fence: 'tape' });
    const edge = run(farm, 3)[1]!;
    expect(refused(farm, { type: 'fixFence', edge }).reason).toBe('nothing-to-fix');
    const fences = cloneFences(farm.layout.fences);
    setEdge(fences, edge, EDGE.tapeDown);
    farm.layout = { ...farm.layout, fences };
    const out = actWith(farm, { type: 'fixFence', edge });
    expect(farm.cash - out.farm.cash).toBe(25);
    expect(out.farm.year.running).toBe(25);
    expect(getEdge(out.farm.layout.fences, edge)).toBe(EDGE.tape);
    expect(out.events[0]).toMatchObject({ job: 'fixFence', cost: 25 });
    // Tape that is down is still the farm's tape.
    expect(infraInPlace(farm)).toBe(3 * 45);
  });

  it('fences that came with the farm count for nothing, and a gate hung in one counts its $450', () => {
    const farm = createFarm({
      seed: 3,
      district: 'cw',
      size: 'small',
      start: { year: 2023, month: 8 },
      startType: 'running',
      difficulty: 'easy',
    });
    expect(infraInPlace(farm)).toBe(0);
    const v = farm.layout.fences.vE.findIndex((c) => c === EDGE.permanent || c === EDGE.electric);
    const edge: EdgeRef = { line: 'v', index: v };
    const gated = act(farm, { type: 'placeGate', edge });
    expect(infraInPlace(gated)).toBe(450);
    const worth = netWorth(farm);
    const pulled = act(farm, { type: 'removeFence', edges: [edge] });
    expect(infraInPlace(pulled)).toBe(0);
    // Nothing was spent on it, so nothing comes off. (Mobs may have joined; their worth is the same.)
    expect(netWorth(pulled)).toBeCloseTo(worth, 6);
  });
});

describe('pipe, troughs and water hubs', () => {
  function piped(): { farm: FarmState; cells: number[] } {
    const farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    const cells = [1, 2, 3].map((k) => cellAt(bx + k, by));
    return { farm: act(farm, { type: 'layPipe', cells }), cells };
  }

  it('pipe costs $4.80 a metre and a trough $1,500', () => {
    const start = openFarm('nsw');
    const { farm, cells } = piped();
    expect(start.cash - farm.cash).toBe(3 * 240);
    expect(farm.ledger.pipe).toBe(720);
    expect(farm.year.infra).toBe(720);
    expect(refused(farm, { type: 'layPipe', cells }).reason).toBe('pipe-already-there');
    const out = actWith(farm, { type: 'placeTrough', cell: cells[2]! });
    expect(farm.cash - out.farm.cash).toBe(1500);
    expect(out.farm.ledger.troughs).toEqual({ [cells[2]!]: 1500 });
    expect(infraInPlace(out.farm)).toBe(720 + 1500);
    expect(out.events[0]).toEqual({
      type: 'layout-job',
      job: 'placeTrough',
      cost: 1500,
      detail: { cell: cells[2]! },
    });
    expect(refused(out.farm, { type: 'placeTrough', cell: cells[2]! }).reason).toBe(
      'trough-already-there',
    );
    expect(refused(farm, { type: 'placeTrough', cell: cellAt(1, 1) }).reason).toBe(
      'trough-needs-water',
    );
  });

  it('pipe that is not joined to water is laid, and the report says so', () => {
    const farm = openFarm('nsw');
    const out = actWith(farm, { type: 'layPipe', cells: [cellAt(1, 1), cellAt(2, 1)] });
    expect(out.events[0]).toMatchObject({ detail: { segments: 2, metres: 100, connected: false } });
    const { farm: joined } = piped();
    expect(joined.inbox.at(-1)!.event).toMatchObject({ detail: { connected: true } });
  });

  it('moving a trough costs $300, and removing one gives nothing back', () => {
    const { farm: f0, cells } = piped();
    const farm = act(f0, { type: 'placeTrough', cell: cells[2]! });
    const moved = act(farm, { type: 'moveTrough', from: cells[2]!, to: cells[0]! });
    expect(farm.cash - moved.cash).toBe(300);
    expect(moved.year.running).toBe(300);
    expect(moved.ledger.troughs).toEqual({ [cells[0]!]: 1500 });
    expect(infraInPlace(moved)).toBe(720 + 1500);
    const worth = netWorth(moved);
    const gone = act(moved, { type: 'removeTrough', cell: cells[0]! });
    expect(gone.cash).toBe(moved.cash);
    expect(gone.ledger.troughs).toEqual({});
    expect(netWorth(gone)).toBe(worth - 0.8 * 1500);
    expect(refused(gone, { type: 'removeTrough', cell: cells[0]! }).reason).toBe('no-trough-there');
    // The trough on the bore came with the farm. Removing it changes no worth.
    const bore = act(gone, { type: 'removeTrough', cell: gone.layout.water.bore });
    expect(netWorth(bore)).toBe(netWorth(gone));
    expect(bore.layout.water.troughs).toEqual([]);
  });

  it('a water hub on a fence line costs a trough plus $500', () => {
    let farm = openFarm('nsw');
    const [bx, by] = boreXY(farm);
    const v = vertexId(bx, by);
    expect(refused(farm, { type: 'placeFenceHub', vertex: v }).reason).toBe('hub-needs-fence');
    farm = act(farm, {
      type: 'buildFence',
      edges: [hEdge(by, bx), hEdge(by, bx - 1)],
      fence: 'permanent',
    });
    const out = actWith(farm, { type: 'placeFenceHub', vertex: v });
    expect(farm.cash - out.farm.cash).toBe(2000);
    expect(out.farm.ledger.hubs).toEqual({ [v]: 2000 });
    expect(out.farm.year.infra).toBe(700 + 2000);
    expect(refused(out.farm, { type: 'placeFenceHub', vertex: v }).reason).toBe(
      'hub-already-there',
    );
    const worth = netWorth(out.farm);
    const gone = act(out.farm, { type: 'removeHub', vertex: v });
    expect(gone.cash).toBe(out.farm.cash);
    expect(netWorth(gone)).toBe(worth - 1600);
    expect(refused(gone, { type: 'removeHub', vertex: v }).reason).toBe('no-hub-there');
    const [x0, y0] = farCorner(farm);
    const far = act(farm, { type: 'buildFence', edges: [hEdge(y0, x0)], fence: 'permanent' });
    expect(refused(far, { type: 'placeFenceHub', vertex: vertexId(x0, y0) }).reason).toBe(
      'hub-needs-water',
    );
  });

  it('a water hub on a square costs a gate for each side, and a trough if there is none', () => {
    const { farm, cells } = piped();
    // On the bore, where the trough already is: four gates.
    const bore = actWith(farm, { type: 'placeSquareHub', cell: farm.layout.water.bore });
    expect(farm.cash - bore.farm.cash).toBe(4 * 450);
    expect(Object.values(bore.farm.ledger.edges)).toEqual([450, 450, 450, 450]);
    expect(bore.farm.ledger.troughs).toEqual({});
    expect(count(bore.farm, EDGE.gateOpen)).toBe(4);
    expect(bore.events[0]).toMatchObject({
      job: 'placeSquareHub',
      cost: 1800,
      detail: { troughAdded: false, gates: 4, paddocksBefore: 1, paddocksAfter: 2 },
    });
    expect(
      refused(bore.farm, { type: 'placeSquareHub', cell: farm.layout.water.bore }).reason,
    ).toBe('hub-already-there');
    // On piped ground with no trough: the trough as well.
    const fresh = act(farm, { type: 'placeSquareHub', cell: cells[2]! });
    expect(farm.cash - fresh.cash).toBe(1500 + 4 * 450);
    expect(fresh.ledger.troughs).toEqual({ [cells[2]!]: 1500 });
    expect(infraInPlace(fresh)).toBe(720 + 1500 + 1800);
    expect(refused(farm, { type: 'placeSquareHub', cell: cellAt(1, 1) }).reason).toBe(
      'hub-needs-water',
    );
  });
});

describe('portable troughs', () => {
  it('cost $600 full, $10 to move and $45 to refill, and sell back for half', () => {
    const farm = openFarm('nsw');
    const worth = netWorth(farm);
    const out = actWith(farm, { type: 'placePortable', cell: cellAt(3, 3) });
    let f = out.farm;
    const port = f.layout.water.ports[0]!.id;
    expect(farm.cash - f.cash).toBe(600);
    expect(f.year.infra).toBe(600);
    // The first fill of water is not infrastructure: $555 is.
    expect(f.ledger.ports).toEqual({ [port]: 555 });
    expect(netWorth(f)).toBe(worth - 600 + 0.8 * 555);
    expect(f.layout.water.ports[0]).toMatchObject({ cell: cellAt(3, 3), level: 6000 });
    expect(out.events[0]).toMatchObject({ job: 'placePortable', cost: 600 });

    const moved = act(f, { type: 'movePortable', port, cell: cellAt(8, 8) });
    expect(f.cash - moved.cash).toBe(10);
    expect(moved.year.running).toBe(10);
    expect(moved.layout.water.ports[0]!.cell).toBe(cellAt(8, 8));
    f = moved;

    // Half empty, then refilled.
    f.layout = {
      ...f.layout,
      water: {
        ...f.layout.water,
        ports: [{ ...f.layout.water.ports[0]!, level: 2500, warned: true }],
      },
    };
    const filled = actWith(f, { type: 'refillPortable', port });
    expect(f.cash - filled.farm.cash).toBe(45);
    expect(filled.farm.year.running).toBe(55);
    expect(filled.farm.layout.water.ports[0]).toMatchObject({ level: 6000, warned: false });
    expect(filled.events[0]).toMatchObject({ cost: 45, detail: { litres: 3500, wasEmpty: false } });

    const sold = actWith(filled.farm, { type: 'removePortable', port });
    expect(sold.farm.cash - filled.farm.cash).toBe(300);
    expect(sold.farm.layout.water.ports).toEqual([]);
    expect(sold.farm.ledger.ports).toEqual({});
    expect(sold.events[0]).toMatchObject({ job: 'removePortable', cost: -300 });
    expect(infraInPlace(sold.farm)).toBe(0);
    for (const type of ['movePortable', 'refillPortable', 'removePortable'] as const) {
      expect(refused(sold.farm, { type, port, cell: 5 } as Action).reason).toBe(
        'no-portable-trough',
      );
    }
  });

  it('gives an area water, so cattle put there get no warning', () => {
    let farm = openFarm('nsw');
    const [x0, y0] = farCorner(farm);
    farm = act(farm, {
      type: 'buildFence',
      edges: boxEdges(x0, y0, x0 + 4, y0 + 4),
      fence: 'electric',
    });
    const dry = actWith(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 5,
      to: { cell: cellAt(x0 + 1, y0 + 1) },
    });
    expect(dry.events.map((e) => e.type)).toContain('no-water');
    farm = act(farm, { type: 'placePortable', cell: cellAt(x0 + 2, y0 + 2) });
    const wet = actWith(farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 5,
      to: { cell: cellAt(x0 + 1, y0 + 1) },
    });
    expect(wet.events.map((e) => e.type)).toEqual(['cattle-bought']);
    expect(surveyOf(wet.farm).points.areaTroughs.filter((t) => t.length).length).toBe(2);
  });
});

describe('the overdraft is enforced', () => {
  it('every job the bank must agree to is done at the limit and refused a cent past it', () => {
    const base = openFarm('nsw');
    const [bx, by] = boreXY(base);
    const pipe = [1, 2].map((k) => cellAt(bx + k, by));
    let ready = act(base, { type: 'layPipe', cells: pipe });
    ready = act(ready, { type: 'buildFence', edges: run(base, 4), fence: 'tape' });
    ready = act(ready, { type: 'buildFence', edges: [hEdge(by, bx)], fence: 'permanent' });
    ready = act(ready, { type: 'placeTrough', cell: pipe[0]! });
    ready = act(ready, { type: 'placePortable', cell: cellAt(2, 2) });
    const fences = cloneFences(ready.layout.fences);
    setEdge(fences, run(base, 4)[0]!, EDGE.tapeDown);
    ready.layout = { ...ready.layout, fences };
    const port = ready.layout.water.ports[0]!.id;
    const jobs: [Action, number][] = [
      [{ type: 'buildFence', edges: run(base, 3, 2), fence: 'permanent' }, 1050],
      [{ type: 'buildFence', edges: run(base, 3, 2), fence: 'electric' }, 540 + 900],
      [{ type: 'buildFence', edges: run(base, 3, 2), fence: 'tape' }, 135],
      [{ type: 'placeGate', edge: hEdge(by, bx) }, 450],
      [{ type: 'fixFence', edge: run(base, 4)[0]! }, 25],
      [{ type: 'layPipe', cells: [cellAt(bx + 3, by)] }, 240],
      [{ type: 'placeTrough', cell: pipe[1]! }, 1500],
      [{ type: 'moveTrough', from: pipe[0]!, to: pipe[1]! }, 300],
      [{ type: 'placeFenceHub', vertex: vertexId(bx, by) }, 2000],
      [{ type: 'placeSquareHub', cell: pipe[1]! }, 1500 + 4 * 450],
      [{ type: 'placePortable', cell: 5 }, 600],
      [{ type: 'movePortable', port, cell: 6 }, 10],
      [{ type: 'refillPortable', port }, 45],
    ];
    for (const [job, cost] of jobs) {
      const exact = withRoom(ready, cost);
      const done = applyInstantly(exact, job);
      expect(done.ok, `${job.type} with exactly ${cost}`).toBe(true);
      if (done.ok) expect(done.farm.cash, job.type).toBe(exact.overdraft);
      const short = withRoom(ready, cost - 0.01);
      const hash = farmHash(short);
      const no = refused(short, job);
      expect(no.reason, job.type).toBe('bank-limit');
      expect(no.message).toContain('overdraft');
      expect(farmHash(short), job.type).toBe(hash);
    }
  });
});

describe('the action log and the inbox', () => {
  it('every action that is done is logged in order with its day, and refusals are not', () => {
    let farm = openFarm('nsw');
    const jobs: Action[] = [
      { type: 'buildFence', edges: run(farm, 2), fence: 'tape' },
      { type: 'placePortable', cell: 9 },
      { type: 'buyCattle', cls: 'weanerSteer', qty: 3, to: { cell: 9 } },
    ];
    farm = act(farm, jobs[0]!);
    // The log holds its own copy: changing the request afterwards changes nothing on the farm.
    const asked = (jobs[0] as { edges: EdgeRef[] }).edges;
    const kept = asked.slice();
    asked.length = 0;
    expect((farm.actionLog[0]!.action as { edges: EdgeRef[] }).edges).toEqual(kept);
    asked.push(...kept);
    refused(farm, { type: 'placeGate', edge: hEdge(13, 20) });
    expect(applyInstantly(farm, { type: 'dance' } as unknown as Action)).toMatchObject({
      ok: false,
      reason: 'bad-request',
    });
    expect(applyInstantly(farm, null as unknown as Action)).toMatchObject({ ok: false });
    farm = act(farm, jobs[1]!);
    farm = cloneFarm(farm);
    farm.day = 7;
    farm = act(farm, jobs[2]!);
    expect(farm.actionLog).toEqual([
      { day: 0, action: jobs[0] },
      { day: 0, action: jobs[1] },
      { day: 7, action: jobs[2] },
    ]);
    // The log holds its own copy of each action.
    (jobs[0] as { edges: EdgeRef[] }).edges.length = 0;
    expect((farm.actionLog[0]!.action as { edges: EdgeRef[] }).edges.length).toBe(2);
    // The inbox has the farm's first message, then one for each event, numbered in order.
    expect(farm.inbox.map((m) => m.event.type)).toEqual([
      'farm-started',
      'layout-job',
      'layout-job',
      'cattle-bought',
    ]);
    expect(farm.inbox.map((m) => m.seq)).toEqual([1, 2, 3, 4]);
    expect(farm.inbox.map((m) => m.day)).toEqual([0, 0, 0, 7]);
  });

  it('lines off the farm and unknown fences are refused', () => {
    const farm = openFarm('nsw');
    const bad: [Action, string][] = [
      [{ type: 'buildFence', edges: [{ line: 'h', index: -1 }], fence: 'tape' }, 'off-the-farm'],
      [
        { type: 'buildFence', edges: [{ line: 'x' as 'h', index: 3 }], fence: 'tape' },
        'off-the-farm',
      ],
      [{ type: 'buildFence', edges: 'all' as unknown as EdgeRef[], fence: 'tape' }, 'off-the-farm'],
      [{ type: 'buildFence', edges: [vEdge(3, 3)], fence: 'barbed' as 'tape' }, 'bad-request'],
      [{ type: 'buildFence', edges: [vEdge(3, 0)], fence: 'tape' }, 'nothing-to-build'],
      [{ type: 'removeFence', edges: [{ line: 'v', index: 1e9 }] }, 'off-the-farm'],
      [{ type: 'layPipe', cells: [-4] }, 'off-the-farm'],
      [{ type: 'placePortable', cell: 5000 }, 'off-the-farm'],
      [{ type: 'placeTrough', cell: 5000 }, 'off-the-farm'],
    ];
    for (const [action, reason] of bad) {
      expect(refused(farm, action).reason, JSON.stringify(action)).toBe(reason);
    }
  });
});

describe('one fence over another', () => {
  it('tape run over a fence the player built: the fence is gone and so is its worth', () => {
    let farm = openFarm('nsw');
    farm = act(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'permanent' });
    expect(infraInPlace(farm)).toBe(4 * 350);
    const taped = act(farm, { type: 'buildFence', edges: run(farm, 4), fence: 'tape' });
    expect(count(taped, EDGE.permanent)).toBe(0);
    expect(taped.ledger.edges).toEqual({});
    expect(infraInPlace(taped)).toBe(4 * 45);
    // Electric over the tape: the tape is gone, the electric fence and its energiser count.
    const wired = act(taped, { type: 'buildFence', edges: run(farm, 4), fence: 'electric' });
    expect(tapeOwned(wired)).toBe(0);
    expect(infraInPlace(wired)).toBe(4 * 180 + 900);
  });

  it('a run that takes in fence the farm came with counts only the new segments', () => {
    const farm = twoPaddockFarm('nsw');
    // Three segments of the old fence line, and two new ones running off it.
    const index = farm.layout.fences.vE.indexOf(EDGE.permanent);
    const vx = index % (GRID_W + 1);
    const y = Math.floor(index / (GRID_W + 1));
    const old = [0, 1, 2].map((k) => vEdge(y + k, vx));
    for (const e of old) expect(getEdge(farm.layout.fences, e)).toBe(EDGE.permanent);
    const fresh = [hEdge(y + 1, vx), hEdge(y + 1, vx + 1)];
    const out = actWith(farm, {
      type: 'buildFence',
      edges: [...old, ...fresh],
      fence: 'permanent',
    });
    expect(farm.cash - out.farm.cash).toBe(2 * 350);
    expect(Object.keys(out.farm.ledger.edges).length).toBe(2);
    expect(infraInPlace(out.farm)).toBe(2 * 350);
    expect(out.events[0]).toMatchObject({ detail: { segments: 2 } });
  });
});

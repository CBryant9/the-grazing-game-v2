import { describe, expect, it, vi } from 'vitest';
import { act, actWith, cellAt, openFarm, refused } from '../../test-support/wholeFarm';
import { work } from '../../test-support/workingDay';
import { endDay } from '../day/days';
import { isSquareHub } from '../farm/layout';
import { EDGE, getEdge, hEdge, vEdge } from '../farm/topology';
import { COSTS } from '../money/costs';
import { infraInPlace } from '../money/worth';
import { farmHash, loadFarm, saveFarm, type SavedFarm } from '../save/save';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';

/*
 * Water hubs can be removed and moved (Claudia, 14 Nov 2026): "Water hub
 * can be removed or moved." Both kinds: the hub on a fence line or corner,
 * and the hub on a square (a trough with a gate on every side).
 */

vi.setConfig({ testTimeout: 600_000 });

interface HubFarm {
  farm: FarmState;
  /** Piped squares along the bore's row, nearest first. */
  run: number[];
  /** The row and the step along it. */
  by: number;
  dir: number;
  /** The column line of a permanent fence across the far side of the pipe. */
  fx: number;
}

/** Pipe along the bore's row, and a fence across the row past its end. */
function hubFarm(): HubFarm {
  let farm = openFarm('nsw');
  const bore = farm.layout.water.bore;
  const bx = bore % 40;
  const by = Math.floor(bore / 40);
  const dir = bx < 20 ? 1 : -1;
  const run = [1, 2, 3, 4, 5, 6].map((k) => cellAt(bx + dir * k, by));
  farm = act(farm, { type: 'layPipe', cells: run });
  // A fence line across the row, on the far side of the fourth piped square.
  const fx = bx + dir * 4 + (dir > 0 ? 1 : 0);
  farm = act(farm, {
    type: 'buildFence',
    edges: [vEdge(by - 2, fx), vEdge(by - 1, fx), vEdge(by, fx), vEdge(by + 1, fx)],
    fence: 'permanent',
  });
  return { farm, run, by, dir, fx };
}

const corner = (vx: number, vy: number): number => vy * 41 + vx;
const watered = (farm: FarmState, c: number): boolean => surveyOf(farm).points.dist[c] === 0;

describe('a hub on a fence line or corner', () => {
  it('moves to another corner on a fence that water reaches, at what moving a trough costs', () => {
    const h = hubFarm();
    const from = corner(h.fx, h.by);
    let farm = act(h.farm, { type: 'placeFenceHub', vertex: from });
    expect(farm.ledger.hubs[from]).toBe(COSTS.trough + COSTS.fenceHubExtra);
    const to = corner(h.fx, h.by + 1);
    const running = farm.year.running;
    const out = actWith(farm, { type: 'moveHub', from, to });
    expect(farm.cash - out.farm.cash).toBe(COSTS.moveTrough);
    expect(out.farm.year.running - running).toBe(COSTS.moveTrough);
    // What was spent on the hub goes with it, so net worth does not move.
    expect(out.farm.ledger.hubs).toEqual({ [to]: COSTS.trough + COSTS.fenceHubExtra });
    expect(infraInPlace(out.farm)).toBe(infraInPlace(farm));
    expect(out.farm.layout.water.hubs).toEqual([to]);
    expect(out.events[0]).toMatchObject({
      type: 'layout-job',
      job: 'moveHub',
      cost: COSTS.moveTrough,
      detail: { from, to },
    });
    farm = out.farm;
    // The squares under the old corner and not the new one no longer drink there.
    const above = cellAt(h.fx - (h.dir > 0 ? 0 : 1), h.by - 1);
    expect(watered(farm, above)).toBe(false);
    const below = cellAt(h.fx - (h.dir > 0 ? 0 : 1), h.by + 1);
    expect(watered(farm, below)).toBe(true);
  });

  it('is refused with the trough’s and the hub’s own checks', () => {
    const h = hubFarm();
    const from = corner(h.fx, h.by);
    const farm = act(h.farm, { type: 'placeFenceHub', vertex: from });
    const at = (to: number, f = from) => refused(farm, { type: 'moveHub', from: f, to }).reason;
    expect(at(corner(h.fx, h.by + 1), corner(h.fx, h.by + 1))).toBe('no-hub-there');
    expect(at(from)).toBe('hub-already-there');
    // Out in the open, with no fence: this kind of hub needs a fence line or corner.
    expect(at(corner(h.fx + 3 * h.dir, h.by + 6))).toBe('hub-needs-fence');
    // On the fence, but far from the pipe.
    expect(at(corner(h.fx, h.by - 2))).toBe('hub-needs-water');
    expect(at(1e9)).toBe('off-the-farm');
  });

  it('takes as long as fitting one', () => {
    const h = hubFarm();
    const from = corner(h.fx, h.by);
    const farm = act(h.farm, { type: 'placeFenceHub', vertex: from });
    const card = work(farm, { type: 'moveHub', from, to: corner(h.fx, h.by + 1) }).job;
    expect(card.parts).toEqual([{ what: 'trough', minutes: 180 }]);
    expect(card.costToday).toBe(COSTS.moveTrough);
  });

  it('what drew water through it stays, as for a trough: a trough placed past it keeps watering', () => {
    // The trough rule: water is checked where a trough or hub goes, when it goes. Once placed,
    // it waters its squares whether or not water still reaches it. Pipe past it shows as dry.
    const h = hubFarm();
    const from = corner(h.fx, h.by);
    let farm = act(h.farm, { type: 'placeFenceHub', vertex: from });
    // Past the fence: the square across the corner, reached through the hub.
    const across = cellAt(h.fx + (h.dir > 0 ? 0 : -1), h.by - 1);
    expect(farm.layout.water.pipe[across]).toBe(0);
    farm = act(farm, { type: 'placeTrough', cell: across });
    farm = act(farm, { type: 'removeHub', vertex: from });
    expect(farm.layout.water.troughs).toContain(across);
    expect(watered(farm, across)).toBe(true);
  });
});

describe('a hub on a square', () => {
  /** A hub farm with a hub on the second piped square. */
  const withSquareHub = (): HubFarm => {
    const h = hubFarm();
    return { ...h, farm: act(h.farm, { type: 'placeSquareHub', cell: h.run[1]! }) };
  };

  it('is a trough with a gate on every side that is not the boundary', () => {
    const h = withSquareHub();
    expect(isSquareHub(h.farm.layout, h.run[1]!)).toBe(true);
    // The trough on the bore is a plain trough.
    expect(isSquareHub(h.farm.layout, h.farm.layout.water.bore)).toBe(false);
    // A square with no trough is not a hub.
    expect(isSquareHub(h.farm.layout, h.run[2]!)).toBe(false);
  });

  it('comes out: the trough goes, the gates stay, and nothing is given back', () => {
    const h = withSquareHub();
    const c = h.run[1]!;
    const worth = infraInPlace(h.farm);
    const out = actWith(h.farm, { type: 'removeSquareHub', cell: c });
    expect(out.farm.cash).toBe(h.farm.cash);
    expect(out.farm.layout.water.troughs).not.toContain(c);
    expect(out.farm.ledger.troughs[c]).toBeUndefined();
    expect(infraInPlace(out.farm)).toBe(worth - COSTS.trough);
    // The four gates are still there, open, and still on the books.
    const x = c % 40;
    for (const e of [hEdge(h.by, x), hEdge(h.by + 1, x), vEdge(h.by, x), vEdge(h.by, x + 1)]) {
      expect(getEdge(out.farm.layout.fences, e)).toBe(EDGE.gateOpen);
    }
    expect(Object.values(out.farm.ledger.edges).filter((v) => v === COSTS.gate).length).toBe(4);
    expect(out.events[0]).toMatchObject({
      job: 'removeSquareHub',
      cost: 0,
      detail: { cell: c, gatesLeft: 4 },
    });
    expect(isSquareHub(out.farm.layout, c)).toBe(false);
    expect(refused(out.farm, { type: 'removeSquareHub', cell: c }).reason).toBe('no-hub-there');
  });

  it('a plain trough is not a hub, and the hub actions refuse it', () => {
    const h = hubFarm();
    const bore = h.farm.layout.water.bore;
    expect(refused(h.farm, { type: 'removeSquareHub', cell: bore }).reason).toBe('no-hub-there');
    expect(refused(h.farm, { type: 'moveSquareHub', from: bore, to: h.run[2]! }).reason).toBe(
      'no-hub-there',
    );
  });

  it('moves: the trough goes to the new square, which gets its open gates; the old gates stay', () => {
    const h = withSquareHub();
    const from = h.run[1]!;
    const to = h.run[4]!;
    const out = actWith(h.farm, { type: 'moveSquareHub', from, to });
    const f = out.farm;
    // Two sides of the new square are new gates (top and bottom), one is the permanent fence
    // (now a gate), and the side towards the bore: four gates in all.
    expect(out.events.find((e) => e.type === 'layout-job')).toMatchObject({
      job: 'moveSquareHub',
      detail: { from, to, gates: 4 },
    });
    expect(h.farm.cash - f.cash).toBe(COSTS.moveTrough + 4 * COSTS.gate);
    expect(f.layout.water.troughs).toContain(to);
    expect(f.layout.water.troughs).not.toContain(from);
    expect(isSquareHub(f.layout, to)).toBe(true);
    expect(isSquareHub(f.layout, from)).toBe(false);
    // What was paid for the trough moves with it.
    expect(f.ledger.troughs[to]).toBe(COSTS.trough);
    expect(f.ledger.troughs[from]).toBeUndefined();
    const fx = from % 40;
    expect(getEdge(f.layout.fences, hEdge(h.by, fx))).toBe(EDGE.gateOpen);
    expect(watered(f, to)).toBe(true);
    expect(watered(f, from)).toBe(false);
  });

  it('is refused with the trough’s checks', () => {
    const h = withSquareHub();
    const from = h.run[1]!;
    const at = (to: number) => refused(h.farm, { type: 'moveSquareHub', from, to }).reason;
    expect(at(h.farm.layout.water.bore)).toBe('trough-already-there');
    expect(at(from)).toBe('trough-already-there');
    expect(at(cellAt(0, 0))).toBe('hub-needs-water');
    expect(at(1e9)).toBe('off-the-farm');
  });

  it('job times: taking it out as long as fitting a trough; moving it, a trough and a gate for each new gate', () => {
    const h = withSquareHub();
    const out = work(h.farm, { type: 'removeSquareHub', cell: h.run[1]! }).job;
    expect(out.parts).toEqual([{ what: 'trough', minutes: 180 }]);
    const moved = work(h.farm, { type: 'moveSquareHub', from: h.run[1]!, to: h.run[4]! }).job;
    expect(moved.parts).toEqual([
      { what: 'trough', minutes: 180 },
      { what: 'gate', minutes: 4 * 60 },
    ]);
    expect(moved.costToday).toBe(COSTS.moveTrough + 4 * COSTS.gate);
  });

  it('moving it next to stock splits nothing and joins the mob into the hub square as building one does', () => {
    const h = withSquareHub();
    let farm = act(h.farm, {
      type: 'buyCattle',
      cls: 'yearSteer',
      qty: 30,
      to: { cell: h.farm.layout.water.bore },
    });
    farm = act(farm, { type: 'moveSquareHub', from: h.run[1]!, to: h.run[4]! });
    // Open gates join the hub square to the paddocks round it, so the mob is still one mob.
    expect(farm.mobs.length).toBe(1);
    expect(farm.mobs[0]!.animals.length).toBe(30);
  });
});

describe('saves', () => {
  it('a farm with hubs moved and removed saves, loads and carries on as if run straight through', () => {
    const h = hubFarm();
    let farm = act(h.farm, { type: 'placeSquareHub', cell: h.run[1]! });
    farm = act(farm, { type: 'placeFenceHub', vertex: corner(h.fx, h.by) });
    farm = act(farm, { type: 'moveSquareHub', from: h.run[1]!, to: h.run[4]! });
    const straight = endDay(
      work(farm, { type: 'moveHub', from: corner(h.fx, h.by), to: corner(h.fx, h.by + 1) }).farm,
    ).farm;
    const loaded = loadFarm(JSON.parse(JSON.stringify(saveFarm(farm))) as SavedFarm);
    const carried = endDay(
      work(loaded, { type: 'moveHub', from: corner(h.fx, h.by), to: corner(h.fx, h.by + 1) }).farm,
    ).farm;
    expect(farmHash(carried)).toBe(farmHash(straight));
    expect(isSquareHub(carried.layout, h.run[4]!)).toBe(true);
  });
});

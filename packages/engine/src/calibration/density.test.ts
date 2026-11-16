import type { DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import type { Action } from '../actions/types';
import { GRID_H, GRID_W } from '../grid';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { AVERAGE_YEAR } from '../../test-support/calibration';
import { boxCells, boxEdges, cellAt, notFinite, openFarm } from '../../test-support/wholeFarm';

/*
 * High-density grazing with a daily move (PRD 5.9): 500 weaner steers on
 * 4 ha, moved to a fresh 4 ha every day, in each district's growing season
 * in the average year. The intake, what is left behind and the gain must
 * look right to a grazier.
 *
 * The farm is 1,040 ha, so a square is 1 ha and a cell is 2 squares by 2.
 * Thirty cells are fenced with tape in two bands, each with a trough on
 * pipe from the bore.
 */

vi.setConfig({ testTimeout: 600_000 });

const env = { seasons: AVERAGE_YEAR };
const HEAD = 500;
const CELL_HA = 4;
const DAYS = 20;

interface Cell {
  x: number;
  y: number;
}

function must(farm: FarmState, action: Action): FarmState {
  const done = applyInstantly(farm, action, env);
  if (!done.ok) throw new Error(`${action.type} was refused: ${done.message}`);
  return done.farm;
}

function setUp(district: DistrictId, month: number): { farm: FarmState; cells: Cell[] } {
  let farm = openFarm(district, { seed: 1, size: 1040, start: { year: 2023, month } });
  const bore = farm.layout.water.bore;
  const bx = bore % GRID_W;
  const by = Math.floor(bore / GRID_W);
  const y0 = by + 4 < GRID_H ? by : by - 5;
  const cells: Cell[] = [];
  for (const y of [y0, y0 + 2]) {
    for (let x = 2; x + 1 < GRID_W - 2 && cells.length < 30; x += 2) cells.push({ x, y });
  }
  const pipe = new Set<number>();
  for (let y = Math.min(by, y0); y <= Math.max(by, y0 + 2); y++) pipe.add(cellAt(bx, y));
  for (const y of [y0, y0 + 2]) for (let x = 2; x < GRID_W - 2; x++) pipe.add(cellAt(x, y));
  pipe.delete(bore);
  farm = must(farm, { type: 'layPipe', cells: [...pipe] });
  for (const c of cells) {
    farm = must(farm, {
      type: 'buildFence',
      edges: boxEdges(c.x, c.y, c.x + 1, c.y + 1),
      fence: 'tape',
    });
    if (cellAt(c.x, c.y) !== bore) {
      farm = must(farm, { type: 'placeTrough', cell: cellAt(c.x, c.y) });
    }
  }
  farm = must(farm, {
    type: 'buyCattle',
    cls: 'weanerSteer',
    qty: HEAD,
    to: { cell: cellAt(cells[0]!.x, cells[0]!.y) },
  });
  for (const m of farm.mobs) {
    if (m.supp !== 'none') farm = must(farm, { type: 'setSupplement', mob: m.id, supp: 'none' });
  }
  return { farm, cells };
}

const squares = (c: Cell): number[] => boxCells(c.x, c.y, c.x + 1, c.y + 1);
const massOn = (farm: FarmState, c: Cell): number =>
  squares(c).reduce((t, i) => t + farm.pasture.G[i]! + farm.pasture.D[i]!, 0) / 4;
const headOf = (farm: FarmState): number => farm.mobs.reduce((n, m) => n + m.animals.length, 0);
const weightOf = (farm: FarmState): number =>
  farm.mobs.reduce((t, m) => t + m.animals.reduce((s, a) => s + a.wt, 0), 0) / headOf(farm);

interface DayOnACell {
  before: number;
  after: number;
  /** Share of the pasture the mob wanted that it got. */
  fill: number;
  /** Intake, kg DM a head. */
  intake: number;
  intakePctLw: number;
  head: number;
}

const CASES: { district: DistrictId; name: string; month: number }[] = [
  { district: 'cq', name: 'Central Qld in February', month: 1 },
  { district: 'nsw', name: 'Northern Tablelands in December', month: 11 },
  { district: 'cw', name: 'Central West NSW in October', month: 9 },
  { district: 'wv', name: 'Western Victoria in October', month: 9 },
];

for (const c of CASES) {
  describe(`500 head on 4 ha, moved daily: ${c.name}`, () => {
    const start = setUp(c.district, c.month);
    let farm = start.farm;
    const w0 = weightOf(farm);
    const days: DayOnACell[] = [];
    let breakouts = 0;
    for (let d = 0; d < DAYS; d++) {
      const cell = start.cells[d]!;
      if (d > 0) {
        farm = must(farm, {
          type: 'moveMob',
          mob: farm.mobs[0]!.id,
          to: { cell: cellAt(cell.x, cell.y) },
        });
      }
      const before = massOn(farm, cell);
      const head = headOf(farm);
      const result = stepDay(farm, env);
      breakouts += result.events.filter((e) => e.type === 'breakout').length;
      const st = farm.mobs[0]!.st!;
      days.push({
        before,
        after: massOn(farm, cell),
        fill: st.f,
        intake: st.intake,
        intakePctLw: (st.intake / weightOf(farm)) * 100,
        head,
      });
    }

    it('stays one mob, loses no more than three head, and never pushes through the tape', () => {
      expect(farm.mobs).toHaveLength(1);
      expect(headOf(farm)).toBeGreaterThanOrEqual(HEAD - 3);
      expect(breakouts).toBe(0);
      expect(notFinite(farm)).toEqual([]);
    });

    it('gets all the feed it wants on each fresh cell', () => {
      for (const [d, day] of days.entries()) expect(day.fill, `day ${d + 1}`).toBeGreaterThan(0.99);
    });

    it('eats 2 to 3% of live weight a day', () => {
      for (const [d, day] of days.entries()) {
        expect(day.intakePctLw, `day ${d + 1}`).toBeGreaterThan(2);
        expect(day.intakePctLw, `day ${d + 1}`).toBeLessThan(3);
      }
    });

    it('takes off the cell what the mob ate, plus 5 to 25% trampled or lost', () => {
      for (const [d, day] of days.entries()) {
        const eaten = (day.intake * day.head) / CELL_HA;
        const gone = day.before - day.after;
        expect(gone / eaten, `day ${d + 1}`).toBeGreaterThan(1.05);
        expect(gone / eaten, `day ${d + 1}`).toBeLessThan(1.25);
      }
    });

    it('leaves a residual: at least a third of the feed, and over 400 kg DM/ha', () => {
      for (const [d, day] of days.entries()) {
        expect(day.after, `day ${d + 1}`).toBeGreaterThan(400);
        expect(day.after / day.before, `day ${d + 1}`).toBeGreaterThan(1 / 3);
      }
    });

    it('gains 0.3 to 1.1 kg a head a day', () => {
      const gain = (weightOf(farm) - w0) / DAYS;
      expect(gain).toBeGreaterThan(0.3);
      expect(gain).toBeLessThan(1.1);
    });
  });
}

describe('500 head left on the same 4 ha', () => {
  const start = setUp('nsw', 11);
  const farm = start.farm;
  const fills: number[] = [];
  const weights: number[] = [weightOf(farm)];
  for (let d = 0; d < 5; d++) {
    stepDay(farm, env);
    fills.push(farm.mobs[0]?.st?.f ?? 0);
    weights.push(weightOf(farm));
  }

  it('gets its fill on the first day and has run short by the third', () => {
    expect(fills[0]).toBeGreaterThan(0.99);
    expect(fills[2]).toBeLessThan(0.9);
    expect(Math.min(...fills)).toBeLessThan(0.5);
  });

  it('is losing weight by the fifth day', () => {
    expect(weights[5]).toBeLessThan(weights[4]!);
  });
});

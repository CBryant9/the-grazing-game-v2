import { describe, expect, it, vi } from 'vitest';
import { openFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, cell, down, setUp, work } from '../../test-support/workingDay';
import type { Action } from '../actions/types';
import { GRID_W } from '../grid';
import { homesteadPoint } from '../sim/clock';
import { cloneFarm, type FarmState } from '../sim/state';
import { previewAction } from './act';
import { endDay } from './days';
import { clockView } from './look';
import { driveMinutes, metresBetween } from './travel';

/*
 * Travel (PRD 5.1 and 5.4): each job includes the drive from where the
 * player is, at 25 km/h over the farm's real distances, and the day ends
 * with the drive home.
 */

vi.setConfig({ testTimeout: 600_000 });

/** The homestead's column and row. */
const homeXY = (farm: FarmState): [number, number] => [
  farm.buildings.homestead % GRID_W,
  Math.floor(farm.buildings.homestead / GRID_W),
];

/** A square `dx` columns towards the middle of the farm from the homestead, and `dy` rows. */
function from(farm: FarmState, dx: number, dy = 0): number {
  const [hx, hy] = homeXY(farm);
  return cell(hx < 20 ? hx + dx : hx - dx, hy < 13 ? hy + dy : hy - dy);
}

describe('driving', () => {
  it('is the straight-line distance at 25 km/h: 1 km takes 2.4 minutes', () => {
    // 100 m squares (1,040 ha). Ten squares along the row from the homestead is 1,000 m.
    const farm = openFarm('nsw', { size: 1040 });
    expect(farm.layout.scale.sideM).toBeCloseTo(100, 9);
    const job = work(farm, { type: 'placePortable', cell: from(farm, 10) }).job;
    expect(job.travelMin).toBeCloseTo(2.4, 9);
    // 12 squares across and 5 down is 13 squares in a straight line: 1,300 m, 3.12 minutes.
    const diagonal = work(farm, { type: 'placePortable', cell: from(farm, 12, 5) }).job;
    expect(diagonal.travelMin).toBeCloseTo(3.12, 9);
    expect(metresBetween(farm, { x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(500, 9);
    expect(driveMinutes(farm, { x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(1.2, 9);
  });

  it('scales with the farm: the same squares on a farm four times the size are twice the drive', () => {
    const small = openFarm('nsw', { size: 1040 });
    const big = openFarm('nsw', { size: 4160 });
    expect(homeXY(big)).toEqual(homeXY(small));
    const job = (farm: FarmState): number =>
      work(farm, { type: 'placePortable', cell: from(farm, 10) }).job.travelMin;
    expect(job(big)).toBeCloseTo(2 * job(small), 9);
    expect(job(big)).toBeCloseTo(4.8, 9);
  });

  it('with travel switched off, no job has a drive and none is kept back', () => {
    const farm = openFarm('nsw', { size: 4160, work: { travel: false } });
    const job = work(farm, { type: 'placePortable', cell: from(farm, 30, 20) }).job;
    expect(job.travelMin).toBe(0);
    expect(job.homeMin).toBe(0);
    expect(job.endsAt - job.startsAt).toBe(30);
    expect(
      endDay(work(farm, { type: 'placePortable', cell: from(farm, 30, 20) }).farm).homeMin,
    ).toBe(0);
  });
});

describe("a job's place is where its work is", () => {
  it('a trough: the square it goes on', () => {
    const b = busyFarm();
    const job = work(b.farm, { type: 'placeTrough', cell: b.pipedCell });
    const x = (b.pipedCell % GRID_W) + 0.5;
    const y = Math.floor(b.pipedCell / GRID_W) + 0.5;
    expect(job.farm.clock.at).toEqual({ x, y });
    expect(job.job.travelMin).toBeCloseTo(
      driveMinutes(b.farm, homesteadPoint(b.farm), { x, y }),
      12,
    );
  });

  it('a fence line: where the work starts, and the player ends where the line ends', () => {
    const farm = openFarm('nsw', { size: 1040 });
    const [hx, hy] = homeXY(farm);
    // A line across the farm, 6 squares up or down from the homestead's row.
    const vy = hy < 13 ? hy + 7 : hy - 6;
    const line = across(vy, 2, 37);
    const job = work(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    // Work starts at the left end, where the line was drawn from: the drive is to there,
    // not to the nearest point of the line (which is 650 m away, straight up or down).
    const toStart = Math.hypot(hx + 0.5 - 2, 6.5) * 100;
    expect(toStart).toBeGreaterThan(650);
    expect(job.job.travelMin).toBeCloseTo((toStart / 25000) * 60, 9);
    // Built in the order drawn, left to right, so the player ends at the right-hand end.
    expect(job.farm.clock.at).toEqual({ x: 38, y: vy });
  });

  it('a mob: the nearest square of the ground it runs on, and a move ends where the mob is put', () => {
    const b = busyFarm();
    const move = work(b.farm, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    const mob = move.farm.mobs.find((m) => m.id === b.steers)!;
    if (mob.where.kind !== 'paddock') throw new Error('expected the mob on pasture');
    const anchor = mob.where.anchor;
    expect(move.farm.clock.at).toEqual({
      x: (anchor % GRID_W) + 0.5,
      y: Math.floor(anchor / GRID_W) + 0.5,
    });
    // The drive out was to the steers' paddock, not to where they were sent.
    const toSteers = work(b.farm, { type: 'setSupplement', mob: b.steers, supp: 'hay' }).job;
    expect(move.job.travelMin).toBeCloseTo(toSteers.travelMin, 12);
  });

  it('moving a trough: to where it is, then on to where it goes', () => {
    const b = busyFarm();
    const at = (c: number): { x: number; y: number } => ({
      x: (c % GRID_W) + 0.5,
      y: Math.floor(c / GRID_W) + 0.5,
    });
    const move = work(b.farm, { type: 'movePortable', port: b.port, cell: b.openCell });
    const was = b.farm.layout.water.ports[0]!.cell;
    expect(move.job.travelMin).toBeCloseTo(
      driveMinutes(b.farm, homesteadPoint(b.farm), at(was)) +
        driveMinutes(b.farm, at(was), at(b.openCell)),
      12,
    );
    expect(move.farm.clock.at).toEqual(at(b.openCell));
  });
});

describe('nearby jobs one after another', () => {
  it('two jobs side by side cost less travel than the same two from the homestead', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const a: Action = { type: 'placePortable', cell: from(farm, 30, 18) };
    const b: Action = { type: 'placePortable', cell: from(farm, 31, 18) };
    // One after the other on the same day.
    const first = work(farm, a);
    const second = work(first.farm, b);
    const together = first.job.travelMin + second.job.travelMin;
    // Each from the homestead, on its own day.
    const alone = work(farm, a).job.travelMin + work(farm, b).job.travelMin;
    expect(together).toBeLessThan(alone);
    // The second job is one square on: 200 m, under half a minute.
    expect(second.job.travelMin).toBeCloseTo((200 / 25000) * 60, 9);
    expect(alone - together).toBeGreaterThan(15);
    // The job card for the second job, asked from the first job's place, says the same.
    const card = previewAction(first.farm, b);
    expect(card.ok && card.card.travelMin).toBeCloseTo(second.job.travelMin, 12);
  });

  it('the next day starts back at the homestead', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const a: Action = { type: 'placePortable', cell: from(farm, 30, 18) };
    const out = work(farm, a);
    expect(out.farm.clock.at).not.toEqual(homesteadPoint(farm));
    const next = endDay(out.farm);
    expect(next.homeMin).toBeCloseTo(out.job.travelMin, 9);
    expect(next.farm.clock.at).toEqual(homesteadPoint(farm));
    expect(clockView(next.farm).homeMin).toBe(0);
  });
});

describe('the drive home', () => {
  // A long permanent fence far from the homestead, on a big farm.
  const job = (farm: FarmState): Action => {
    const [hx] = homeXY(farm);
    return { type: 'buildFence', edges: down(hx < 20 ? 36 : 4, 2, 20), fence: 'permanent' };
  };

  it('by default must fit inside daylight: the job stops in time to be home by last light', () => {
    const farm = openFarm('nsw', { size: 4160 });
    expect(farm.workRules).toEqual({ travel: true, driveHome: 'inside-daylight' });
    const done = work(farm, job(farm));
    expect(done.job.homeMin).toBeGreaterThan(15);
    expect(done.job.leftAfterMin).toBeCloseTo(done.job.homeMin, 6);
    // The drive home from where the line stopped is no longer than the light kept back.
    const home = endDay(done.farm);
    expect(home.homeMin).toBeLessThanOrEqual(done.job.homeMin + 1e-9);
    expect(home.lightLeftMin).toBeGreaterThanOrEqual(home.homeMin - 1e-9);
    // Nothing more can be started out there: there is only the drive home left.
    const more = previewAction(done.farm, { type: 'continueJob', job: 1 });
    expect(more.ok).toBe(false);
  });

  it('the one switch: with the drive home free after last light, the job runs to last light', () => {
    const inside = openFarm('nsw', { size: 4160 });
    const after = openFarm('nsw', { size: 4160, work: { driveHome: 'after-last-light' } });
    expect(after.workRules).toEqual({ travel: true, driveHome: 'after-last-light' });
    const a = work(inside, job(inside)).job;
    const b = work(after, job(after)).job;
    expect(b.homeMin).toBe(0);
    expect(b.leftAfterMin).toBeCloseTo(0, 6);
    // The drive out is the same. The light kept back on the first farm is worked on the second.
    expect(b.travelMin).toBeCloseTo(a.travelMin, 12);
    expect(b.workMin - a.workMin).toBeCloseTo(a.homeMin, 6);
    expect(b.line!.metresToday).toBeGreaterThan(a.line!.metresToday);
  });

  it('the farm keeps the switches it started with', () => {
    const farm = openFarm('nsw', { work: { driveHome: 'after-last-light' } });
    const later = endDay(setUp(farm, { type: 'placePortable', cell: 5 })).farm;
    expect(later.workRules).toEqual({ travel: true, driveHome: 'after-last-light' });
    expect(clockView(later).workRules).toEqual(later.workRules);
    expect(clockView(later).travelKmH).toBe(25);
  });
});

describe('home by last light', () => {
  it('whatever the job and however late it starts, the player can still drive home in the light left', () => {
    const b = busyFarm({ size: 4160 });
    // The steers start in the far paddock, so a move towards the homestead begins further out than it ends.
    const far = setUp(b.farm, { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } });
    const jobs: { farm: FarmState; action: Action }[] = [
      { farm: far, action: { type: 'moveMob', mob: b.steers, to: { cell: b.steerCell } } },
      { farm: b.farm, action: { type: 'moveMob', mob: b.steers, to: { cell: b.emptyCell } } },
      { farm: b.farm, action: { type: 'wean', mob: b.cows } },
      { farm: b.farm, action: { type: 'placeTrough', cell: b.pipedCell } },
      { farm: b.farm, action: { type: 'movePortable', port: b.port, cell: b.openCell } },
      {
        farm: b.farm,
        action: { type: 'movePortable', port: b.port, cell: b.farm.buildings.yards },
      },
      {
        farm: b.farm,
        action: { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' },
      },
      { farm: b.farm, action: { type: 'buildFence', edges: down(36, 1, 24), fence: 'electric' } },
      { farm: b.farm, action: { type: 'rollUpTape', edge: b.tape } },
      { farm: b.farm, action: { type: 'sellGroup', mob: b.steers, group: 'steer', qty: 10 } },
    ];
    let done = 0;
    let part = 0;
    for (const { farm, action } of jobs) {
      for (const left of [6, 9, 12, 15, 20, 30, 45, 90, 400]) {
        const late = cloneFarm(farm);
        late.clock.used = late.clock.lastLight - late.clock.firstLight - left;
        const out = previewAction(late, action);
        if (!out.ok) continue;
        const after = work(late, action);
        const lightLeft = after.job.dayMin - after.farm.clock.used;
        const home = driveMinutes(after.farm, after.farm.clock.at, homesteadPoint(after.farm));
        expect(home, action.type + ' with ' + left + ' m left').toBeLessThanOrEqual(
          lightLeft + 1e-6,
        );
        // The card gives that drive home.
        expect(after.job.homeMin).toBeCloseTo(home, 9);
        if (after.job.outcome === 'part') part++;
        else done++;
      }
    }
    // Both ways a job can come out were tried many times.
    expect(done).toBeGreaterThan(10);
    expect(part).toBeGreaterThan(10);
  });
});

describe('the drive charged on a line is the drive made', () => {
  /** Minutes to drive a number of metres at 25 km/h. */
  const drive = (metres: number): number => (metres / 25000) * 60;

  it('a line drawn from its far end is driven to at its far end', () => {
    // 200 m squares. The same line drawn left to right and right to left.
    const farm = openFarm('nsw', { size: 4160 });
    const [hx, hy] = homeXY(farm);
    const vy = hy < 13 ? hy + 7 : hy - 6;
    const line = across(vy, 2, 37);
    const fromLeft = work(farm, { type: 'buildFence', edges: line, fence: 'tape' });
    const fromRight = work(farm, { type: 'buildFence', edges: [...line].reverse(), fence: 'tape' });
    // The homestead is 6.5 squares from the line's row. Each drive is to the end the work starts at.
    const toLeft = Math.hypot(hx + 0.5 - 2, 6.5) * 200;
    const toRight = Math.hypot(hx + 0.5 - 38, 6.5) * 200;
    expect(fromLeft.job.travelMin).toBeCloseTo(drive(toLeft), 9);
    expect(fromRight.job.travelMin).toBeCloseTo(drive(toRight), 9);
    // The two ends are 7.2 km apart, so one of the drives is much the longer.
    expect(Math.abs(fromLeft.job.travelMin - fromRight.job.travelMin)).toBeGreaterThan(5);
    // Each ends at its own far end.
    expect(fromLeft.farm.clock.at).toEqual({ x: 38, y: vy });
    expect(fromRight.farm.clock.at).toEqual({ x: 2, y: vy });
    // The time on the clock is the drive and the tape: 7.2 km at 3 km an hour is 144 minutes.
    expect(fromRight.job.endsAt - fromRight.job.startsAt).toBeCloseTo(drive(toRight) + 144, 9);
  });

  it('a gap between two bits of one job is driven across, and charged', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const [hx, hy] = homeXY(farm);
    const vy = hy < 13 ? hy + 7 : hy - 6;
    // Two bits of tape on one row: squares 2 and 3, then squares 30 and 31.
    const near = across(vy, 2, 3);
    const bits = [...near, ...across(vy, 30, 31)];
    const one = work(farm, { type: 'buildFence', edges: near, fence: 'tape' });
    const both = work(farm, { type: 'buildFence', edges: bits, fence: 'tape' });
    const toStart = Math.hypot(hx + 0.5 - 2, 6.5) * 200;
    expect(one.job.travelMin).toBeCloseTo(drive(toStart), 9);
    // From the end of the first bit (corner 4) to the start of the second (corner 30): 26 squares, 5.2 km.
    expect(both.job.travelMin).toBeCloseTo(drive(toStart) + drive(5200), 9);
    expect(both.job.travelMin - one.job.travelMin).toBeCloseTo(12.48, 9);
    // 800 m of tape is 16 minutes. The clock moves by the drives and the work.
    expect(both.job.workMin).toBeCloseTo(16, 9);
    expect(both.farm.clock.used).toBeCloseTo(drive(toStart) + 12.48 + 16, 9);
    expect(both.farm.clock.at).toEqual({ x: 32, y: vy });
  });

  it('with too little light to cross the gap and get home, the job stops at the gap', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const [hx, hy] = homeXY(farm);
    const vy = hy < 13 ? hy + 7 : hy - 6;
    const bits = [...across(vy, 2, 3), ...across(vy, 30, 31)];
    const toStart = drive(Math.hypot(hx + 0.5 - 2, 6.5) * 200);
    const homeFromFirst = drive(Math.hypot(hx + 0.5 - 4, 6.5) * 200);
    // Light for the drive out, the first bit (8 minutes) and the drive home, and 5 minutes more:
    // not enough to drive the 12.5 minutes across.
    const late = cloneFarm(farm);
    late.clock.used =
      late.clock.lastLight - late.clock.firstLight - (toStart + 8 + homeFromFirst + 5);
    const out = work(late, { type: 'buildFence', edges: bits, fence: 'tape' });
    expect(out.job.outcome).toBe('part');
    expect(out.job.line!.piecesToday).toBe(2);
    expect(out.job.travelMin).toBeCloseTo(toStart, 9);
    expect(out.farm.clock.at).toEqual({ x: 4, y: vy });
    // The next day the drive is from the homestead to the second bit.
    const next = work(endDay(out.farm).farm, { type: 'continueJob', job: out.job.jobId! });
    expect(next.job.travelMin).toBeCloseTo(drive(Math.hypot(hx + 0.5 - 30, 6.5) * 200), 9);
    expect(next.job.outcome).toBe('done');
  });

  it('carrying a line on, the drive is to where the line had got to', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const [hx, hy] = homeXY(farm);
    const vy = hy < 13 ? hy + 7 : hy - 6;
    const day1 = work(farm, { type: 'buildFence', edges: across(vy, 2, 37), fence: 'permanent' });
    const stopped = day1.farm.clock.at;
    expect(stopped.y).toBe(vy);
    expect(stopped.x).toBeGreaterThan(4);
    const day2 = work(endDay(day1.farm).farm, { type: 'continueJob', job: 1 });
    expect(day2.job.travelMin).toBeCloseTo(drive(Math.hypot(hx + 0.5 - stopped.x, 6.5) * 200), 9);
    // And the job card for the days still to come counts the same drive.
    expect(day1.job.moreDays).toBeGreaterThan(10);
  });

  it('squares of pipe side by side have no drive between them, and a jump does', () => {
    const farm = openFarm('nsw', { size: 4160 });
    const [hx, hy] = homeXY(farm);
    const y = hy < 13 ? hy + 6 : hy - 6;
    const run = [5, 6, 7, 8].map((x) => cell(x, y));
    const joined = work(farm, { type: 'layPipe', cells: run });
    const toFirst = drive(Math.hypot(hx - 5, 6) * 200);
    expect(joined.job.travelMin).toBeCloseTo(toFirst, 9);
    // Two more squares 20 squares on: a 4 km drive from square 8 to square 28.
    const jump = work(farm, { type: 'layPipe', cells: [...run, cell(28, y), cell(29, y)] });
    expect(jump.job.travelMin).toBeCloseTo(toFirst + drive(4000), 9);
  });
});

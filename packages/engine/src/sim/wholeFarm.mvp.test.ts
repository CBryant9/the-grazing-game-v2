import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { toMvpEdge, type MvpFarm } from '../../test-support/mvpFarm';
import { WholeFarmRun, loadMvpWhole, type MvpWhole } from '../../test-support/mvpWhole';
import type { Supplement } from '../data/feed';
import { SPECIES } from '../data/species';
import { hEdge, vEdge, type EdgeRef } from '../farm/topology';
import { GRID_H, GRID_W } from '../grid';
import { COSTS, carryingCapacityAE, segmentCost } from '../money/costs';
import { infraInPlace } from '../money/worth';
import { LAND } from '../pasture/state';
import { createFarm, type FarmSizeName } from './create';
import { surveyOf } from './derived';
import type { FarmState } from './state';

/*
 * The whole farm, day by day, against the MVP's own stepDay.
 *
 * The engine builds a farm and the MVP is given the same one. Each day both
 * run, and afterwards every pasture array, planting, fence, trough, mob and
 * animal, the cash, the year's totals, the market and the game-over
 * counters must be equal, exactly. Each side must also have drawn the same
 * count of random numbers from each stream.
 *
 * Where the rebuild differs from the MVP on purpose, the run either keeps
 * off that path or checks the intended difference and brings the MVP into
 * line:
 *
 *   - a cow whose calf dies, or is weaned in another mob, is dried off (the
 *     run checks the engine did, then dries her off in the MVP);
 *   - net worth counts only what was spent on infrastructure still in place
 *     (the MVP's sum is given the engine's figure for infrastructure);
 *   - tape costs: no energiser, and no $10 fee on all-new tape (checked,
 *     then the MVP's cash is set level);
 *   - a fence through a mob shares it out by a seeded rule (never done here;
 *     see mobs.test.ts).
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 900_000 });

const loaded = loadMvpWhole();

/** A start month for each district that takes the run through dry or frosty months and a 1 July. */
const STARTS: Record<DistrictId, number> = { cq: 2, nsw: 9, cw: 4, wv: 7 };
const SIZES: Record<DistrictId, FarmSizeName> = {
  cq: 'small',
  nsw: 'medium',
  cw: 'small',
  wv: 'medium',
};
const at = (id: DistrictId): number => DISTRICT_IDS.indexOf(id);

function setSupplement(run: WholeFarmRun, supp: Supplement): void {
  for (const m of run.farm.mobs.slice()) {
    run.act({ type: 'setSupplement', mob: m.id, supp }, () => {
      run.mvpMob(m.id).supp = supp;
    });
  }
}

describe.each(DISTRICT_IDS)('%s: a running farm side by side with the MVP', (id) => {
  it('a breeding herd for 380 days: calving, joining, weaning, a new season and the year end', () => {
    const farm = createFarm({
      seed: 100 + at(id),
      district: id,
      size: SIZES[id],
      start: { year: 2023, month: STARTS[id] },
      startType: 'running',
      difficulty: 'medium',
    });
    const head = farm.mobs.reduce((n, m) => n + m.animals.length, 0);
    const run = new WholeFarmRun(loaded, farm, 7919 + at(id));
    // Central Qld starts on a lick. Everywhere else starts without one.
    expect(farm.mobs.every((m) => m.supp === (id === 'cq' ? 'lick' : 'none'))).toBe(true);
    run.days(380);
    expect(run.farm.day).toBe(380);
    expect(run.farm.years.length).toBe(1);
    for (const type of [
      'births',
      'weaned',
      'deaths',
      'new-season',
      'year-end',
      'cattle:joiningStarted',
      'cattle:pregTest',
      'cattle:calvingStarted',
      'cattle:toMark',
    ]) {
      expect(run.seen, type).toContain(type);
    }
    // The run was a real year for a real herd.
    expect(head).toBeGreaterThan(100);
    expect(run.farm.year.births + run.farm.years[0]!.births).toBeGreaterThan(20);
    expect(run.farm.years[0]!.score.total).not.toBe(0);
    expect(run.farm.years[0]!.interest).not.toBe(0);
  });
});

describe('breeding herds on the other supplement', () => {
  it('Central Qld off the lick, and Western Vic on it, for 150 days', () => {
    for (const [id, supp] of [
      ['cq', 'none'],
      ['wv', 'lick'],
    ] as const) {
      const farm = createFarm({
        seed: 300 + at(id),
        district: id,
        size: 'small',
        start: { year: 2024, month: id === 'cq' ? 4 : 0 },
        startType: 'running',
        difficulty: 'hard',
      });
      const run = new WholeFarmRun(loaded, farm, 31 + at(id));
      setSupplement(run, supp);
      run.days(150);
      expect(run.farm.day).toBe(150);
      expect(run.farm.mobs.every((m) => m.supp === supp)).toBe(true);
      expect(run.farm.year.feed > 0).toBe(supp === 'lick');
    }
  });
});

/** A from-scratch farm that came with its one old fence line, so it has a second paddock with no water. */
function scratchFarm(id: DistrictId, year: number, month: number): FarmState {
  for (let seed = 500 + at(id) * 50; ; seed++) {
    const farm = createFarm({
      seed,
      district: id,
      size: 260,
      start: { year, month },
      startType: 'scratch',
      difficulty: 'easy',
      // Plenty in the bank, as the old calibration run had: this run is about the rules.
      money: { cash: 5e6, overdraft: -5e6, broke: -1e7 },
    });
    if (surveyOf(farm).topology.paddocks.length === 2) return farm;
  }
}

/** The edges of a box of squares, x0 to x1 and y0 to y1. */
function boxEdges(x0: number, y0: number, x1: number, y1: number): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (let x = x0; x <= x1; x++) out.push(hEdge(y0, x), hEdge(y1 + 1, x));
  for (let y = y0; y <= y1; y++) out.push(vEdge(y, x0), vEdge(y, x1 + 1));
  return out;
}

describe.each([
  ['cq', 'lick'],
  ['cq', 'none'],
  ['nsw', 'none'],
  ['cw', 'none'],
  ['wv', 'lick'],
] as const)('%s steers on %s side by side with the MVP', (id, supp) => {
  it('bought, sold, in the lot, on a portable trough behind tape, and out of water: 150 days', () => {
    let farm = scratchFarm(id, 2021, [8, 9, 3, 3][at(id)]!);
    const bore = farm.layout.water.bore;
    const run = new WholeFarmRun(loaded, farm, 4001 + at(id));
    const mvpF = run.mvp as unknown as MvpFarm;

    // Weaner steers at about 60% of carrying capacity, as the old calibration run did.
    const n = Math.max(10, Math.round((carryingCapacityAE(id, 260) * 0.6) / 0.56));
    const bought = run.act(
      { type: 'buyCattle', cls: 'weanerSteer', qty: n, to: { cell: bore } },
      (m) => m.buyCattle('weanerSteer', n, 'pad:' + m.ROF[bore]),
    );
    expect(bought.events.map((e) => e.type)).toEqual(['cattle-bought']);
    const mob = run.farm.mobs[0]!.id;
    // New mobs start on a lick in Central Qld and nowhere else.
    expect(run.farm.mobs[0]!.supp).toBe(id === 'cq' ? 'lick' : 'none');
    setSupplement(run, supp);
    run.days(30);

    // More cattle into the same mob, a sale, a spell in the feedlot.
    run.act({ type: 'buyCattle', cls: 'yearSteer', qty: 6, to: { mob } }, (m) =>
      m.buyCattle('yearSteer', 6, 'mob:' + mob),
    );
    run.act({ type: 'sellGroup', mob, group: 'steer', qty: 5 }, (m) =>
      m.sellGroup(run.mvpMob(mob), 'steer', 5),
    );
    expect(run.farm.year.sales).toBeGreaterThan(0);
    run.act({ type: 'moveMob', mob, to: 'lot' }, (m) => m.toLot(run.mvpMob(mob)));
    run.days(7);
    expect(run.farm.year.feed).toBeGreaterThan(n * 7);
    run.act({ type: 'moveMob', mob, to: { cell: bore } }, (m) => {
      const where = run.farm.mobs[0]!.where;
      m.moveMob(run.mvpMob(mob), where.kind === 'paddock' ? where.anchor : -1);
    });

    // Pipe and a second trough in the first paddock.
    farm = run.farm;
    const bx = bore % GRID_W;
    const by = (bore / GRID_W) | 0;
    const dy = by > GRID_H / 2 ? -1 : 1;
    const pipe = [1, 2, 3].map((k) => (by + k * dy) * GRID_W + bx);
    run.act({ type: 'layPipe', cells: pipe }, (m) => m.layPipe(pipe));
    run.act({ type: 'placeTrough', cell: pipe[2]! }, (m) => m.placeTrough(pipe[2]!));
    expect(infraInPlace(run.farm)).toBe(
      3 * segmentCost('pipe', run.farm.layout.scale.sideM) + COSTS.trough,
    );

    // A portable trough in the middle of the dry paddock, inside a box of tape.
    const topo = surveyOf(run.farm).topology;
    const dry = topo.paddocks.find((p) => p.id !== topo.paddockOf[bore])!;
    const c = dry.label;
    const cx = Math.min(GRID_W - 3, Math.max(2, c % GRID_W));
    const cy = Math.min(GRID_H - 3, Math.max(2, (c / GRID_W) | 0));
    const cell = cy * GRID_W + cx;
    // From here the MVP's one counter is ahead of the engine's tag counter.
    run.compare = { skipNextTag: true };
    run.farm.layout.water.nextPortId = run.mvp.S.nid;
    run.act({ type: 'placePortable', cell }, (m) => (m as unknown as MvpFarm).placePort(cell));
    const box = boxEdges(cx - 1, cy - 1, cx + 1, cy + 1);
    const cashBefore = run.farm.cash;
    run.act(
      { type: 'buildFence', edges: box, fence: 'tape' },
      (m) => (m as unknown as MvpFarm).buildFence({ edges: box.map(toMvpEdge) }, 3),
      (f, m: MvpWhole) => {
        // The MVP charged an energiser and a $10 fee on all-new tape. The rebuild charges neither.
        const tape = 12 * segmentCost('tape', f.layout.scale.sideM);
        expect(cashBefore - f.cash).toBeCloseTo(tape, 6);
        expect(f.cash - m.S.cash).toBeCloseTo(COSTS.energiser + COSTS.tapeRoll, 6);
        expect(f.energiser).toBe(false);
        expect(m.S.energiser).toBe(true);
        expect(m.S.yr.running - f.year.running).toBeCloseTo(COSTS.tapeRoll, 6);
        m.S.cash = f.cash;
        m.S.yr.running = f.year.running;
        m.S.energiser = false;
      },
    );
    expect(surveyOf(run.farm).topology.paddocks.length).toBe(3);

    // Most of the steers go into the box: too many for nine squares.
    const into = Math.min(60, run.farm.mobs[0]!.animals.length - 5);
    const moved = run.act(
      {
        type: 'moveCattle',
        picks: [
          { mob, cls: 'weanerSteer', qty: into },
          { mob, cls: 'yearlingSteer', qty: into },
        ],
        to: { cell },
      },
      (m) => {
        const t = run.farm.mobs.find((x) => x.id !== mob)!;
        m.U.picked = new Set(t.animals.map((a) => a.id));
        m.movePicked(t.where.kind === 'paddock' ? t.where.anchor : -1);
      },
    );
    expect(moved.events.map((e) => e.type)).toEqual(['mob-moved']);
    expect(run.farm.mobs.length).toBe(2);
    expect(mvpF.REGS.length).toBe(3);

    // The portable trough runs low, then dry. It is refilled once. The second time it is left.
    let refilled = false;
    let emptied = 0;
    const causes = new Set<string>();
    for (let d = 0; d < 113 && !run.farm.over; d++) {
      const out = run.day();
      for (const x of out.deaths) causes.add(x.cause);
      if (out.events.some((e) => e.type === 'water' && e.event.type === 'portable-empty')) {
        emptied++;
        if (!refilled) {
          refilled = true;
          const port = run.farm.layout.water.ports[0]!.id;
          run.act({ type: 'refillPortable', port }, (m) =>
            (m as unknown as MvpFarm).refillPort(m.S.ports[0]!),
          );
        }
      }
    }
    expect(run.farm.day).toBe(150);
    expect(emptied).toBe(2);
    for (const type of ['water', 'breakout', 'cattle:noWater', 'deaths']) {
      expect(run.seen, type).toContain(type);
    }
    // Left without water, the mob in the dry paddock died on day 4.
    expect(causes).toContain('noWater');
    expect(run.farm.mobs.length).toBe(1);
    expect(run.farm.mobs[0]!.id).toBe(mob);
    // Tape was knocked down, and the tape on the farm is still worth what was paid for it.
    const fences = run.farm.layout.fences;
    const count = (code: number): number =>
      [...fences.hE, ...fences.vE].filter((v) => v === code).length;
    expect(count(7)).toBeGreaterThan(0);
    expect(count(3) + count(7)).toBe(12);
  });
});

describe('a mixed farm side by side with the MVP', () => {
  it('Central West: steers on crops, harvests and a sowing, for 300 days', () => {
    let farm: FarmState;
    for (let seed = 900; ; seed++) {
      farm = createFarm({
        seed,
        district: 'cw',
        size: 'small',
        start: { year: 2022, month: 5 },
        startType: 'scratch',
        mixed: { arablePct: 40, croppedPct: 50 },
        difficulty: 'easy',
      });
      // A farm whose rotation shares a grazing area with the bore, so the steers reach the crops.
      const s = surveyOf(farm);
      const area = s.topology.areaOf[farm.layout.water.bore];
      if (farm.crops.rotBlocks.every((b) => b.every((i) => s.topology.areaOf[i] === area))) break;
    }
    expect(farm.crops.fields.length).toBe(3);
    // The MVP hands out tag numbers and planting ids from one counter.
    farm.animalIds.next = farm.crops.nextFieldId;
    const run = new WholeFarmRun(loaded, farm, 77);
    const bore = farm.layout.water.bore;
    run.act({ type: 'buyCattle', cls: 'yearSteer', qty: 40, to: { cell: bore } }, (m) =>
      m.buyCattle('yearSteer', 40, 'pad:' + m.ROF[bore]),
    );
    run.farm.crops.nextFieldId = run.farm.animalIds.next;
    run.compare = { skipNextTag: true };

    const harvested: string[] = [];
    let sown = false;
    for (let d = 0; d < 300; d++) {
      const out = run.day();
      for (const e of out.events) {
        if (e.type !== 'crop') continue;
        if (e.event.type === 'harvest-ready') {
          const id = e.event.fieldId;
          const done = run.act({ type: 'harvest', field: id }, (m) =>
            (m as unknown as MvpFarm).harvestField(m.FMAP.get(id)!),
          );
          harvested.push(e.event.sp);
          expect(done.events[0]).toMatchObject({ type: 'harvested', sp: e.event.sp });
        }
        // When forage sorghum's window opens, sow it on the stubble and fallow.
        if (e.event.type === 'sowing-window' && e.event.sp === 'forsorg' && !sown) {
          sown = true;
          const cells: number[] = [];
          for (let i = 0; i < run.farm.pasture.land.length; i++) {
            if (run.farm.pasture.land[i]! >= LAND.fallow) cells.push(i);
          }
          expect(cells.length).toBeGreaterThan(0);
          const yearCrops = run.farm.year.crops;
          run.act({ type: 'sow', species: 'forsorg', cells }, (m) => {
            // The MVP's sowing rules sat in its screen code. These are those lines.
            const F = m as unknown as MvpFarm;
            const o = F.sowInfo('forsorg', cells);
            expect(m.spend(o.cost, 'sowing')).toBe(true);
            m.S.yr.crops += o.cost;
            F.addField('forsorg', o.use, m.S.day);
          });
          expect(run.farm.year.crops - yearCrops).toBeCloseTo(
            cells.length * run.farm.layout.scale.haPerSquare * SPECIES.forsorg.cost,
            6,
          );
        }
      }
    }
    expect(run.farm.day).toBe(300);
    expect(harvested.sort()).toEqual(['barley', 'oats', 'wheat']);
    expect(sown).toBe(true);
    expect(run.farm.year.grain).toBeGreaterThan(0);
    for (const type of ['crop', 'crop-grazed', 'sown', 'harvested']) {
      expect(run.seen, type).toContain(type);
    }
  });
});

describe('game over side by side with the MVP', () => {
  const herd = (seed: number): WholeFarmRun =>
    new WholeFarmRun(
      loaded,
      createFarm({
        seed,
        district: 'nsw',
        size: 'small',
        start: { year: 2023, month: 1 },
        startType: 'running',
        difficulty: 'medium',
      }),
      seed,
    );

  it('the whole farm eaten out: the count, the warning day and the end are the same', () => {
    const run = herd(41);
    run.days(3);
    expect(run.farm.noFeedDays).toBe(0);
    // Bare ground everywhere, in both.
    for (const side of [run.farm.pasture, run.mvp.S]) {
      side.land.fill(LAND.fallow);
      side.G.fill(0);
      side.D.fill(255);
    }
    const counts: number[] = [];
    for (let d = 0; d < 14 && !run.farm.over; d++) {
      run.day();
      counts.push(run.farm.noFeedDays);
    }
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(run.farm.over).toEqual({ reason: 'feed', day: 13 });
    expect(run.mvp.S.over).toBe(true);
    expect(run.seen).toContain('out-of-feed');
    expect(run.seen).toContain('game-over');
  });

  it('the bank limit: both end on the day cash reaches it', () => {
    const run = herd(42);
    run.days(2);
    run.farm.cash = run.farm.broke + 60;
    run.mvp.S.cash = run.farm.cash;
    let days = 0;
    while (!run.farm.over && days < 20) {
      run.day();
      days++;
    }
    expect(run.farm.over?.reason).toBe('bank');
    expect(run.mvp.S.over).toBe(true);
    expect(run.farm.cash).toBeLessThanOrEqual(run.farm.broke);
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThan(5);
  });
});

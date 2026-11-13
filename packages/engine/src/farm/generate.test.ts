import { DISTRICT_IDS, type DistrictId } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { firstDifference } from '../../test-support/farms';
import { bareLayout } from '../../test-support/layouts';
import { seededRandom } from '../../test-support/mvp';
import {
  cropsFromMvp,
  expectSameCrops,
  expectSameLayout,
  expectSameSurvey,
  loadMvpFarm,
  mvpNewGame,
  putLayout,
  randomFrom,
} from '../../test-support/mvpFarm';
import { dateAt, type FarmStart } from '../calendar';
import { blobGrow, genArable, startCropping } from '../crops/arable';
import { createCropState, type CropState } from '../crops/fields';
import { ARABLE_SHARES, ROTATIONS } from '../data/crops';
import { DISTRICTS } from '../data/districts';
import { FARM_SIZES, farmScale } from '../data/farms';
import { SPECIES } from '../data/species';
import { GRID_H, GRID_N, GRID_W } from '../grid';
import { LAND, createPastureState } from '../pasture/state';
import { rngStream, type Rng } from '../rng';
import type { GrowthFactorSource } from '../season/factors';
import {
  RUN_UP_SEASON_FLOOR,
  RUN_UP_WOBBLE,
  drawSeason,
  monthFactor,
  randomSeasons,
} from '../season/randomSeasons';
import {
  BUILDING_CLEAR_OF_BORE,
  GENERATION_STREAMS,
  genBore,
  genFertility,
  generateFarm,
  layRunning,
  layScratch,
  placeBuildings,
  runUpPasture,
  type GeneratedFarm,
  type StartLayout,
} from './generate';
import { surveyLayout, type FarmLayout } from './layout';
import { EDGE, getEdge, hEdge, vEdge, type EdgeRef, type Fences } from './topology';
import type { Water } from './water';

/*
 * The farm at the start, against the MVP's newGame, startScratch,
 * startLayout, genArable, blobGrow and startCropping.
 *
 * The MVP draws every random number from one unseeded source. Here that
 * source is fed from a seeded stream, and the engine's pieces are given the
 * same numbers in the same order. Each piece must then give exactly the
 * MVP's result. In play each piece draws from its own named stream, so
 * whole farms can't equal the MVP's; they are checked by their properties.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;
mvpNewGame(loaded, { region: 'cw', year: 2022, month: 3, ha: 2000 }, seededRandom(1));

/** The gates around each paddock, by paddock id. */
function gatesByPaddock(layout: FarmLayout): number[] {
  const { topology } = surveyLayout(layout);
  const of = topology.paddockOf;
  return topology.paddocks.map((pd) => {
    const seen = new Set<string>();
    for (const i of pd.cells) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const sides: EdgeRef[] = [];
      if (x < GRID_W - 1 && of[i + 1] !== pd.id) sides.push(vEdge(y, x + 1));
      if (x > 0 && of[i - 1] !== pd.id) sides.push(vEdge(y, x));
      if (y < GRID_H - 1 && of[i + GRID_W] !== pd.id) sides.push(hEdge(y + 1, x));
      if (y > 0 && of[i - GRID_W] !== pd.id) sides.push(hEdge(y, x));
      for (const e of sides) {
        const code = getEdge(layout.fences, e);
        if (code === EDGE.gateShut || code === EDGE.gateOpen) seen.add(`${e.line}${e.index}`);
      }
    }
    return seen.size;
  });
}

/** The rules a running farm's fences and water must meet. Returns its paddock count. */
function expectRunningRules(layout: FarmLayout, where: string): number {
  const { topology, points } = surveyLayout(layout);
  const { scale, fences, water } = layout;
  // One to two lines down the farm and at most one across make 2 to 6 paddocks.
  expect(topology.paddocks.length, `paddocks ${where}`).toBeGreaterThanOrEqual(2);
  expect(topology.paddocks.length, `paddocks ${where}`).toBeLessThanOrEqual(6);
  // Every paddock has at least one gate, and every gate starts shut.
  for (const [id, gates] of gatesByPaddock(layout).entries()) {
    expect(gates, `gates on paddock ${id + 1} ${where}`).toBeGreaterThanOrEqual(1);
  }
  expect(countEdges(fences, EDGE.gateOpen)).toBe(0);
  expect(topology.areas.length).toBe(topology.paddocks.length);
  // Only permanent and electric fence, shut gates and the boundary.
  for (const code of [EDGE.tape, EDGE.electricDown, EDGE.tapeDown]) {
    expect(countEdges(fences, code)).toBe(0);
  }
  // A trough on the bore, and water in every paddock over 2% of the farm.
  expect(water.troughs[0]).toBe(water.bore);
  expect(new Set(water.troughs).size).toBe(water.troughs.length);
  for (const pd of topology.paddocks) {
    const troughs = points.paddockTroughs[pd.id]!;
    const want = Math.min(8, Math.ceil(pd.ha / 2500));
    if (pd.ha >= scale.farmHa * 0.02) {
      expect(troughs.length, `water in paddock ${pd.id + 1} ${where}`).toBeGreaterThanOrEqual(1);
    }
    // About one water for each 2,500 ha, and never more than 8 in a paddock.
    expect(troughs.length).toBeLessThanOrEqual(Math.max(1, want));
    if (troughs.length) {
      // Either it has all the waters its size calls for, or no point is 2 km from water.
      let far = 0;
      for (const c of pd.cells) far = Math.max(far, points.dist[c]!);
      expect(
        troughs.length >= want || far * scale.sideM < 2000,
        `paddock ${pd.id + 1} has ${troughs.length} of ${want} waters, ${far * scale.sideM} m out, ${where}`,
      ).toBe(true);
    }
  }
  // Every trough is on the bore or on pipe that reaches it.
  const reach = surveyReach(water);
  for (const t of water.troughs) expect(reach[t], `trough ${t} is on water ${where}`).toBe(1);
  expect(water.hubs).toEqual([]);
  expect(water.ports).toEqual([]);
  return topology.paddocks.length;
}

function surveyReach(water: Water): Uint8Array {
  // Pipe joined to the bore, square to square.
  const r = new Uint8Array(GRID_N);
  const st = [water.bore];
  r[water.bore] = 1;
  while (st.length) {
    const i = st.pop()!;
    const x = i % GRID_W;
    for (const j of [x < GRID_W - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, i + GRID_W, i - GRID_W]) {
      if (j >= 0 && j < GRID_N && !r[j] && (water.pipe[j] || water.troughs.includes(j))) {
        r[j] = 1;
        st.push(j);
      }
    }
  }
  return r;
}

function countEdges(f: Fences, code: number): number {
  let n = 0;
  for (const v of f.hE) if (v === code) n++;
  for (const v of f.vE) if (v === code) n++;
  return n;
}

/** The rules a from-scratch farm must meet. */
function expectScratchRules(layout: FarmLayout, where: string): number {
  const { topology } = surveyLayout(layout);
  const { fences, water } = layout;
  expect(water.troughs, `one water, on the bore ${where}`).toEqual([water.bore]);
  expect(water.pipe.some((v) => v === 1)).toBe(false);
  const fence = countEdges(fences, EDGE.permanent);
  const gates = countEdges(fences, EDGE.gateShut);
  // Nothing, or one old permanent line down the farm with one shut gate.
  expect([`0,0`, `${GRID_H - 1},1`]).toContain(`${fence},${gates}`);
  expect(countEdges(fences, EDGE.electric) + countEdges(fences, EDGE.tape)).toBe(0);
  expect(topology.paddocks.length).toBe(gates ? 2 : 1);
  if (gates) expect(gatesByPaddock(layout)).toEqual([1, 1]);
  return topology.paddocks.length;
}

/** 4-connected groups of arable squares, biggest first. */
function patches(arable: Uint8Array): number[] {
  const seen = new Uint8Array(GRID_N);
  const sizes: number[] = [];
  for (let s = 0; s < GRID_N; s++) {
    if (!arable[s] || seen[s]) continue;
    let n = 0;
    const st = [s];
    seen[s] = 1;
    while (st.length) {
      const i = st.pop()!;
      n++;
      const x = i % GRID_W;
      for (const j of [x < GRID_W - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, i + GRID_W, i - GRID_W]) {
        if (j >= 0 && j < GRID_N && arable[j] && !seen[j]) {
          seen[j] = 1;
          st.push(j);
        }
      }
    }
    sizes.push(n);
  }
  return sizes.sort((a, b) => b - a);
}

/** Rotation blocks: all the same size, square, on the farm, apart from each other, and arable. */
function expectSquareBlocks(
  district: DistrictId,
  crops: Pick<CropState, 'arable' | 'rotBlocks'>,
): void {
  const blocks = crops.rotBlocks;
  expect(blocks.length).toBe(ROTATIONS[district].length + 1);
  const side = Math.sqrt(blocks[0]!.length);
  expect(Number.isInteger(side)).toBe(true);
  const used = new Set<number>();
  for (const b of blocks) {
    expect(b.length).toBe(side * side);
    const xs = b.map((i) => i % GRID_W);
    const ys = b.map((i) => (i / GRID_W) | 0);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(side - 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBe(side - 1);
    // Clear of the boundary by at least one square.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(GRID_W - 2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(GRID_H - 2);
    for (const i of b) {
      expect(used.has(i)).toBe(false);
      used.add(i);
      expect(crops.arable[i]).toBe(1);
    }
  }
}

describe('fences, gates and water at the start, against the MVP', () => {
  it(
    'taking over a running farm: 80 farms, the same numbers in, the same farm out',
    { timeout: 120000 },
    () => {
      const paddockCounts = new Set<number>();
      let electric = 0;
      let extraWaters = 0;
      let addedGates = 0;
      for (let k = 0; k < 80; k++) {
        const id = DISTRICT_IDS[k % 4]!;
        const farmHa = FARM_SIZES[id][k % 3]!;
        const scale = farmScale(farmHa);
        const bore = genBore(rngStream(k, 'bore'));
        putLayout(mvp, bareLayout(farmHa, bore));
        mvp.S.infra = 0;
        mvp.S.energiser = false;
        loaded.setRandom(randomFrom(rngStream(k, 'running')));
        mvp.startLayout(true);
        mvp.recompute();
        const laid = layRunning(rngStream(k, 'running'), bore, scale);
        const layout: FarmLayout = { scale, fences: laid.fences, water: laid.water, tapeOnRoll: 0 };
        const where = `running farm ${k} (${id}, ${farmHa} ha)`;
        expectSameLayout(layout, mvp, where);
        expectSameSurvey(surveyLayout(layout), mvp, where);
        // What the farm comes with, as the MVP counted it.
        expect(laid.improvements.permanent + laid.improvements.electric).toBe(mvp.S.startFence);
        expect(laid.improvements.gates).toBe(mvp.S.startGates);
        expect(laid.improvements.troughs).toBe(mvp.S.troughs.length);
        // Pipe is counted in squares, leaving out the bore's own square.
        const piped = mvp.S.pipe.reduce((s, v) => s + v, 0);
        expect(laid.improvements.pipe).toBe(piped - (mvp.S.pipe[bore] ? 1 : 0));
        expect(mvp.S.energiser).toBe(laid.improvements.electric > 0);
        paddockCounts.add(expectRunningRules(layout, where));
        // The MVP's own farm meets the same rules.
        for (const pd of mvp.PADS) {
          if (pd.ha >= farmHa * 0.02) expect(pd.troughs.length).toBeGreaterThanOrEqual(1);
        }
        if (laid.improvements.electric) electric++;
        if (laid.improvements.troughs > surveyLayout(layout).topology.paddocks.length)
          extraWaters++;
        // At most three lines, each with its own gate. Any more were added for paddocks without one.
        if (laid.improvements.gates > 3) addedGates++;
      }
      // The 80 farms cover 2, 3, 4 and 6 paddocks, electric lines, extra gates and extra waters.
      expect([...paddockCounts].sort()).toEqual([2, 3, 4, 6]);
      expect(electric).toBeGreaterThan(10);
      expect(extraWaters).toBeGreaterThan(10);
      expect(addedGates).toBeGreaterThan(5);
    },
  );

  it('starting from scratch: 80 farms, the same numbers in, the same farm out', () => {
    let fenced = 0;
    for (let k = 0; k < 80; k++) {
      const id = DISTRICT_IDS[k % 4]!;
      const farmHa = FARM_SIZES[id][k % 3]!;
      const scale = farmScale(farmHa);
      const bore = genBore(rngStream(k, 'bore'));
      putLayout(mvp, bareLayout(farmHa, bore));
      loaded.setRandom(randomFrom(rngStream(k, 'scratch')));
      mvp.startScratch();
      mvp.recompute();
      const laid = layScratch(rngStream(k, 'scratch'), bore);
      const layout: FarmLayout = { scale, fences: laid.fences, water: laid.water, tapeOnRoll: 0 };
      const where = `scratch farm ${k}`;
      expectSameLayout(layout, mvp, where);
      expectSameSurvey(surveyLayout(layout), mvp, where);
      expect(laid.improvements).toEqual({
        permanent: mvp.S.startFence,
        electric: 0,
        gates: mvp.S.startGates,
        troughs: 1,
        pipe: 0,
      });
      if (expectScratchRules(layout, where) === 2) fenced++;
    }
    // About half have the one old fence line.
    expect(fenced).toBeGreaterThan(25);
    expect(fenced).toBeLessThan(55);
  });

  it('the old fence line on a scratch farm keeps 3 squares clear of the bore', () => {
    for (let k = 0; k < 200; k++) {
      const bore = genBore(rngStream(k, 'bore'));
      const laid = layScratch(rngStream(k, 'scratch-clear'), bore);
      for (let vx = 1; vx < GRID_W; vx++) {
        if (laid.fences.vE[vx] === EDGE.none) continue;
        expect(vx).toBeGreaterThanOrEqual(8);
        expect(vx).toBeLessThanOrEqual(GRID_W - 8);
        expect(Math.abs(vx - (bore % GRID_W))).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe('arable land and the starting rotation, against the MVP', () => {
  const resetCrops = (): void => {
    const S = mvp.S;
    S.fields = [];
    S.fid.fill(-1);
    S.CD.fill(1);
    S.Y.fill(0);
    S.land.fill(0);
    S.regen = [];
    S.nid = 1;
    mvp.rebuildFields();
  };

  it.each(DISTRICT_IDS)(
    '%s grazing farms: one natural patch, sometimes a second, within the range',
    (id) => {
      mvp.S.region = id;
      const [lo, hi] = ARABLE_SHARES[id].graze;
      let two = 0;
      for (let k = 0; k < 60; k++) {
        loaded.setRandom(randomFrom(rngStream(k, `arable-${id}`)));
        const pct = rngStream(k, `pct-${id}`).range(lo, hi);
        mvp.genArable(pct, 0);
        const land = genArable(id, pct, 0, rngStream(k, `arable-${id}`));
        const total = Math.round((GRID_N * pct) / 100);
        if (total === 1) {
          // The MVP left a one-square patch out altogether. The engine keeps it.
          expect(mvp.S.arable.some((v) => v === 1)).toBe(false);
          expect(land.squares).toBe(1);
          continue;
        }
        expect(firstDifference(land.arable, mvp.S.arable), `${id} farm ${k}`).toBeNull();
        expect(land.squares * mvp.HA).toBe(mvp.S.arableHa);
        expect(land.rotBlocks).toEqual([]);
        // The share asked for, to the nearest square, in one patch or two.
        expect(land.squares).toBe(total);
        expect((land.squares / GRID_N) * 100).toBeGreaterThanOrEqual(lo - 0.05);
        expect((land.squares / GRID_N) * 100).toBeLessThanOrEqual(hi + 0.05);
        const sizes = patches(land.arable);
        expect(sizes.length).toBeLessThanOrEqual(2);
        if (total <= 16) expect(sizes.length).toBeLessThanOrEqual(1);
        if (sizes.length === 2) {
          two++;
          // The second patch is the smaller: about 18% of the arable land.
          expect(sizes[1]).toBe(total - Math.round(total * 0.82));
        }
      }
      if (hi >= 8) expect(two).toBeGreaterThan(5);
    },
  );

  it.each(DISTRICT_IDS)(
    '%s mixed farms: every arable and cropped choice, square blocks inside the patch',
    (id) => {
      mvp.S.region = id;
      let compared = 0;
      let faults = 0;
      for (const pct of ARABLE_SHARES[id].mixed) {
        for (const cropPct of [25, 50, 75, 100]) {
          for (let k = 0; k < 6; k++) {
            const name = `mixed-${id}-${pct}-${cropPct}`;
            loaded.setRandom(randomFrom(rngStream(k, name)));
            mvp.genArable(pct, cropPct);
            const land = genArable(id, pct, cropPct, rngStream(k, name));
            const total = Math.round((GRID_N * pct) / 100);
            const inBlocks = land.rotBlocks.reduce((s, b) => s + b.length, 0);
            expect(land.rotBlocks).toEqual(mvp.S.rotBlocks.map((b) => Array.from(b)));
            expectSquareBlocks(id, land);
            if (mvp.S.rotBlocks.some((b) => b.some((i) => !mvp.S.arable[i]))) {
              // The MVP fault: the blocks were as big as the main patch asked
              // for, and it left them off the arable land. The engine keeps the
              // blocks arable (expectSquareBlocks above), so from here the two
              // draw different numbers and only the rules are checked.
              expect(inBlocks).toBeGreaterThanOrEqual(Math.round(total * 0.82));
              expect(land.squares).toBeGreaterThanOrEqual(inBlocks);
              expect(patches(land.arable).length).toBeLessThanOrEqual(2);
              faults++;
              continue;
            }
            expect(firstDifference(land.arable, mvp.S.arable), `${name} farm ${k}`).toBeNull();
            // The share asked for, to the square. On an 80% arable farm the
            // second patch can be boxed in by the first and come up short, as
            // in the MVP.
            if (pct <= 60) expect(land.squares).toBe(total);
            else {
              expect(land.squares).toBeLessThanOrEqual(total);
              expect(land.squares).toBeGreaterThanOrEqual(Math.round(total * 0.82));
            }
            // One patch holding the blocks, sometimes with a smaller one elsewhere.
            const sizes = patches(land.arable);
            expect(sizes.length).toBeLessThanOrEqual(2);
            expect(sizes[0]).toBeGreaterThanOrEqual(inBlocks);
            compared++;
          }
        }
      }
      expect(compared).toBeGreaterThan(60);
      expect(compared + faults).toBe(96);
    },
  );

  it('the MVP fault with blocks as big as the arable land is fixed, not copied', () => {
    // Northern Tablelands, 30% arable, all of it cropped: the blocks come to
    // 324 squares against 312 asked for.
    mvp.S.region = 'nsw';
    loaded.setRandom(randomFrom(rngStream(1, 'fault')));
    mvp.genArable(30, 100);
    expect(mvp.S.rotBlocks.length).toBe(4);
    // In the MVP most or all of the rotation is on land that is not arable.
    const offArable = mvp.S.rotBlocks.flat().filter((i) => !mvp.S.arable[i]).length;
    expect(offArable).toBeGreaterThan(200);
    const land = genArable('nsw', 30, 100, rngStream(1, 'fault'));
    expect(land.rotBlocks.reduce((s, b) => s + b.length, 0)).toBe(324);
    for (const b of land.rotBlocks) for (const i of b) expect(land.arable[i]).toBe(1);
    expect(land.squares).toBeGreaterThanOrEqual(324);
  });

  it('a patch grows from its seeds, square by square, and stays joined up', () => {
    for (let k = 0; k < 40; k++) {
      const rng = rngStream(k, 'blob');
      const seeds = [rng.int(0, GRID_N - 1)];
      const target = rng.int(1, 300);
      const mark = new Uint8Array(GRID_N);
      const theirs = new Uint8Array(GRID_N);
      loaded.setRandom(randomFrom(rngStream(k, 'blob-draws')));
      const nTheirs = mvp.blobGrow(seeds, target, theirs);
      const n = blobGrow(seeds, target, mark, rngStream(k, 'blob-draws'));
      expect(n).toBe(nTheirs);
      expect(firstDifference(mark, theirs)).toBeNull();
      expect(n).toBe(target + 1);
      expect(patches(mark.map((v) => (v === 2 ? 1 : 0)))).toEqual([target + 1]);
    }
    const mark = new Uint8Array(GRID_N);
    expect(blobGrow([], 5, mark, rngStream(1, 'x'))).toBe(0);
    expect(blobGrow([7, 8], 0, mark, rngStream(1, 'x'))).toBe(2);
    expect([mark[7], mark[8]]).toEqual([2, 2]);
  });

  it.each(DISTRICT_IDS)('%s: the rotation is part-way through, to suit each start month', (id) => {
    mvp.S.region = id;
    const pct = ARABLE_SHARES[id].mixed[2]!;
    const planted = new Set<string>();
    for (let month = 0; month < 12; month++) {
      for (const cropPct of [50, 100]) {
        resetCrops();
        const S = mvp.S;
        S.startM = month;
        S.startY = 2022;
        S.day = 0;
        S.mixed = true;
        const name = `rotation-${id}-${month}-${cropPct}`;
        loaded.setRandom(randomFrom(rngStream(3, name)));
        mvp.genArable(pct, cropPct);
        const e = cropsFromMvp(mvp);
        mvp.startCropping();
        const made = startCropping(e.crops, e.pasture, e.ctx, 0);
        expectSameCrops(e, mvp, name);
        expect(made.map((f) => f.id)).toEqual(S.fields.map((f) => f.id));

        // What is in the ground suits the month: each crop was sown in its
        // own window, no longer ago than it lives. The last block is fallow.
        const rot = ROTATIONS[id];
        const start: FarmStart = { year: 2022, month };
        for (const f of made) {
          const sp = SPECIES[f.sp];
          const life = (sp.type === 'crop' ? sp.mature : sp.life)!;
          const t = -f.sown;
          expect(t).toBeGreaterThanOrEqual(0);
          expect(t).toBeLessThanOrEqual(life + 10);
          if (t === 0) expect(sp.sow).toContain(month);
          else expect(sp.sow).toContain(dateAt(start, f.sown + 10).month);
          expect(rot).toContain(f.sp);
          expect(f.cells).toEqual(e.crops.rotBlocks[rot.indexOf(f.sp)]);
          planted.add(`${f.sp}@${month}`);
        }
        const fallow = e.crops.rotBlocks[rot.length]!;
        for (const i of fallow) {
          expect(e.pasture.land[i]).toBe(LAND.fallow);
          expect([e.pasture.G[i], e.pasture.D[i], e.crops.fid[i]]).toEqual([0, 0, -1]);
        }
        // Fallow only on rotation blocks. Everything else is still native.
        const inBlocks = new Set(e.crops.rotBlocks.flat());
        e.pasture.land.forEach((v, i) => {
          if (!inBlocks.has(i)) expect(v).toBe(LAND.native);
        });
      }
    }
    // Over the twelve start months every crop in the rotation is in the ground at some time.
    for (const key of ROTATIONS[id]) {
      expect(
        [...planted].some((p) => p.startsWith(`${key}@`)),
        `${key} planted`,
      ).toBe(true);
    }
  });
});

/** Growth factors drawn the way the MVP's run-up drew them: the season first, then each month. */
function mvpOrderSeasons(rng: Rng, start: FarmStart): GrowthFactorSource {
  let seasonF: number | null = null;
  let monthF = 0;
  return {
    factorsOn(day) {
      if (seasonF === null) {
        seasonF = Math.max(RUN_UP_SEASON_FLOOR, drawSeason(rng).factor);
        monthF = seasonF;
      }
      if (dateAt(start, day).date === 1) monthF = monthFactor(seasonF, rng, RUN_UP_WOBBLE);
      return { seasonF, monthF, label: '' };
    },
  };
}

describe('a whole new farm, against the MVP', () => {
  const cases: {
    id: DistrictId;
    size: number;
    month: number;
    herd: boolean;
    mixed?: [number, number];
  }[] = [
    { id: 'cq', size: 1, month: 0, herd: true },
    { id: 'cq', size: 2, month: 6, herd: false, mixed: [25, 50] },
    { id: 'nsw', size: 0, month: 3, herd: false },
    { id: 'nsw', size: 2, month: 9, herd: true, mixed: [20, 75] },
    { id: 'cw', size: 1, month: 4, herd: true, mixed: [40, 50] },
    { id: 'cw', size: 2, month: 11, herd: false },
    { id: 'wv', size: 0, month: 7, herd: true },
    { id: 'wv', size: 1, month: 2, herd: false, mixed: [20, 25] },
  ];

  it.each(
    cases.map(
      (c, k) =>
        [`${c.id} ${c.herd ? 'running' : 'scratch'}${c.mixed ? ' mixed' : ''}`, c, k] as const,
    ),
  )(
    '%s: soil, bore, run-up pasture, fences, water, arable land and rotation',
    { timeout: 60000 },
    (_name, c, k) => {
      const farmHa = FARM_SIZES[c.id][c.size]!;
      const start: FarmStart = { year: 2022, month: c.month };
      const S = mvpNewGame(
        loaded,
        {
          region: c.id,
          year: start.year,
          month: start.month,
          ha: farmHa,
          herd: c.herd,
          mixed: !!c.mixed,
          arable: c.mixed?.[0],
          cropped: c.mixed?.[1],
        },
        randomFrom(rngStream(k, 'whole-farm')),
      );

      // The engine's pieces, in the MVP's order, fed the same numbers.
      const rng = rngStream(k, 'whole-farm');
      const scale = farmScale(farmHa);
      const pasture = createPastureState();
      pasture.F.set(genFertility(rng));
      const bore = genBore(rng);
      // The MVP then places 16 trees. The engine has none yet; draw the same numbers.
      const trees: number[] = [];
      while (trees.length < 16) {
        const t = rng.int(0, GRID_N - 1);
        if (t !== bore && !trees.includes(t)) trees.push(t);
      }
      runUpPasture(
        pasture,
        DISTRICTS[c.id],
        start,
        scale.haPerSquare,
        mvpOrderSeasons(rng, start),
        rng,
      );
      drawSeason(rng); // the first season of play
      const laid: StartLayout = c.herd ? layRunning(rng, bore, scale) : layScratch(rng, bore);
      const pct = c.mixed ? c.mixed[0] : rng.range(...ARABLE_SHARES[c.id].graze);
      const land = genArable(c.id, pct, c.mixed ? c.mixed[1] : 0, rng);
      const crops = createCropState();
      crops.arable = land.arable;
      crops.rotBlocks = land.rotBlocks;
      const ctx = { district: c.id, start, haPerSquare: scale.haPerSquare, mixed: !!c.mixed };
      if (c.mixed) startCropping(crops, pasture, ctx, 0);

      expect(firstDifference(pasture.F, S.F), 'soil fertility').toBeNull();
      expect(bore).toBe(S.bore);
      const layout: FarmLayout = { scale, fences: laid.fences, water: laid.water, tapeOnRoll: 0 };
      expectSameLayout(layout, mvp);
      expectSameCrops({ crops, pasture, ctx }, mvp);
      expect(land.squares * scale.haPerSquare).toBe(S.arableHa);
      // The run-up left a real sward: feed on every native square, and patchy.
      const native = Array.from(pasture.G).filter((_, i) => pasture.land[i] === LAND.native);
      expect(Math.min(...native)).toBeGreaterThan(0);
      expect(new Set(native).size).toBeGreaterThan(native.length * 0.95);
    },
  );
});

describe('generating a farm from its seed', () => {
  const START: FarmStart = { year: 2022, month: 3 };
  const make = (
    seed: number,
    id: DistrictId,
    startType: 'scratch' | 'running',
    extra = {},
  ): GeneratedFarm =>
    generateFarm({
      seed,
      district: id,
      farmHa: FARM_SIZES[id][seed % 3]!,
      start: START,
      startType,
      ...extra,
    });

  const flat = (f: GeneratedFarm): string =>
    JSON.stringify([
      Array.from(f.layout.fences.hE),
      Array.from(f.layout.fences.vE),
      f.layout.water,
      Array.from(f.layout.water.pipe),
      Array.from(f.pasture.F),
      Array.from(f.pasture.G),
      Array.from(f.pasture.D),
      Array.from(f.pasture.A),
      Array.from(f.pasture.X),
      Array.from(f.pasture.land),
      Array.from(f.crops.arable),
      f.crops.fields,
      f.buildings,
      f.improvements,
      f.arablePct,
    ]);

  it(
    'the same seed gives the same farm, and another seed a different one',
    { timeout: 30000 },
    () => {
      const a = make(42, 'cw', 'running', { mixed: { arablePct: 40, croppedPct: 50 } });
      const b = make(42, 'cw', 'running', { mixed: { arablePct: 40, croppedPct: 50 } });
      const c = make(43, 'cw', 'running', { mixed: { arablePct: 40, croppedPct: 50 } });
      expect(flat(a)).toBe(flat(b));
      expect(flat(a)).not.toBe(flat(c));
      expect(a.layout.water.bore).not.toBe(c.layout.water.bore);
    },
  );

  it(
    'each piece draws from its own stream, so one never shifts another',
    { timeout: 30000 },
    () => {
      const seed = 77;
      const running = make(seed, 'cq', 'running');
      const scratch = make(seed, 'cq', 'scratch');
      const mixed = make(seed, 'cq', 'running', { mixed: { arablePct: 25, croppedPct: 50 } });
      // The start type changes the fences and water, and nothing else.
      expect(Array.from(scratch.pasture.F)).toEqual(Array.from(running.pasture.F));
      expect(Array.from(scratch.pasture.G)).toEqual(Array.from(running.pasture.G));
      expect(scratch.layout.water.bore).toBe(running.layout.water.bore);
      expect(Array.from(scratch.crops.arable)).toEqual(Array.from(running.crops.arable));
      expect(scratch.arablePct).toBe(running.arablePct);
      // A mixed farm changes the arable land and the rotation, not the fences or water.
      expect(Array.from(mixed.layout.fences.vE)).toEqual(Array.from(running.layout.fences.vE));
      expect(Array.from(mixed.layout.fences.hE)).toEqual(Array.from(running.layout.fences.hE));
      expect(mixed.layout.water).toEqual(running.layout.water);
      expect(Array.from(mixed.pasture.F)).toEqual(Array.from(running.pasture.F));
      // Each piece is its own named stream.
      const scale = running.layout.scale;
      const bore = genBore(rngStream(seed, GENERATION_STREAMS.bore));
      expect(running.layout.water.bore).toBe(bore);
      expect(Array.from(running.pasture.F)).toEqual(
        Array.from(genFertility(rngStream(seed, GENERATION_STREAMS.fertility))),
      );
      const laid = layRunning(rngStream(seed, GENERATION_STREAMS.layout), bore, scale);
      expect(Array.from(running.layout.fences.vE)).toEqual(Array.from(laid.fences.vE));
      expect(running.layout.water).toEqual(laid.water);
      // The homestead and yards have their own stream too, and are placed last.
      expect(running.buildings).toEqual(
        placeBuildings(rngStream(seed, GENERATION_STREAMS.buildings), laid.water),
      );
      expect(new Set(Object.values(GENERATION_STREAMS)).size).toBe(6);
    },
  );

  it(
    'the run-up uses the seeded seasons for the 540 days before the start',
    { timeout: 30000 },
    () => {
      const seed = 5;
      const farm = make(seed, 'nsw', 'scratch');
      const pasture = createPastureState();
      pasture.F.set(genFertility(rngStream(seed, GENERATION_STREAMS.fertility)));
      const asked: number[] = [];
      const seasons = randomSeasons({ seed, start: START });
      runUpPasture(
        pasture,
        DISTRICTS.nsw,
        START,
        farm.layout.scale.haPerSquare,
        {
          factorsOn(day) {
            asked.push(day);
            return seasons.factorsOn(day);
          },
        },
        rngStream(seed, GENERATION_STREAMS.pasture),
      );
      expect(asked.length).toBe(540);
      expect([asked[0], asked[539]]).toEqual([-540, -1]);
      expect(Array.from(pasture.G)).toEqual(Array.from(farm.pasture.G));
      expect(Array.from(pasture.X)).toEqual(Array.from(farm.pasture.X));
      // A different season source gives a different sward.
      const other = make(seed, 'nsw', 'scratch', {
        seasons: { factorsOn: () => ({ seasonF: 0.85, monthF: 0.6, label: '' }) },
      });
      expect(Array.from(other.pasture.G)).not.toEqual(Array.from(farm.pasture.G));
      expect(Array.from(other.pasture.F)).toEqual(Array.from(farm.pasture.F));
    },
  );

  it.each(['running', 'scratch'] as const)(
    '48 %s farms: gates, water, soil, bore, arable land and buildings all meet the rules',
    { timeout: 120000 },
    (startType) => {
      let paddocks = 0;
      for (let seed = 0; seed < 48; seed++) {
        const id = DISTRICT_IDS[seed % 4]!;
        const mixed = seed % 5 === 0;
        const share = ARABLE_SHARES[id];
        const farm = make(
          1000 + seed,
          id,
          startType,
          mixed ? { mixed: { arablePct: share.mixed[seed % 4]!, croppedPct: 50 } } : {},
        );
        const where = `${startType} farm ${seed} (${id})`;
        const { layout, pasture, crops, buildings } = farm;
        paddocks +=
          startType === 'running'
            ? expectRunningRules(layout, where)
            : expectScratchRules(layout, where);
        expect(layout.tapeOnRoll).toBe(0);

        // The bore is at least 4 squares in from every boundary.
        const bx = layout.water.bore % GRID_W;
        const by = (layout.water.bore / GRID_W) | 0;
        expect(bx).toBeGreaterThanOrEqual(4);
        expect(bx).toBeLessThanOrEqual(GRID_W - 5);
        expect(by).toBeGreaterThanOrEqual(4);
        expect(by).toBeLessThanOrEqual(GRID_H - 5);

        // Soil fertility: 0.6 to 1.35, and smooth from square to square.
        let roughest = 0;
        let sum = 0;
        for (let i = 0; i < GRID_N; i++) {
          const v = pasture.F[i]!;
          expect(v).toBeGreaterThanOrEqual(Math.fround(0.6));
          expect(v).toBeLessThanOrEqual(Math.fround(1.35));
          sum += v;
          if (i % GRID_W < GRID_W - 1)
            roughest = Math.max(roughest, Math.abs(v - pasture.F[i + 1]!));
          if (i + GRID_W < GRID_N)
            roughest = Math.max(roughest, Math.abs(v - pasture.F[i + GRID_W]!));
        }
        expect(roughest).toBeLessThan(0.26);
        expect(sum / GRID_N).toBeGreaterThan(0.85);
        expect(sum / GRID_N).toBeLessThan(1.15);

        // Arable land: the share asked for or drawn, in one patch or two.
        const squares = crops.arable.reduce((s, v) => s + v, 0);
        const sizes = patches(crops.arable);
        expect(sizes.length).toBeLessThanOrEqual(2);
        if (mixed) {
          expect(farm.arablePct).toBe(share.mixed[seed % 4]);
          expectSquareBlocks(id, crops);
          expect(squares).toBe(Math.round((GRID_N * farm.arablePct) / 100));
          expect(farm.startFields.length).toBe(crops.fields.length);
          for (const f of crops.fields) expect(ROTATIONS[id]).toContain(f.sp);
        } else {
          expect(farm.arablePct).toBeGreaterThanOrEqual(share.graze[0]);
          expect(farm.arablePct).toBeLessThan(share.graze[1]);
          const total = Math.round((GRID_N * farm.arablePct) / 100);
          expect(squares).toBe(total);
          expect(crops.rotBlocks).toEqual([]);
          expect(crops.fields).toEqual([]);
          // A grazing farm starts with no fallow and no stubble anywhere.
          expect(pasture.land.every((v) => v === LAND.native)).toBe(true);
        }

        // The homestead touches the boundary. The yards are within two squares
        // of it, two to five squares from the homestead. Both are clear of the
        // bore and of every trough.
        const depth = (i: number): number =>
          Math.min(
            i % GRID_W,
            (i / GRID_W) | 0,
            GRID_W - 1 - (i % GRID_W),
            GRID_H - 1 - ((i / GRID_W) | 0),
          );
        const apart = (a: number, b: number): number =>
          Math.max(
            Math.abs((a % GRID_W) - (b % GRID_W)),
            Math.abs(((a / GRID_W) | 0) - ((b / GRID_W) | 0)),
          );
        expect(depth(buildings.homestead), `homestead ${where}`).toBe(0);
        expect(depth(buildings.yards), `yards ${where}`).toBeLessThanOrEqual(1);
        expect(apart(buildings.homestead, buildings.yards)).toBeGreaterThanOrEqual(2);
        expect(apart(buildings.homestead, buildings.yards)).toBeLessThanOrEqual(5);
        for (const b of [buildings.homestead, buildings.yards]) {
          expect(apart(b, layout.water.bore)).toBeGreaterThanOrEqual(BUILDING_CLEAR_OF_BORE);
          expect(layout.water.troughs).not.toContain(b);
        }
      }
      expect(paddocks).toBeGreaterThan(startType === 'running' ? 130 : 60);
    },
  );

  /** A farm with a trough on every square within two of the boundary, but for the ones left open. */
  const crowded = (bore: number, open: number[]): Water => {
    const water: Water = {
      bore,
      pipe: new Uint8Array(GRID_N),
      troughs: [],
      hubs: [],
      ports: [],
      nextPortId: 1,
    };
    for (let i = 0; i < GRID_N; i++) {
      const x = i % GRID_W;
      const y = (i / GRID_W) | 0;
      const ring = Math.min(x, y, GRID_W - 1 - x, GRID_H - 1 - y) <= 1;
      if (ring && !open.includes(i)) water.troughs.push(i);
    }
    return water;
  };

  it('the buildings keep off a trough that sits on the boundary', () => {
    const open = [5, 7, GRID_W + 6];
    const water = crowded(13 * GRID_W + 20, open);
    for (let k = 0; k < 20; k++) {
      const b = placeBuildings(rngStream(k, 'crowded'), water);
      expect([5, 7]).toContain(b.homestead);
      expect(open).toContain(b.yards);
      expect(b.yards).not.toBe(b.homestead);
    }
  });

  it('the buildings can stand three squares from the bore, and the yards two from the homestead', () => {
    // The bore is four squares in from the top-left corner. The only open
    // squares are (3, 0) on the boundary and (1, 1), which is three squares
    // from the bore and two from (3, 0).
    const water = crowded(4 * GRID_W + 4, [3, GRID_W + 1]);
    for (let k = 0; k < 5; k++) {
      expect(placeBuildings(rngStream(k, 'near-bore'), water)).toEqual({
        homestead: 3,
        yards: GRID_W + 1,
      });
    }
    // Six squares apart is too far for the yards.
    const far = crowded(13 * GRID_W + 20, [3, 9]);
    expect(() => placeBuildings(rngStream(1, 'too-far'), far)).toThrow();
    const five = placeBuildings(rngStream(1, 'far-enough'), crowded(13 * GRID_W + 20, [3, 8]));
    expect([five.homestead, five.yards].sort((a, b) => a - b)).toEqual([3, 8]);
  });
});

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FARM_GRID_N, FARM_VIEW_VERSION, VIEW_LAND, type FarmView } from '@gg/shared';
import { describe, expect, it } from 'vitest';
// The renderer's plain-arithmetic parts, by path, so this test never loads PixiJS.
import { placeCattle } from '../../../packages/render/src/cattle';
import { allLooks, squareTufts } from '../../../packages/render/src/grass';
import { breedFor } from '../../../packages/render/src/palette';
import { swardParts, swardPlan } from '../../../packages/render/src/sward';

/*
 * The map fixtures are real farm views, built by the engine
 * (scripts/dev/make-map-fixtures.mjs). These tests run the renderer's own
 * placement and grass code over every one of them, so a change to the view
 * or the renderer that breaks a real farm shows up here.
 */

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'map');
const names = readdirSync(DIR)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .map((f) => f.replace(/\.json$/, ''));
const load = (name: string): FarmView =>
  JSON.parse(readFileSync(join(DIR, name + '.json'), 'utf8')) as FarmView;
const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as {
  name: string;
  head: number;
  bytes: number;
}[];

describe('the map fixtures', () => {
  it('cover the four districts, small and large, scratch and running, and the special cases', () => {
    expect(names.sort()).toEqual(
      [
        'cq-small-scratch',
        'cq-large-running',
        'nsw-small-running',
        'nsw-large-scratch',
        'cw-small-scratch',
        'cw-large-running',
        'wv-small-running',
        'wv-large-scratch',
        'cw-mixed-crops',
        'cq-dry-season',
        'wv-green-season',
        'nsw-tape-cells',
        'cq-4000-head',
      ].sort(),
    );
    expect(index.map((f) => f.name).sort()).toEqual([...names].sort());
  });

  it('the big-herd farm has more than 4,000 head and is still well under 100 KB', () => {
    const big = index.find((f) => f.name === 'cq-4000-head')!;
    expect(big.head).toBeGreaterThan(4000);
    expect(big.bytes).toBeLessThan(64_000);
    for (const f of index) expect(f.bytes, f.name).toBeLessThan(64_000);
  });

  it('the mixed farm has crop, fallow and stubble squares, and a split paddock picture', () => {
    const view = load('cw-mixed-crops');
    const lands = new Set(view.squares.land);
    expect(lands.has(VIEW_LAND.fallow)).toBe(true);
    expect(lands.has(VIEW_LAND.stubble)).toBe(true);
    expect(lands.has(VIEW_LAND.crop) || lands.has(VIEW_LAND.annual)).toBe(true);
    const split = view.paddocks.filter((p) => swardParts(p, view.plantings).length === 2);
    expect(split.length).toBeGreaterThan(0);
  });

  it('the tape farm has tape, tape lying down, gates open and shut, a hub, a portable trough and a mob with no water', () => {
    const view = load('nsw-tape-cells');
    const codes = new Set([...view.fences.h, ...view.fences.v]);
    expect(codes.has(4)).toBe(true); // tape
    expect(codes.has(6)).toBe(true); // tape lying down
    expect(codes.has(3)).toBe(true); // electric
    expect(view.gates.some((g) => g.open)).toBe(true);
    expect(view.gates.some((g) => !g.open)).toBe(true);
    expect(view.water.hubs.length).toBe(1);
    const port = view.water.troughs.find((t) => t.kind === 'portable')!;
    expect(port.levelPct).toBeGreaterThan(0);
    expect(port.levelPct).toBeLessThan(100);
    expect(view.mobs.some((m) => m.status.noWater)).toBe(true);
    expect(view.water.pipe.length).toBeGreaterThan(0);
  });

  it('the dry season is shorter and less green than the green season', () => {
    const mean = (list: number[]): number => list.reduce((t, v) => t + v, 0) / list.length;
    const dry = load('cq-dry-season');
    const green = load('wv-green-season');
    expect(mean(dry.squares.heightCm)).toBeLessThan(mean(green.squares.heightCm) / 2);
    expect(mean(dry.squares.green)).toBeLessThan(mean(green.squares.green) / 2);
    expect(
      dry.paddocks.every((p) => p.label === 'short' || p.label === 'rank' || p.label === 'mixed'),
    ).toBe(true);
    expect(green.paddocks.every((p) => p.label === 'green')).toBe(true);
  });
});

describe.each(names)('fixture %s through the renderer', (name) => {
  const view = load(name);

  it('is this version of the view, with every list of squares complete', () => {
    expect(view.viewVersion).toBe(FARM_VIEW_VERSION);
    for (const [key, list] of Object.entries(view.squares)) {
      expect(list.length, key).toBe(FARM_GRID_N);
    }
    // The yards only (no homestead), and nothing that is a saleyard or a feedlot.
    expect(view.buildings.map((b) => b.kind).sort()).toEqual(['yards']);
  });

  it('paddock labels are the neutral four', () => {
    for (const p of view.paddocks) expect(['green', 'mixed', 'rank', 'short']).toContain(p.label);
  });

  it('every beast stands inside its own grazing area, off troughs, the bore and buildings', () => {
    const blocked = new Set([
      view.water.bore,
      ...view.water.troughs.map((t) => t.cell),
      ...view.buildings.map((b) => b.cell),
    ]);
    const mobs = new Map(view.mobs.map((m) => [m.id, m]));
    for (const everyBeast of [false, true]) {
      for (const p of placeCattle(view, { everyBeast })) {
        const mob = mobs.get(p.mob)!;
        expect(p.total).toBe(mob.head + mob.calves);
        expect(p.beasts.length).toBeGreaterThan(0);
        expect(p.beasts.length).toBeLessThanOrEqual(p.total);
        for (const b of p.beasts) {
          const square = Math.floor(b.y) * 40 + Math.floor(b.x);
          if (mob.where === 'paddock') expect(view.squares.area[square]).toBe(mob.area);
          if (mob.where === 'paddock') expect(blocked.has(square)).toBe(false);
        }
      }
    }
  });

  it('cattle stand in the same places every time', () => {
    expect(placeCattle(view)).toEqual(placeCattle(load(name)));
  });

  it('the grass can be drawn for every square, and every paddock has a side-view picture', () => {
    const looks = allLooks(view);
    let tufts = 0;
    for (let i = 0; i < FARM_GRID_N; i++) {
      const look = looks[i]!;
      expect(Number.isFinite(look.height) && look.height >= 0).toBe(true);
      expect(look.raise).toBeGreaterThanOrEqual(0);
      expect(look.raise).toBeLessThanOrEqual(0.5);
      for (const t of squareTufts(i, look)) {
        tufts++;
        expect(t.greenH).toBeLessThanOrEqual(t.h + 1e-9);
        expect(Math.floor(t.x) + Math.floor(t.y) * 40).toBe(i);
      }
    }
    // Fallow is the only country with no tufts, so every fixture has plenty.
    expect(tufts).toBeGreaterThan(2000);
    for (const p of view.paddocks) {
      const plan = swardPlan(p.sward);
      expect(plan.dryStems + plan.greenLeaves).toBeGreaterThan(0);
    }
  });

  it('Central Queensland is drawn with Brahman-style cattle and the south with British breeds', () => {
    expect(breedFor(view.district)).toBe(view.district === 'cq' ? 'brahman' : 'british');
  });
});

import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { loadMvpFarm, mvpNewGame } from '../../test-support/mvpFarm';
import { seededRandom } from '../../test-support/mvp';
import { GRID_H, GRID_N, GRID_W } from '../grid';
import {
  ARABLE_SHARES,
  CONVERT_COST_PER_HA,
  CROP_DISTRICT_FACTORS,
  LAND_OPTIONS,
  ROTATIONS,
} from './crops';
import { FARM_SIZES, farmScale } from './farms';
import {
  BRASSICA_CURVE,
  SPECIES,
  SPECIES_IDS,
  SUMMER_CURVE,
  WINTER_CURVE,
  speciesCurve,
} from './species';

/*
 * The farm, species and cropping figures against the MVP's own tables,
 * figure for figure, for the four launch districts.
 */

// The MVP runs slowly in its sandbox, more so when test files run side by side.
vi.setConfig({ testTimeout: 180000 });

const loaded = loadMvpFarm();
const { mvp } = loaded;

describe('farm sizes and scale', () => {
  it('the grid is exactly 40 by 26, with no yards strip', () => {
    expect([GRID_W, GRID_H, GRID_N]).toEqual([40, 26, 1040]);
    expect([mvp.W, mvp.H, mvp.N]).toEqual([40, 26, 1040]);
  });

  it.each(DISTRICT_IDS)('%s: small, medium and large match the MVP', (id) => {
    expect([...FARM_SIZES[id]]).toEqual(Array.from(mvp.FARMS[id]!));
  });

  it('carries the four launch districts only', () => {
    expect(Object.keys(FARM_SIZES).sort()).toEqual([...DISTRICT_IDS].sort());
    for (const table of [LAND_OPTIONS, ROTATIONS, ARABLE_SHARES, CROP_DISTRICT_FACTORS]) {
      expect(Object.keys(table).sort()).toEqual([...DISTRICT_IDS].sort());
    }
  });

  it('hectares and metres per square are the MVP figures', { timeout: 30000 }, () => {
    // One game for each district, on a different size each time.
    DISTRICT_IDS.forEach((id, k) => {
      const ha = FARM_SIZES[id][k % 3]!;
      const S = mvpNewGame(loaded, { region: id, year: 2022, month: 3, ha }, seededRandom(ha));
      const scale = farmScale(ha);
      expect(scale.farmHa).toBe(S.farmHa);
      expect(scale.haPerSquare).toBe(S.cellHa);
      expect(scale.haPerSquare).toBe(mvp.HA);
      expect(scale.sideM).toBe(S.side);
    });
    // Every size follows the same sums: ha / 1,040, and the square root of that in metres.
    for (const id of DISTRICT_IDS) {
      for (const ha of FARM_SIZES[id]) {
        expect(farmScale(ha).haPerSquare).toBe(ha / 1040);
        expect(farmScale(ha).sideM).toBe(Math.sqrt((ha / 1040) * 1e4));
      }
    }
  });

  it('a 1,040 ha farm has 1 ha squares, 100 m across', () => {
    expect(farmScale(1040)).toEqual({ farmHa: 1040, haPerSquare: 1, sideM: 100 });
  });
});

describe('species', () => {
  it('has every species the four districts can plant, and no others', () => {
    const wanted = new Set(DISTRICT_IDS.flatMap((id) => mvp.LAND_OPTS[id]!));
    expect([...SPECIES_IDS].sort()).toEqual([...wanted].sort());
    // Jarra digit grass was only offered in the Top End.
    expect(SPECIES_IDS).not.toContain('jarra');
    expect(mvp.LAND_OPTS.nt).toContain('jarra');
  });

  it.each(SPECIES_IDS)('%s matches the MVP figure for figure', (id) => {
    const mine = SPECIES[id] as unknown as Record<string, unknown>;
    const theirs = mvp.SPECIES[id]!;
    // Every figure the MVP holds, and nothing the MVP does not hold.
    const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));
    expect(plain({ ...mine, id: undefined })).toEqual(plain(theirs));
    expect(mine.id).toBe(id);
  });

  it('growth curves are the MVP curves', () => {
    expect([...WINTER_CURVE]).toEqual(Array.from(mvp.WINTER));
    expect([...SUMMER_CURVE]).toEqual(Array.from(mvp.SUMMER));
    expect([...BRASSICA_CURVE]).toEqual(Array.from(mvp.BRASS));
  });

  it('a species with a curve for each district uses that district, or its first curve', () => {
    for (const id of SPECIES_IDS) {
      const g = mvp.SPECIES[id]!.g;
      if (!g) {
        expect(() => speciesCurve(SPECIES[id], 'cq')).toThrow();
        continue;
      }
      for (const d of DISTRICT_IDS) {
        const theirs = Array.isArray(g) ? g : (g[d] ?? Object.values(g)[0]!);
        expect([...speciesCurve(SPECIES[id], d)]).toEqual(Array.from(theirs));
      }
    }
    // Lucerne has no Western Victoria curve, so it falls back to Central West.
    expect(speciesCurve(SPECIES.lucerne, 'wv')).toBe(speciesCurve(SPECIES.lucerne, 'cw'));
  });
});

describe('cropping figures', () => {
  it.each(DISTRICT_IDS)('%s: what it can plant, its rotation, arable share and factor', (id) => {
    expect([...LAND_OPTIONS[id]]).toEqual(Array.from(mvp.LAND_OPTS[id]!));
    expect([...ROTATIONS[id]]).toEqual(Array.from(mvp.ROTATION[id]!));
    expect([...ARABLE_SHARES[id].graze]).toEqual(Array.from(mvp.ARABLE[id]!.graze));
    expect([...ARABLE_SHARES[id].mixed]).toEqual(Array.from(mvp.ARABLE[id]!.mixed));
    expect(CROP_DISTRICT_FACTORS[id]).toBe(mvp.CROPF[id]);
  });

  it('conversion cost is the MVP figure', () => {
    expect(CONVERT_COST_PER_HA).toBe(mvp.CONVERT);
    expect(CONVERT_COST_PER_HA).toBe(150);
  });
});

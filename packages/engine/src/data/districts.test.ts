import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { REBUILD_TUNES, loadMvp } from '../../test-support/mvp';
import { DISTRICTS } from './districts';

const { mvp } = loadMvp();

describe('district figures', () => {
  it('covers the four launch districts and leaves the Top End out', () => {
    expect(Object.keys(DISTRICTS).sort()).toEqual(['cq', 'cw', 'nsw', 'wv']);
    expect(Object.keys(DISTRICTS).sort()).toEqual([...DISTRICT_IDS].sort());
  });

  it('differs from the MVP only by the tunes on the list', () => {
    // The MVP is loaded with these already set (test-support/mvp.ts), after
    // checking the MVP file still holds the old figure.
    expect(REBUILD_TUNES).toEqual([{ district: 'cw', key: 'dmdMax', mvp: 0.7, rebuild: 0.68 }]);
    expect(DISTRICTS.cw.dmdMax).toBe(0.68);
  });

  it.each(DISTRICT_IDS)('%s matches the MVP figure for figure, tunes aside', (id) => {
    const mine = DISTRICTS[id];
    const theirs = mvp.REGIONS[id]!;
    expect(mine.id).toBe(id);
    expect(mine.g).toEqual([...theirs.g]);
    expect(mine.g).toHaveLength(12);
    expect(mine.frost).toEqual([...theirs.frost]);
    expect(mine.head).toEqual([...theirs.head]);
    for (const key of [
      'scale',
      'bmax',
      'dmdMax',
      'dmdMin',
      'dmdDead',
      'cpMax',
      'frostSen',
      'util',
      'peak',
      'annual',
    ] as const) {
      expect(mine[key], key).toBe(theirs[key]);
    }
  });
});

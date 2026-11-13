import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { loadMvp } from '../../test-support/mvp';
import { DISTRICTS } from './districts';

const { mvp } = loadMvp();

describe('district figures', () => {
  it('covers the four launch districts and leaves the Top End out', () => {
    expect(Object.keys(DISTRICTS).sort()).toEqual(['cq', 'cw', 'nsw', 'wv']);
    expect(Object.keys(DISTRICTS).sort()).toEqual([...DISTRICT_IDS].sort());
  });

  it.each(DISTRICT_IDS)('%s matches the MVP figure for figure', (id) => {
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

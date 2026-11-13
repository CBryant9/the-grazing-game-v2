import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { loadCattleMvp, putCattleFarm } from '../../test-support/cattle';
import { makeScenario } from '../../test-support/farms';
import type { Mvp } from '../../test-support/mvp';
import {
  GROUPS,
  HEALTH_COST_PER_HEAD_YEAR,
  MARKET_CLASSES,
  SALE_CLASSES,
  type GroupId,
} from './cattle';
import { FEED_COST } from './feed';

/*
 * The cattle and feed tables against the MVP's own. The figures in the
 * formulas (hay kg, lick lift and so on) are checked where they are used,
 * in the cattle tests.
 */

const { mvp } = loadCattleMvp();
const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

describe('cattle and feed tables, against the MVP', () => {
  it('has the same saleyard classes', () => {
    expect(plain(SALE_CLASSES)).toEqual(plain(mvp.BUYS));
  });

  it('has the same feed prices', () => {
    expect(plain(FEED_COST)).toEqual(plain(mvp.FEED));
  });

  it('has the same group names, for one and for several', () => {
    for (const [key, name] of Object.entries(mvp.GROUPS)) {
      expect(GROUPS[key as GroupId].name, key).toBe(name);
    }
    expect(Object.keys(GROUPS).sort()).toEqual(Object.keys(mvp.GNAME).sort());
    for (const [key, [one, many]] of Object.entries(mvp.GNAME)) {
      expect([GROUPS[key as GroupId].one, GROUPS[key as GroupId].many], key).toEqual([one, many]);
    }
  });

  it('has the same market classes, and no prices', () => {
    expect(Object.keys(MARKET_CLASSES)).toEqual(Object.keys(mvp.MCLS));
    for (const [key, [name]] of Object.entries(mvp.MCLS)) {
      expect(MARKET_CLASSES[key as keyof typeof MARKET_CLASSES], key).toBe(name);
    }
  });

  it.each(DISTRICT_IDS)('%s has the same health cost a head', (id) => {
    const scn = makeScenario(mvp as unknown as Mvp, {
      district: id,
      start: { year: 2023, month: 0 },
    });
    putCattleFarm(mvp, scn);
    expect(HEALTH_COST_PER_HEAD_YEAR[id]).toBe(mvp.health());
  });
});

import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it } from 'vitest';
import { SQUARE_SAMPLES, makeScenario, putFarm, refreshPlantings } from '../../test-support/farms';
import { loadMvp } from '../../test-support/mvp';
import { DISTRICTS } from '../data/districts';
import { GRID_N } from '../grid';
import { PHASE_LABELS, phaseOf, type PhaseId } from './phase';
import { cellQuality, meFromDmd } from './quality';
import { LAND, createPastureState } from './state';

/*
 * Feed quality and phase labels against the MVP's cellQuality and phaseOf.
 * Every number must be exactly equal. Nothing here uses a tolerance.
 */

const { mvp } = loadMvp();

describe('feed quality on a square, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: every kind of square gives the same diet', (id) => {
    // Two passes. On the second, every planting is 45 days older, so the
    // crops and sown pastures are seen at different points in their stages.
    for (const day of [0, 45]) {
      const scn = makeScenario(mvp, {
        district: id,
        start: { year: 2022, month: 3 },
        day,
        landUses: true,
        seed: 3 + day,
      });
      for (const f of scn.fields) f.sown -= day;
      putFarm(mvp, scn);
      const plantings = refreshPlantings(mvp, scn);
      for (let i = 0; i < GRID_N; i++) {
        const mine = cellQuality(scn.state, DISTRICTS[id], plantings, i);
        const theirs = mvp.cellQuality(i);
        const where = `${id} day ${day} square ${i}`;
        expect(mine.pg, `pg ${where}`).toBe(theirs.pg);
        expect(mine.dmd, `dmd ${where}`).toBe(theirs.dmd);
        expect(mine.cp, `cp ${where}`).toBe(theirs.cp);
        expect(mine.dmdG, `dmdG ${where}`).toBe(theirs.dmdG);
        expect(mine.cpG, `cpG ${where}`).toBe(theirs.cpG);
        expect(mine.me, `me ${where}`).toBe(mvp.ME(theirs.dmd));
      }
    }
  });

  it('turns digestibility into energy the way the MVP does', () => {
    for (const dmd of [0.42, 0.45, 0.5, 0.58, 0.66, 0.72, 0.84]) {
      expect(meFromDmd(dmd)).toBe(mvp.ME(dmd));
    }
    // 65% digestible feed is about 9.5 MJ/kg DM.
    expect(meFromDmd(0.65)).toBeCloseTo(9.47, 2);
  });
});

describe('what feed quality does', () => {
  const cq = DISTRICTS.cq;

  it('gives stubble and fallow their fixed figures', () => {
    const s = createPastureState();
    s.land[0] = LAND.stubble;
    s.land[1] = LAND.fallow;
    s.D.fill(2000);
    expect(cellQuality(s, cq, null, 0)).toMatchObject({ pg: 0, dmd: 0.45, cp: 4 });
    expect(cellQuality(s, cq, null, 1)).toMatchObject({ pg: 0, dmd: 0.42, cp: 3 });
  });

  it('rates young green leaf above old rank leaf', () => {
    const s = createPastureState();
    s.G.fill(1500);
    s.D.fill(500);
    s.A[0] = 10;
    s.A[1] = 150;
    s.X[1] = 0.8;
    const young = cellQuality(s, cq, null, 0);
    const old = cellQuality(s, cq, null, 1);
    expect(young.dmd).toBeGreaterThan(old.dmd);
    expect(young.cp).toBeGreaterThan(old.cp);
    expect(young.me).toBeGreaterThan(old.me);
  });
});

describe('phase labels, against the MVP', () => {
  it.each(DISTRICT_IDS)('%s: every square gets the same label', (id) => {
    const scn = makeScenario(mvp, { district: id, start: { year: 2022, month: 3 }, seed: 5 });
    putFarm(mvp, scn);
    for (let i = 0; i < GRID_N; i++) {
      expect(PHASE_LABELS[phaseOf(scn.state, i)], `square ${i}`).toBe(mvp.phaseOf(i));
    }
  });

  it('the sample squares reach every label', () => {
    const scn = makeScenario(mvp, { district: 'cq', start: { year: 2022, month: 3 } });
    const seen = new Set<PhaseId>();
    for (let i = 0; i < SQUARE_SAMPLES.length; i++) seen.add(phaseOf(scn.state, i));
    expect([...seen].sort()).toEqual(Object.keys(PHASE_LABELS).sort());
  });

  it('uses describing words only', () => {
    for (const label of Object.values(PHASE_LABELS)) {
      expect(label.toLowerCase()).not.toMatch(/overgraz|undergraz|zone|buffer/);
    }
  });
});

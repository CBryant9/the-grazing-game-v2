import { describe, expect, it } from 'vitest';
import { toSaleDay, work } from '../../test-support/workingDay';
import type { Animal } from '../cattle/types';
import { createFarm } from '../sim/create';
import { surveyOf } from '../sim/derived';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { knownClassOf, knownGroupOf } from '../sim/told';
import { applyAction } from '../day/act';

/*
 * A player picks cattle from what they know (milestone 1.7f). Selling by
 * sale group and moving part of a mob by class take the animals the mob card
 * lists, by `knownGroupOf` and `knownClassOf`: never by live pregnancy, which
 * a grazier can not see before a preg test.
 */

const inCalf = (a: Animal): boolean => (a.kind === 'cow' || a.kind === 'heifer') && a.preg >= 0;

/** A running farm part way into a joining, with nothing known in calf: an untested joined mob. */
function untestedJoined(): FarmState {
  const farm = createFarm({
    seed: 21,
    district: 'nsw',
    size: 'small',
    start: { year: 2023, month: 8 },
    startType: 'running',
    difficulty: 'medium',
  });
  for (let d = 0; d < 400; d++) {
    stepDay(farm);
    const cows = farm.mobs.flatMap((m) => m.animals).filter((a) => a.kind === 'cow');
    if (cows.filter(inCalf).length >= 5 && cows.some((a) => !inCalf(a))) break;
  }
  // No preg test since: the player knows no cow is in calf.
  farm.knownInCalf = new Int32Array(0);
  return farm;
}

const known = (farm: FarmState) => new Set(farm.knownInCalf);
const cowMob = (farm: FarmState) =>
  farm.mobs.find((m) => m.animals.some((a) => a.kind === 'cow' && inCalf(a)))!;

describe('selling by sale group picks by what the player knows', () => {
  it('"cows not in calf" in an untested mob: the head sold is the head asked for, in-calf cows included', () => {
    const farm = toSaleDay(untestedJoined());
    const m = cowMob(farm);
    const k = known(farm);
    const empties = m.animals.filter((a) => a.kind !== 'calf' && knownGroupOf(a, k) === 'cowE');
    const reallyInCalf = empties.filter(inCalf).length;
    expect(reallyInCalf).toBeGreaterThan(0);
    const before = new Set(m.animals.map((a) => a.id));
    const done = work(farm, { type: 'sellGroup', mob: m.id, group: 'cowE', qty: empties.length });
    const left = new Set(done.farm.mobs.flatMap((x) => x.animals.map((a) => a.id)));
    const soldIds = [...before].filter((id) => !left.has(id));
    const soldCows = m.animals.filter((a) => a.kind === 'cow' && soldIds.includes(a.id));
    expect(soldCows.length).toBe(empties.length);
    expect(soldCows.filter(inCalf).length).toBe(reallyInCalf);
  });

  it('the PTIC group of an untested mob sells none', () => {
    const farm = toSaleDay(untestedJoined());
    const m = cowMob(farm);
    const r = applyAction(farm, { type: 'sellGroup', mob: m.id, group: 'cowP', qty: 50 });
    if (r.ok) {
      const left = r.farm.mobs.find((x) => x.id === m.id)!;
      expect(left.animals.filter((a) => a.kind === 'cow').length).toBe(
        m.animals.filter((a) => a.kind === 'cow').length,
      );
    } else {
      expect(r.ok).toBe(false);
    }
  });
});

describe('moving part of a mob by class picks by what the player knows', () => {
  /** A square on the farm outside the mob's own area, to move to. */
  function elsewhere(farm: FarmState, from: number): number {
    const s = surveyOf(farm);
    const here = s.topology.areaOf[from];
    const area = s.topology.areas.find((a) => a.id !== here)!;
    return area.cells[0]!;
  }

  it('moving every "dry cow" row takes in-calf cows the player was never told about', () => {
    const farm = untestedJoined();
    const m = cowMob(farm);
    const k = known(farm);
    const rows = new Map<string, Animal[]>();
    for (const a of m.animals) {
      if (a.kind !== 'cow') continue;
      const c = knownClassOf(a, k);
      rows.set(c, [...(rows.get(c) ?? []), a]);
    }
    expect(rows.has('pticCow')).toBe(false);
    const [cls, list] = [...rows].sort(
      (x, y) => y[1].filter(inCalf).length - x[1].filter(inCalf).length,
    )[0]!;
    expect(list.filter(inCalf).length).toBeGreaterThan(0);
    const anchor = m.where.kind === 'paddock' ? m.where.anchor : 0;
    const to = elsewhere(farm, anchor);
    const done = work(farm, {
      type: 'moveCattle',
      picks: [{ mob: m.id, cls: cls as never, qty: list.length }],
      to: { cell: to },
    });
    const moved = new Set(
      done.farm.mobs.filter((x) => x.id !== m.id).flatMap((x) => x.animals.map((a) => a.id)),
    );
    const movedCows = list.filter((a) => moved.has(a.id));
    expect(movedCows.length).toBe(list.length);
  });

  it('the PTIC cow class of an untested mob moves none', () => {
    const farm = untestedJoined();
    const m = cowMob(farm);
    const anchor = m.where.kind === 'paddock' ? m.where.anchor : 0;
    const r = applyAction(farm, {
      type: 'moveCattle',
      picks: [{ mob: m.id, cls: 'pticCow', qty: 20 }],
      to: { cell: elsewhere(farm, anchor) },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('nothing-to-move');
  });
});

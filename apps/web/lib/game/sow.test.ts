import { describe, expect, it } from 'vitest';
import { FARM_GRID_N } from '@gg/shared';
import { dragPick, newPick, paddockArable, pickDraft, rectCells, sowCells, union } from './sow';

/** A farm of 1,040 squares: arable in the box from square 41 to 82, in paddock 1 on the left half. */
function view() {
  const arable = new Array<number>(FARM_GRID_N).fill(0);
  const paddock = new Array<number>(FARM_GRID_N).fill(0);
  for (let i = 0; i < FARM_GRID_N; i++) paddock[i] = i % 40 < 20 ? 1 : 2;
  for (const i of [41, 42, 43, 81, 82, 83, 61]) arable[i] = 1;
  return { squares: { arable, paddock } } as unknown as Parameters<typeof paddockArable>[0];
}

describe('picking squares to sow', () => {
  it('a box runs corner to corner, whichever way it is dragged', () => {
    expect(rectCells(41, 43)).toEqual([41, 42, 43]);
    expect(rectCells(83, 41)).toEqual([41, 42, 43, 81, 82, 83]);
    expect(rectCells(41, 41)).toEqual([41]);
    expect(rectCells(-1, 5)).toEqual([]);
    expect(rectCells(5, FARM_GRID_N)).toEqual([]);
  });

  it('a drag keeps only arable squares and adds to what was picked', () => {
    const v = view();
    let p = { ...newPick(1), picking: true };
    p = dragPick(p, v, { phase: 'start', square: 41 });
    expect(p.live).toEqual([41]);
    p = dragPick(p, v, { phase: 'move', square: 83 });
    // 61 is arable too but sits outside the box's columns, so it is left out.
    expect(p.live).toEqual([41, 42, 43, 81, 82, 83]);
    p = dragPick(p, v, { phase: 'end', square: 83 });
    expect(p.cells).toEqual([41, 42, 43, 81, 82, 83]);
    expect(p.live).toEqual([]);
    expect(p.from).toBeNull();
    // A second drag over bare ground adds nothing; over more arable land it adds.
    p = dragPick(p, v, { phase: 'start', square: 200 });
    p = dragPick(p, v, { phase: 'end', square: 205 });
    expect(p.cells).toHaveLength(6);
    p = dragPick(p, v, { phase: 'start', square: 61 });
    p = dragPick(p, v, { phase: 'end', square: 61 });
    expect(p.cells).toContain(61);
  });

  it('ignores a drag when the map is not picking', () => {
    const v = view();
    const p = newPick(1);
    expect(dragPick(p, v, { phase: 'start', square: 41 })).toBe(p);
  });

  it('all the arable land in a paddock, or the squares picked', () => {
    const v = view();
    expect(paddockArable(v, 1)).toEqual([41, 42, 43, 81, 82, 83]);
    expect(paddockArable(v, 2)).toEqual([61]);
    const p = { ...newPick(1), cells: [41, 42] };
    expect(sowCells(p, v, 'all')).toEqual([41, 42, 43, 81, 82, 83]);
    expect(sowCells(p, v, 'picked')).toEqual([41, 42]);
    expect(union([1, 2], [2, 3])).toEqual([1, 2, 3]);
  });

  it('marks the picked squares on the map only while picking', () => {
    expect(pickDraft(null)).toBeNull();
    expect(pickDraft({ ...newPick(1), cells: [41] })).toBeNull();
    const d = pickDraft({ ...newPick(1), picking: true, cells: [41], live: [42] });
    expect(d?.squares.map((s) => s.cell)).toEqual([41, 42]);
  });
});

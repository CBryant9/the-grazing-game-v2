import { describe, expect, it } from 'vitest';
import {
  edgeSquare,
  firstSteps,
  mobSquare,
  parseFirstOff,
  todoGo,
  type FirstStepFarm,
} from './nextsteps';

const paddock = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  ha: 1200,
  water: 'own',
  mobs: [] as number[],
  cell: 100 + id,
  ...over,
});

const farm = (over: Partial<Record<keyof FirstStepFarm, unknown>> = {}): FirstStepFarm =>
  ({
    paddocks: [paddock(0), paddock(1)],
    mobs: [{ id: 7 }],
    view: { water: { bore: 85 } },
    ...over,
  }) as unknown as FirstStepFarm;

describe('first steps (19 Nov 2026: what to do next is obvious)', () => {
  it('a farm with water, fences and stock shows none', () => {
    expect(firstSteps(farm())).toEqual([]);
  });

  it('no stock water: a fact, and the trough tool on the bore', () => {
    const steps = firstSteps(
      farm({ paddocks: [paddock(0, { water: 'none' }), paddock(1, { water: 'none' })] }),
    );
    expect(steps).toEqual([
      {
        key: 'water',
        text: 'No paddock has stock water yet. Water starts at the bore.',
        button: 'Put in a trough',
        go: { kind: 'tool', tool: 'trough', square: 85 },
      },
    ]);
  });

  it('a paddock watered through a gate counts as water', () => {
    expect(firstSteps(farm({ paddocks: [paddock(0), paddock(1, { water: 'gate' })] }))).toEqual([]);
  });

  it('one big paddock: its size, and the fence tool', () => {
    const [s] = firstSteps(farm({ paddocks: [paddock(0, { ha: 2400 })] }));
    expect(s).toMatchObject({
      key: 'paddocks',
      text: 'The whole farm is one paddock of 2,400 ha.',
      go: { kind: 'tool', tool: 'fence', square: null },
    });
  });

  it('no stock: the market', () => {
    const [s] = firstSteps(farm({ mobs: [] }));
    expect(s).toMatchObject({ key: 'stock', go: { kind: 'tab', tab: 'market' } });
  });

  it('in order water, fences, stock, and each can be put away', () => {
    const bare = farm({ paddocks: [paddock(0, { water: 'none' })], mobs: [] });
    expect(firstSteps(bare).map((s) => s.key)).toEqual(['water', 'paddocks', 'stock']);
    expect(firstSteps(bare, ['paddocks']).map((s) => s.key)).toEqual(['water', 'stock']);
  });

  it('states facts only: no praise, no blame, no telling off', () => {
    const bare = farm({ paddocks: [paddock(0, { water: 'none' })], mobs: [] });
    for (const s of firstSteps(bare)) {
      expect(s.text).not.toMatch(/!|should|must|great|well done|bad|poor/i);
    }
  });
});

describe('where a Things to do button takes the player', () => {
  it('a mob with no water gets the trough tool on its paddock', () => {
    const f = farm({ paddocks: [paddock(0, { mobs: [7], cell: 321 })] });
    expect(todoGo(f, { key: 'no-water:7', mob: 7 })).toEqual({
      button: 'Put in a trough',
      go: { kind: 'tool', tool: 'trough', square: 321 },
    });
    expect(todoGo(f, { key: 'low-condition:7', mob: 7 })).toBeNull();
    expect(mobSquare(f, 9)).toBeNull();
  });

  it('a fence that is down frames the square beside it', () => {
    // Row line 3, column 5: the square below it.
    expect(edgeSquare({ line: 'h', index: 3 * 40 + 5 })).toBe(3 * 40 + 5);
    // The bottom boundary: the square above it.
    expect(edgeSquare({ line: 'h', index: 26 * 40 + 5 })).toBe(25 * 40 + 5);
    expect(edgeSquare(null)).toBeNull();
  });

  it('reads back what was put away, and ignores anything else', () => {
    expect(parseFirstOff('["water"]')).toEqual(['water']);
    expect(parseFirstOff('{"x":1}')).toEqual([]);
    expect(parseFirstOff('not json')).toEqual([]);
    expect(parseFirstOff(null)).toEqual([]);
  });
});

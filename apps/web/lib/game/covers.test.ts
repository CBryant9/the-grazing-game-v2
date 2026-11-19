import { describe, expect, it } from 'vitest';
import { insetsOf, revealMove } from './covers';

// A phone held upright: the map is 375 by 750, the top bar takes 0 to 200, the tray 450 to 750.
const W = 375;
const H = 750;
const top = { x0: 8, y0: 8, x1: 367, y1: 200 };
const tray = { x0: 0, y0: 450, x1: W, y1: H };

describe('keeping the map clear of the bars (19 Nov 2026)', () => {
  it('a cover on each edge hides that edge as far as it reaches', () => {
    expect(insetsOf({ top: [top], bottom: [tray] }, W, H)).toEqual({
      top: 200,
      bottom: 300,
      left: 0,
      right: 0,
    });
    // On its side: a tool column at the left and a card at the right.
    expect(
      insetsOf(
        {
          left: [{ x0: 8, y0: 200, x1: 400, y1: 280 }],
          right: [{ x0: 500, y0: 8, x1: 740, y1: 200 }],
        },
        748,
        285,
      ),
    ).toEqual({ top: 0, bottom: 0, left: 400, right: 248 });
  });

  it('a line ending under the tray is moved up just clear of it', () => {
    const [dx, dy] = revealMove({ x: 120, y: 600 }, [top, tray], W, H, 24);
    expect(dx).toBe(0);
    expect(600 + dy).toBe(450 - 24);
  });

  it('a line already in the clear is left where it is', () => {
    expect(revealMove({ x: 120, y: 320 }, [top, tray], W, H, 24)).toEqual([0, 0]);
  });

  it('on its side, a line under the tool column moves the shortest way out', () => {
    const column = { x0: 8, y0: 150, x1: 400, y1: 280 };
    const card = { x0: 500, y0: 8, x1: 740, y1: 200 };
    // Near the column's top edge: up is shortest.
    expect(revealMove({ x: 300, y: 160 }, [column, card], 748, 285, 12)).toEqual([0, -22]);
    // Near its right edge: right is shortest.
    expect(revealMove({ x: 395, y: 260 }, [column, card], 748, 285, 12)).toEqual([17, 0]);
  });

  it('when nothing would clear it, the map stays put', () => {
    expect(revealMove({ x: 100, y: 100 }, [{ x0: 0, y0: 0, x1: 200, y1: 200 }], 200, 200)).toEqual([
      0, 0,
    ]);
  });
});

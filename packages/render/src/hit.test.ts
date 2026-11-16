import { describe, expect, it } from 'vitest';
import { lookAt, worldToScreen, type Viewport } from './camera';
import { allLooks } from './grass';
import { GROUND_SQUASH } from './grid';
import { hitTest, squareAtScreen, squareAtWorld } from './hit';
import { placeCattle } from './cattle';
import { RANK, SHORT, cell, mob, sampleView, setSquare } from './testing/sampleView';

const VP: Viewport = { width: 1000, height: 700 };

describe('a tap is turned into a square', () => {
  it('the middle of each square, on the flat map', () => {
    for (const [col, row] of [
      [0, 0],
      [39, 0],
      [0, 25],
      [39, 25],
      [17, 11],
    ] as const) {
      expect(squareAtWorld(col + 0.5, (row + 0.5) * GROUND_SQUASH)).toBe(cell(col, row));
    }
  });

  it('the ground is squashed: a square is 1 wide and 0.7 deep on the map', () => {
    expect(squareAtWorld(3.2, 0.69)).toBe(cell(3, 0));
    expect(squareAtWorld(3.2, 0.71)).toBe(cell(3, 1));
  });

  it('off the farm is no square', () => {
    expect(squareAtWorld(-0.1, 5)).toBe(-1);
    expect(squareAtWorld(40.01, 5)).toBe(-1);
    expect(squareAtWorld(5, -0.1)).toBe(-1);
    expect(squareAtWorld(5, 26 * GROUND_SQUASH + 0.01)).toBe(-1);
  });

  it('through the camera, wherever it is looking and however far in', () => {
    for (const zoom of [12, 26, 60, 96]) {
      const cam = lookAt(VP, zoom, 23, 9);
      const s = worldToScreen(cam, VP, 25.5, 12.5 * GROUND_SQUASH);
      expect(squareAtScreen(cam, VP, s.x, s.y)).toBe(cell(25, 12));
    }
  });
});

describe('a tap opens the paddock, never a cow', () => {
  it('reports the square, its paddock and its grazing area', () => {
    const view = sampleView();
    const cam = lookAt(VP, 40, 20, 9);
    const left = worldToScreen(cam, VP, 12.5, 8.5 * GROUND_SQUASH);
    const right = worldToScreen(cam, VP, 27.5, 8.5 * GROUND_SQUASH);
    expect(hitTest(view, cam, VP, left.x, left.y)).toEqual({
      square: cell(12, 8),
      col: 12,
      row: 8,
      paddock: 0,
      paddockName: 'Paddock 1',
      area: 0,
    });
    expect(hitTest(view, cam, VP, right.x, right.y)?.paddockName).toBe('Paddock 2');
  });

  it('a tap right on a beast still gives the paddock under it', () => {
    const view = sampleView();
    view.mobs = [mob()];
    const beast = placeCattle(view)[0]!.beasts[0]!;
    const cam = lookAt(VP, 60, beast.x, beast.y * GROUND_SQUASH);
    const s = worldToScreen(cam, VP, beast.x, beast.y * GROUND_SQUASH);
    const hit = hitTest(view, cam, VP, s.x, s.y)!;
    expect(hit.square).toBe(cell(Math.floor(beast.x), Math.floor(beast.y)));
    expect(hit.paddock).toBe(0);
    // The hit has a square and a paddock and nothing about cattle.
    expect(Object.keys(hit).sort()).toEqual(
      ['area', 'col', 'paddock', 'paddockName', 'row', 'square'].sort(),
    );
  });

  it('off the farm is nothing', () => {
    const view = sampleView();
    const cam = lookAt(VP, 12, 20, 9);
    expect(hitTest(view, cam, VP, 2, 2)).toBeNull();
  });
});

describe('zoomed out, squares are drawn raised and the tap is tested against what is drawn', () => {
  it('a tall square covers the bottom of the square behind it', () => {
    const view = sampleView();
    // A rank, tall square at (10, 12), with short grass behind it at (10, 11).
    setSquare(view, cell(10, 12), RANK);
    setSquare(view, cell(10, 11), SHORT);
    const raise = allLooks(view).map((l) => l.raise);
    const tall = raise[cell(10, 12)]!;
    const short = raise[cell(10, 11)]!;
    expect(tall).toBeGreaterThan(short + 0.2);

    // A point just above the tall square's ground line: on the flat map that is the square behind.
    const wy = 12 * GROUND_SQUASH - tall * 0.5;
    expect(squareAtWorld(10.5, wy)).toBe(cell(10, 11));
    // Drawn raised, the tall square's top is what is there.
    expect(squareAtWorld(10.5, wy, raise)).toBe(cell(10, 12));
    // Higher than the tall square reaches, it is the square behind again.
    expect(squareAtWorld(10.5, 12 * GROUND_SQUASH - tall - 0.02, raise)).toBe(cell(10, 11));
  });

  it('the front face of a raised square belongs to that square', () => {
    const view = sampleView();
    setSquare(view, cell(4, 25), RANK);
    const raise = allLooks(view).map((l) => l.raise);
    // Just above the bottom edge of the farm, in the bottom row.
    expect(squareAtWorld(4.5, 26 * GROUND_SQUASH - 0.01, raise)).toBe(cell(4, 25));
  });

  it('with nothing raised, the raised test and the flat test agree everywhere', () => {
    const flat = new Float32Array(1040);
    for (let k = 0; k < 500; k++) {
      const wx = (k * 0.0803) % 40;
      const wy = (k * 0.0367) % (26 * GROUND_SQUASH);
      expect(squareAtWorld(wx, wy, flat)).toBe(squareAtWorld(wx, wy));
    }
  });
});

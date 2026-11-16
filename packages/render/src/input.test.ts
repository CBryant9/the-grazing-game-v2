import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fitFarm, type Camera, type Viewport } from './camera';
import { attachInput, type InputMode, type InputTarget } from './input';

/*
 * No tool changes the zoom by itself, and pinch and wheel zoom work in every
 * tool, drawing ones included (Claudia, 14 Nov 2026: "They should be able to
 * zoom it to where they want and then draw the pipe").
 */

type Listener = (e: unknown) => void;

/** Just enough of an element and a window for the input code, with no browser. */
class FakeTarget {
  private readonly on = new Map<string, Listener[]>();
  style: Record<string, string> = {};
  addEventListener(type: string, fn: Listener): void {
    this.on.set(type, [...(this.on.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.on.set(
      type,
      (this.on.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  fire(type: string, e: Record<string, unknown>): void {
    for (const fn of this.on.get(type) ?? []) fn({ preventDefault() {}, ...e });
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 400, height: 300 };
  }
  setPointerCapture(): void {}
}

const vp: Viewport = { width: 400, height: 300 };
let win: FakeTarget;
const saved = (globalThis as { window?: unknown }).window;

beforeEach(() => {
  win = new FakeTarget();
  (globalThis as { window?: unknown }).window = win;
});
afterEach(() => {
  (globalThis as { window?: unknown }).window = saved;
});

function setUp(mode: InputMode) {
  const el = new FakeTarget();
  let cam: Camera = fitFarm(vp, 'auto');
  const drags: string[] = [];
  const target: InputTarget = {
    mode: () => mode,
    drag: (phase) => drags.push(phase),
    camera: () => cam,
    viewport: () => vp,
    moveTo: (c) => {
      cam = c;
    },
    tap: () => {},
    hover: () => {},
    fit: () => {
      cam = fitFarm(vp, 'auto');
    },
  };
  attachInput(el as unknown as HTMLElement, target);
  return { el, cam: () => cam, drags };
}

const touch = (id: number, x: number, y: number) => ({
  pointerId: id,
  pointerType: 'touch',
  button: 0,
  clientX: x,
  clientY: y,
});

describe.each(['pan', 'draw'] as const)('zooming in a %s tool', (mode) => {
  it('the wheel zooms', () => {
    const { el, cam } = setUp(mode);
    const before = cam().zoom;
    el.fire('wheel', { clientX: 200, clientY: 150, deltaY: -200, deltaMode: 0, ctrlKey: false });
    expect(cam().zoom).toBeGreaterThan(before);
  });

  it('two fingers pinch, and nothing is drawn by the pinch', () => {
    const { el, cam, drags } = setUp(mode);
    const before = cam().zoom;
    el.fire('pointerdown', touch(1, 180, 150));
    el.fire('pointerdown', touch(2, 220, 150));
    el.fire('pointermove', touch(2, 300, 150));
    el.fire('pointerup', touch(2, 300, 150));
    el.fire('pointerup', touch(1, 180, 150));
    expect(cam().zoom).toBeGreaterThan(before);
    expect(drags).toEqual([]);
  });

  it('picking the tool and drawing do not change the zoom', () => {
    const { el, cam } = setUp(mode);
    const before = cam().zoom;
    el.fire('pointerdown', touch(1, 100, 100));
    el.fire('pointermove', touch(1, 160, 100));
    el.fire('pointerup', touch(1, 160, 100));
    expect(cam().zoom).toBe(before);
  });
});

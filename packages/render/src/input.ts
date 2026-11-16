/**
 * Touch, mouse and keyboard on the map.
 *
 * Touch: one finger drags, two fingers pinch. Mouse: drag to pan, wheel to
 * zoom at the pointer. Keyboard: arrows pan, plus and minus zoom, 0 shows
 * the whole farm. A press that does not move is a tap: the map reports the
 * square and paddock under it, never a cow (CLAUDE.md rule 7).
 *
 * In a drawing tool (`mode()` is `draw`) one finger or the left button
 * draws instead of panning. Two fingers still pan and pinch. On a PC, hold
 * the space bar or use the middle button to pan.
 */

import { panBy, pinch, zoomAt, type Camera, type Point, type Viewport } from './camera';

/** `pan`: a drag moves the map. `draw`: a drag draws, and the map is moved another way. */
export type InputMode = 'pan' | 'draw';

export type DragPhase = 'start' | 'move' | 'end';

export interface InputTarget {
  /** What a one-finger drag does now. */
  mode(): InputMode;
  /** A drawing drag, in screen pixels from the top left of the map. */
  drag(phase: DragPhase, point: Point): void;
  camera(): Camera;
  viewport(): Viewport;
  /** Take a new camera from a gesture. */
  moveTo(cam: Camera): void;
  tap(x: number, y: number): void;
  /** The mouse is over a point, or has left the map (null). */
  hover(point: Point | null): void;
  fit(): void;
}

/** A press that moves less than this many pixels is a tap. Fingers get more slack than a mouse. */
export const TAP_SLOP = { mouse: 5, touch: 12 } as const;

export interface InputHandle {
  /** Take the cursor for the current mode (call after the mode changes). */
  refreshCursor(): void;
  /** Remove everything. */
  detach(): void;
}

const isFormTarget = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(t.tagName));

/** Wire up the map's input on an element. */
export function attachInput(el: HTMLElement, target: InputTarget): InputHandle {
  const pointers = new Map<number, Point>();
  let downAt: Point | null = null;
  let moved = false;
  let wasPinch = false;
  /** This press draws (a drawing tool, one pointer, no space bar). */
  let drawing = false;
  let drawStarted = false;
  let lastDraw: Point | null = null;
  let space = false;
  let over = false;

  const refreshCursor = (): void => {
    el.style.cursor = target.mode() === 'draw' && !space ? 'crosshair' : 'grab';
  };

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent): void => {
    const middle = e.pointerType === 'mouse' && e.button === 1;
    if (e.pointerType === 'mouse' && e.button !== 0 && !middle) return;
    // The middle button pans in any tool (and would otherwise start the browser's auto-scroll).
    if (middle) e.preventDefault();
    const p = local(e);
    pointers.set(e.pointerId, p);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // Some browsers refuse capture for synthetic events. Dragging still works inside the map.
    }
    if (pointers.size === 1) {
      downAt = p;
      moved = false;
      wasPinch = false;
      drawing = target.mode() === 'draw' && !space && !middle;
      drawStarted = false;
      lastDraw = null;
    } else {
      // A second finger: the line drawn so far stays, and the two fingers move the map.
      if (drawing && drawStarted && lastDraw) target.drag('end', lastDraw);
      drawing = false;
      drawStarted = false;
      wasPinch = true;
    }
  };

  const onMove = (e: PointerEvent): void => {
    const p = local(e);
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === 'mouse') target.hover(p);
      return;
    }
    const vp = target.viewport();
    if (pointers.size === 1) {
      const slop = e.pointerType === 'mouse' ? TAP_SLOP.mouse : TAP_SLOP.touch;
      if (!moved && downAt && Math.hypot(p.x - downAt.x, p.y - downAt.y) < slop) return;
      if (drawing) {
        if (!drawStarted) {
          drawStarted = true;
          moved = true;
          target.hover(null);
          target.drag('start', downAt ?? p);
        }
        lastDraw = p;
        target.drag('move', p);
        pointers.set(e.pointerId, p);
        return;
      }
      if (!moved) {
        moved = true;
        el.style.cursor = 'grabbing';
        target.hover(null);
        // Start the drag from where the finger is now, so the map does not jump by the slop.
        pointers.set(e.pointerId, p);
        return;
      }
      target.moveTo(panBy(target.camera(), vp, p.x - prev.x, p.y - prev.y));
      pointers.set(e.pointerId, p);
    } else if (pointers.size === 2) {
      const ids = [...pointers.keys()];
      const otherId = ids[0] === e.pointerId ? ids[1]! : ids[0]!;
      const other = pointers.get(otherId)!;
      target.moveTo(pinch(target.camera(), vp, prev, other, p, other));
      pointers.set(e.pointerId, p);
      moved = true;
    } else {
      pointers.set(e.pointerId, p);
    }
  };

  const onUp = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      if (drawing && drawStarted) target.drag('end', e.type === 'pointerup' ? p : (lastDraw ?? p));
      refreshCursor();
      if (!moved && !wasPinch && e.type === 'pointerup') target.tap(p.x, p.y);
      downAt = null;
      drawing = false;
      drawStarted = false;
      lastDraw = null;
    }
  };

  const onEnter = (): void => {
    over = true;
  };

  const onLeave = (): void => {
    over = false;
    target.hover(null);
  };

  /** Holding the space bar pans in a drawing tool. It only counts over the map, and not from a button. */
  const spaceKey = (e: KeyboardEvent, down: boolean): void => {
    if (e.code !== 'Space' || isFormTarget(e.target)) return;
    if (!over && document.activeElement !== el) return;
    if (down !== space) {
      space = down;
      refreshCursor();
    }
    e.preventDefault();
  };
  const onSpaceDown = (e: KeyboardEvent): void => spaceKey(e, true);
  const onSpaceUp = (e: KeyboardEvent): void => spaceKey(e, false);
  const onBlur = (): void => {
    if (space) {
      space = false;
      refreshCursor();
    }
  };

  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const p = local(e);
    // A pinch on a trackpad arrives as a wheel with ctrl held, in finer steps.
    const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-step * (e.ctrlKey ? 0.01 : 0.0016));
    const cam = target.camera();
    target.moveTo(zoomAt(cam, target.viewport(), cam.zoom * factor, p.x, p.y));
  };

  const onKey = (e: KeyboardEvent): void => {
    const vp = target.viewport();
    const cam = target.camera();
    const step = 64;
    const mid = { x: vp.width / 2, y: vp.height / 2 };
    switch (e.key) {
      case 'ArrowLeft':
        target.moveTo(panBy(cam, vp, step, 0));
        break;
      case 'ArrowRight':
        target.moveTo(panBy(cam, vp, -step, 0));
        break;
      case 'ArrowUp':
        target.moveTo(panBy(cam, vp, 0, step));
        break;
      case 'ArrowDown':
        target.moveTo(panBy(cam, vp, 0, -step));
        break;
      case '+':
      case '=':
        target.moveTo(zoomAt(cam, vp, cam.zoom * 1.25, mid.x, mid.y));
        break;
      case '-':
      case '_':
        target.moveTo(zoomAt(cam, vp, cam.zoom / 1.25, mid.x, mid.y));
        break;
      case '0':
        target.fit();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('keydown', onKey);
  window.addEventListener('keydown', onSpaceDown);
  window.addEventListener('keyup', onSpaceUp);
  window.addEventListener('blur', onBlur);
  return {
    refreshCursor,
    detach() {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerenter', onEnter);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onSpaceDown);
      window.removeEventListener('keyup', onSpaceUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}

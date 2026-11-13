/**
 * Touch, mouse and keyboard on the map.
 *
 * Touch: one finger drags, two fingers pinch. Mouse: drag to pan, wheel to
 * zoom at the pointer. Keyboard: arrows pan, plus and minus zoom, 0 shows
 * the whole farm. A press that does not move is a tap: the map reports the
 * square and paddock under it, never a cow (CLAUDE.md rule 7).
 */

import { panBy, pinch, zoomAt, type Camera, type Point, type Viewport } from './camera';

export interface InputTarget {
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

/** Wire up the map's input on an element. Returns a function that removes it all. */
export function attachInput(el: HTMLElement, target: InputTarget): () => void {
  const pointers = new Map<number, Point>();
  let downAt: Point | null = null;
  let moved = false;
  let wasPinch = false;

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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
    } else {
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
      el.style.cursor = 'grab';
      if (!moved && !wasPinch && e.type === 'pointerup') target.tap(p.x, p.y);
      downAt = null;
    }
  };

  const onLeave = (): void => target.hover(null);

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
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('keydown', onKey);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('keydown', onKey);
  };
}

/**
 * What the page lays over the map, and how the map keeps clear of it (19 Nov
 * 2026: "the build tray must not cover where the player is drawing"). On a
 * phone held upright the top bar and the build tray cover the top and
 * bottom; on its side the tool column and the job card cover the left and
 * right. Pure arithmetic on boxes in map pixels, so it can be tested
 * without a screen.
 */

/** A box in CSS pixels from the map's top left. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type CoverEdge = 'top' | 'bottom' | 'left' | 'right';

/** How far each edge of the map is covered, in CSS pixels. */
export interface EdgeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The insets the covers make: a cover on the top edge hides down to its bottom, and so on. */
export function insetsOf(
  covers: Partial<Record<CoverEdge, readonly Box[]>>,
  width: number,
  height: number,
): EdgeInsets {
  const most = (boxes: readonly Box[] | undefined, f: (b: Box) => number): number =>
    Math.max(0, ...(boxes ?? []).map(f));
  return {
    top: Math.min(
      height,
      most(covers.top, (b) => b.y1),
    ),
    bottom: Math.min(
      height,
      most(covers.bottom, (b) => height - b.y0),
    ),
    left: Math.min(
      width,
      most(covers.left, (b) => b.x1),
    ),
    right: Math.min(
      width,
      most(covers.right, (b) => width - b.x0),
    ),
  };
}

const inside = (x: number, y: number, b: Box): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/**
 * How far to move the map (a drag, in CSS pixels) so a point is out from
 * under every cover, with `pad` to spare and still on the map. The shortest
 * move wins. [0, 0] when the point is already clear, or when no move clears it.
 */
export function revealMove(
  p: { x: number; y: number },
  boxes: readonly Box[],
  width: number,
  height: number,
  pad = 24,
): [number, number] {
  const grown = boxes.map((b) => ({
    x0: b.x0 - pad,
    y0: b.y0 - pad,
    x1: b.x1 + pad,
    y1: b.y1 + pad,
  }));
  const hit = grown.filter((b) => inside(p.x, p.y, b));
  if (!hit.length) return [0, 0];
  const tries: [number, number][] = [];
  for (const b of hit) {
    tries.push([0, b.y0 - p.y], [0, b.y1 - p.y], [b.x0 - p.x, 0], [b.x1 - p.x, 0]);
  }
  const clear = tries.filter(([dx, dy]) => {
    const x = p.x + dx;
    const y = p.y + dy;
    return (
      x >= pad &&
      x <= width - pad &&
      y >= pad &&
      y <= height - pad &&
      !grown.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)
    );
  });
  if (!clear.length) return [0, 0];
  clear.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
  return clear[0]!;
}

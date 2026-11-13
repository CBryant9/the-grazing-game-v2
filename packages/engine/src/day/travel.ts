/**
 * Places and driving on the farm (PRD 5.1 and 5.4).
 *
 * A place is a point on the map, in squares (see `MapPoint`). Driving is
 * the straight-line distance over the farm's real size at 25 km/h. The
 * builder's reading: a straight line, not a route round fences and through
 * gates. Stock walk a route through gates from the next part of this
 * milestone. Vehicles do not.
 */

import { JOB_TIMES } from '../data/jobTimes';
import type { EdgeRef } from '../farm/topology';
import { GRID_W } from '../grid';
import { homesteadPoint, squareCentre } from '../sim/clock';
import type { FarmState, MapPoint } from '../sim/state';

/** The two ends of a fence segment, as grid corners. */
export function edgeEnds(e: EdgeRef): [MapPoint, MapPoint] {
  if (e.line === 'h') {
    const vy = Math.floor(e.index / GRID_W);
    const x = e.index % GRID_W;
    return [
      { x, y: vy },
      { x: x + 1, y: vy },
    ];
  }
  const y = Math.floor(e.index / (GRID_W + 1));
  const vx = e.index % (GRID_W + 1);
  return [
    { x: vx, y },
    { x: vx, y: y + 1 },
  ];
}

/** The grid corner a water hub on a fence line stands on. */
export const vertexPoint = (v: number): MapPoint => ({
  x: v % (GRID_W + 1),
  y: Math.floor(v / (GRID_W + 1)),
});

/** The distance between two places, in squares. */
export const squaresBetween = (a: MapPoint, b: MapPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** The point a share `t` of the way from `a` to `b`. */
export const pointAlong = (a: MapPoint, b: MapPoint, t: number): MapPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** The point on the line from `a` to `b` that is nearest to `p`. */
export function nearestOnLine(p: MapPoint, a: MapPoint, b: MapPoint): MapPoint {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return pointAlong(a, b, t);
}

/** The square of a list whose middle is nearest a place. The first one wins a tie. */
export function nearestSquare(cells: readonly number[], p: MapPoint): number {
  let best = cells[0]!;
  let bestD = Infinity;
  for (const c of cells) {
    const d = squaresBetween(squareCentre(c), p);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Metres between two places on a farm. */
export const metresBetween = (farm: Pick<FarmState, 'layout'>, a: MapPoint, b: MapPoint): number =>
  squaresBetween(a, b) * farm.layout.scale.sideM;

/** Minutes to drive between two places. 0 on a farm with travel switched off. */
export function driveMinutes(
  farm: Pick<FarmState, 'layout' | 'workRules'>,
  a: MapPoint,
  b: MapPoint,
): number {
  if (!farm.workRules.travel) return 0;
  return (metresBetween(farm, a, b) / (JOB_TIMES.travelKmH.value * 1000)) * 60;
}

/**
 * The light kept back so the player is home by last light, from the
 * furthest of the places a job could leave them. 0 when the drive home is
 * free after last light, or travel is switched off.
 */
export function homeReserve(
  farm: Pick<FarmState, 'layout' | 'workRules' | 'buildings'>,
  places: readonly MapPoint[],
): number {
  if (!farm.workRules.travel || farm.workRules.driveHome !== 'inside-daylight') return 0;
  const home = homesteadPoint(farm);
  let most = 0;
  for (const p of places) most = Math.max(most, driveMinutes(farm, p, home));
  return most;
}

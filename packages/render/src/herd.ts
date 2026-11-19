/**
 * Cattle that walk and graze, as they did in the MVP (Claudia, 19 Nov 2026:
 * "the cows don't seem to move like they did in the first version of the
 * grazing game which is fun").
 *
 * This is for looks only. The model never reads it, and nothing here comes
 * back from the browser (LESSONS W3). It works from the view's own figures
 * for each square, so cattle are drawn to the better feed the way the model
 * says it is.
 *
 * How a beast behaves (the MVP's `moveAnimals` and `pickTarget`):
 * - It stands and grazes for a short while (`IDLE_SECONDS`), then takes a
 *   short walk and stops again. It faces the way it walks.
 * - Where it walks to: now and then to water (`TO_WATER`), often next to a
 *   mob-mate so the mob keeps loosely together (`NEAR_MATE`), otherwise to a
 *   square of the herd's ground picked by feed: more cover, more green and
 *   better quality draw it, closer to water a little more, bare ground hardly.
 * - A calf follows its mother.
 * - It never walks through a fence or out of its grazing area. If the next
 *   step would cross one it stops and picks again.
 * - The herd's patch of ground drifts round the paddock over time, to better
 *   feed and now and then to water, so a mob in a big paddock moves about
 *   it and one in a small strip fills it.
 * - A mob that is moved trots to its new paddock from where it stood, in a
 *   straight line (there are no routes: Claudia took them out), and bought
 *   cattle walk out from the yards. Then they graze as before.
 * - Places carry over from one day's view to the next, so nothing jumps.
 *
 * Speed (PRD 14.10): everything is in typed arrays, only mobs on screen
 * move (a mob on its way somewhere keeps going), and the work each frame is
 * held by the number of cattle drawn (`FARM_DRAWN_MAX`).
 */

import type { FarmView, ViewCattleKind } from '@gg/shared';
import { GRID_H, GRID_N, GRID_W, colOf, rowOf } from './grid';
import {
  cowSquares,
  herdGround,
  markerOf,
  placementGround,
  shrinkBox,
  standingBox,
  stepOpen,
  yardsBox,
  type BodyShape,
  type MobPlacement,
  type PlacementGround,
} from './cattle';
import { scatter } from './random';

/** A grazing walk, in the beast's own (drawn) lengths a second, at 1x game speed. */
export const WALK_LENGTHS_PER_S = 1.8;
/** A moved mob trots this many lengths a second... */
export const TROT_LENGTHS_PER_S = 9;
/** ...but takes at least the first and at most the second of these seconds to get there. */
export const TROT_SECONDS: readonly [number, number] = [1.5, 6];
/** How long a beast stands and grazes between walks, seconds at 1x (the MVP's 30 to 240 frames). */
export const IDLE_SECONDS: readonly [number, number] = [0.5, 4];
/** The share of walks that go to water (the MVP's 7%). */
export const TO_WATER = 0.07;
/** Walks up to this share (water included) go next to a mob-mate (the MVP's 45%). */
export const NEAR_MATE = 0.45;
/** How long the herd's patch stays put before it drifts, seconds at 1x. */
export const HERD_SHIFT_SECONDS: readonly [number, number] = [25, 70];
/** The share of drifts that take the herd to water. */
export const HERD_TO_WATER = 0.15;
/** How much less bare ground draws cattle (the MVP's 0.15 under 350 kg DM/ha). */
export const BARE_PULL = 0.15;

const RUSH = 1;
const WALKING = 2;

export interface HerdMob {
  id: number;
  where: MobPlacement['where'];
  area: number;
  /** Its cattle are `from` to `to - 1` in the herd's arrays. */
  from: number;
  to: number;
  head: number;
  seed: number;
  total: number;
  /** The squares the herd grazes over now, nearest `start` first. */
  cells: number[];
  start: number;
  /** Running total of the feed pull over `cells`, for a weighted pick. */
  cum: Float32Array;
  herdM2: number;
  boxScale: number;
  centre: { x: number; y: number };
  spread: { x: number; y: number };
  /** Seconds (at 1x) until the herd's patch drifts. */
  shiftIn: number;
  /** How many of its cattle are still on their way to it. */
  rushing: number;
  /** Where its cattle are: x0, y0, x1, y1 in ground coordinates. */
  box: [number, number, number, number];
  rng: () => number;
}

export interface HerdStep {
  /** Something moved: draw another frame. */
  moved: boolean;
  /** Nothing moved: seconds until the first beast on screen moves again (Infinity for never). */
  wakeIn: number;
  /** A herd's patch drifted: its marker and footprint move. */
  shifted: boolean;
  /** A moved mob's last beast got there. */
  arrived: boolean;
}

/** A visible piece of the ground: x0, y0, x1, y1 in ground coordinates. */
export type GroundRect = readonly [number, number, number, number];

const cellAt = (x: number, y: number): number => {
  const c = Math.min(GRID_W - 1, Math.max(0, Math.floor(x)));
  const r = Math.min(GRID_H - 1, Math.max(0, Math.floor(y)));
  return r * GRID_W + c;
};

const between = (rng: () => number, range: readonly [number, number]): number =>
  range[0] + (range[1] - range[0]) * rng();

/**
 * How strongly a square draws grazing cattle, from the view's figures. The
 * MVP's diet weighting: green feed and some dry, better energy, nearer
 * water, and little pull from bare ground. Only the order matters.
 */
export function feedPull(view: FarmView, out = new Float32Array(GRID_N)): Float32Array {
  const sq = view.squares;
  for (let i = 0; i < GRID_N; i++) {
    const cover = (sq.cover[i] ?? 0) / 10;
    const green = (sq.green[i] ?? 0) / 20;
    const me = (sq.me10[i] ?? 80) / 10;
    let w = (0.15 + cover) * (0.35 + green) * Math.exp((me - 8) * 0.45);
    const wd = sq.waterDist[i] ?? -1;
    if (wd >= 0) w *= Math.exp((-wd * 100) / 3000);
    if (cover < 0.35) w *= BARE_PULL;
    out[i] = Math.max(1e-4, w);
  }
  return out;
}

/** The squares beside water in each grazing area, where cattle stand to drink. */
export function waterSquares(g: PlacementGround): Map<number, number[]> {
  const view = g.view;
  const area = view.squares.area;
  const out = new Map<number, number[]>();
  const add = (sq: number): void => {
    if (sq < 0 || sq >= GRID_N || g.blocked[sq]) return;
    const a = area[sq] ?? -1;
    let list = out.get(a);
    if (!list) out.set(a, (list = []));
    if (!list.includes(sq)) list.push(sq);
  };
  for (const t of view.water.troughs) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = colOf(t.cell) + dx;
        const r = rowOf(t.cell) + dy;
        if (c < 0 || c >= GRID_W || r < 0 || r >= GRID_H) continue;
        const sq = r * GRID_W + c;
        if (sq !== t.cell && stepOpen(g, t.cell, sq)) add(sq);
      }
    }
  }
  for (const v of view.water.hubs) {
    const vc = v % (GRID_W + 1);
    const vr = Math.floor(v / (GRID_W + 1));
    for (const [c, r] of [
      [vc - 1, vr - 1],
      [vc, vr - 1],
      [vc - 1, vr],
      [vc, vr],
    ] as const) {
      if (c >= 0 && c < GRID_W && r >= 0 && r < GRID_H) add(r * GRID_W + c);
    }
  }
  return out;
}

/** The cattle on the map and where each is going. */
export class Herd {
  n = 0;
  x = new Float32Array(0);
  y = new Float32Array(0);
  tx = new Float32Array(0);
  ty = new Float32Array(0);
  /** Seconds (at 1x) left standing still. */
  idle = new Float32Array(0);
  /** Each beast's own walking pace, about 1. */
  gait = new Float32Array(0);
  /** A trotting beast's speed, ground units a second, set when it sets off. */
  trot = new Float32Array(0);
  flags = new Uint8Array(0);
  /** 1 facing right, -1 facing left. */
  dir = new Int8Array(0);
  /** Which mob (its place in `mobs`). */
  mobOf = new Uint16Array(0);
  /** A calf's mother (her place in the arrays), or -1. */
  dam = new Int32Array(0);
  kind: ViewCattleKind[] = [];
  shape: BodyShape[] = [];
  mobs: HerdMob[] = [];

  private g: PlacementGround | null = null;
  private pull = new Float32Array(GRID_N);
  private water = new Map<number, number[]>();
  private synced = false;

  /** The mob with this id, or undefined. */
  mob(id: number): HerdMob | undefined {
    return this.mobs.find((m) => m.id === id);
  }

  /**
   * Take a new placement. Cattle already on the map keep their places; a
   * mob moved to another area trots there; new cattle come from the yards
   * (bought) or from a mob that shrank or went (a split or a merge).
   */
  sync(view: FarmView, placements: readonly MobPlacement[]): void {
    const first = !this.synced;
    this.synced = true;
    const g = placementGround(view);
    this.g = g;
    feedPull(view, this.pull);
    this.water = waterSquares(g);

    // The cattle there were, by mob and kind, in order.
    const old = new Map<number, { mob: HerdMob; byKind: Map<ViewCattleKind, number[]> }>();
    for (const m of this.mobs) {
      const byKind = new Map<ViewCattleKind, number[]>();
      for (let i = m.from; i < m.to; i++) {
        const k = this.kind[i]!;
        let list = byKind.get(k);
        if (!list) byKind.set(k, (list = []));
        list.push(i);
      }
      old.set(m.id, { mob: m, byKind });
    }
    // Which old beasts each new mob keeps, kind by kind. The rest are free
    // to become a new mob's cattle.
    const keep = new Map<number, Map<ViewCattleKind, number[]>>();
    for (const p of placements) {
      const o = old.get(p.mob);
      if (!o) continue;
      const want = new Map<ViewCattleKind, number>();
      for (const b of p.beasts) want.set(b.kind, (want.get(b.kind) ?? 0) + 1);
      const mine = new Map<ViewCattleKind, number[]>();
      for (const [k, n] of want) {
        const list = o.byKind.get(k) ?? [];
        mine.set(k, list.splice(0, n));
      }
      keep.set(p.mob, mine);
    }
    const freed: number[] = [];
    for (const o of old.values()) for (const list of o.byKind.values()) freed.push(...list);

    const n = placements.reduce((t, p) => t + p.beasts.length, 0);
    const ox = this.x;
    const oy = this.y;
    const odir = this.dir;
    this.n = n;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.ty = new Float32Array(n);
    this.idle = new Float32Array(n);
    this.gait = new Float32Array(n);
    this.trot = new Float32Array(n);
    this.flags = new Uint8Array(n);
    this.dir = new Int8Array(n);
    this.mobOf = new Uint16Array(n);
    this.dam = new Int32Array(n);
    this.kind = new Array<ViewCattleKind>(n);
    this.shape = new Array<BodyShape>(n);
    const yards = view.buildings.find((b) => b.kind === 'yards');
    const mobs: HerdMob[] = [];
    let at = 0;
    for (const p of placements) {
      const o = old.get(p.mob)?.mob;
      const vm = view.mobs.find((m) => m.id === p.mob)!;
      const moved = !!o && (o.where !== p.where || o.area !== p.area);
      const rng = o?.rng ?? scatter(vm.seed ^ 0x3c6ef372);
      let cells = p.cells;
      let start = p.start;
      let herdM2 = p.herdM2;
      let boxScale = 1;
      if (p.where === 'paddock') {
        // A herd that has drifted keeps its patch, unless it was moved or a fence cut it off.
        const kept =
          o && !moved && view.squares.area[o.start] === p.area && !g.blocked[o.start];
        start = kept ? o.start : p.start;
        const hg = herdGround(g, vm, start);
        cells = hg.cells;
        herdM2 = hg.herdM2;
        boxScale = hg.boxScale;
      }
      const mob: HerdMob = {
        id: p.mob,
        where: p.where,
        area: p.area,
        from: at,
        to: at + p.beasts.length,
        head: vm.head,
        seed: vm.seed,
        total: p.total,
        cells,
        start,
        cum: new Float32Array(0),
        herdM2,
        boxScale,
        ...markerOf(cells),
        shiftIn: o?.shiftIn ?? between(rng, HERD_SHIFT_SECONDS),
        rushing: 0,
        box: [Infinity, Infinity, -Infinity, -Infinity],
        rng,
      };
      this.weigh(mob);
      const mine = keep.get(p.mob);
      const yardsCell = p.where === 'yards' ? p.cells[0]! : -1;
      p.beasts.forEach((b, j) => {
        const i = at + j;
        this.kind[i] = b.kind;
        this.shape[i] = b.shape;
        this.mobOf[i] = mobs.length;
        this.dam[i] = b.dam >= 0 ? at + b.dam : -1;
        this.gait[i] = 0.8 + 0.45 * rng();
        const src = mine?.get(b.kind)?.shift() ?? (first ? undefined : freed.shift());
        if (src !== undefined) {
          this.x[i] = ox[src]!;
          this.y[i] = oy[src]!;
          this.dir[i] = odir[src]! || 1;
        } else if (!first && p.where === 'paddock' && yards) {
          // Bought: they come out of the yards.
          const box = yardsBox(yards.cell);
          this.x[i] = box[0] + (box[2] - box[0]) * rng();
          this.y[i] = box[1] + (box[3] - box[1]) * rng();
          this.dir[i] = 1;
        } else {
          this.x[i] = b.x;
          this.y[i] = b.y;
          this.dir[i] = b.flip ? -1 : 1;
        }
        const c = cellAt(this.x[i]!, this.y[i]!);
        const inside =
          p.where === 'yards'
            ? c === yardsCell
            : view.squares.area[c] === p.area && !g.blocked[c];
        if (inside) {
          this.tx[i] = this.x[i]!;
          this.ty[i] = this.y[i]!;
          this.idle[i] = between(rng, IDLE_SECONDS);
        } else {
          // On its way: to its place in the new paddock, straight there.
          this.tx[i] = b.x;
          this.ty[i] = b.y;
          this.flags[i] = RUSH;
          this.dir[i] = b.x >= this.x[i]! ? 1 : -1;
          mob.rushing++;
        }
      });
      at += p.beasts.length;
      mobs.push(mob);
    }
    this.mobs = mobs;
    for (const m of mobs) this.measure(m);
  }

  /** New figures for the grass, with no change to where the cattle are. */
  feed(view: FarmView): void {
    if (!this.g) return;
    feedPull(view, this.pull);
    for (const m of this.mobs) this.weigh(m);
  }

  /** Put every beast where it is going at once (reduce motion). */
  settle(): void {
    for (let i = 0; i < this.n; i++) {
      if (!(this.flags[i]! & RUSH)) continue;
      this.x[i] = this.tx[i]!;
      this.y[i] = this.ty[i]!;
      this.flags[i] = 0;
    }
    for (const m of this.mobs) {
      m.rushing = 0;
      this.measure(m);
    }
  }

  /**
   * Time passed with no frames drawn because every beast on screen was
   * standing: `seconds` of game time (already times the pace) come off their
   * standing time, so they set off when they would have.
   */
  rest(seconds: number): void {
    if (seconds <= 0) return;
    for (let i = 0; i < this.n; i++) {
      if (!this.flags[i]) this.idle[i] = this.idle[i]! - seconds;
    }
    for (const m of this.mobs) m.shiftIn -= seconds;
  }

  /**
   * Move the cattle on by `dt` seconds. `pace` is the game speed (1, 2, 4;
   * 0 is paused: they stand still, but a moved mob still gets there).
   * `walk` is a grazing walk in ground units a second at 1x. Only mobs that
   * reach into `rect` move, unless they are on their way somewhere.
   */
  step(dt: number, pace: number, walk: number, rect?: GroundRect): HerdStep {
    const out: HerdStep = { moved: false, wakeIn: Infinity, shifted: false, arrived: false };
    if (!this.n || !this.g || dt <= 0) return out;
    const p = Math.max(0, pace);
    const trotSpeed = (walk / WALK_LENGTHS_PER_S) * TROT_LENGTHS_PER_S;
    const area = this.g.view.squares.area;
    const blocked = this.g.blocked;
    const { x, y, tx, ty, flags } = this;
    for (const m of this.mobs) {
      if (p > 0 && m.where === 'paddock') {
        m.shiftIn -= dt * p;
        if (m.shiftIn <= 0) out.shifted = this.shift(m) || out.shifted;
      }
      const seen =
        !rect ||
        (m.box[2] >= rect[0] && m.box[0] <= rect[2] && m.box[3] >= rect[1] && m.box[1] <= rect[3]);
      if (!seen && !m.rushing) continue;
      for (let i = m.from; i < m.to; i++) {
        const f = flags[i]!;
        if (f & RUSH) {
          const dx = tx[i]! - x[i]!;
          const dy = ty[i]! - y[i]!;
          const d = Math.hypot(dx, dy);
          if (!this.trot[i]) {
            const secs = Math.min(TROT_SECONDS[1], Math.max(TROT_SECONDS[0], d / trotSpeed));
            this.trot[i] = d / secs || trotSpeed;
          }
          const s = this.trot[i]! * dt * Math.max(1, p);
          out.moved = true;
          if (d <= s) {
            x[i] = tx[i]!;
            y[i] = ty[i]!;
            flags[i] = 0;
            this.trot[i] = 0;
            this.idle[i] = between(m.rng, IDLE_SECONDS);
            m.rushing--;
            if (!m.rushing) out.arrived = true;
          } else {
            x[i] = x[i]! + (dx / d) * s;
            y[i] = y[i]! + (dy / d) * s;
            if (Math.abs(dx) > 1e-3) this.dir[i] = dx > 0 ? 1 : -1;
          }
          continue;
        }
        if (p <= 0) continue;
        if (!(f & WALKING)) {
          this.idle[i] = this.idle[i]! - dt * p;
          if (this.idle[i]! > 0) {
            const wake = this.idle[i]! / p;
            if (wake < out.wakeIn) out.wakeIn = wake;
            continue;
          }
          this.pick(m, i);
          flags[i] = WALKING;
          out.moved = true;
          continue;
        }
        out.moved = true;
        const dx = tx[i]! - x[i]!;
        const dy = ty[i]! - y[i]!;
        const d = Math.hypot(dx, dy);
        const s = walk * this.gait[i]! * p * dt;
        if (d <= s) {
          x[i] = tx[i]!;
          y[i] = ty[i]!;
          flags[i] = 0;
          this.idle[i] = between(m.rng, IDLE_SECONDS);
          continue;
        }
        const nx = x[i]! + (dx / d) * s;
        const ny = y[i]! + (dy / d) * s;
        if (m.where === 'paddock') {
          const c0 = cellAt(x[i]!, y[i]!);
          const c1 = cellAt(nx, ny);
          // Never through a fence: stop, and pick again in a moment.
          if (c1 !== c0 && (area[c1] !== m.area || blocked[c1] || !stepOpen(this.g, c0, c1))) {
            tx[i] = x[i]!;
            ty[i] = y[i]!;
            flags[i] = 0;
            this.idle[i] = 0.2 + 0.8 * m.rng();
            continue;
          }
        }
        x[i] = nx;
        y[i] = ny;
      }
      this.measure(m);
    }
    return out;
  }

  /** The feed pull over a herd's squares, as a running total. */
  private weigh(m: HerdMob): void {
    const cum = new Float32Array(m.cells.length);
    let t = 0;
    m.cells.forEach((c, k) => {
      t += this.pull[c]!;
      cum[k] = t;
    });
    m.cum = cum;
  }

  /** Where a mob's cattle are now. */
  private measure(m: HerdMob): void {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = m.from; i < m.to; i++) {
      const xi = this.x[i]!;
      const yi = this.y[i]!;
      if (xi < x0) x0 = xi;
      if (xi > x1) x1 = xi;
      if (yi < y0) y0 = yi;
      if (yi > y1) y1 = yi;
    }
    m.box = [x0, y0, x1, y1];
  }

  /** A square of the herd's ground, picked by feed. */
  private feedSquare(m: HerdMob): number {
    const cum = m.cum;
    const total = cum[cum.length - 1] ?? 0;
    if (!cum.length || total <= 0) return m.cells[Math.floor(m.rng() * m.cells.length)] ?? m.start;
    const t = m.rng() * total;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < t) lo = mid + 1;
      else hi = mid;
    }
    return m.cells[lo]!;
  }

  /** True if a beast of this mob may stand on the square. */
  private ok(m: HerdMob, sq: number): boolean {
    const g = this.g!;
    return sq >= 0 && sq < GRID_N && g.view.squares.area[sq] === m.area && !g.blocked[sq];
  }

  /** Where beast `i` walks to next. */
  private pick(m: HerdMob, i: number): void {
    const g = this.g!;
    const view = g.view;
    const rng = m.rng;
    let tx: number;
    let ty: number;
    if (m.where === 'yards') {
      const box = yardsBox(m.cells[0]!);
      tx = box[0] + (box[2] - box[0]) * rng();
      ty = box[1] + (box[3] - box[1]) * rng();
    } else if (this.dam[i]! >= 0) {
      // A calf follows its mother: beside where she is going, on her side of any fence.
      const d = this.dam[i]!;
      const bx = this.flags[d]! & WALKING ? this.tx[d]! : this.x[d]!;
      const by = this.flags[d]! & WALKING ? this.ty[d]! : this.y[d]!;
      const gap = cowSquares(view.scale.sideM);
      const side = rng() < 0.5 ? -1 : 1;
      const box = standingBox(view, cellAt(bx, by));
      tx = Math.min(box[2], Math.max(box[0], bx + side * gap * (0.5 + 0.4 * rng())));
      ty = Math.min(box[3], Math.max(box[1], by + gap * (0.05 + 0.3 * rng())));
    } else {
      const r = rng();
      const water = this.water.get(m.area);
      let sq = -1;
      if (r < TO_WATER && water && water.length) {
        sq = water[Math.floor(rng() * water.length)]!;
      } else if (r < NEAR_MATE && m.to - m.from > 1) {
        const mate = m.from + Math.floor(rng() * (m.to - m.from));
        const c = cellAt(this.x[mate]!, this.y[mate]!);
        if (this.ok(m, c)) {
          const steps = [0, 0, 1, -1, GRID_W, -GRID_W];
          const s = steps[Math.floor(rng() * steps.length)]!;
          const next = c + s;
          const sameRow = Math.abs(colOf(next) - colOf(c)) <= 1;
          sq = sameRow && this.ok(m, next) && stepOpen(g, c, next) ? next : c;
        }
      }
      if (sq < 0) sq = this.feedSquare(m);
      const box = shrinkBox(standingBox(view, sq), m.boxScale);
      tx = box[0] + (box[2] - box[0]) * rng();
      ty = box[1] + (box[3] - box[1]) * rng();
    }
    this.tx[i] = tx;
    this.ty[i] = ty;
    const dx = tx - this.x[i]!;
    if (Math.abs(dx) > 1e-3) this.dir[i] = dx > 0 ? 1 : -1;
  }

  /** Move the herd's patch on a little, to better feed or to water. True if it moved. */
  private shift(m: HerdMob): boolean {
    const g = this.g!;
    m.shiftIn = between(m.rng, HERD_SHIFT_SECONDS);
    const area = g.areaCells.get(m.area);
    if (!area) return false;
    const open = area.filter((c) => !g.blocked[c]);
    // The herd already fills its area: nowhere to drift to.
    if (m.cells.length >= open.length) return false;
    let next = -1;
    const water = this.water.get(m.area);
    if (water && water.length && m.rng() < HERD_TO_WATER) {
      next = water[Math.floor(m.rng() * water.length)]!;
    } else {
      // A short way from where it is, picked by feed.
      const reach = Math.max(1.5, Math.sqrt(m.cells.length) * 0.9);
      const sx = colOf(m.start);
      const sy = rowOf(m.start);
      const near = open.filter((c) => Math.hypot(colOf(c) - sx, rowOf(c) - sy) <= reach);
      let t = 0;
      for (const c of near) t += this.pull[c]!;
      let r = m.rng() * t;
      for (const c of near) {
        r -= this.pull[c]!;
        if (r <= 0) {
          next = c;
          break;
        }
      }
      if (next < 0) next = near[near.length - 1] ?? m.start;
    }
    if (next === m.start) return false;
    const hg = herdGround(g, { area: m.area, head: m.head, seed: m.seed }, next);
    m.start = next;
    m.cells = hg.cells;
    m.herdM2 = hg.herdM2;
    m.boxScale = hg.boxScale;
    const mark = markerOf(m.cells);
    m.centre = mark.centre;
    m.spread = mark.spread;
    this.weigh(m);
    return true;
  }
}

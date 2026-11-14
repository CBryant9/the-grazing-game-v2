/**
 * A pixel farm at dusk, drawn in code for the landing page. It is a picture
 * made for this site, not a screenshot, and it carries no game data. The same
 * picture is drawn every time (the random numbers are fixed), so the page is
 * the same for everyone and can be cached.
 *
 * Paddocks use the game's neutral colours: green, mixed, dry and rank, short.
 */

const W = 160;
const H = 52;
const SKY_H = 20;

// A small fixed random sequence (mulberry32), so the picture never changes between builds.
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Box = [x: number, y: number, w: number, h: number];

function path(boxes: Box[]): string {
  return boxes.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join('');
}

const SKY = ['#1b2050', '#2c2a66', '#563a76', '#8e4a7c', '#d0685e', '#f2a064'];
const GROUND = '#586238';

type Paddock = { x0: number; y0: number; x1: number; y1: number; base: string; tuft: string };

// Four columns by three rows of paddocks, some joined, as in the mockup.
const COLS = [3, 44, 82, 122, 157];
const ROWS = [SKY_H + 3, SKY_H + 14, SKY_H + 24, H - 3];
const PADDOCKS: Paddock[] = [
  { x0: 0, y0: 0, x1: 1, y1: 1, base: '#46582a', tuft: '#8fd046' }, // green
  { x0: 1, y0: 0, x1: 2, y1: 1, base: '#62602f', tuft: '#a8a84a' }, // mixed
  { x0: 2, y0: 0, x1: 3, y1: 1, base: '#8a7648', tuft: '#c8aa5e' }, // dry and rank
  { x0: 3, y0: 0, x1: 4, y1: 2, base: '#46582a', tuft: '#8fd046' },
  { x0: 0, y0: 1, x1: 1, y1: 2, base: '#7c5c3c', tuft: '#a07848' }, // short
  { x0: 1, y0: 1, x1: 2, y1: 2, base: '#46582a', tuft: '#8fd046' },
  { x0: 2, y0: 1, x1: 3, y1: 2, base: '#62602f', tuft: '#a8a84a' },
  { x0: 0, y0: 2, x1: 2, y1: 3, base: '#8a7648', tuft: '#c8aa5e' },
  { x0: 2, y0: 2, x1: 3, y1: 3, base: '#46582a', tuft: '#8fd046' },
  { x0: 3, y0: 2, x1: 4, y1: 3, base: '#7c5c3c', tuft: '#a07848' },
];

function build() {
  const rnd = random(7);
  const skyBands = SKY.map((fill, i): { fill: string; y: number; h: number } => ({
    fill,
    y: Math.round((i * SKY_H) / SKY.length),
    h: Math.round(((i + 1) * SKY_H) / SKY.length) - Math.round((i * SKY_H) / SKY.length),
  }));

  // Hills along the horizon, two layers.
  const farHills: Box[] = [];
  const nearHills: Box[] = [];
  for (let x = 0; x < W; x++) {
    const far = Math.round(5 + 3 * Math.sin(x * 0.05 + 1) + 2 * Math.sin(x * 0.13));
    const near = Math.round(3 + 2.5 * Math.sin(x * 0.08 + 2));
    farHills.push([x, SKY_H - far, 1, far]);
    nearHills.push([x, SKY_H - near, 1, near]);
  }

  // The sun, sitting on the horizon.
  const sun: Box[] = [];
  const sx = 118;
  const sy = SKY_H - 2;
  for (let dy = -6; dy <= 0; dy++) {
    for (let dx = -6; dx <= 6; dx++) {
      if (Math.hypot(dx, dy) <= 6) sun.push([sx + dx, sy + dy, 1, 1]);
    }
  }

  // A few stars.
  const stars: Box[] = [];
  for (let i = 0; i < 18; i++) stars.push([Math.floor(rnd() * W), Math.floor(rnd() * 6), 1, 1]);

  const cells = PADDOCKS.map((p) => ({
    ...p,
    px0: COLS[p.x0]!,
    px1: COLS[p.x1]!,
    py0: ROWS[p.y0]!,
    py1: ROWS[p.y1]!,
  }));

  // Grass tufts: short upright strokes, in rows.
  const tufts = new Map<string, Box[]>();
  for (const c of cells) {
    const list = tufts.get(c.tuft) ?? [];
    for (let y = c.py0 + 2; y < c.py1 - 1; y += 3) {
      const off = (Math.round(y) % 2) * 2;
      for (let x = c.px0 + 2 + off; x < c.px1 - 1; x += 4) {
        if (c.base === '#7c5c3c' && rnd() < 0.55) continue;
        list.push([x, y - 1, 1, 2]);
      }
    }
    tufts.set(c.tuft, list);
  }

  // Cattle in three paddocks: a body, a head and legs.
  const coats = ['#96482a', '#2c2624', '#d4cec0', '#b27846'];
  const cattleBodies = new Map<string, Box[]>();
  const cattleHeads: Box[] = [];
  const cattleShadow: Box[] = [];
  const herd: [number, number][] = [
    [5, 12],
    [1, 8],
    [8, 7],
  ];
  for (const [index, count] of herd) {
    const c = cells[index]!;
    for (let k = 0; k < count; k++) {
      const x = Math.round(c.px0 + 3 + rnd() * (c.px1 - c.px0 - 9));
      const y = Math.round(c.py0 + 4 + rnd() * (c.py1 - c.py0 - 8));
      const coat = coats[Math.floor(rnd() * coats.length)]!;
      const list = cattleBodies.get(coat) ?? [];
      list.push([x, y, 4, 2], [x, y + 2, 1, 1], [x + 3, y + 2, 1, 1]);
      cattleBodies.set(coat, list);
      cattleHeads.push([x + 4, y - 1, 1, 2]);
      cattleShadow.push([x - 1, y + 3, 6, 1]);
    }
  }

  // Trees along the fences.
  const trunks: Box[] = [];
  const canopy: Box[] = [];
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(6 + rnd() * (W - 12));
    const y = Math.floor(SKY_H + 5 + rnd() * (H - SKY_H - 8));
    trunks.push([x, y - 3, 1, 3]);
    canopy.push([x - 2, y - 6, 5, 3], [x - 1, y - 7, 3, 1]);
  }

  // Fences: one-pixel lines round every paddock.
  const fences: Box[] = [];
  for (const c of cells) {
    fences.push(
      [c.px0, c.py0, c.px1 - c.px0 + 1, 1],
      [c.px0, c.py1, c.px1 - c.px0 + 1, 1],
      [c.px0, c.py0, 1, c.py1 - c.py0 + 1],
      [c.px1, c.py0, 1, c.py1 - c.py0 + 1],
    );
  }

  return {
    skyBands,
    farHills: path(farHills),
    nearHills: path(nearHills),
    sun: path(sun),
    stars: path(stars),
    cells,
    tufts: [...tufts.entries()].map(([fill, boxes]) => ({ fill, d: path(boxes) })),
    cattle: [...cattleBodies.entries()].map(([fill, boxes]) => ({ fill, d: path(boxes) })),
    cattleHeads: path(cattleHeads),
    cattleShadow: path(cattleShadow),
    trunks: path(trunks),
    canopy: path(canopy),
    fences: path(fences),
  };
}

const SCENE = build();

export function FarmScene({ className }: { className?: string }) {
  const s = SCENE;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      shapeRendering="crispEdges"
      role="img"
      aria-label="A picture drawn for this site: a farm at dusk with paddocks in different pasture, fences, trees and cattle."
    >
      {s.skyBands.map((b) => (
        <rect key={b.y} x="0" y={b.y} width={W} height={b.h} fill={b.fill} />
      ))}
      <path d={s.stars} fill="#f0e6d2" />
      <path d={s.sun} fill="#ffd682" />
      <path d={s.farHills} fill="#5c446a" />
      <path d={s.nearHills} fill="#42405a" />
      <rect x="0" y={SKY_H} width={W} height={H - SKY_H} fill={GROUND} />
      {s.cells.map((c, i) => (
        <rect
          key={i}
          x={c.px0}
          y={c.py0}
          width={c.px1 - c.px0}
          height={c.py1 - c.py0}
          fill={c.base}
        />
      ))}
      {s.tufts.map((t) => (
        <path key={t.fill} d={t.d} fill={t.fill} />
      ))}
      <path d={s.fences} fill="#d6d0c0" />
      <path d={s.cattleShadow} fill="#000" opacity="0.3" />
      {s.cattle.map((c) => (
        <path key={c.fill} d={c.d} fill={c.fill} />
      ))}
      <path d={s.cattleHeads} fill="#e6dcc8" />
      <path d={s.trunks} fill="#d6d0c0" />
      <path d={s.canopy} fill="#58733a" />
    </svg>
  );
}

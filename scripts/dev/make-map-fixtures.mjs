// Builds a handful of farms with the engine and writes each one's farm view
// as a JSON fixture for the map's dev page (/dev/map).
//
//   node scripts/dev/make-map-fixtures.mjs
//
// The fixtures are views only: the same plain numbers the server will send
// the browser. No engine code, formulas or data tables go into them.
//
// Plain Node. The only package used is TypeScript, which the repo already
// has, to read the engine's source directly (see the hook below).

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_DIR = join(ROOT, 'apps/web/dev-fixtures/map');

const PACKAGES = {
  '@gg/shared': pathToFileURL(join(ROOT, 'packages/shared/src/index.ts')).href,
  '@gg/engine': pathToFileURL(join(ROOT, 'packages/engine/src/index.ts')).href,
};

// The TypeScript sources import each other without file extensions, and use
// a little syntax Node cannot strip by itself, so TypeScript turns each file
// into JavaScript as it is loaded. Nothing is written to disk.
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('.ts')) return nextLoad(url, context);
    const js = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
      fileName: fileURLToPath(url),
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
        verbatimModuleSyntax: true,
      },
    }).outputText;
    return { format: 'module', source: js, shortCircuit: true };
  },
  resolve(specifier, context, nextResolve) {
    if (PACKAGES[specifier]) return { url: PACKAGES[specifier], shortCircuit: true };
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && context.parentURL?.endsWith('.ts') && !/\.[a-z]+$/i.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context);
      } catch {
        return nextResolve(specifier + '/index.ts', context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const {
  applyAction,
  createFarm,
  farmTotals,
  farmView,
  hEdge,
  knockDownTape,
  stepDay,
  surveyOf,
  vEdge,
} = await import('@gg/engine');

const PLENTY = { cash: 5e7, overdraft: -5e7, broke: -1e9 };
const W = 40;
const cellAt = (x, y) => y * W + x;

/** Do an action that must work. */
function act(farm, action) {
  const done = applyAction(farm, action);
  if (!done.ok) throw new Error(`${action.type} was refused (${done.reason}): ${done.message}`);
  return done.farm;
}

function run(farm, days, env) {
  for (let d = 0; d < days && !farm.over; d++) stepDay(farm, env);
  return farm;
}

function make(o) {
  return createFarm({ difficulty: 'easy', money: { ...PLENTY }, ...o });
}

function boxEdges(x0, y0, x1, y1) {
  const out = [];
  for (let x = x0; x <= x1; x++) out.push(hEdge(y0, x), hEdge(y1 + 1, x));
  for (let y = y0; y <= y1; y++) out.push(vEdge(y, x0), vEdge(y, x1 + 1));
  return out;
}

/** A source of growth factors that holds one season the whole time. */
const steadySeason = (seasonF, monthF, label) => ({
  factorsOn: () => ({ seasonF, monthF, label }),
});

/** Put a herd on every watered grazing area until the farm carries more than `target` head. */
function stockUp(farm, target, perArea) {
  const s = surveyOf(farm);
  for (const r of s.topology.areas) {
    if (farmTotals(farm).head > target) break;
    if (!s.points.areaTroughs[r.id].length) continue;
    const done = applyAction(farm, {
      type: 'buyCattle',
      cls: 'weanerSteer',
      qty: perArea,
      to: { cell: r.cells[0] },
    });
    if (done.ok) farm = done.farm;
  }
  return farm;
}

/** A first square, well away from the bore and the edge, for a box of fences. */
function farCorner(farm) {
  const bx = farm.layout.water.bore % W;
  return [bx < W / 2 ? W - 12 : 4, 5];
}

const FIXTURES = [
  {
    name: 'cq-small-scratch',
    title: 'Central Queensland, small, from scratch',
    note: 'Day 1. The boundary, the bore, the homestead and the yards. No cattle.',
    build: () =>
      make({
        seed: 14,
        district: 'cq',
        size: 'small',
        start: { year: 2023, month: 0 },
        startType: 'scratch',
      }),
  },
  {
    name: 'cq-large-running',
    title: 'Central Queensland, large, running',
    note: 'A running station, 60 days in. Brahman-style cattle.',
    build: () =>
      run(
        make({
          seed: 5,
          district: 'cq',
          size: 'large',
          start: { year: 2024, month: 1 },
          startType: 'running',
        }),
        60,
      ),
  },
  {
    name: 'nsw-small-running',
    title: 'Northern Tablelands, small, running',
    note: 'A small running farm, 45 days in.',
    build: () =>
      run(
        make({
          seed: 3,
          district: 'nsw',
          size: 'small',
          start: { year: 2023, month: 9 },
          startType: 'running',
        }),
        45,
      ),
  },
  {
    name: 'nsw-large-scratch',
    title: 'Northern Tablelands, large, from scratch',
    note: 'Day 1 on a large block with no cattle.',
    build: () =>
      make({
        seed: 8,
        district: 'nsw',
        size: 'large',
        start: { year: 2023, month: 6 },
        startType: 'scratch',
      }),
  },
  {
    name: 'cw-small-scratch',
    title: 'Central West, small, from scratch',
    note: 'Day 1. No cattle.',
    build: () =>
      make({
        seed: 2,
        district: 'cw',
        size: 'small',
        start: { year: 2023, month: 3 },
        startType: 'scratch',
      }),
  },
  {
    name: 'cw-large-running',
    title: 'Central West, large, running',
    note: 'A running farm, 90 days in.',
    build: () =>
      run(
        make({
          seed: 12,
          district: 'cw',
          size: 'large',
          start: { year: 2023, month: 7 },
          startType: 'running',
        }),
        90,
      ),
  },
  {
    name: 'wv-small-running',
    title: 'Western Victoria, small, running',
    note: 'A small running farm in spring, 30 days in.',
    build: () =>
      run(
        make({
          seed: 6,
          district: 'wv',
          size: 'small',
          start: { year: 2023, month: 8 },
          startType: 'running',
        }),
        30,
      ),
  },
  {
    name: 'wv-large-scratch',
    title: 'Western Victoria, large, from scratch',
    note: 'Day 1. No cattle.',
    build: () =>
      make({
        seed: 9,
        district: 'wv',
        size: 'large',
        start: { year: 2023, month: 10 },
        startType: 'scratch',
      }),
  },
  {
    name: 'cw-mixed-crops',
    title: 'Central West, mixed farm: crops, fallow and stubble',
    note: 'A mixed farm run until crops ripen. Ripe grain crops are harvested, which leaves stubble. The rotation has a block in fallow.',
    build: () => {
      let farm = make({
        seed: 21,
        district: 'cw',
        size: 'medium',
        start: { year: 2023, month: 3 },
        startType: 'running',
        mixed: { arablePct: 40, croppedPct: 60 },
      });
      let harvested = 0;
      // Run up to a year and a half, taking off the first grain crop that ripens.
      for (let d = 0; d < 540 && !farm.over && harvested < 1; d++) {
        stepDay(farm);
        for (const p of farmView(farm).plantings) {
          if (!p.ready) continue;
          const done = applyAction(farm, { type: 'harvest', field: p.id });
          if (done.ok) {
            farm = done.farm;
            harvested++;
            break;
          }
        }
      }
      return run(farm, 5);
    },
  },
  {
    name: 'cq-dry-season',
    title: 'Central Queensland, a dry season',
    note: 'A running farm held in a dry season for 240 days: little growth, dry feed, short paddocks.',
    env: { seasons: steadySeason(0.5, 0.3, 'Dry') },
    build: (env) =>
      run(
        make({
          seed: 17,
          district: 'cq',
          size: 'medium',
          start: { year: 2023, month: 3 },
          startType: 'running',
        }),
        240,
        env,
      ),
  },
  {
    name: 'wv-green-season',
    title: 'Western Victoria, a green season',
    note: 'A running farm held in a good spring for 75 days: green, leafy feed.',
    env: { seasons: steadySeason(1.35, 1.5, 'Well above average') },
    build: (env) =>
      run(
        make({
          seed: 18,
          district: 'wv',
          size: 'medium',
          start: { year: 2023, month: 8 },
          startType: 'running',
        }),
        75,
        env,
      ),
  },
  {
    name: 'nsw-tape-cells',
    title: 'Northern Tablelands: tape cells, a portable trough and gates',
    note: 'Steers strip grazing behind tape with a portable trough. Also an electric fence, open and shut gates, pipe to a trough, a water hub, a length of tape lying down, and a mob with no water.',
    build: () => {
      let farm = make({
        seed: 4,
        district: 'nsw',
        size: 600,
        start: { year: 2023, month: 9 },
        startType: 'scratch',
      });
      const [x0, y0] = farCorner(farm);
      // A permanent box, cut into three tape strips.
      farm = act(farm, {
        type: 'buildFence',
        edges: boxEdges(x0, y0, x0 + 8, y0 + 5),
        fence: 'permanent',
      });
      for (const dx of [3, 6]) {
        const edges = [];
        for (let y = y0; y <= y0 + 5; y++) edges.push(vEdge(y, x0 + dx));
        farm = act(farm, { type: 'buildFence', edges, fence: 'tape' });
      }
      farm = act(farm, { type: 'placePortable', cell: cellAt(x0 + 1, y0 + 2) });
      farm = act(farm, {
        type: 'buyCattle',
        cls: 'yearSteer',
        qty: 120,
        to: { cell: cellAt(x0 + 1, y0 + 3) },
      });
      // A gate into the box, and an electric fence with two gates beside it.
      farm = act(farm, { type: 'placeGate', edge: hEdge(y0 + 6, x0 + 1) });
      const ey = y0 + 9;
      const run1 = [];
      for (let x = x0; x <= x0 + 8; x++) run1.push(hEdge(ey, x));
      farm = act(farm, { type: 'buildFence', edges: run1, fence: 'electric' });
      farm = act(farm, { type: 'placeGate', edge: hEdge(ey, x0 + 2) });
      farm = act(farm, { type: 'placeGate', edge: hEdge(ey, x0 + 6) });
      farm = act(farm, { type: 'setGate', edge: hEdge(ey, x0 + 6), open: true });
      // Pipe from the bore to a trough, and a hub on the electric fence.
      const bore = farm.layout.water.bore;
      const bx = bore % W;
      const by = Math.floor(bore / W);
      const dir = bx < W / 2 ? 1 : -1;
      const pipe = [1, 2, 3, 4].map((k) => cellAt(bx + dir * k, by));
      farm = act(farm, { type: 'layPipe', cells: pipe });
      farm = act(farm, { type: 'placeTrough', cell: pipe[3] });
      // A short fence over the pipe, with a water hub on it.
      const hubRun = [1, 2, 3, 4].map((k) => hEdge(by, bx + dir * k));
      farm = act(farm, { type: 'buildFence', edges: hubRun, fence: 'electric' });
      farm = act(farm, {
        type: 'placeFenceHub',
        vertex: by * (W + 1) + bx + dir * 2 + (dir < 0 ? 1 : 0),
      });
      // A second, dry box with a small mob in it: the "no water" case.
      const dryX = x0 < W / 2 ? x0 + 12 : x0 - 8;
      farm = act(farm, {
        type: 'buildFence',
        edges: boxEdges(dryX, y0 + 12, dryX + 3, y0 + 14),
        fence: 'electric',
      });
      farm = act(farm, { type: 'buyCattle', cls: 'dryCow', qty: 24, to: { cell: bore } });
      const cows = farm.mobs[farm.mobs.length - 1];
      farm = act(farm, { type: 'moveMob', mob: cows.id, to: { cell: cellAt(dryX + 1, y0 + 13) } });
      // One day: the steers drink the portable trough down, and the cows go a day without water.
      run(farm, 1);
      // One length of the middle tape lying down.
      const down = knockDownTape(farm.layout, vEdge(y0 + 2, x0 + 6));
      if (down.ok) farm = { ...farm, layout: down.layout };
      return farm;
    },
  },
  {
    name: 'cq-4000-head',
    title: 'Central Queensland, large, more than 4,000 head',
    note: 'The speed test farm: a running station topped up with steers on every watered paddock.',
    build: () => {
      let farm = make({
        seed: 5,
        district: 'cq',
        size: 'large',
        start: { year: 2024, month: 4 },
        startType: 'running',
      });
      farm = stockUp(farm, 4200, 700);
      return run(farm, 10);
    },
  },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const f of readdirSync(OUT_DIR)) if (f.endsWith('.json')) rmSync(join(OUT_DIR, f));

const index = [];
for (const fx of FIXTURES) {
  const farm = fx.build(fx.env);
  if (farm.over) throw new Error(`${fx.name}: the game ended (${farm.over.reason})`);
  const view = farmView(farm, fx.env);
  const text = JSON.stringify(view);
  const totals = farmTotals(farm, fx.env);
  writeFileSync(join(OUT_DIR, fx.name + '.json'), text + '\n');
  index.push({
    name: fx.name,
    title: fx.title,
    note: fx.note,
    district: view.district,
    farmHa: view.scale.farmHa,
    head: totals.head,
    calves: totals.calves,
    mobs: view.mobs.length,
    paddocks: view.paddocks.length,
    bytes: Buffer.byteLength(text, 'utf8'),
  });
  const lands = new Set(view.squares.land);
  console.log(
    `${fx.name.padEnd(20)} ${(Buffer.byteLength(text) / 1024).toFixed(1).padStart(5)} KB  ` +
      `${String(totals.head).padStart(5)} head  ${String(view.mobs.length).padStart(2)} mobs  ` +
      `${String(view.paddocks.length).padStart(2)} paddocks  land ${[...lands].sort().join(',')}`,
  );
}
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`Wrote ${index.length} fixtures to ${OUT_DIR}`);

/// <reference types="node" />
/**
 * Loads the MVP game in memory so tests can call its own functions.
 *
 * Test use only. Nothing in `src` may import this file.
 *
 * The MVP is one HTML file with one script. This reads the file, takes the
 * script text, and runs it in a separate Node `vm` context with stand-ins
 * for the browser (document, canvas, storage and so on). A small hook is
 * added to the script text IN MEMORY so tests can reach the script's own
 * variables and functions. The file on disk is never changed, and nothing
 * containing the hook is ever written out.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const MVP_PATH = fileURLToPath(
  new URL('../../../reference/mvp/grazing-game.html', import.meta.url),
);

/** A planting's record for today, as the MVP's fieldState returns it. */
export interface MvpNow {
  stage: string;
  pot: number;
  dmd: number;
  cp: number;
  cpD: number;
  bmax: number;
  sen: number;
  pf?: number;
}

export interface MvpField {
  id: number;
  /** Species key, for example 'oats' or 'phal'. */
  sp: string;
  /** The farm day it was sown. */
  sown: number;
  cells: number[];
  /** Stand strength of a self-sown stand (1 when left out). */
  str?: number;
  now?: MvpNow;
}

export interface MvpAnimal {
  kind: string;
  wt: number;
  age: number;
  lact: number;
  preg: number;
  calf: number;
}

export interface MvpMob {
  loc: string;
  anchor: number;
  animals: MvpAnimal[];
  st?: { demand: number; f: number };
}

/** The part of the MVP's game state the grass code reads. */
export interface MvpState {
  region: string;
  startY: number;
  startM: number;
  day: number;
  rainF: number;
  monthF: number;
  G: Float32Array;
  D: Float32Array;
  A: Float32Array;
  X: Float32Array;
  F: Float32Array;
  land: Uint8Array;
  fid: Int16Array;
  CD: Float32Array;
  graz: Float32Array;
  lastG: Int32Array;
  fields: MvpField[];
  mobs: MvpMob[];
  yr: { grown: number };
}

export interface MvpRegion {
  g: number[];
  scale: number;
  bmax: number;
  dmdMax: number;
  dmdMin: number;
  dmdDead: number;
  cpMax: number;
  frost: number[];
  frostSen: number;
  head: number[];
  util: number;
  peak: number;
  annual: number;
}

export interface MvpPadStats {
  g: number;
  d: number;
  mass: number;
  green: number;
  age: number;
  x: number;
  me: number;
  cp: number;
  rest: number;
  cover: number;
  height: number;
  leafH: number;
  ae: number;
  head: number;
  grow: number;
  eat: number;
  rate: number;
  cc: number;
  feedDays: number;
  zone: string;
  ha: number;
}

export interface MvpArea {
  id: number;
  cells: number[];
  ha: number;
}

/** The MVP's own variables and functions, reached through the in-memory hook. */
export interface Mvp {
  S: MvpState;
  HA: number;
  FMAP: Map<number, MvpField>;
  REGS: MvpArea[];
  ROF: Int16Array;
  readonly REGIONS: Record<string, MvpRegion>;
  readonly SPECIES: Record<string, { type: string; g: number[] | Record<string, number[]> }>;
  readonly ZONES: Record<string, [string, string]>;
  readonly GRW: Float32Array;
  readonly N: number;
  readonly W: number;
  readonly H: number;
  growGrass(record: boolean): void;
  cellQuality(i: number): { pg: number; dmd: number; cp: number; dmdG: number; cpG: number };
  phaseOf(i: number): string;
  padStats(pd: { cells: number[]; ha: number }, part?: number[]): MvpPadStats;
  regionStats(r: { cells: number[] }): {
    g: number;
    d: number;
    mass: number;
    me: number;
    rest: number;
    feed: number;
    green: number;
  };
  coverPct(): number;
  potNow(): number;
  interpMonth(curve: number[], day: number): number;
  fieldState(f: MvpField, day: number, rain: number): MvpNow;
  drawSeason(): [number, string, number];
  aeOf(a: MvpAnimal): number;
  ME(dmd: number): number;
}

export interface LoadedMvp {
  mvp: Mvp;
  /** The MVP script text as it is on disk (without the hook). */
  script: string;
  /**
   * Replace the MVP's Math.random. The MVP is unseeded, so anything that
   * reaches Math.random must be given a repeatable source.
   */
  setRandom(next: () => number): void;
}

// Added before the script's closing line, in memory only. `S`, `HA`, `FMAP`,
// `REGS` and `ROF` are reassigned by the game, so they need getters and setters.
const HOOK = `
globalThis.__mvp={
  get S(){return S},set S(v){S=v},
  get HA(){return HA},set HA(v){HA=v},
  get FMAP(){return FMAP},set FMAP(v){FMAP=v},
  get REGS(){return REGS},set REGS(v){REGS=v},
  get ROF(){return ROF},set ROF(v){ROF=v},
  REGIONS,SPECIES,ZONES,GRW,N,W,H,
  growGrass,cellQuality,phaseOf,padStats,regionStats,coverPct,potNow,interpMonth,fieldState,drawSeason,aeOf,ME
};
`;

/**
 * A stand-in for any browser object. Every property is itself, it can be
 * called or built with `new`, it is empty when looped over, and it reads as
 * 0 where a number is wanted. That is enough for the MVP's start-up code,
 * which wires up buttons and canvases that the tests never use.
 */
function browserStandIn(): unknown {
  const target = function standIn(): void {};
  const proxy: unknown = new Proxy(target, {
    get(_t, key) {
      if (key === Symbol.toPrimitive) return () => 0;
      if (key === Symbol.iterator) return function* empty(): Generator<never> {};
      if (key === 'length') return 0;
      if (key === 'then') return undefined;
      return proxy;
    },
    set: () => true,
    has: () => true,
    apply: () => proxy,
    construct: () => proxy as object,
  });
  return proxy;
}

/** A small seeded generator (mulberry32) for the MVP's Math.random. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The MVP script text, straight from the HTML file. */
export function readMvpScript(): string {
  const html = readFileSync(MVP_PATH, 'utf8');
  const open = html.indexOf('<script>');
  const close = html.lastIndexOf('</script>');
  if (open < 0 || close < open) throw new Error('MVP file: could not find its script');
  return html.slice(open + '<script>'.length, close);
}

/**
 * Load a fresh copy of the MVP. Each call gives a separate game.
 * `extraHook` is more script text added after the hook, in memory only, for
 * a test-support file that needs to reach more of the MVP (see mvpFarm.ts).
 */
export function loadMvp(extraHook = ''): LoadedMvp {
  const script = readMvpScript();
  // The whole script sits inside one function that ends with `})();`.
  const end = script.lastIndexOf('})();');
  if (end < 0) throw new Error('MVP file: could not find the end of its script');
  const hooked = script.slice(0, end) + HOOK + extraHook + script.slice(end);

  const dom = browserStandIn();
  let random = seededRandom(1);
  const noop = (): number => 0;
  const context = vm.createContext({
    document: dom,
    window: dom,
    navigator: dom,
    localStorage: dom,
    Image: dom,
    // The game loop and timers are never started.
    requestAnimationFrame: noop,
    cancelAnimationFrame: noop,
    setTimeout: noop,
    clearTimeout: noop,
    setInterval: noop,
    clearInterval: noop,
    performance: { now: noop },
    __random: () => random(),
  });
  vm.runInContext('Math.random=()=>__random();', context);
  vm.runInContext(hooked, context, { filename: 'mvp-script-in-memory.js' });

  const mvp = (context as { __mvp?: Mvp }).__mvp;
  if (!mvp) throw new Error('MVP file: the test hook did not load');
  return {
    mvp,
    script,
    setRandom(next) {
      random = next;
    },
  };
}

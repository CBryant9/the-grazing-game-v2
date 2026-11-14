/**
 * The farm side of the MVP for tests: fences, water, crops and the layout
 * at the start. It reaches more of the MVP's own variables and functions
 * through a second in-memory hook, and gives the same farm to the MVP and
 * to the engine so their results can be compared.
 *
 * Test use only. Nothing in `src` may import this file.
 */

import type { DistrictId } from '@gg/shared';
import { expect } from 'vitest';
import type { FarmStart } from '../src/calendar';
import { createCropState, type CropContext, type CropState, type Field } from '../src/crops/fields';
import { farmScale } from '../src/data/farms';
import type { SpeciesId } from '../src/data/species';
import type { FarmLayout, Survey } from '../src/farm/layout';
import type { EdgeRef } from '../src/farm/topology';
import { createPastureState, type PastureState } from '../src/pasture/state';
import type { Rng } from '../src/rng';
import { firstDifference } from './farms';
import { loadMvp, type Mvp, type MvpField, type MvpNow, type MvpState } from './mvp';

/** An edge as the MVP writes it: ['h', index] or ['v', index]. */
export type MvpEdge = ['h' | 'v', number];

export interface MvpPort {
  id: number;
  cell: number;
  lvl: number;
  warned: boolean;
  lastUse: number;
}

export interface MvpPad {
  id: number;
  cells: number[];
  ha: number;
  name: string;
  short: string;
  label: number;
  troughs: number[];
}

export interface MvpReg extends MvpPad {
  pads: number[];
}

export interface MvpFarmField extends MvpField {
  regen?: boolean;
  dmgNote?: number;
  lockNote?: number;
}

export interface MvpLogLine {
  d: string;
  msg: string;
  cls: string;
  /** Lines are numbered in the order they were written. */
  seq: number;
}

/** The diary lines the MVP has written since line number `seq`, oldest first. */
export function logSince(mvp: MvpFarm, seq: number): string[] {
  return mvp.S.log
    .filter((l) => l.seq > seq)
    .sort((a, b) => a.seq - b.seq)
    .map((l) => l.msg);
}

/** The parts of the MVP's game state the farm code reads and writes. */
export interface MvpFarmState extends Omit<MvpState, 'fields' | 'mobs'> {
  farmHa: number;
  cellHa: number;
  side: number;
  cash: number;
  overdraft: number;
  infra: number;
  mixed: boolean;
  hE: Uint8Array;
  vE: Uint8Array;
  pipe: Uint8Array;
  troughs: number[];
  hubs: number[];
  ports: MvpPort[];
  tape: number;
  bore: number;
  energiser: boolean;
  arable: Uint8Array;
  Y: Float32Array;
  fields: MvpFarmField[];
  regen: { sp: string; cells: number[]; day: number }[];
  rotBlocks: number[][];
  arableHa: number;
  nid: number;
  log: MvpLogLine[];
  logSeq?: number;
  mobs: {
    id: number;
    name: string;
    loc: string;
    anchor: number;
    animals: { wt: number; kind: string }[];
    plan: unknown;
    supp: string;
  }[];
  startFence: number;
  startGates: number;
  yr: { grown: number; infra: number; running: number; grain: number; crops: number };
}

export interface MvpNewGameOptions {
  region: string;
  year: number;
  month: number;
  ha: number;
  cash?: number;
  overdraft?: number;
  broke?: number;
  herd?: boolean;
  mixed?: boolean;
  arable?: number;
  cropped?: number;
}

export interface MvpSpecies {
  name: string;
  short: string;
  type: string;
  info: string;
  g?: number[] | Record<string, number[]>;
  [key: string]: unknown;
}

/** The MVP with its farm functions reachable. */
export interface MvpFarm extends Omit<Mvp, 'S' | 'SPECIES' | 'FMAP' | 'fieldState'> {
  S: MvpFarmState;
  FMAP: Map<number, MvpFarmField>;
  PADS: MvpPad[];
  POF: Int16Array;
  REGS: MvpReg[];
  readonly DIST: Float32Array;
  /** The MVP's screen state. `portMove` is the portable trough the next placePort call moves. */
  readonly U: { portMove: number | null; playing: boolean; queue: number };
  readonly SPECIES: Record<string, MvpSpecies>;
  readonly FARMS: Record<string, number[]>;
  readonly LAND_OPTS: Record<string, string[]>;
  readonly ROTATION: Record<string, string[]>;
  readonly ARABLE: Record<string, { graze: number[]; mixed: number[] }>;
  readonly CROPF: Record<string, number>;
  readonly CONVERT: number;
  readonly WINTER: number[];
  readonly SUMMER: number[];
  readonly BRASS: number[];
  readonly PORT_CAP: number;
  readonly BLOCK: Uint8Array;
  readonly ALLB: Uint8Array;
  hIdx(vy: number, x: number): number;
  vIdx(y: number, vx: number): number;
  getE(e: MvpEdge): number;
  setE(e: MvpEdge, v: number): void;
  flood(block: Uint8Array): [Int16Array, number[][]];
  labelCell(cells: number[]): number;
  recompute(split?: boolean): void;
  pipeReach(): Uint8Array;
  hubCells(v: number): number[];
  touchesFence(vx: number, vy: number): boolean;
  vertexOnFence(v: number): boolean;
  lineFrom(d: { x0: number; y0: number; x1: number; y1: number }): {
    edges: MvpEdge[];
    ax: number;
    ay: number;
    bx: number;
    by: number;
    aOn: boolean;
    bOn: boolean;
  };
  fenceQuote(
    line: { edges: MvpEdge[] },
    type: number,
  ): { n: number; use?: number; buyN?: number; cost: number };
  buildFence(line: { edges: MvpEdge[]; aOn?: boolean; bOn?: boolean }, type: number): void;
  removeFence(line: { edges: MvpEdge[] }): void;
  tapeRun(e: MvpEdge): MvpEdge[];
  pipeCells(d: { x0: number; y0: number; x1: number; y1: number }): number[];
  layPipe(cells: number[]): void;
  canTrough(i: number): boolean;
  placeTrough(i: number): void;
  moveTrough(from: number, to: number): boolean;
  toggleGate(e: MvpEdge): void;
  placeGate(e: MvpEdge): void;
  fixFence(e: MvpEdge): void;
  placeFenceHub(v: number): void;
  placeHub(cell: number): void;
  boundaryEdges(reg: MvpReg, types: number[]): MvpEdge[];
  placePort(cell: number): void;
  refillPort(pt: MvpPort): void;
  waterUse(): void;
  rebuildFields(): void;
  fieldState(f: MvpField, day: number, rain: number): MvpNow;
  stageText(f: MvpFarmField): string;
  fieldYield(f: MvpFarmField): { tha: number; t: number; ha: number; value: number; cost: number };
  addField(
    key: string,
    cells: number[],
    sown: number,
    o?: { str?: number; regen?: boolean; keep?: boolean },
  ): MvpFarmField;
  endField(f: MvpFarmField): void;
  harvestField(f: MvpFarmField): void;
  cropGrazed(f: MvpFarmField, i: number, r: number, rg: number, g: number): void;
  fieldTick(): void;
  blobGrow(seeds: number[], target: number, mark: Uint8Array): number;
  genArable(pct: number, cropPct: number): void;
  startCropping(): void;
  sowInfo(
    key: string,
    cells: number[],
  ): { use: number[]; conv: number; ha: number; cost: number; now: boolean; crop: boolean };
  cropRisks(area: { cells: number[] }): string[];
  newGame(o: MvpNewGameOptions): void;
  startScratch(): void;
  startLayout(running: boolean): void;
}

// Added after the first hook, in memory only. `PADS` and `POF` are
// reassigned by the game, so they need getters and setters.
const FARM_HOOK = `
Object.defineProperties(globalThis.__mvp,Object.getOwnPropertyDescriptors({
  get PADS(){return PADS},set PADS(v){PADS=v},
  get POF(){return POF},set POF(v){POF=v},
  get DIST(){return DIST},
  U,FARMS,LAND_OPTS,ROTATION,ARABLE,CROPF,CONVERT,WINTER,SUMMER,BRASS,PORT_CAP,BLOCK,ALLB,
  hIdx,vIdx,getE,setE,flood,labelCell,recompute,pipeReach,hubCells,touchesFence,vertexOnFence,lineFrom,fenceQuote,
  buildFence,removeFence,tapeRun,pipeCells,layPipe,canTrough,placeTrough,moveTrough,toggleGate,placeGate,fixFence,
  placeFenceHub,placeHub,boundaryEdges,placePort,refillPort,waterUse,rebuildFields,stageText,fieldYield,addField,
  endField,harvestField,cropGrazed,fieldTick,blobGrow,genArable,startCropping,sowInfo,cropRisks,newGame,startScratch,startLayout
}));
`;

export interface LoadedMvpFarm {
  mvp: MvpFarm;
  /** Replace the MVP's Math.random. */
  setRandom(next: () => number): void;
}

/**
 * Load a fresh copy of the MVP with its farm functions reachable.
 * `extraHook` is more script text added after the farm hook, in memory only
 * (see mvpWhole.ts).
 */
export function loadMvpFarm(extraHook = ''): LoadedMvpFarm {
  const loaded = loadMvp(FARM_HOOK + extraHook);
  return { mvp: loaded.mvp as unknown as MvpFarm, setRandom: loaded.setRandom };
}

/**
 * Start a game in the MVP with its own newGame, so its state is complete.
 * Money is set so the bank never refuses a job: the tests are about the
 * rules, not the cash.
 */
export function mvpNewGame(
  loaded: LoadedMvpFarm,
  o: MvpNewGameOptions,
  random: () => number,
): MvpFarmState {
  loaded.setRandom(random);
  loaded.mvp.newGame({ cash: 1e12, overdraft: -1e12, broke: -1e13, ...o });
  return loaded.mvp.S;
}

/** Feed the MVP's Math.random from an engine stream, one number at a time. */
export const randomFrom =
  (rng: Rng): (() => number) =>
  () =>
    rng.next();

export const toMvpEdge = (e: EdgeRef): MvpEdge => [e.line, e.index];
export const fromMvpEdge = (e: MvpEdge): EdgeRef => ({ line: e[0], index: e[1] });

/** The engine's layout for the MVP's current farm: a separate copy. */
export function layoutFromMvp(mvp: MvpFarm): FarmLayout {
  const S = mvp.S;
  const ports = (S.ports || []).map((p) => ({
    id: p.id,
    cell: p.cell,
    level: p.lvl,
    warned: p.warned,
    lastUse: p.lastUse,
  }));
  return {
    scale: farmScale(S.farmHa),
    fences: { hE: S.hE.slice(), vE: S.vE.slice() },
    water: {
      bore: S.bore,
      pipe: S.pipe.slice(),
      troughs: S.troughs.slice(),
      hubs: (S.hubs || []).slice(),
      ports,
      nextPortId: S.nid,
    },
    tapeOnRoll: S.tape || 0,
    // The MVP kept no fence materials.
    fenceOnHand: { permanent: 0, electric: 0 },
  };
}

/** Give the MVP the engine's layout and have it work out its paddocks and water again. */
export function putLayout(mvp: MvpFarm, layout: FarmLayout): void {
  const S = mvp.S;
  mvp.HA = layout.scale.haPerSquare;
  S.farmHa = layout.scale.farmHa;
  S.cellHa = layout.scale.haPerSquare;
  S.side = layout.scale.sideM;
  S.hE = layout.fences.hE.slice();
  S.vE = layout.fences.vE.slice();
  S.bore = layout.water.bore;
  S.pipe = layout.water.pipe.slice();
  S.troughs = layout.water.troughs.slice();
  S.hubs = layout.water.hubs.slice();
  S.ports = layout.water.ports.map((p) => ({
    id: p.id,
    cell: p.cell,
    lvl: p.level,
    warned: p.warned,
    lastUse: p.lastUse,
  }));
  S.tape = layout.tapeOnRoll;
  mvp.recompute();
}

/** Assert the engine's layout equals the MVP's farm: every edge, pipe, trough, hub and portable. */
export function expectSameLayout(layout: FarmLayout, mvp: MvpFarm, where = ''): void {
  const S = mvp.S;
  expect(firstDifference(layout.fences.hE, S.hE), `hE ${where}`).toBeNull();
  expect(firstDifference(layout.fences.vE, S.vE), `vE ${where}`).toBeNull();
  expect(firstDifference(layout.water.pipe, S.pipe), `pipe ${where}`).toBeNull();
  expect(layout.water.bore, `bore ${where}`).toBe(S.bore);
  expect(layout.water.troughs, `troughs ${where}`).toEqual(Array.from(S.troughs));
  expect(layout.water.hubs, `hubs ${where}`).toEqual(Array.from(S.hubs || []));
  expect(
    layout.water.ports.map((p) => [p.id, p.cell, p.level, p.warned, p.lastUse]),
    `portable troughs ${where}`,
  ).toEqual((S.ports || []).map((p) => [p.id, p.cell, p.lvl, p.warned, p.lastUse]));
  expect(layout.tapeOnRoll, `tape on the roll ${where}`).toBe(S.tape || 0);
}

/**
 * Assert the engine's paddocks, grazing areas, watered squares and distance
 * to water equal the MVP's, exactly: the same ids for every square, the
 * same squares, names, labels and areas, the same watered squares in the
 * same order, and the same distance on every square bit for bit.
 */
export function expectSameSurvey(survey: Survey, mvp: MvpFarm, where = ''): void {
  const { topology: t, points } = survey;
  expect(firstDifference(t.paddockOf, mvp.POF), `paddock of each square ${where}`).toBeNull();
  expect(firstDifference(t.areaOf, mvp.ROF), `grazing area of each square ${where}`).toBeNull();
  expect(firstDifference(points.dist, mvp.DIST), `distance to water ${where}`).toBeNull();
  expect(
    t.paddocks.map((p) => ({ ...p, troughs: points.paddockTroughs[p.id] })),
    `paddocks ${where}`,
  ).toEqual(
    mvp.PADS.map((p) => ({
      id: p.id,
      cells: Array.from(p.cells),
      ha: p.ha,
      name: p.name,
      label: p.label,
      troughs: Array.from(p.troughs),
    })),
  );
  expect(
    t.areas.map((r) => ({ ...r, troughs: points.areaTroughs[r.id] })),
    `grazing areas ${where}`,
  ).toEqual(
    mvp.REGS.map((r) => ({
      id: r.id,
      cells: Array.from(r.cells),
      paddocks: Array.from(r.pads),
      ha: r.ha,
      name: r.name,
      label: r.label,
      troughs: Array.from(r.troughs),
    })),
  );
}

/** A farm's crops and pasture in the engine, copied from the MVP's current farm. */
export interface EngineCrops {
  crops: CropState;
  pasture: PastureState;
  ctx: CropContext;
}

/** The engine's planting record for one of the MVP's. */
export function fieldFromMvp(f: MvpFarmField): Field {
  const out: Field = { id: f.id, sp: f.sp as SpeciesId, sown: f.sown, cells: Array.from(f.cells) };
  if (f.str !== undefined) out.str = f.str;
  if (f.regen) out.regen = true;
  if (f.dmgNote) out.dmgNote = true;
  if (f.lockNote) out.lockNote = true;
  return out;
}

/** Copy the MVP's pasture and crops into engine state. */
export function cropsFromMvp(mvp: MvpFarm): EngineCrops {
  const S = mvp.S;
  const pasture = createPastureState();
  pasture.G.set(S.G);
  pasture.D.set(S.D);
  pasture.A.set(S.A);
  pasture.X.set(S.X);
  pasture.F.set(S.F);
  pasture.land.set(S.land);
  pasture.graz.set(S.graz);
  pasture.lastG.set(S.lastG);
  const crops = createCropState();
  crops.fid.set(S.fid);
  crops.density.set(S.CD);
  crops.yieldT.set(S.Y);
  crops.arable.set(S.arable);
  crops.fields = S.fields.map(fieldFromMvp);
  crops.regen = (S.regen || []).map((r) => ({
    sp: r.sp as SpeciesId,
    cells: Array.from(r.cells),
    day: r.day,
  }));
  crops.rotBlocks = (S.rotBlocks || []).map((b) => Array.from(b));
  crops.nextFieldId = S.nid;
  const start: FarmStart = { year: S.startY, month: S.startM };
  return {
    crops,
    pasture,
    ctx: {
      district: S.region as DistrictId,
      start,
      haPerSquare: mvp.HA,
      mixed: !!S.mixed,
    },
  };
}

/** Assert the engine's crops and pasture equal the MVP's, exactly. */
export function expectSameCrops(e: EngineCrops, mvp: MvpFarm, where = ''): void {
  const S = mvp.S;
  const pairs: [string, ArrayLike<number>, ArrayLike<number>][] = [
    ['G', e.pasture.G, S.G],
    ['D', e.pasture.D, S.D],
    ['A', e.pasture.A, S.A],
    ['X', e.pasture.X, S.X],
    ['land', e.pasture.land, S.land],
    ['planting ids', e.crops.fid, S.fid],
    ['stand density', e.crops.density, S.CD],
    ['yield', e.crops.yieldT, S.Y],
    ['arable', e.crops.arable, S.arable],
  ];
  for (const [name, mine, theirs] of pairs) {
    expect(firstDifference(mine, theirs), `${name} ${where}`).toBeNull();
  }
  const plain = (f: {
    id: number;
    sp: string;
    sown: number;
    cells: number[];
    str?: number;
    regen?: boolean;
    dmgNote?: boolean | number;
    lockNote?: boolean | number;
  }): unknown => ({
    id: f.id,
    sp: f.sp,
    sown: f.sown,
    cells: Array.from(f.cells),
    str: f.str,
    regen: !!f.regen,
    dmgNote: !!f.dmgNote,
    lockNote: !!f.lockNote,
  });
  expect(e.crops.fields.map(plain), `plantings ${where}`).toEqual(S.fields.map(plain));
  expect(
    e.crops.regen.map((r) => ({ sp: r.sp, cells: r.cells, day: r.day })),
    `seed waiting ${where}`,
  ).toEqual((S.regen || []).map((r) => ({ sp: r.sp, cells: Array.from(r.cells), day: r.day })));
}

/**
 * The farm view: what the map is drawn from.
 *
 * The simulation runs on the server. The browser is sent this view and
 * nothing else about the farm's country: plain numbers for each square,
 * the fences, the water, the buildings, the paddocks and the mobs (PRD 5.16).
 *
 * Every figure here is read from the model's own functions (the paddock
 * summary, the survey, the mob summaries), so the picture matches the
 * numbers on the paddock sheet. Figures are rounded to what the map can
 * show, which also keeps the view small.
 *
 * It must never carry a rule: no formulas, no data tables, no prices, no
 * seed, no random number state, no soil fertility, no grain yield in
 * prospect and nothing about days to come. `view.test.ts` walks the view
 * and checks it holds only the fields listed there.
 */

import {
  FARM_VIEW_VERSION,
  VIEW_FENCE,
  VIEW_LABELS,
  type FarmView,
  type FarmViewArea,
  type FarmViewBuilding,
  type FarmViewCattle,
  type FarmViewFences,
  type FarmViewGate,
  type FarmViewMob,
  type FarmViewPaddock,
  type FarmViewPart,
  type FarmViewPlanting,
  type FarmViewSquares,
  type FarmViewSward,
  type FarmViewTrough,
  type ViewCattleKind,
} from '@gg/shared';
import { fieldProgress } from '../crops/fields';
import { DISTRICTS } from '../data/districts';
import { SPECIES } from '../data/species';
import { daylightFor } from '../daylight/daylight';
import { DISTRICT_PLACES } from '../daylight/places';
import { EDGE, labelSquare } from '../farm/topology';
import { NO_WATER_DISTANCE, PORTABLE_CAPACITY_L, pipeReach } from '../farm/water';
import { GRID_N } from '../grid';
import { clamp } from '../num';
import { LAND } from '../pasture/state';
import { paddockSummary, type PaddockSummary } from '../pasture/summary';
import { hash32 } from '../rng';
import { dateOn, plantingsNow, surveyOf, type SourceEnv } from './derived';
import type { FarmState } from './state';
import { mobSummaries, paddockSummaries } from './summary';

/** Green leaf looks old by this age, days (docs/VISUALS.md, green leaf colour). */
export const VIEW_OLD_LEAF_DAYS = 80;
/** Dry feed looks fully weathered at this much dead feed, kg DM/ha (docs/VISUALS.md). */
export const VIEW_WEATHERED_KG = 4500;
/** Seed heads show on pasture past this rankness and this much feed (docs/VISUALS.md). */
export const VIEW_SEED_HEADS = { rankness: 0.35, massKgHa: 1800 } as const;
/** Cattle below this condition score are drawn thin, and at or above the other, fat (docs/VISUALS.md). */
export const VIEW_BODY_SHAPE = { thinBelow: 2, fatFrom: 3.6 } as const;

const EDGE_TO_VIEW: Record<number, number> = {
  [EDGE.none]: VIEW_FENCE.none,
  [EDGE.permanent]: VIEW_FENCE.permanent,
  [EDGE.electric]: VIEW_FENCE.electric,
  [EDGE.tape]: VIEW_FENCE.tape,
  [EDGE.gateShut]: VIEW_FENCE.gate,
  [EDGE.gateOpen]: VIEW_FENCE.gate,
  [EDGE.electricDown]: VIEW_FENCE.electricDown,
  [EDGE.tapeDown]: VIEW_FENCE.tapeDown,
  [EDGE.boundary]: VIEW_FENCE.boundary,
};

/** In the side-view picture seed heads show past this rankness (the MVP's drawSward; docs/VISUALS.md). */
export const VIEW_SWARD_SEED_HEADS_RANKNESS = 0.3;

const round1 = (v: number): number => Math.round(v * 10) / 10;
const nearest10 = (v: number): number => Math.round(v / 10) * 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;

function swardOf(s: PaddockSummary): FarmViewSward {
  // Rounded to what a paddock sheet shows. Finer figures would let the
  // height and leaf-reach rules be worked back out of the view.
  return {
    massKgHa: nearest10(s.mass),
    greenKgHa: nearest10(s.g),
    deadKgHa: nearest10(s.d),
    heightCm: Math.round(s.height),
    leafCm: Math.round(s.leafH),
    greenPct: Math.round(s.green * 100),
    coverPct: Math.round(s.cover * 100),
    seedHeads:
      s.x > VIEW_SWARD_SEED_HEADS_RANKNESS ? Math.max(1, Math.round(clamp(s.x, 0, 1) * 10)) : 0,
    leafAge: Math.round(clamp(s.age / VIEW_OLD_LEAF_DAYS, 0, 1) * 10),
  };
}

const KIND_ORDER: readonly ViewCattleKind[] = ['cow', 'heifer', 'steer', 'bull', 'calf'];

/**
 * Build the view of a farm as it stands. The farm is only read.
 * `env.seasons` is for a farm run on growth factors other than its own.
 * A real-year farm needs its real data in `env.data`, as every read of
 * its weather does.
 */
export function farmView(farm: FarmState, env: SourceEnv = {}): FarmView {
  const survey = surveyOf(farm);
  const { topology, points } = survey;
  const { pasture, crops, layout } = farm;
  const { fences, water, scale } = layout;
  const district = DISTRICTS[farm.district];
  const plantings = plantingsNow(farm, env);
  const cropCtx = { district: farm.district, start: farm.start };

  // ---- Plantings
  const plantingIndex = new Map<number, number>();
  const plantingList: FarmViewPlanting[] = crops.fields.map((f, k) => {
    plantingIndex.set(f.id, k);
    const sp = SPECIES[f.sp];
    return {
      id: f.id,
      name: sp.short,
      kind: sp.type,
      stage: plantings?.byId.get(f.id)?.now.stage ?? 'none',
      squares: f.cells.length,
      labelCell: f.cells.length ? labelSquare(f.cells) : 0,
      selfSown: !!f.regen,
      oversown: !!sp.oversow,
      ready: sp.type === 'crop' && fieldProgress(f, farm.day, cropCtx).code === 'ready-to-harvest',
    };
  });

  // ---- Squares
  const sq: FarmViewSquares = {
    land: new Array<number>(GRID_N),
    heightCm: new Array<number>(GRID_N),
    green: new Array<number>(GRID_N),
    cover: new Array<number>(GRID_N),
    leafAge: new Array<number>(GRID_N),
    weathered: new Array<number>(GRID_N),
    seedHeads: new Array<number>(GRID_N),
    label: new Array<number>(GRID_N),
    planting: new Array<number>(GRID_N),
    me10: new Array<number>(GRID_N),
    grazed: new Array<number>(GRID_N),
    waterDist: new Array<number>(GRID_N),
    arable: new Array<number>(GRID_N),
    paddock: new Array<number>(GRID_N),
    area: new Array<number>(GRID_N),
  };
  const one = [0];
  for (let i = 0; i < GRID_N; i++) {
    one[0] = i;
    // The paddock summary of the square on its own: the same height, green
    // share, cover, label and diet energy the paddock sheet would show.
    const s = paddockSummary(pasture, {
      district,
      plantings,
      cells: one,
      ha: scale.haPerSquare,
      haPerSquare: scale.haPerSquare,
      day: farm.day,
    });
    const land = pasture.land[i]!;
    const k = plantingIndex.get(crops.fid[i]!);
    const stage = k === undefined ? null : plantingList[k]!.stage;
    let seed = 0;
    if (land === LAND.annual || land === LAND.crop) {
      // A planting that has finished and gone leaves its square looking finished.
      seed = stage === null || stage === 'head' || stage === 'done' ? 1 : 0;
    } else if (land === LAND.native || land === LAND.sown) {
      seed = s.x > VIEW_SEED_HEADS.rankness && s.mass > VIEW_SEED_HEADS.massKgHa ? 1 : 0;
    }
    const dist = points.dist[i]!;
    sq.land[i] = land;
    sq.heightCm[i] = Math.round(s.height);
    sq.green[i] = Math.round(clamp(s.green, 0, 1) * 20);
    sq.cover[i] = Math.round(clamp(s.cover, 0, 1) * 10);
    sq.leafAge[i] = Math.round(clamp(s.age / VIEW_OLD_LEAF_DAYS, 0, 1) * 10);
    sq.weathered[i] = Math.round(clamp(s.d / VIEW_WEATHERED_KG, 0, 1) * 10);
    sq.seedHeads[i] = seed;
    sq.label[i] = VIEW_LABELS.indexOf(s.label);
    sq.planting[i] = k === undefined ? 0 : k + 1;
    sq.me10[i] = Math.round(s.me * 10);
    sq.grazed[i] = Math.round(clamp(pasture.graz[i]!, 0, 1) * 10);
    sq.waterDist[i] = dist >= NO_WATER_DISTANCE ? -1 : Math.round((dist * scale.sideM) / 100);
    sq.arable[i] = crops.arable[i] ? 1 : 0;
    sq.paddock[i] = topology.paddockOf[i]!;
    sq.area[i] = topology.areaOf[i]!;
  }

  // ---- Fences and gates
  const viewFences: FarmViewFences = { h: [], v: [] };
  const gates: FarmViewGate[] = [];
  const copyEdges = (line: 'h' | 'v', codes: Uint8Array, out: number[]): void => {
    for (let index = 0; index < codes.length; index++) {
      const code = codes[index]!;
      out.push(EDGE_TO_VIEW[code] ?? VIEW_FENCE.none);
      if (code === EDGE.gateShut || code === EDGE.gateOpen) {
        gates.push({ line, index, open: code === EDGE.gateOpen, kind: 'swing' });
      }
    }
  };
  copyEdges('h', fences.hE, viewFences.h);
  copyEdges('v', fences.vE, viewFences.v);

  // ---- Water
  const reach = pipeReach(water);
  const pipe: number[] = [];
  const pipeDry: number[] = [];
  for (let i = 0; i < GRID_N; i++) {
    if (!water.pipe[i]) continue;
    (reach[i] ? pipe : pipeDry).push(i);
  }
  const troughs: FarmViewTrough[] = [
    ...water.troughs.map((cell): FarmViewTrough => ({ kind: 'fixed', cell, id: 0, levelPct: 100 })),
    ...water.ports.map((p): FarmViewTrough => ({
      kind: 'portable',
      cell: p.cell,
      id: p.id,
      levelPct: Math.round(clamp(p.level / PORTABLE_CAPACITY_L, 0, 1) * 100),
    })),
  ];

  // ---- Buildings
  const buildings: FarmViewBuilding[] = [
    { kind: 'homestead', cell: farm.buildings.homestead },
    { kind: 'yards', cell: farm.buildings.yards },
  ];

  // ---- Paddocks and grazing areas
  const summaries = paddockSummaries(farm, env);
  const paddocks: FarmViewPaddock[] = summaries.map((p) => {
    const pd = topology.paddocks[p.id]!;
    const groups: Record<FarmViewPart['kind'], number[]> = {
      pasture: [],
      crop: [],
      stubble: [],
      fallow: [],
    };
    for (const i of pd.cells) {
      const land = pasture.land[i]!;
      const kind =
        land === LAND.annual || land === LAND.crop
          ? 'crop'
          : land === LAND.stubble
            ? 'stubble'
            : land === LAND.fallow
              ? 'fallow'
              : 'pasture';
      groups[kind].push(i);
    }
    const kinds = (Object.keys(groups) as FarmViewPart['kind'][]).filter((g) => groups[g].length);
    const parts: FarmViewPart[] =
      kinds.length < 2
        ? []
        : kinds.map((kind) => {
            const cells = groups[kind];
            // The planting on most of the part's squares.
            const tally = new Map<number, number>();
            for (const i of cells) {
              const k = plantingIndex.get(crops.fid[i]!);
              if (k !== undefined) tally.set(k, (tally.get(k) ?? 0) + 1);
            }
            let main = -1;
            let most = 0;
            for (const [k, n] of tally) {
              if (n > most) {
                most = n;
                main = k;
              }
            }
            return {
              kind,
              ha: round1(cells.length * scale.haPerSquare),
              planting: kind === 'crop' ? main : -1,
              sward: swardOf(
                paddockSummary(pasture, {
                  district,
                  plantings,
                  cells,
                  ha: pd.ha,
                  haPerSquare: scale.haPerSquare,
                  day: farm.day,
                }),
              ),
            };
          });
    return {
      id: p.id,
      name: p.name,
      ha: round1(p.ha),
      labelCell: pd.label,
      area: p.areaId,
      label: p.label,
      water: p.water,
      mobs: p.mobs,
      sward: swardOf(p),
      parts,
    };
  });
  const areas: FarmViewArea[] = topology.areas.map((r) => ({
    id: r.id,
    name: r.name,
    ha: round1(r.ha),
    labelCell: r.label,
    paddocks: r.paddocks.slice(),
    hasWater: points.areaTroughs[r.id]!.length > 0,
  }));

  // ---- Mobs
  const mobSums = mobSummaries(farm);
  const mobs: FarmViewMob[] = farm.mobs.map((m, k) => {
    const sum = mobSums[k]!;
    const tally = new Map<ViewCattleKind, FarmViewCattle>();
    let toMark = 0;
    for (const a of m.animals) {
      let c = tally.get(a.kind);
      if (!c) tally.set(a.kind, (c = { kind: a.kind, n: 0, thin: 0, fat: 0 }));
      c.n++;
      if (a.cond < VIEW_BODY_SHAPE.thinBelow) c.thin++;
      else if (a.cond >= VIEW_BODY_SHAPE.fatFrom) c.fat++;
      if (a.sex === 'M' && (a.kind === 'calf' || a.young)) toMark++;
    }
    const anchor = m.where.kind === 'paddock' ? m.where.anchor : -1;
    const classes: Record<string, number> = {};
    for (const key of Object.keys(sum.classes).sort()) {
      classes[key] = sum.classes[key as keyof typeof sum.classes]!;
    }
    return {
      id: m.id,
      name: m.name,
      where: m.where.kind,
      area: anchor >= 0 ? topology.areaOf[anchor]! : -1,
      anchor,
      head: sum.head,
      calves: sum.calves,
      ae: round1(sum.ae),
      classes,
      cattle: KIND_ORDER.filter((kind) => tally.has(kind)).map((kind) => tally.get(kind)!),
      // From the mob's id only. The farm's seed must never reach the browser.
      seed: hash32('map-mob:' + m.id),
      status: { noWater: !sum.hasWater, dryDays: sum.dryDays, toMark },
    };
  });

  // The date the game reports: the real date on a real-year farm.
  const date = dateOn(farm);
  const light = daylightFor(DISTRICT_PLACES[farm.district], date);

  return {
    viewVersion: FARM_VIEW_VERSION,
    district: farm.district,
    day: farm.day,
    date: { year: date.year, month: date.month, date: date.date },
    light: { first: Math.round(light.firstLight), last: Math.round(light.lastLight) },
    scale: {
      farmHa: scale.farmHa,
      haPerSquare: round2(scale.haPerSquare),
      sideM: round1(scale.sideM),
    },
    squares: sq,
    fences: viewFences,
    gates,
    water: { bore: water.bore, pipe, pipeDry, troughs, hubs: water.hubs.slice() },
    // The model has no trees. The MVP's 16 trees were decoration only.
    trees: [],
    buildings,
    paddocks,
    areas,
    plantings: plantingList,
    mobs,
  };
}

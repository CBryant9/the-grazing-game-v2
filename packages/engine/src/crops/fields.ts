/**
 * Sown pastures, forages and crops: what each planting is doing, sowing,
 * grazing damage, yield, harvest and what is left afterwards.
 *
 * These are the MVP's fieldState, fieldYield, addField, endField,
 * harvestField, cropGrazed, sowInfo, cropRisks and stageText, matched number
 * for number (docs/MODEL.md, section 4). The order of the arithmetic
 * matters, so keep each expression as it is written.
 *
 * Like the daily pasture step, the functions that change the farm change
 * the pasture and crop state they are given, in place. They never touch
 * anything else. Where the MVP wrote a diary line or stopped the clock,
 * these return a record instead and the caller decides what to show.
 */

import type { DistrictId } from '@gg/shared';
import { dateAt, type FarmStart } from '../calendar';
import { CONVERT_COST_PER_HA, CROP_DISTRICT_FACTORS, LAND_OPTIONS } from '../data/crops';
import { DISTRICTS } from '../data/districts';
import { SPECIES, speciesCurve, type Species, type SpeciesId } from '../data/species';
import { GRID_N } from '../grid';
import { clamp, lerp } from '../num';
import type { Planting, PlantingNow, PlantingStage, Plantings } from '../pasture/plantings';
import { interpMonth } from '../pasture/potential';
import { LAND, type PastureState } from '../pasture/state';

/** One planting: a species sown on a set of squares on one day. */
export interface Field {
  id: number;
  sp: SpeciesId;
  /** The farm day it was sown. */
  sown: number;
  /** Its squares. */
  cells: number[];
  /** Stand strength of a self-sown stand. Left out for a full stand. */
  str?: number;
  /** True for a stand that came back from seed. It does not come back a second time. */
  regen?: boolean;
  /** True once the grazing-damage notice has gone out for this planting. */
  dmgNote?: boolean;
  /** True once the grazing-after-lock-up notice has gone out for this planting. */
  lockNote?: boolean;
}

/** Seed left by a finished annual pasture, waiting for its next sowing window. */
export interface Regen {
  sp: SpeciesId;
  cells: number[];
  /** The farm day it comes up. */
  day: number;
}

/** The cropping side of a farm. */
export interface CropState {
  fields: Field[];
  /** The planting on each square, by id. -1 means none. */
  fid: Int16Array;
  /** Stand density on each square. 1 is a full stand. Grazing too early lowers it. */
  density: Float32Array;
  /** Grain yield in prospect on each square, t/ha, before the season is counted. */
  yieldT: Float32Array;
  /** 1 where the land is arable, for each square. Crops and forages only go there. */
  arable: Uint8Array;
  regen: Regen[];
  /** The id the next planting gets. */
  nextFieldId: number;
  /** The rotation blocks laid out at the start of a mixed farm. The last one starts in fallow. */
  rotBlocks: number[][];
}

/** A farm with nothing sown and no arable land. */
export function createCropState(): CropState {
  return {
    fields: [],
    fid: new Int16Array(GRID_N).fill(-1),
    density: new Float32Array(GRID_N).fill(1),
    yieldT: new Float32Array(GRID_N),
    arable: new Uint8Array(GRID_N),
    regen: [],
    nextFieldId: 1,
    rotBlocks: [],
  };
}

export function cloneCropState(c: CropState): CropState {
  return {
    fields: c.fields.map((f) => ({ ...f, cells: f.cells.slice() })),
    fid: c.fid.slice(),
    density: c.density.slice(),
    yieldT: c.yieldT.slice(),
    arable: c.arable.slice(),
    regen: c.regen.map((r) => ({ ...r, cells: r.cells.slice() })),
    nextFieldId: c.nextFieldId,
    rotBlocks: c.rotBlocks.map((b) => b.slice()),
  };
}

/** The facts about the farm the crop rules need. */
export interface CropContext {
  district: DistrictId;
  start: FarmStart;
  /** Hectares in one square. */
  haPerSquare: number;
  /** True for a mixed farm. It gets sowing reminders even with nothing in fallow. */
  mixed?: boolean;
}

/** The planting with the given id, or null. */
export function fieldById(crops: CropState, id: number): Field | null {
  if (id < 0) return null;
  for (const f of crops.fields) if (f.id === id) return f;
  return null;
}

/** The planting on a square, or null. */
export const fieldAt = (crops: CropState, i: number): Field | null =>
  fieldById(crops, crops.fid[i]!);

/**
 * What a planting is doing on a given day: its growth potential, quality
 * and stage. `monthF` is the month factor for that day. This is the record
 * the pasture step reads.
 */
export function fieldState(
  f: Pick<Field, 'sp' | 'sown' | 'str'>,
  day: number,
  monthF: number,
  ctx: Pick<CropContext, 'district' | 'start'>,
): PlantingNow {
  const sp = SPECIES[f.sp];
  const t = day - f.sown;
  const date = dateAt(ctx.start, day);
  if (sp.type === 'pasture') {
    // Establishing pasture grows at 20% rising to 100%. Past its life it
    // thins by 15% a year, to no less than 55% of a full stand.
    const est = clamp(0.2 + (0.8 * t) / sp.estab, 0.2, 1);
    const yrs = t / 365;
    const pf = yrs < sp.life! ? 1 : Math.max(0.55, 1 - (yrs - sp.life!) * 0.15);
    let pot: number;
    let dmd: number;
    let cp: number;
    let cpD: number;
    let bmax: number;
    if (sp.oversow) {
      const R = DISTRICTS[ctx.district];
      pot = interpMonth(R.g, date) * R.scale * sp.gx!;
      dmd = R.dmdMax + sp.dmdAdd!;
      cp = R.cpMax + sp.cpAdd!;
      cpD = 5 + sp.cpDeadAdd!;
      bmax = R.bmax;
    } else {
      pot = interpMonth(speciesCurve(sp, ctx.district), date);
      dmd = sp.dmd! - (1 - pf) * 0.1;
      cp = sp.cp! - (1 - pf) * 8;
      cpD = sp.cpDead || 6;
      bmax = sp.bmax!;
    }
    return {
      stage: t < sp.estab ? 'est' : 'ok',
      pot: pot * (sp.oversow ? 1 : est) * pf * monthF,
      dmd,
      cp,
      cpD,
      bmax,
      sen: 0,
      pf,
    };
  }
  const life = cropLife(sp);
  const head = sp.head || Math.round(sp.life! * 0.75);
  const lock = sp.lock || head;
  if (t < 0) return { stage: 'none', pot: 0, dmd: 0.5, cp: 5, cpD: 4, bmax: 1000, sen: 0 };
  let sf: number;
  let stage: PlantingStage;
  if (t < sp.estab) {
    sf = 0.25 + (0.75 * t) / sp.estab;
    stage = 'est';
  } else if (t < lock) {
    sf = 1;
    stage = 'veg';
  } else if (t < head) {
    sf = 1;
    stage = 'lock';
  } else if (t < life) {
    sf = 0.3;
    stage = 'head';
  } else {
    sf = 0;
    stage = 'done';
  }
  // Leafy until lock-up, then quality falls as it heads and ripens.
  let dmd = sp.dmdV!;
  let cp = sp.cpV!;
  if (t >= lock && t < head) {
    const k = (t - lock) / Math.max(1, head - lock);
    dmd = lerp(sp.dmdV!, sp.dmdV! - 0.1, k);
    cp = lerp(sp.cpV!, sp.cpV! * 0.6, k);
  } else if (t >= head) {
    const k = clamp((t - head) / Math.max(1, life - head), 0, 1);
    dmd = lerp(sp.dmdV! - 0.1, 0.58, k);
    cp = lerp(sp.cpV! * 0.6, 7, k);
  }
  if (stage === 'done') {
    dmd = 0.52;
    cp = 5;
  }
  return {
    stage,
    pot:
      interpMonth(speciesCurve(sp, ctx.district), date) *
      CROP_DISTRICT_FACTORS[ctx.district] *
      sf *
      monthF *
      (f.str || 1),
    dmd,
    cp,
    cpD: 5,
    bmax: sp.bmax || 9000,
    sen: stage === 'head' ? 0.015 : stage === 'done' ? 0.04 : 0,
  };
}

/** Days from sowing until a crop's grain is ready, or an annual finishes. */
function cropLife(sp: Species): number {
  return (sp.type === 'crop' ? sp.mature : sp.life)!;
}

/**
 * What every planting is doing on a day, in the form the pasture step and
 * the feed quality rules read. Returns null for a farm with nothing sown.
 * Work this out after the day's fieldTick.
 */
export function plantingsOn(
  crops: CropState,
  day: number,
  monthF: number,
  ctx: Pick<CropContext, 'district' | 'start'>,
): Plantings | null {
  if (!crops.fields.length) return null;
  const byId = new Map<number, Planting>();
  for (const f of crops.fields) {
    byId.set(f.id, { kind: SPECIES[f.sp].type, now: fieldState(f, day, monthF, ctx) });
  }
  return { fid: crops.fid, density: crops.density, byId };
}

/** A grain crop's yield as it stands. */
export interface FieldYield {
  /** Tonnes of grain per hectare. */
  tha: number;
  /** Tonnes of grain. */
  t: number;
  ha: number;
  /** What the grain is worth, $. */
  value: number;
  /** What harvesting costs, $. */
  cost: number;
}

/**
 * A crop's yield in prospect. Each square's yield, after any grazing damage
 * and shedding, is averaged and scaled by the season: the season factor,
 * held between 0.4 and 1.4, to the power 0.8.
 */
export function fieldYield(
  crops: CropState,
  f: Field,
  seasonF: number,
  haPerSquare: number,
): FieldYield {
  const sp = SPECIES[f.sp];
  let y = 0;
  for (const i of f.cells) y += crops.yieldT[i]!;
  const tha = (y / f.cells.length) * Math.pow(clamp(seasonF, 0.4, 1.4), 0.8);
  const ha = f.cells.length * haPerSquare;
  const t = tha * ha;
  return { tha, t, ha, value: t * (sp.price || 0), cost: ha * (sp.harvest || 0) };
}

export interface AddFieldOptions {
  /** Stand strength of a self-sown stand. */
  str?: number;
  /** True for a stand that came back from seed. */
  regen?: boolean;
  /** Keep the feed that is standing on the squares, instead of starting from a bare seedbed. */
  keep?: boolean;
}

/**
 * Put a planting on a set of squares. Squares are taken out of any planting
 * they were in. A new pasture or crop starts from a sprayed-out seedbed,
 * unless it is oversown into the pasture that is there.
 */
export function addField(
  crops: CropState,
  pasture: PastureState,
  ctx: Pick<CropContext, 'district'>,
  key: SpeciesId,
  cells: readonly number[],
  sown: number,
  o: AddFieldOptions = {},
): Field {
  const sp = SPECIES[key];
  const f: Field = { id: crops.nextFieldId++, sp: key, sown, cells: cells.slice() };
  if (o.str !== undefined) f.str = o.str;
  if (o.regen) f.regen = true;
  for (const i of cells) {
    const old = fieldAt(crops, i);
    if (old) old.cells = old.cells.filter((c) => c !== i);
    crops.fid[i] = f.id;
    crops.density[i] = 1;
    if (sp.type === 'pasture') {
      pasture.land[i] = LAND.sown;
      if (!sp.oversow && !o.keep) {
        pasture.G[i] = 120;
        pasture.D[i] = Math.min(pasture.D[i]!, 400);
        pasture.A[i] = 0;
        pasture.X[i] = 0;
      }
    } else {
      pasture.land[i] = sp.type === 'crop' ? LAND.crop : LAND.annual;
      if (!o.keep) {
        pasture.G[i] = 40;
        pasture.D[i] = Math.min(pasture.D[i]!, 150);
        pasture.A[i] = 0;
        pasture.X[i] = 0;
      }
      crops.yieldT[i] = (sp.yield || 0) * CROP_DISTRICT_FACTORS[ctx.district];
    }
  }
  crops.fields = crops.fields.filter((x) => x.cells.length);
  crops.fields.push(f);
  return f;
}

/**
 * A planting comes to its end. On arable land it is left as dry standing
 * stubble, which never regrows. Anywhere else the square goes back to
 * native pasture. An annual pasture leaves seed that comes up once, in its
 * next sowing window.
 */
export function endField(
  crops: CropState,
  pasture: PastureState,
  ctx: Pick<CropContext, 'start'>,
  f: Field,
  day: number,
): void {
  const sp = SPECIES[f.sp];
  for (const i of f.cells) {
    crops.fid[i] = -1;
    crops.yieldT[i] = 0;
    crops.density[i] = 1;
    if (crops.arable[i]) {
      pasture.land[i] = LAND.stubble;
      pasture.D[i] = Math.max(800, pasture.D[i]! + pasture.G[i]!);
      pasture.G[i] = 0;
    } else pasture.land[i] = LAND.native;
  }
  if (sp.regen && !f.regen) {
    // It comes up on the 15th of the first month of its sowing window, at
    // least 30 days from now.
    let d = day + 30;
    for (;;) {
      const date = dateAt(ctx.start, d);
      if (date.month === sp.sow[0] && date.date === 15) break;
      d++;
    }
    crops.regen.push({ sp: f.sp, cells: f.cells.slice(), day: d });
  }
  crops.fields = crops.fields.filter((x) => x !== f);
}

export type CropRefusalReason =
  | 'no-such-planting'
  | 'not-a-grain-crop'
  | 'not-ready'
  | 'not-grown-here'
  | 'out-of-window'
  | 'no-usable-land'
  | 'off-the-farm';

export interface CropRefusal {
  ok: false;
  reason: CropRefusalReason;
  /** The reason in plain words. */
  message: string;
}

const refuse = (reason: CropRefusalReason, message: string): CropRefusal => ({
  ok: false,
  reason,
  message,
});

export interface Harvested extends FieldYield {
  ok: true;
  sp: SpeciesId;
  fieldId: number;
  /** The squares now in stubble. */
  cells: number[];
}

/**
 * Harvest a grain crop. It can be harvested from the day the grain is ready
 * until it is lost, 60 days later. The stubble left is dead feed of
 * (half the old dead feed + 600 kg DM/ha for each t/ha of grain), held
 * between 1,500 and 3,500 kg DM/ha. The caller takes the cost and banks the
 * grain.
 */
export function harvestField(
  crops: CropState,
  pasture: PastureState,
  ctx: CropContext,
  fieldId: number,
  day: number,
  seasonF: number,
): Harvested | CropRefusal {
  const f = fieldById(crops, fieldId);
  if (!f) return refuse('no-such-planting', 'There is no crop there to harvest.');
  const sp = SPECIES[f.sp];
  if (sp.type !== 'crop') return refuse('not-a-grain-crop', `${sp.name} is not a grain crop.`);
  if (day - f.sown < sp.mature!) {
    return refuse('not-ready', `The ${sp.short} is not ready to harvest yet.`);
  }
  const est = fieldYield(crops, f, seasonF, ctx.haPerSquare);
  const cells = f.cells.slice();
  for (const i of cells) {
    pasture.D[i] = Math.min(3500, Math.max(1500, pasture.D[i]! * 0.5 + est.tha * 600));
    pasture.G[i] = 0;
  }
  endField(crops, pasture, ctx, f, day);
  return { ok: true, sp: f.sp, fieldId: f.id, cells, ...est };
}

/** What sowing a species on a set of squares would take. */
export interface SowInfo {
  sp: SpeciesId;
  /** True for a forage or grain crop, which only goes on arable land. */
  crop: boolean;
  /** The squares that can take it. */
  use: number[];
  /** How many of those are pasture that has to be turned into cropping country first. */
  conv: number;
  ha: number;
  /** Area to convert, ha. */
  convHa: number;
  /** Seed, fertiliser, spraying and sowing plus any conversion, $. */
  cost: number;
  /** True if today is in the species' sowing window. */
  now: boolean;
}

/**
 * Work out what a sowing would cover and cost. Pasture can go anywhere.
 * Forages and grain crops only go on arable land. Nothing is sown over a
 * forage or grain crop that is still in the ground. Turning pasture into
 * cropping country costs extra.
 */
export function sowInfo(
  crops: CropState,
  pasture: PastureState,
  ctx: CropContext,
  key: SpeciesId,
  cells: readonly number[],
  day: number,
): SowInfo {
  const sp = SPECIES[key];
  const crop = sp.type !== 'pasture';
  const use = cells.filter((i) => {
    const f = fieldAt(crops, i);
    if (f && SPECIES[f.sp].type !== 'pasture') return false;
    return crop ? crops.arable[i] === 1 : true;
  });
  const conv = crop ? use.filter((i) => pasture.land[i]! < LAND.fallow).length : 0;
  const ha = use.length * ctx.haPerSquare;
  return {
    sp: key,
    crop,
    use,
    conv,
    ha,
    convHa: conv * ctx.haPerSquare,
    cost: ha * sp.cost + conv * ctx.haPerSquare * CONVERT_COST_PER_HA,
    now: sp.sow.includes(dateAt(ctx.start, day).month),
  };
}

export interface Sown extends SowInfo {
  ok: true;
  field: Field;
  /** Squares asked for that could not take it. */
  skipped: number;
}

/**
 * Sow a species. Refused outside its sowing window, for a species the
 * district does not grow, and where none of the squares can take it. The
 * caller takes the cost.
 */
export function sow(
  crops: CropState,
  pasture: PastureState,
  ctx: CropContext,
  key: SpeciesId,
  cells: readonly number[],
  day: number,
): Sown | CropRefusal {
  if (!LAND_OPTIONS[ctx.district].includes(key) || !SPECIES[key]) {
    return refuse('not-grown-here', 'That is not grown in this district.');
  }
  if (!cells.every((i) => Number.isInteger(i) && i >= 0 && i < GRID_N)) {
    return refuse('off-the-farm', 'That area runs off the farm.');
  }
  const unique = [...new Set(cells)];
  const info = sowInfo(crops, pasture, ctx, key, unique, day);
  if (!info.now) {
    return refuse('out-of-window', `${SPECIES[key].name} can't be sown at this time of year.`);
  }
  if (!info.use.length) {
    return refuse(
      'no-usable-land',
      info.crop
        ? 'None of that land can take it. Crops and forage crops only go on arable land with no crop in the ground.'
        : 'None of that land can take it. A crop is already in the ground there.',
    );
  }
  const field = addField(crops, pasture, ctx, key, info.use, day);
  return { ok: true, ...info, field, skipped: unique.length - info.use.length };
}

/** A planting being grazed at a time that costs stand or grain. Sent once for each planting. */
export type GrazeDamageEvent =
  /** Grazed before it was established: a thinner stand, and lower yield for a grain crop. */
  | { type: 'grazed-before-established'; fieldId: number; sp: SpeciesId; cell: number }
  /** A grain-only crop is being eaten. That comes straight off the yield. */
  | { type: 'grain-crop-grazed'; fieldId: number; sp: SpeciesId; cell: number }
  /** A dual-purpose crop is being grazed after lock-up. Stock are eating the heads. */
  | { type: 'grazed-after-lock-up'; fieldId: number; sp: SpeciesId; cell: number };

/**
 * What grazing does to the planting on a square. `r` is the feed taken from
 * the square today, kg DM/ha, `rg` the green part of it, and `g` the green
 * feed that was there before. Call it for each square of a planting with
 * more than 3 kg DM/ha taken (see squareGrazed).
 *
 * - Before establishment: the stand and the yield both fall by up to 60%.
 * - A grain-only crop before maturity: yield falls by up to 80%.
 * - A dual-purpose crop after lock-up: yield falls by up to 90%.
 * - A dual-purpose crop before lock-up: yield falls by up to 4%.
 */
export function cropGrazed(
  crops: CropState,
  f: Field,
  i: number,
  r: number,
  rg: number,
  g: number,
  day: number,
): GrazeDamageEvent | null {
  const sp = SPECIES[f.sp];
  const t = day - f.sown;
  const Y = crops.yieldT;
  if (t < sp.estab) {
    const k = Math.min(0.6, r / 500);
    crops.density[i] = crops.density[i]! * (1 - k);
    Y[i] = Y[i]! * (1 - k);
    if (!f.dmgNote) {
      f.dmgNote = true;
      return { type: 'grazed-before-established', fieldId: f.id, sp: f.sp, cell: i };
    }
  } else if (sp.type === 'crop' && sp.graze === false && t < sp.mature!) {
    Y[i] = Y[i]! * (1 - Math.min(0.8, r / 800));
    if (!f.dmgNote) {
      f.dmgNote = true;
      return { type: 'grain-crop-grazed', fieldId: f.id, sp: f.sp, cell: i };
    }
  } else if (sp.type === 'crop' && t >= sp.lock! && t < sp.mature!) {
    Y[i] = Y[i]! * (1 - Math.min(0.9, (1.3 * rg) / (g + 1)));
    if (!f.lockNote) {
      f.lockNote = true;
      return { type: 'grazed-after-lock-up', fieldId: f.id, sp: f.sp, cell: i };
    }
  } else if (sp.type === 'crop' && t < sp.lock!) {
    Y[i] = Y[i]! * (1 - 0.04 * Math.min(1, r / 1000));
  }
  return null;
}

/**
 * The grazing model calls this for every square it takes feed from. It
 * applies cropGrazed where the square holds a planting and more than
 * 3 kg DM/ha was taken.
 */
export function squareGrazed(
  crops: CropState,
  i: number,
  r: number,
  rg: number,
  g: number,
  day: number,
): GrazeDamageEvent | null {
  if (crops.fid[i]! >= 0 && r > 3) {
    const f = fieldAt(crops, i);
    if (f) return cropGrazed(crops, f, i, r, rg, g, day);
  }
  return null;
}

/** Something a player should know before putting stock on an area. */
export type CropRisk =
  /** Part crop, part pasture. Stock go for the crop first, because it is better feed. */
  | { type: 'mixed-paddock'; cropHa: number; pastureHa: number }
  /** A planting that is not established. Grazing it now damages it. */
  | { type: 'not-established'; fieldId: number; sp: SpeciesId; readyDay: number }
  /** A grain-only crop. Anything eaten comes off the harvest. */
  | { type: 'grain-crop'; fieldId: number; sp: SpeciesId }
  /** A crop locked up for grain. Grazing it now eats the heads. */
  | { type: 'locked-up'; fieldId: number; sp: SpeciesId }
  /** Stubble: dry straw, low in energy and protein. */
  | { type: 'stubble'; ha: number };

/**
 * What stock would meet on a set of squares, so the screen can ask before
 * the move. Describes only; the player decides.
 */
export function cropRisks(
  crops: CropState,
  pasture: PastureState,
  ctx: Pick<CropContext, 'haPerSquare'>,
  cells: readonly number[],
  day: number,
): CropRisk[] {
  let crop = 0;
  let past = 0;
  let stub = 0;
  const fields = new Map<number, Field>();
  for (const i of cells) {
    const lu = pasture.land[i]!;
    if (lu === LAND.annual || lu === LAND.crop) {
      crop++;
      const f = fieldAt(crops, i);
      if (f) fields.set(f.id, f);
    } else if (lu === LAND.stubble) stub++;
    else if (lu < LAND.fallow) past++;
  }
  const out: CropRisk[] = [];
  const HA = ctx.haPerSquare;
  if (crop && past) out.push({ type: 'mixed-paddock', cropHa: crop * HA, pastureHa: past * HA });
  for (const f of fields.values()) {
    const sp = SPECIES[f.sp];
    const t = day - f.sown;
    if (t < sp.estab) {
      out.push({ type: 'not-established', fieldId: f.id, sp: f.sp, readyDay: f.sown + sp.estab });
    } else if (sp.type === 'crop' && sp.graze === false && t < sp.mature!) {
      out.push({ type: 'grain-crop', fieldId: f.id, sp: f.sp });
    } else if (sp.type === 'crop' && t >= sp.lock! && t < sp.mature!) {
      out.push({ type: 'locked-up', fieldId: f.id, sp: f.sp });
    }
  }
  if (stub) out.push({ type: 'stubble', ha: stub * HA });
  return out;
}

/** Where a planting is up to, for the paddock sheet. `day` is the farm day that matters next. */
export type FieldProgress =
  /** Pasture not yet established. Graze lightly until `day`. */
  | { code: 'pasture-establishing'; day: number }
  /** Established pasture, `ageDays` old. `thinning` once it is past its life. */
  | { code: 'pasture-established'; ageDays: number; thinning: boolean }
  /** A grain-only crop establishing. Harvest about `day`. */
  | { code: 'establishing-keep-off'; day: number }
  /** A forage or dual-purpose crop establishing. Ready to graze about `day`. */
  | { code: 'establishing'; day: number }
  /** A grain-only crop growing. Harvest about `day`. */
  | { code: 'growing-keep-off'; day: number }
  /** A dual-purpose crop that can be grazed until lock-up about `day`. */
  | { code: 'vegetative'; day: number }
  /** Locked up for grain. Harvest about `day`. */
  | { code: 'locked-up'; day: number }
  /** Heading and filling grain. Harvest about `day`. */
  | { code: 'heading'; day: number }
  | { code: 'ready-to-harvest' }
  | { code: 'finished' }
  /** A forage in leaf. It finishes about `day`. */
  | { code: 'grazing'; day: number }
  /** A forage going to head. It finishes about `day`. */
  | { code: 'going-to-head'; day: number }
  | { code: 'finished-for-season' }
  /** Not sown yet. */
  | { code: 'not-sown' };

/** Where a planting is up to on a day. */
export function fieldProgress(
  f: Pick<Field, 'sp' | 'sown' | 'str'>,
  day: number,
  ctx: Pick<CropContext, 'district' | 'start'>,
): FieldProgress {
  const sp = SPECIES[f.sp];
  const t = day - f.sown;
  const on = (d: number): number => f.sown + d;
  if (sp.type === 'pasture') {
    if (t < sp.estab) return { code: 'pasture-establishing', day: on(sp.estab) };
    return {
      code: 'pasture-established',
      ageDays: t,
      thinning: !sp.oversow && t / 365 >= sp.life!,
    };
  }
  const st = fieldState(f, day, 1, ctx).stage;
  if (st === 'none') return { code: 'not-sown' };
  if (st === 'est') {
    return sp.graze === false
      ? { code: 'establishing-keep-off', day: on(sp.mature!) }
      : { code: 'establishing', day: on(sp.estab) };
  }
  if (sp.type === 'crop') {
    if (st === 'veg') {
      return sp.graze === false
        ? { code: 'growing-keep-off', day: on(sp.mature!) }
        : { code: 'vegetative', day: on(sp.lock!) };
    }
    if (st === 'lock') return { code: 'locked-up', day: on(sp.mature!) };
    if (st === 'head') return { code: 'heading', day: on(sp.mature!) };
    return t < sp.mature! + 60 ? { code: 'ready-to-harvest' } : { code: 'finished' };
  }
  if (st === 'veg' || st === 'lock') return { code: 'grazing', day: on(sp.life!) };
  if (st === 'head') return { code: 'going-to-head', day: on(sp.life!) };
  return { code: 'finished-for-season' };
}

/**
 * The daily crop step: self-sown regrowth, the notices each planting gives
 * as it moves through its stages, grain shedding, and plantings coming to
 * their end.
 *
 * This is the MVP's fieldTick, matched exactly. It runs before the day's
 * pasture growth. Where the MVP wrote a diary line or stopped the clock,
 * this returns an event and the caller decides what to show. Events only
 * come from plantings still in the ground, so a harvested crop gives none.
 */

import { dateAt } from '../calendar';
import { LAND_OPTIONS } from '../data/crops';
import { SPECIES, type SpeciesId } from '../data/species';
import { meFromDmd } from '../pasture/quality';
import { LAND, type PastureState } from '../pasture/state';
import {
  addField,
  endField,
  fieldState,
  fieldYield,
  type CropContext,
  type CropState,
  type FieldYield,
} from './fields';

interface FieldEventBase {
  fieldId: number;
  sp: SpeciesId;
  /** The planting's first square, to say where it is. */
  cell: number;
  /** True for a stand that came back from seed. */
  selfSown: boolean;
}

export type CropEvent =
  /** Some of an annual pasture has come back from seed. `share` is its strength against a full stand. */
  | ({ type: 'self-sown'; share: number } & FieldEventBase)
  /** A pasture is established. Graze it lightly at first. */
  | ({ type: 'pasture-established' } & FieldEventBase)
  /** A pasture is past its life and thinning. It is losing growth and quality. */
  | ({ type: 'pasture-thinning'; years: number } & FieldEventBase)
  /** A forage or crop is established. `keepOff` for a grain-only crop; otherwise its feed quality. */
  | ({ type: 'crop-established'; keepOff: boolean; me: number; cp: number } & FieldEventBase)
  /** A dual-purpose crop locks up for grain in `days` days. */
  | ({ type: 'lock-up-soon'; days: number } & FieldEventBase)
  /** The grain is ready. Stop the clock and offer the harvest. */
  | ({ type: 'harvest-ready'; estimate: FieldYield } & FieldEventBase)
  /** Still standing 30 days after it was ready. Grain is starting to shed. */
  | ({ type: 'grain-shedding' } & FieldEventBase)
  /** An annual forage has finished for the season. `mayRegrow` if some may come back from seed. */
  | ({ type: 'forage-finished'; mayRegrow: boolean } & FieldEventBase)
  /** A crop was never harvested. The grain is gone and it is now stubble. */
  | ({ type: 'not-harvested' } & FieldEventBase)
  /** A sowing window opens today for a forage or crop the district grows. */
  | { type: 'sowing-window'; sp: SpeciesId };

/** Days of warning before a dual-purpose crop locks up. */
export const LOCK_UP_WARNING_DAYS = 10;
/** Grain starts shedding faster this many days after it is ready. */
export const SHED_AFTER_DAYS = 30;
/** An unharvested crop becomes stubble this many days after it is ready. */
export const CROP_LOST_AFTER_DAYS = 60;
/** A finished annual forage becomes stubble this many days after it finishes. */
export const FORAGE_ENDS_AFTER_DAYS = 30;

/**
 * Run the crops for a day. Changes `crops` and `pasture` in place and
 * returns the day's events in the order they happened. `monthF` and
 * `seasonF` are the day's growth factors.
 */
export function fieldTick(
  crops: CropState,
  pasture: PastureState,
  ctx: CropContext,
  day: number,
  monthF: number,
  seasonF: number,
): CropEvent[] {
  const events: CropEvent[] = [];

  // Seed left by last year's annual pasture comes up where the ground is
  // native pasture, fallow or stubble with nothing else sown.
  for (const rg of crops.regen.slice()) {
    if (day < rg.day) continue;
    crops.regen.splice(crops.regen.indexOf(rg), 1);
    const cells = rg.cells.filter(
      (i) =>
        crops.fid[i]! < 0 && (pasture.land[i] === LAND.native || pasture.land[i]! >= LAND.fallow),
    );
    if (cells.length) {
      // The share that comes back is the species' own figure (0.12).
      const share = SPECIES[rg.sp].regen!;
      const f = addField(crops, pasture, ctx, rg.sp, cells, day, {
        str: share,
        regen: true,
        keep: true,
      });
      events.push({
        type: 'self-sown',
        fieldId: f.id,
        sp: f.sp,
        cell: cells[0]!,
        selfSown: true,
        share,
      });
    }
  }

  for (const f of crops.fields.slice()) {
    const sp = SPECIES[f.sp];
    const t = day - f.sown;
    const base: FieldEventBase = {
      fieldId: f.id,
      sp: f.sp,
      cell: f.cells[0]!,
      selfSown: !!f.regen,
    };
    if (sp.type === 'pasture') {
      if (t === sp.estab) events.push({ type: 'pasture-established', ...base });
      if (!sp.oversow && t > 0 && t % 365 === 0 && t / 365 >= sp.life!) {
        events.push({ type: 'pasture-thinning', years: Math.round(t / 365), ...base });
      }
      continue;
    }
    const crop = sp.type === 'crop';
    const life = (crop ? sp.mature : sp.life)!;
    if (t === sp.estab && !f.regen) {
      const now = fieldState(f, day, monthF, ctx);
      events.push({
        type: 'crop-established',
        keepOff: sp.graze === false,
        me: meFromDmd(now.dmd),
        cp: now.cp,
        ...base,
      });
    }
    if (crop && sp.graze !== false && t === sp.lock! - LOCK_UP_WARNING_DAYS) {
      events.push({ type: 'lock-up-soon', days: LOCK_UP_WARNING_DAYS, ...base });
    }
    if (crop && t === sp.mature!) {
      events.push({
        type: 'harvest-ready',
        estimate: fieldYield(crops, f, seasonF, ctx.haPerSquare),
        ...base,
      });
    }
    if (crop && t === sp.mature! + SHED_AFTER_DAYS)
      events.push({ type: 'grain-shedding', ...base });
    // Ripe grain left standing sheds: 0.2% a day at first, then 3% a day.
    if (crop && t > sp.mature!) {
      const keep = t > sp.mature! + SHED_AFTER_DAYS ? 0.97 : 0.998;
      for (const i of f.cells) crops.yieldT[i] = crops.yieldT[i]! * keep;
    }
    if (sp.type === 'annual' && t === life) {
      events.push({ type: 'forage-finished', mayRegrow: !!sp.regen && !f.regen, ...base });
    }
    if (
      (crop && t >= sp.mature! + CROP_LOST_AFTER_DAYS) ||
      (sp.type === 'annual' && t >= life + FORAGE_ENDS_AFTER_DAYS)
    ) {
      if (crop) events.push({ type: 'not-harvested', ...base });
      endField(crops, pasture, ctx, f, day);
    }
  }

  // Sowing reminders on the 1st of the month a window opens, for a mixed
  // farm or any farm with fallow or stubble.
  const d = dateAt(ctx.start, day);
  if (d.date === 1 && (ctx.mixed || pasture.land.some((v) => v >= LAND.fallow))) {
    for (const k of LAND_OPTIONS[ctx.district]) {
      const sp = SPECIES[k];
      if (sp.type !== 'pasture' && sp.sow[0] === d.month) {
        events.push({ type: 'sowing-window', sp: k });
      }
    }
  }
  return events;
}

import 'server-only';
import { FEED_FLOOR_KG_HA, FEED_SHORT_KG_HA } from '@gg/engine';

/**
 * The comment line on a stocked paddock's sheet (REQUIREMENTS, Wording:
 * "Commentary describes, it doesn't judge, and it only appears on paddocks
 * with cattle in them", with Claudia's own examples). One or two plain
 * sentences from the model's state: what the stock are picking, then the
 * feed against what they eat. Never advice, praise or blame, never
 * "overgrazed" (rest is not modelled), only the neutral paddock words.
 *
 * Each sentence is tied to one stated condition (docs/MODEL.md, "The
 * paddock comment line"). The thresholds are for the words only; no rule
 * reads them.
 */

/** Diet ME this far above the paddock's average, MJ/kg, means the stock are choosing the better feed. */
export const PICKING_ME = 0.5;
/** A green share under this, with the sward this tall, is tall dry grass with the green near the base. */
export const DRY_SHARE = 0.35;
export const TALL_CM = 25;
/** Eating more than this many times what grows each day is a high impact. */
export const HIGH_IMPACT = 2;

export interface CommentInputs {
  /** Stock (cattle or sheep) on the paddock's grazing area. */
  stocked: boolean;
  /** Feed, kg DM/ha. */
  massKgHa: number;
  /** Green share, 0 to 1. */
  green: number;
  heightCm: number;
  /** Grown on the last day, kg DM/ha. */
  growKgHa: number;
  /** Eaten on the last day, kg DM/ha. 0 before the stock's first day here. */
  eatKgHa: number;
  /** The diet ME the stock got on their last day (pasture only), MJ/kg, or null when not known. */
  dietMe: number | null;
  /** The paddock's average ME, MJ/kg. */
  paddockMe: number;
}

const kg = (n: number): string => (Math.round(n * 10) / 10).toLocaleString('en-AU');

/** What the stock are picking: one sentence, or null when there is nothing to say. */
export function pickLine(i: CommentInputs): string | null {
  if (i.massKgHa < FEED_SHORT_KG_HA && i.green < DRY_SHARE) {
    return "They're down to eating what they'd normally leave.";
  }
  if (i.green < DRY_SHARE && i.heightCm >= TALL_CM) {
    return "The grass is tall and mostly dry. They're picking the green near the base.";
  }
  if (i.dietMe !== null && i.dietMe - i.paddockMe >= PICKING_ME) {
    return "They're picking the best bits.";
  }
  return null;
}

/** The feed against what the stock eat: one sentence, or null before they have eaten here. */
export function feedLine(i: CommentInputs): string | null {
  if (i.massKgHa < FEED_FLOOR_KG_HA) {
    return `It's getting short: under ${FEED_FLOOR_KG_HA.toLocaleString('en-AU')} kg DM/ha.`;
  }
  if (i.eatKgHa <= 0) return null;
  if (i.growKgHa >= i.eatKgHa) return 'The grass is growing away from them.';
  if (i.eatKgHa > HIGH_IMPACT * i.growKgHa) {
    return `They're having a high impact: they eat about ${kg(i.eatKgHa)} kg DM/ha a day and about ${kg(i.growKgHa)} grows.`;
  }
  return `They eat a little more than grows: about ${kg(i.eatKgHa)} kg DM/ha a day against ${kg(i.growKgHa)}.`;
}

/** The comment line for a paddock, or null for one with no stock (the line only shows on stocked paddocks). */
export function commentLine(i: CommentInputs): string | null {
  if (!i.stocked) return null;
  const parts = [pickLine(i), feedLine(i)].filter((x): x is string => x !== null);
  return parts.length ? parts.join(' ') : null;
}

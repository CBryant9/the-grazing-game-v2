/**
 * The colour washes for the map layers (docs/VISUALS.md, Map layers).
 *
 * Each wash is one colour and strength for each square, painted into a
 * picture of 40 by 26 pixels that the map stretches over the farm. They
 * work on a plain block of pixels, so they can be tested without a screen.
 */

import { VIEW_LAND, type FarmView } from '@gg/shared';
import { blue, green, mix, red } from './colour';
import { GRID_N } from './grid';
import { NATURAL } from './palette';

export type WashLayer = 'waterReach' | 'quality' | 'grazed' | 'arable';

/** Water is close up to here, in metres. The blue fades out to this distance. */
export const WATER_NEAR_M = 1500;
/** Past here water is a long walk, in metres. */
export const WATER_FAR_M = 3000;
/** The pasture quality wash runs from this energy (purple) to the other (green), ME in MJ/kg DM. */
export const QUALITY_RANGE = { low: 6.5, high: 9.8 } as const;

/** One square's wash: a colour and how strongly it shows, 0 to 1. */
export interface Wash {
  colour: number;
  alpha: number;
}

const NONE: Wash = { colour: 0, alpha: 0 };

/** The wash on one square for a layer. */
export function washAt(view: FarmView, layer: WashLayer, i: number): Wash {
  const s = view.squares;
  const N = NATURAL;
  switch (layer) {
    case 'waterReach': {
      const d = s.waterDist[i] ?? -1;
      if (d < 0) return { colour: N.layerWaterNone, alpha: 0.32 };
      const metres = d * 100;
      if (metres > WATER_FAR_M) return { colour: N.layerWaterFar, alpha: 0.28 };
      if (metres > WATER_NEAR_M) return { colour: N.layerWaterMid, alpha: 0.18 };
      return { colour: N.layerWaterNear, alpha: 0.3 * (1 - metres / WATER_NEAR_M) };
    }
    case 'quality': {
      const me = (s.me10[i] ?? 0) / 10;
      const t = (me - QUALITY_RANGE.low) / (QUALITY_RANGE.high - QUALITY_RANGE.low);
      return { colour: mix(N.layerQualityLow, N.layerQualityHigh, t), alpha: 0.45 };
    }
    case 'grazed': {
      const v = (s.grazed[i] ?? 0) / 10;
      return v < 0.03 ? NONE : { colour: N.layerGrazed, alpha: Math.min(0.55, v * 0.6) };
    }
    case 'arable': {
      if (!s.arable[i]) return NONE;
      // Stronger on country that is cropped now.
      return (s.land[i] ?? 0) >= VIEW_LAND.crop
        ? { colour: N.layerArableCropped, alpha: 0.28 }
        : { colour: N.layerArable, alpha: 0.2 };
    }
  }
}

/** Paint a layer's wash into `out`: 40 by 26 pixels, four bytes each. */
export function paintWash(view: FarmView, layer: WashLayer, out: Uint8ClampedArray): void {
  for (let i = 0; i < GRID_N; i++) {
    const w = washAt(view, layer, i);
    const p = i * 4;
    out[p] = red(w.colour);
    out[p + 1] = green(w.colour);
    out[p + 2] = blue(w.colour);
    out[p + 3] = Math.round(w.alpha * 255);
  }
}

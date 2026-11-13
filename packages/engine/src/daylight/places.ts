/**
 * Where each district's daylight is worked out (PRD 14.4): the district town.
 *
 * Coordinates are the Bureau of Meteorology station for each town, read from
 * the Bureau's climate statistics pages on 13 Nov 2026 (docs/DATA.md).
 */

import type { DistrictId } from '@gg/shared';
import type { Place } from './daylight';

export const DISTRICT_PLACES: Record<DistrictId, Place & { town: string; station: string }> = {
  // Queensland has no daylight saving.
  cq: {
    town: 'Emerald',
    station: 'Emerald Airport (035264)',
    lat: -23.57,
    lon: 148.18,
    timeZone: 'Australia/Brisbane',
  },
  nsw: {
    town: 'Armidale',
    station: 'Armidale Airport AWS (056238)',
    lat: -30.53,
    lon: 151.62,
    timeZone: 'Australia/Sydney',
  },
  cw: {
    town: 'Dubbo',
    station: 'Dubbo Airport AWS (065070)',
    lat: -32.22,
    lon: 148.58,
    timeZone: 'Australia/Sydney',
  },
  wv: {
    town: 'Hamilton',
    station: 'Hamilton Airport (090173)',
    lat: -37.65,
    lon: 142.06,
    timeZone: 'Australia/Melbourne',
  },
};

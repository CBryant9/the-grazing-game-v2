/**
 * The map's layers: washes and extras a player can switch on and off
 * (docs/VISUALS.md, Map layers).
 */

export const MAP_LAYER_IDS = [
  'waterReach',
  'quality',
  'grazed',
  'arable',
  'pipe',
  'labels',
  'profit',
] as const;
export type MapLayerId = (typeof MAP_LAYER_IDS)[number];
export type MapLayers = Record<MapLayerId, boolean>;

/** Labels are on to start with. Everything else is off. */
export const DEFAULT_LAYERS: MapLayers = {
  waterReach: false,
  quality: false,
  grazed: false,
  arable: false,
  pipe: false,
  labels: true,
  profit: false,
};

export interface MapLayerInfo {
  /** The name on the toggle. */
  name: string;
  /** What it shows, in a few plain words. */
  shows: string;
  /** False for a layer the map cannot draw yet. */
  drawn: boolean;
}

export const MAP_LAYER_INFO: Record<MapLayerId, MapLayerInfo> = {
  waterReach: {
    name: 'Water reach',
    shows: 'How far each square is from water. Red has no water.',
    drawn: true,
  },
  quality: {
    name: 'Pasture quality',
    shows: 'Feed quality by energy, from red (ME 6.5) to green (ME 9.8).',
    drawn: true,
  },
  grazed: {
    name: 'Recently grazed',
    shows: 'Where stock have been eating. Stronger where more was eaten.',
    drawn: true,
  },
  arable: { name: 'Arable land', shows: 'Land that can be cropped.', drawn: true },
  pipe: { name: 'Pipe', shows: 'Blue when joined to the bore, grey when not.', drawn: true },
  labels: { name: 'Labels', shows: 'Paddock names, hectares and water.', drawn: true },
  // The view carries no figures for each beast yet, so this cannot be drawn.
  profit: { name: 'Profit', shows: 'A marker over each beast.', drawn: false },
};

/** The layers after a change. Anything not named stays as it was. Unknown names are ignored. */
export function withLayers(current: MapLayers, change: Partial<MapLayers>): MapLayers {
  const next = { ...current };
  for (const id of MAP_LAYER_IDS) {
    const v = change[id];
    if (typeof v === 'boolean') next[id] = v;
  }
  return next;
}

/** One layer flipped. */
export const toggleLayer = (current: MapLayers, id: MapLayerId): MapLayers =>
  withLayers(current, { [id]: !current[id] });

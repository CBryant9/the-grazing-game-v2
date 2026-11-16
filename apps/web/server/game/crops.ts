import 'server-only';
import {
  CONVERT_COST_PER_HA,
  GRID_N,
  LAND_OPTIONS,
  SPECIES,
  dateAt,
  fieldById,
  fieldProgress,
  fieldYield,
  seasonsOf,
  sowInfo,
  surveyOf,
  type Action,
  type FarmState,
  type SourceEnv,
  type SpeciesId,
} from '@gg/engine';
import type { CropsWire, FieldWire, SowOptionWire } from '../../lib/game/types';
import {
  aboutLine,
  harvestLines,
  kindText,
  monthRange,
  outOfWindow,
  sowLines,
  stageWord,
} from './cropwords';

const round1 = (n: number): number => Math.round(n * 10) / 10;
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The farm's own month, as the sowing windows use it. */
const monthOf = (farm: FarmState): number => dateAt(farm.start, farm.day).month;

function cropContext(farm: FarmState) {
  return {
    district: farm.district,
    start: farm.start,
    haPerSquare: farm.layout.scale.haPerSquare,
    mixed: true,
  };
}

/** What this district can sow, with its cost a hectare, its window and whether it is open today. */
export function sowOptions(farm: FarmState): SowOptionWire[] {
  const month = monthOf(farm);
  return LAND_OPTIONS[farm.district].map((id) => {
    const sp = SPECIES[id];
    const open = sp.sow.includes(month);
    return {
      id,
      name: capital(sp.short),
      kindText: kindText(sp),
      costPerHa: Math.round(sp.cost),
      window: monthRange(sp.sow),
      open,
      reason: open ? null : outOfWindow(capital(sp.short), sp.sow, month),
      about: aboutLine(id),
    };
  });
}

/** The plantings on the farm: what each is, how much, where it is up to, and which paddocks it covers. */
export function fieldsWire(farm: FarmState): FieldWire[] {
  const topo = surveyOf(farm).topology;
  const ctx = cropContext(farm);
  return farm.crops.fields.map((f) => {
    const paddocks = new Set<number>();
    for (const c of f.cells) {
      const p = topo.paddockOf[c];
      if (p !== undefined && p >= 0) paddocks.add(p);
    }
    const progress = fieldProgress(f, farm.day, ctx);
    return {
      id: f.id,
      name: capital(SPECIES[f.sp].short),
      ha: round1(f.cells.length * ctx.haPerSquare),
      stage: stageWord(progress),
      ready: progress.code === 'ready-to-harvest',
      paddocks: [...paddocks].sort((a, b) => a - b),
    };
  });
}

/** The cropping side of a mixed farm. Null for a farm that is not mixed. */
export function cropsWire(farm: FarmState, mixed: boolean): CropsWire | null {
  if (!mixed) return null;
  return { options: sowOptions(farm), fields: fieldsWire(farm) };
}

/** Arable land in each paddock, ha, for a mixed farm. A farm that is not mixed shows none. */
export function arableHaByPaddock(farm: FarmState, mixed: boolean): Map<number, number> {
  const out = new Map<number, number>();
  if (!mixed) return out;
  const topo = surveyOf(farm).topology;
  const per = farm.layout.scale.haPerSquare;
  for (let i = 0; i < GRID_N; i++) {
    if (farm.crops.arable[i] !== 1) continue;
    const p = topo.paddockOf[i];
    if (p === undefined || p < 0) continue;
    out.set(p, (out.get(p) ?? 0) + per);
  }
  return out;
}

const MAX_CELLS = GRID_N;

/** Check a sow request: a species the engine knows, and a list of squares on the farm. */
export function parseSow(a: Record<string, unknown>): Action | null {
  if (typeof a.species !== 'string' || !Object.hasOwn(SPECIES, a.species)) return null;
  if (!Array.isArray(a.cells) || a.cells.length < 1 || a.cells.length > MAX_CELLS) return null;
  const cells: number[] = [];
  for (const c of a.cells as unknown[]) {
    if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c >= GRID_N) return null;
    cells.push(c);
  }
  return { type: 'sow', species: a.species as SpeciesId, cells };
}

/** The lines on the sow and harvest cards, worked out from the farm as it stands before the job. */
export function cropLines(farm: FarmState, env: SourceEnv, action: Action): string[] {
  if (action.type === 'sow') {
    const ctx = cropContext(farm);
    const info = sowInfo(
      farm.crops,
      farm.pasture,
      ctx,
      action.species,
      [...new Set(action.cells)],
      farm.day,
    );
    if (!info.use.length) return [];
    return sowLines({
      name: SPECIES[action.species].short,
      ha: info.ha,
      cost: info.cost,
      convHa: info.convHa,
      convCost: info.convHa * CONVERT_COST_PER_HA,
      skipped: new Set(action.cells).size - info.use.length,
      crop: info.crop,
      cashBefore: farm.cash,
    });
  }
  if (action.type === 'harvest') {
    const f = fieldById(farm.crops, action.field);
    if (!f) return [];
    const seasonF = seasonsOf(farm, env).factorsOn(farm.day > 0 ? farm.day - 1 : 0).seasonF;
    const y = fieldYield(farm.crops, f, seasonF, farm.layout.scale.haPerSquare);
    return harvestLines({
      name: SPECIES[f.sp].short,
      ha: y.ha,
      t: y.t,
      tha: y.tha,
      value: y.value,
      cost: y.cost,
      cashBefore: farm.cash,
    });
  }
  return [];
}

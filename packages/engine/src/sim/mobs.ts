/**
 * Mobs on the farm: making them, joining the ones that share a grazing
 * area, sharing a mob out when a fence divides its area, and where weaners
 * go.
 *
 * Joining and the weaners' destination are the MVP's newMob, mergeShared
 * and autoWeanDest. Sharing a mob out across a new fence is the rebuild's
 * own rule: the MVP went by where each beast was drawn on the map, and the
 * engine draws nothing (docs/MODEL.md, section 5).
 */

import type { DistrictId } from '@gg/shared';
import { createCattleMob, type Animal } from '../cattle/types';
import type { Supplement } from '../data/feed';
import type { AreaChanges } from '../farm/topology';
import type { Survey } from '../farm/layout';
import type { Plantings } from '../pasture/plantings';
import { areaSummary } from '../pasture/summary';
import { DISTRICTS } from '../data/districts';
import type { Rng } from '../rng';
import { areaIdOf, placeAnchor } from './derived';
import type { FarmEvent } from './events';
import type { FarmMob, FarmState, MobWhere } from './state';

/** Central Queensland runs a dry-season lick, so mobs there start on it. */
export const defaultSupplement = (district: DistrictId): Supplement =>
  district === 'cq' ? 'lick' : 'none';

/**
 * A new, empty mob, added to the farm. It keeps the supplement of the mob it
 * came from. With none to keep, it starts on the district's usual one.
 */
export function newMob(
  farm: FarmState,
  where: MobWhere,
  name?: string,
  supp?: Supplement,
): FarmMob {
  const id = farm.nextMobId++;
  const m: FarmMob = {
    ...createCattleMob(supp && supp !== 'none' ? supp : defaultSupplement(farm.district)),
    id,
    name: name || 'Mob ' + id,
    where,
    lastBreak: null,
  };
  farm.mobs.push(m);
  return m;
}

/** The key mobs are grouped by: mobs with the same key share ground and run as one. */
const groupKeyOf = (survey: Survey, m: FarmMob): string =>
  m.where.kind === 'paddock' ? 'r' + areaIdOf(survey, m) : m.where.kind;

/**
 * One mob per grazing area. Mobs that share an area (or the feedlot, or the
 * yards) join the biggest of them, which keeps its name and its own
 * figures. It takes on a supplement if it had none and another mob had one.
 * Empty mobs are dropped.
 */
export function mergeShared(farm: FarmState, survey: Survey, events?: FarmEvent[]): void {
  const groups = new Map<string, FarmMob[]>();
  for (const m of farm.mobs) {
    if (!m.animals.length) continue;
    const k = groupKeyOf(survey, m);
    const list = groups.get(k);
    if (list) list.push(m);
    else groups.set(k, [m]);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => b.animals.length - a.animals.length);
    const t = list[0]!;
    for (const o of list.slice(1)) {
      for (const a of o.animals) t.animals.push(a);
      o.animals = [];
      if (t.supp === 'none' && o.supp !== 'none') t.supp = o.supp;
      // A mob that joins keeps its plan if the biggest has none, as in the old game.
      if (!t.plan && o.plan) t.plan = o.plan;
      events?.push({
        type: 'mobs-joined',
        from: o.id,
        fromName: o.name,
        into: t.id,
        intoName: t.name,
        area: t.where.kind === 'paddock' ? survey.topology.areas[areaIdOf(survey, t)]!.name : null,
      });
    }
  }
  farm.mobs = farm.mobs.filter((m) => m.animals.length);
}

/**
 * Where a mob's weaners go: another grazing area with water, an empty one
 * first, then the one with the best feed (highest ME). Returns the square
 * to put them on, or null when there is no other area with water.
 */
export function autoWeanDest(
  farm: FarmState,
  survey: Survey,
  plantings: Plantings | null,
  m: FarmMob,
): number | null {
  const here = areaIdOf(survey, m);
  const occupied = new Set<number>();
  for (const x of farm.mobs) if (x.where.kind === 'paddock') occupied.add(areaIdOf(survey, x));
  const opts = survey.topology.areas.filter(
    (r) => r.id !== here && survey.points.areaTroughs[r.id]!.length > 0,
  );
  if (!opts.length) return null;
  const me = new Map<number, number>();
  for (const r of opts) {
    me.set(
      r.id,
      areaSummary(farm.pasture, {
        district: DISTRICTS[farm.district],
        plantings,
        cells: r.cells,
        haPerSquare: farm.layout.scale.haPerSquare,
        day: farm.day,
      }).me,
    );
  }
  const occ = (id: number): number => (occupied.has(id) ? 1 : 0);
  opts.sort((a, b) => occ(a.id) - occ(b.id) || me.get(b.id)! - me.get(a.id)!);
  return placeAnchor(survey, opts[0]!.id);
}

/**
 * Share mobs out after a fence change divided their grazing area.
 *
 * Each beast goes to one of the new areas with a chance in proportion to
 * that area's hectares. A calf stays with its dam when she is in the same
 * mob. The part that lands in the area holding the mob's old square keeps
 * the mob. If none lands there, the part in the first of the new areas
 * keeps it. Every other part becomes a new mob named "<name> strays", with
 * the same supplement and the same days without water.
 *
 * `before` is the survey before the change and `after` the one after it.
 * Draws one number for each beast that is not a calf at its dam's side.
 */
export function splitMobs(
  farm: FarmState,
  before: Survey,
  after: Survey,
  changes: AreaChanges,
  rng: Pick<Rng, 'next'>,
  events?: FarmEvent[],
): void {
  if (!changes.splits.length) return;
  const into = new Map<number, number[]>();
  for (const s of changes.splits) into.set(s.from, s.into);
  for (const m of farm.mobs.slice()) {
    if (m.where.kind !== 'paddock' || !m.animals.length) continue;
    const parts = into.get(before.topology.areaOf[m.where.anchor]!);
    if (!parts) continue;
    const areas = parts.map((id) => after.topology.areas[id]!);
    const totalHa = areas.reduce((t, r) => t + r.ha, 0);
    const pickArea = (): number => {
      let u = rng.next() * totalHa;
      for (let k = 0; k < areas.length; k++) {
        u -= areas[k]!.ha;
        if (u < 0) return k;
      }
      return areas.length - 1;
    };
    const inMob = new Set(m.animals.map((a) => a.id));
    const side = new Map<number, number>();
    for (const a of m.animals) {
      if (a.kind === 'calf' && a.dam && inMob.has(a.dam)) continue;
      side.set(a.id, pickArea());
    }
    const groups: Animal[][] = areas.map(() => []);
    for (const a of m.animals) {
      const k = side.get(a.id) ?? side.get(a.dam) ?? 0;
      groups[k]!.push(a);
    }
    const homeArea = after.topology.areaOf[m.where.anchor]!;
    let keep = areas.findIndex((r) => r.id === homeArea);
    if (keep < 0 || !groups[keep]!.length) keep = groups.findIndex((g) => g.length > 0);
    const used = groups.filter((g) => g.length > 0).length;
    if (used <= 1) {
      // The whole mob is on one side. It stays one mob, in that area.
      if (areas[keep]!.id !== homeArea)
        m.where = { kind: 'paddock', anchor: placeAnchor(after, areas[keep]!.id) };
      continue;
    }
    const base = m.name.replace(/ strays$/, '');
    const report: { mob: number; mobName: string; area: string; head: number }[] = [];
    for (let k = 0; k < areas.length; k++) {
      const g = groups[k]!;
      if (!g.length) continue;
      const r = areas[k]!;
      let t: FarmMob;
      if (k === keep) {
        t = m;
        m.animals = g;
        if (r.id !== homeArea) m.where = { kind: 'paddock', anchor: placeAnchor(after, r.id) };
      } else {
        t = newMob(
          farm,
          { kind: 'paddock', anchor: placeAnchor(after, r.id) },
          base + ' strays',
          m.supp,
        );
        t.supp = m.supp;
        t.dry = m.dry;
        t.lastBreak = m.lastBreak;
        t.animals = g;
      }
      report.push({ mob: t.id, mobName: t.name, area: r.name, head: g.length });
    }
    events?.push({ type: 'mob-split', mob: m.id, mobName: m.name, parts: report });
  }
}

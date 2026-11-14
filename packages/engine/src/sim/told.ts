/**
 * What the player has been told about the herd's breeding, and only that.
 *
 * A grazier can't see which cows are in calf. They are told by the joining
 * reports every 3 weeks, the preg test at the end of a joining, and the
 * saleyard for cattle bought PTIC (pregnancy-tested in calf). A cow with a
 * calf at foot can be seen. So a read for the player's screens holds what
 * those reports said and nothing the engine knows besides (docs/LESSONS.md:
 * a read for the player holds only what the player has been told).
 *
 * What is kept here is what the player knows. No formula, price or chance
 * reads it, so no calibration or comparison figure can move because of it.
 * It does decide which animals a player's own pick by class or sale group
 * takes (`knownClassOf`, `knownGroupOf`): the player picks from what they
 * know, so "cows not in calf" can take a cow that is in calf and was never
 * tested (milestone 1.7f, after the screens review).
 */

import { classOf, groupKey } from '../cattle/animal';
import { joiningFemales } from '../cattle/breeding';
import type { CattleNote } from '../cattle/notes';
import type { Animal } from '../cattle/types';
import type { CattleClassId, GroupId } from '../data/cattle';
import type { FarmMob, FarmState, JoiningReport, MobReports, PregTestReport } from './state';

/** True for a female in calf. */
const inCalf = (a: Animal): boolean => (a.kind === 'cow' || a.kind === 'heifer') && a.preg >= 0;

/** Put tag numbers into the known list, smallest first, each once. */
function addKnown(farm: FarmState, ids: Iterable<number>): void {
  const all = new Set<number>(farm.knownInCalf);
  for (const id of ids) all.add(id);
  farm.knownInCalf = Int32Array.from([...all].sort((x, y) => x - y));
}

/** Cattle bought: the females sold as PTIC are known to be in calf. */
export function toldBought(farm: FarmState, animals: readonly Animal[]): void {
  const ids = animals.filter(inCalf).map((a) => a.id);
  if (ids.length) addKnown(farm, ids);
}

/** A joining report as kept, from its note. */
function joiningReport(
  n: Extract<CattleNote, { type: 'joiningProgress' }>,
  day: number,
): JoiningReport {
  return { day, weeks: n.weeks, conceived: n.conceived, inCalf: n.inCalf, females: n.females };
}

/** A preg test as kept, from its note. */
function pregTestReport(n: Extract<CattleNote, { type: 'pregTest' }>, day: number): PregTestReport {
  return {
    day,
    inCalf: n.inCalf,
    females: n.females,
    rate: n.rate,
    expected: n.expected,
    dry: n.dry,
    cs: n.cs,
    tooSoon: n.tooSoon,
  };
}

/** Keep a joining note on the mob as its latest report. */
function keepNote(m: FarmMob, n: CattleNote, day: number): void {
  if (n.type !== 'joiningProgress' && n.type !== 'pregTest') return;
  const r: MobReports = m.reports ?? { joining: null, pregTest: null };
  if (n.type === 'joiningProgress') r.joining = joiningReport(n, day);
  else r.pregTest = pregTestReport(n, day);
  m.reports = r;
}

/**
 * A mob's notes for the day: keep its latest joining report and preg test,
 * with the day. A preg test tells the player which of the females it
 * counted are in calf.
 */
export function toldNotes(
  farm: FarmState,
  m: FarmMob,
  notes: readonly CattleNote[],
  day: number,
): void {
  for (const n of notes) {
    keepNote(m, n, day);
    if (n.type === 'pregTest') {
      // The females the test counted in calf, as `joinReport` counted them.
      addKnown(
        farm,
        joiningFemales(m)
          .filter((a) => a.preg >= 0)
          .map((a) => a.id),
      );
    }
  }
}

/**
 * Take off the known list every tag that is no longer a female in calf on
 * the farm: she calved, slipped her calf, died or was sold. Run once a day,
 * after the cattle step, so a cow that calves is never counted again when
 * she gets back in calf. Cattle on their way to the yards stay on it.
 */
export function forgetStale(farm: FarmState): void {
  if (!farm.knownInCalf.length) return;
  const here = new Map<number, Animal>();
  for (const m of farm.mobs) for (const a of m.animals) here.set(a.id, a);
  for (const r of farm.arrivals) for (const a of r.animals) here.set(a.id, a);
  const keep = farm.knownInCalf.filter((id) => {
    const a = here.get(id);
    return !!a && !a.dead && inCalf(a);
  });
  if (keep.length !== farm.knownInCalf.length) farm.knownInCalf = keep;
}

/** The tag numbers the player knows are in calf, as a set. */
export const knownInCalfSet = (farm: Pick<FarmState, 'knownInCalf'>): Set<number> =>
  new Set(farm.knownInCalf);

/**
 * An animal's class as the player knows it: the herd list's class, except
 * that a female in calf counts as PTIC only when the player knows she is.
 * Otherwise she is listed as if empty (a cow with her calf at foot, a dry
 * cow, a heifer).
 */
export function knownClassOf(a: Animal, known: ReadonlySet<number>): CattleClassId {
  if (a.preg >= 0 && !known.has(a.id)) return classOf({ ...a, preg: -1 });
  return classOf(a);
}

/**
 * An animal's sale group as the player knows it: a female in calf is in the
 * PTIC group only when the player knows she is. Every other cow or heifer is
 * in the group that is not known in calf, whether or not she really is. The
 * mob card counts by this, and `sellGroup` picks by it, so the two always
 * agree and a sale never tells the player which cows are really empty.
 */
export function knownGroupOf(a: Animal, known: ReadonlySet<number>): GroupId {
  if (a.preg >= 0 && !known.has(a.id)) return groupKey({ ...a, preg: -1 });
  return groupKey(a);
}

/**
 * For a save made before this was kept: the latest joining report and preg
 * test of each mob still on the farm, read back from the inbox. Which
 * females were found in calf was not kept, so the known list starts empty.
 */
export function reportsFromInbox(farm: FarmState): void {
  const byId = new Map<number, FarmMob>();
  for (const m of farm.mobs) byId.set(m.id, m);
  for (const msg of farm.inbox) {
    const e = msg.event;
    if (e.type !== 'cattle') continue;
    const m = byId.get(e.mob);
    if (m) keepNote(m, e.note, msg.day);
  }
}

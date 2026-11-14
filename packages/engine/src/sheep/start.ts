/**
 * A running farm's start flock as it would stand on the start date
 * (milestone 2.3, third pass): a self-replacing Merino flock of ewes in age
 * classes, pregnant or with lambs at foot by the district's joining date,
 * last year's ewe drop kept as replacements, this year's ewe weaners once
 * weaned, rams, fleece grown since the district's shearing day, and CS at
 * the AWI targets. Built with the model's own figures (conception, litters,
 * lamb survival, birth weight, the joining and shearing days), so the
 * first year plays on from where a real flock would be.
 */

import { BIRTH_KG, CYCLE_DAYS, GESTATION_DAYS, JOIN_DAYS, LAMBING_TIMES, MICRON, START_FLOCK } from '../data/sheep';
import type { Rng } from '../rng';
import type { CalendarDate } from '../calendar';
import { litterMean, litterShares, lambSurvival, pregnantShare, ramsNeeded } from './breeding';
import { multinomial } from './counts';
import { matureKg } from './energy';
import { makeSheep } from './farm';
import { refFleeceKg } from './wool';
import type { Sheep, SheepJoining, SheepMob } from './types';

/** Days from a day and month back to the last time it came round, on a date (0 to 364). */
export function daysSince(date: CalendarDate, on: { month: number; date: number }): number {
  const t = Date.UTC(2021, date.month, date.date);
  let o = Date.UTC(2021, on.month, on.date);
  if (o > t) o -= 365 * 86400000;
  return Math.round((t - o) / 86400000);
}

/**
 * Build a start flock of `ewes` Merino ewes (plus replacements and rams) on
 * `date` into the mob `m`, which carries the district's joining and
 * shearing days. Records take numbers from `ids`. Draws from `rng` (cycle
 * days and litters only).
 */
export function buildStartFlock(
  m: SheepMob,
  ewes: number,
  date: CalendarDate,
  ids: { next: number },
  rng: Rng,
): void {
  const F = START_FLOCK;
  const srw = 50;
  const breed = 'merino' as const;
  const cs = F.cs;
  const d = daysSince(date, m.joinOn);
  const wool = m.shearOn ? daysSince(date, m.shearOn) : 0;
  const rate = (s: Pick<Sheep, 'breed' | 'sex'>): number => refFleeceKg(s) / 365;
  const fleeceOn = (s: Sheep, days: number): void => {
    s.woolDays = days;
    s.fleece = rate(s) * days;
    s.micronKg = s.fleece * MICRON[s.breed][s.sex];
  };
  const adult = (n: number, ageYears: number): Sheep => {
    const s = makeSheep(ids.next++, {
      sex: 'F',
      breed,
      srw,
      age: Math.round(ageYears * 365),
      cs,
      wt: srw,
      weaned: true,
      n,
    });
    s.parity = Math.max(0, Math.floor(ageYears - 1.5));
    fleeceOn(s, wool);
    return s;
  };
  // The ewe classes, joined this season: maidens (about 1.5 years at joining) to the oldest,
  // cast for age at `castForAge` (STAND-IN).
  const ages: number[] = [];
  for (let a = F.maidenYears; a < F.castForAge; a++) ages.push(a + d / 365);
  const each = Math.floor(ewes / ages.length);
  const classes = ages.map((a, i) => adult(i === 0 ? ewes - each * (ages.length - 1) : each, a));

  // Where the season is: joining, pregnancy, lambs at foot, or weaned.
  const conceived = d - F.meanConceptionDay;
  const join: SheepJoining = {
    start: -d,
    joined: ewes,
    rams: ramsNeeded(ewes),
    sireBreed: breed,
    sireSrw: srw,
    pregnant: 0,
    foetuses: 0,
    scanned: d >= LAMBING_TIMES.scanDays,
    lambingStart: d >= GESTATION_DAYS ? -(d - GESTATION_DAYS) : -1,
    born: 0,
    ewesLambed: 0,
    marked: -1,
    weaned: -1,
    eweDeathsLambing: 0,
  };
  let weanedLambs = 0;
  const out: Sheep[] = [];
  const share = litterShares(litterMean(cs, breed));
  if (d < JOIN_DAYS) {
    // Joining under way: each ewe on a day of her cycle, as the joining would have shared them.
    for (const c of classes) {
      const byDay = multinomial(c.n, new Array<number>(CYCLE_DAYS).fill(1 / CYCLE_DAYS), rng);
      for (let k = 0; k < CYCLE_DAYS; k++) {
        if (!byDay[k]) continue;
        out.push({ ...c, id: ids.next++, n: byDay[k]!, oes: k });
      }
    }
  } else {
    for (const c of classes) {
      const preg = Math.round(c.n * pregnantShare(cs, breed));
      const byLitter = multinomial(preg, [share[1], share[2], share[3]], rng);
      const empty = c.n - preg;
      if (empty > 0) out.push({ ...c, id: ids.next++, n: empty });
      for (let lit = 1; lit <= 3; lit++) {
        const k = byLitter[lit - 1]!;
        if (!k) continue;
        join.pregnant += k;
        join.foetuses += k * lit;
        const e: Sheep = { ...c, id: ids.next++, n: k };
        if (conceived < GESTATION_DAYS) {
          e.preg = Math.max(0, conceived);
          e.litter = lit;
          e.csJoin = cs;
          if (e.preg >= LAMBING_TIMES.scanDays) e.csScan = cs;
          out.push(e);
          continue;
        }
        // Lambed: lambs at foot until weaning, then weaned (and the ewes dry).
        const lambAge = conceived - GESTATION_DAYS;
        const lambs = Math.round(k * lit * lambSurvival(cs, lit, breed));
        join.born += k * lit;
        join.ewesLambed += k;
        e.parity++;
        if (lambAge < LAMBING_TIMES.weanDays) {
          e.lact = lambAge;
          e.reared = lit;
          out.push(e);
          if (lambs > 0) {
            const birth = lit >= 3 ? BIRTH_KG.triplet : lit === 2 ? BIRTH_KG.twin : BIRTH_KG.single;
            const wt = birth + F.lambGrowthKg * lambAge;
            const ewesL = Math.round(lambs / 2);
            for (const [sex, n] of [
              ['F', ewesL],
              [lambAge >= LAMBING_TIMES.markDays ? 'W' : 'M', lambs - ewesL],
            ] as const) {
              if (!n) continue;
              const l = makeSheep(ids.next++, { sex, breed, srw, age: lambAge, cs, wt, weaned: false, n });
              l.dam = e.id;
              l.reared = lit;
              fleeceOn(l, Math.min(lambAge, wool));
              out.push(l);
            }
          }
        } else {
          out.push(e);
          // This year's ewe weaners kept as replacements; the wether lambs were sold at weaning.
          weanedLambs += lambs;
          const kept = Math.round(lambs / 2);
          if (kept > 0) {
            const w = makeSheep(ids.next++, {
              sex: 'F',
              breed,
              srw,
              age: lambAge,
              cs,
              wt: youngKg(srw, lambAge),
              weaned: true,
              n: kept,
            });
            w.wwt = youngKg(srw, LAMBING_TIMES.weanDays);
            w.wage = LAMBING_TIMES.weanDays;
            w.reared = lit;
            fleeceOn(w, Math.min(lambAge, wool));
            out.push(w);
          }
        }
      }
    }
    if (join.lambingStart >= 0 || d >= GESTATION_DAYS + LAMBING_TIMES.markDays) {
      if (d - GESTATION_DAYS >= LAMBING_TIMES.markDays) join.marked = out.filter((s) => !s.weaned).reduce((t, s) => t + s.n, 0);
      if (d - GESTATION_DAYS >= LAMBING_TIMES.weanDays) {
        join.weaned = weanedLambs;
      }
    }
  }
  // Last year's ewe drop, kept as replacements: they join as maidens next season.
  const lastDrop = d - F.meanConceptionDay - GESTATION_DAYS + 365;
  const hoggets = makeSheep(ids.next++, {
    sex: 'F',
    breed,
    srw,
    age: lastDrop,
    cs,
    wt: youngKg(srw, lastDrop),
    weaned: true,
    n: Math.round(ewes / ages.length),
  });
  hoggets.wwt = youngKg(srw, LAMBING_TIMES.weanDays);
  hoggets.wage = LAMBING_TIMES.weanDays;
  fleeceOn(hoggets, Math.min(lastDrop, wool));
  out.push(hoggets);
  // Rams at 1% + 1.
  const rams = makeSheep(ids.next++, {
    sex: 'M',
    breed,
    srw,
    age: 3 * 365,
    cs,
    wt: matureKg({ srw, sex: 'M' }),
    weaned: true,
    n: ramsNeeded(ewes),
  });
  fleeceOn(rams, wool);
  out.push(rams);
  m.sheep = out;
  m.join = join;
}

/**
 * A young sheep's weight at an age, kg: birth weight, then the lamb growth
 * figure to weaning, then the weaner growth figure (START_FLOCK), up to 95%
 * of SRW.
 */
export function youngKg(srw: number, age: number): number {
  const F = START_FLOCK;
  const atWean = BIRTH_KG.single + F.lambGrowthKg * Math.min(age, LAMBING_TIMES.weanDays);
  const after = Math.max(0, age - LAMBING_TIMES.weanDays) * F.weanerGrowthKg;
  return Math.min(0.95 * srw, atWean + after);
}

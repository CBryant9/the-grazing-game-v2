/**
 * One day for one sheep mob: it eats, gains or loses, breeds, grows wool
 * and may die (docs/MODEL.md, the sheep section). The cattle step's shape
 * (cattle/simMob.ts) with sheep figures. Returns what happened as data.
 *
 * Random draws come from the sheep's own streams in a fixed order, so a
 * farm is repeatable from its seed: breeding (heat and conception, litter,
 * lamb sex and fate), deaths (lambing, orphans, daily deaths), flies.
 */

import type { PlantingGraze } from '../cattle/graze';
import type { AnimalIds, GrazingArea, GrazingLand } from '../cattle/types';
import type { CalendarDate } from '../calendar';
import {
  ADULT_DAILY,
  CYCLE_DAYS,
  FLYSTRIKE,
  GAIN_CAP,
  GESTATION_DAYS,
  JOIN_DAYS,
  LAMBING_TIMES,
  LAMB_LATE_DAILY,
  LOSS_CAP,
  LOSS_MJ,
  MARK_DAYS,
  MILK,
  NO_WATER,
  ORPHAN,
  THIN_DEATHS,
  WEANER_DEATHS,
  WOOL,
} from '../data/sheep';
import { clamp } from '../num';
import { meFromDmd } from '../pasture/quality';
import {
  canJoin,
  cycleConception,
  drawLitter,
  lambFate,
  lambSurvival,
  lambingRisk,
  newLamb,
  onHeat,
  ramCover,
  ramsNeeded,
} from './breeding';
import {
  appetiteShare,
  dseOf,
  gainMJPerKg,
  isAdultRam,
  kgPerCs,
  maintMJ,
  milkPotentialMJ,
  milkSpendMJ,
  pregnancyMJ,
  qualityFactor,
  walkFactor,
} from './energy';
import { sheepDietOf, sheepGrazeAlloc, type SheepDiet, type SheepDietResult } from './graze';
import type { SheepDeathCause, SheepNote } from './notes';
import type { Sheep, SheepMob, SheepMobDay, SheepRngs } from './types';
import { growWool, woolGrowthG } from './wool';

/** Where a sheep mob spends the day. */
export type SheepPlace =
  /** On pasture, in a grazing area. */
  | { kind: 'paddock'; area: GrazingArea }
  /**
   * A paddock held at a set mass and quality, with as much feed as the mob
   * wants (`f` of it, 1 if left out). Tests and calibration only: the
   * benchmark rows of kind "Paddock" (docs/SHEEP_BENCHMARKS.md).
   */
  | { kind: 'held'; diet: SheepDiet; hasWater?: boolean; f?: number };

export interface SimFlockInputs {
  place: SheepPlace;
  /** The farm's country. Not read for a held place. */
  land: GrazingLand | null;
  /** Today's farm day. */
  day: number;
  /** The farm's calendar date today (joining starts on a date). */
  date: CalendarDate;
  /** Every sheep on the farm by tag number, built at the start of the day. */
  byId: ReadonlyMap<number, Sheep>;
  ids: AnimalIds;
  rng: SheepRngs;
}

export interface SheepDeath {
  sheep: Sheep;
  cause: SheepDeathCause;
}

export interface FlockDayResult {
  st: SheepMobDay;
  deaths: SheepDeath[];
  births: Sheep[];
  notes: SheepNote[];
  plantingGrazes: PlantingGraze[];
}

/** Live lambs at foot, by dam. */
export function lambsByDam(sheep: readonly Sheep[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of sheep) {
    if (!s.weaned && !s.dead && s.dam) out.set(s.dam, (out.get(s.dam) ?? 0) + 1);
  }
  return out;
}

/** The daily death risk outside lambing, before no water and flystrike. */
export function dailyDeathRisk(s: Sheep): number {
  let p: number;
  if (!s.weaned) {
    p = s.age >= MARK_DAYS ? LAMB_LATE_DAILY : s.age >= 3 ? s.lambRisk : 0;
  } else if (s.wage > 0 && s.age - s.wage < WEANER_DEATHS.days) {
    p = weanerDailyRisk(s.adg * 1000, s.wwt / s.srw);
  } else {
    p = ADULT_DAILY;
  }
  if (s.cond < THIN_DEATHS.below) p += (THIN_DEATHS.below - s.cond) * THIN_DEATHS.perCs;
  return p;
}

/** A weaner's daily death risk in its first year after weaning, by growth (g/day) and weaning weight ÷ SRW. */
export function weanerDailyRisk(growthG: number, weanShare: number): number {
  const W = WEANER_DEATHS;
  const f = Math.exp(-W.growth * growthG) * Math.exp(-W.weight * (weanShare - W.refShare));
  return W.base * Math.min(W.maxFactor, f);
}

/** Run one sheep mob's day. Changes the mob, its sheep and the pasture in place. */
export function simFlock(m: SheepMob, inp: SimFlockInputs): FlockDayResult {
  const { place, land, day, byId, rng } = inp;
  const notes: SheepNote[] = [];
  const deaths: SheepDeath[] = [];
  const births: Sheep[] = [];
  const plantingGrazes: PlantingGraze[] = [];

  // Water.
  const hasWater = place.kind === 'held' ? place.hasWater !== false : place.area.hasWater;
  m.dry = hasWater ? 0 : m.dry + 1;
  if (m.dry === 1) notes.push({ type: 'noWater', days: 1 });
  if (m.dry === 3) notes.push({ type: 'noWater', days: 3 });

  // The diet.
  let res: SheepDietResult | null = null;
  let diet: SheepDiet;
  if (place.kind === 'held') diet = place.diet;
  else {
    res = sheepDietOf(land!, place.area);
    diet = res.diet;
  }
  const me = meFromDmd(diet.dmd);
  const walk = walkFactor(diet.dist);
  const qf = qualityFactor(diet.dmd);
  const lambsOf = lambsByDam(m.sheep);

  // Lambs go last, so each ewe's milk today is known first.
  const order = [...m.sheep.filter((s) => s.weaned), ...m.sheep.filter((s) => !s.weaned)];
  const wants = new Float64Array(order.length);
  let demand = 0;
  let dseNow = 0;
  for (let k = 0; k < order.length; k++) {
    const s = order[k]!;
    if (s.dead) continue;
    let w = s.wt * appetiteShare(s, lambsOf.get(s.id) ?? 0) * qf * diet.avail;
    // Too little protein and the rumen slows (the cattle rule, no lick for sheep yet).
    if (diet.cp < 7) w *= 1 - (7 - diet.cp) * 0.05;
    wants[k] = w;
    demand += w;
    if (s.weaned) dseNow += dseOf(s, lambsOf.get(s.id) ?? 0);
  }
  let f = 1;
  if (place.kind === 'held') f = place.f ?? 1;
  else if (demand > 0) {
    const got = sheepGrazeAlloc(land!, place.area, res!, demand, dseNow / 8.4, day, plantingGrazes);
    f = got / demand;
  }

  // Joining: starts on the mob's date each year, for 5 weeks.
  const joinToday = inp.date.month === m.joinOn.month && inp.date.date === m.joinOn.date;
  if (joinToday) {
    const ewes = order.filter((s) => canJoin(s, lambsOf.get(s.id) ?? 0));
    const rams = order.filter((s) => isAdultRam(s) && !s.dead);
    if (ewes.length) {
      const sireBreed = rams.some((r) => r.breed === 'xb') ? 'xb' : 'merino';
      const sireSrw = rams.length ? rams.reduce((t, r) => t + r.srw, 0) / rams.length : 50;
      m.join = {
        start: day,
        joined: ewes.length,
        rams: rams.length,
        sireBreed,
        sireSrw,
        pregnant: 0,
        foetuses: 0,
        scanned: false,
        lambingStart: -1,
        born: 0,
        ewesLambed: 0,
        marked: -1,
        weaned: -1,
        eweDeathsLambing: 0,
      };
      for (const s of ewes) s.oes = rng.breeding.int(0, CYCLE_DAYS - 1);
      notes.push({
        type: 'joiningStarted',
        ewes: ewes.length,
        rams: rams.length,
        ramsNeeded: ramsNeeded(ewes.length),
      });
    }
  }
  const join = m.join;
  const into = join ? day - join.start : -1;
  const joining = join !== null && into >= 0 && into < JOIN_DAYS;
  const liveRams = joining ? order.filter((s) => isAdultRam(s) && !s.dead).length : 0;
  const cover = joining ? ramCover(liveRams, join.joined) : 0;
  if (join && into === JOIN_DAYS) {
    for (const s of order) s.oes = -1;
    notes.push({ type: 'joiningEnded', ewes: join.joined });
  }
  const lambing = join !== null && join.lambingStart >= 0 && join.marked < 0;

  let sumWt = 0;
  let sumCs = 0;
  let sumAdg = 0;
  let sumInt = 0;
  let sumPot = 0;
  let n = 0;
  let nLambs = 0;
  let struckToday = 0;
  for (let k = 0; k < order.length; k++) {
    const s = order[k]!;
    if (s.dead) continue;
    const past = wants[k]! * f;
    let mei = past * me;
    let milkIn = 0;
    const lambs = lambsOf.get(s.id) ?? 0;
    let req = maintMJ(s, walk) + pregnancyMJ(s.preg, s.litter);
    const milking = s.lact >= 0 && lambs > 0;
    if (milking) {
      s.milk = milkSpendMJ(milkPotentialMJ(s, lambs), s.cond, me, mei, req);
      req += s.milk;
    } else s.milk = 0;
    if (!s.weaned) {
      const dam = byId.get(s.dam);
      if (dam && !dam.dead && dam.milk > 0) {
        milkIn = (dam.milk * MILK.efficiency) / Math.max(1, lambsOf.get(dam.id) ?? 1);
        mei += milkIn;
      }
    }
    const bal = mei - req;
    let gain = bal > 0 ? bal / gainMJPerKg(s) : bal / LOSS_MJ;
    gain = clamp(gain, -LOSS_CAP, GAIN_CAP);
    if (m.dry > 0) gain = -s.wt * NO_WATER.lossShare;
    const W0 = s.wt;
    s.wt = Math.max(1.5, W0 + gain);
    // Young growing sheep put most of a gain into frame, not condition.
    const young = s.age < 540;
    s.cond = clamp(s.cond + (gain / kgPerCs(s)) * (gain > 0 && young ? 0.3 : 1), 1, 5);
    s.adg = s.adg * 0.93 + gain * 0.07;
    s.age++;

    // Wool.
    growWool(s, woolGrowthG(s, past + milkIn * WOOL.milkKgPerMj, gain, milking));

    // Breeding.
    if (s.sex === 'F' && s.weaned) {
      if (s.preg >= 0) {
        s.preg++;
        if (s.preg === LAMBING_TIMES.scanDays) s.csScan = s.cond;
        if (s.preg >= GESTATION_DAYS) {
          const born = lambEwe(s, m, inp, births, deaths);
          if (born && join && join.lambingStart < 0 && day >= join.start) {
            join.lambingStart = day;
            notes.push({ type: 'lambingStarted' });
          }
          if (s.dead) continue;
        }
      } else if (joining && s.oes >= 0 && lambs === 0 && onHeat(into, s.oes)) {
        if (rng.breeding.chance(cycleConception(s.cond, s.breed) * cover)) {
          s.preg = 0;
          s.litter = drawLitter(s.cond, s.breed, rng.breeding);
          s.csJoin = s.cond;
          s.oes = -1;
          join.pregnant++;
          join.foetuses += s.litter;
        }
      }
      if (s.lact >= 0) s.lact++;
    }

    // Lambs: an early death drawn at birth, or no dam to suckle.
    if (!s.weaned) {
      if (s.doomed >= 0) {
        if (s.doomed === 0) {
          s.dead = true;
          deaths.push({ sheep: s, cause: 'newborn' });
          continue;
        }
        s.doomed--;
      }
      const dam = byId.get(s.dam);
      if (!dam || dam.dead) {
        if (s.age >= ORPHAN.weanDays) weanSheep(s);
        else if (rng.deaths.chance(ORPHAN.daily)) {
          s.dead = true;
          deaths.push({ sheep: s, cause: 'orphaned' });
          continue;
        }
      }
    }

    // Deaths.
    let pd = dailyDeathRisk(s);
    if (s.struck >= 0) pd += 1 - Math.pow(1 - FLYSTRIKE.dieShare, 1 / FLYSTRIKE.dieWithin);
    if (m.dry >= NO_WATER.dieOnDay) pd = 1;
    if (rng.deaths.chance(pd)) {
      s.dead = true;
      deaths.push({
        sheep: s,
        cause:
          m.dry > 2
            ? 'noWater'
            : s.cond < 1.6
              ? 'poorCondition'
              : s.struck >= 0
                ? 'flystrike'
                : !s.weaned && s.age < MARK_DAYS
                  ? 'newborn'
                  : 'natural',
      });
      continue;
    }

    // Flystrike (call C21: Merinos unmulesed).
    if (s.struck >= 0) s.struck = s.struck + 1 >= FLYSTRIKE.dieWithin ? -1 : s.struck + 1;
    if (s.weaned) {
      if (s.flyCover > 0) s.flyCover--;
      else if (s.struck < 0 && rng.flies.chance(FLYSTRIKE.daily[s.breed])) {
        s.struck = 0;
        s.wt = Math.max(1.5, s.wt - FLYSTRIKE.kg[s.breed]);
        s.cond = clamp(s.cond - FLYSTRIKE.cs, 1, 5);
        struckToday++;
      }
    }

    s.di = past;
    if (s.weaned) {
      n++;
      sumWt += s.wt;
      sumCs += s.cond;
      sumAdg += s.adg;
      sumInt += past;
      sumPot += s.wt * appetiteShare(s, lambs) * 1.05;
    } else nLambs++;
  }
  if (struckToday) notes.push({ type: 'flystrike', count: struckToday });

  if (join) {
    if (lambing) {
      for (const d of deaths) {
        if (d.sheep.sex === 'F' && d.sheep.weaned && d.sheep.parity > 0) join.eweDeathsLambing++;
      }
    }
    // The scanning count.
    if (!join.scanned && into === LAMBING_TIMES.scanDays) {
      join.scanned = true;
      let preg = 0;
      let foet = 0;
      for (const s of m.sheep) {
        if (!s.dead && s.preg >= 0) {
          preg++;
          foet += s.litter;
        }
      }
      join.pregnant = preg;
      join.foetuses = foet;
      notes.push({ type: 'scanned', ewes: join.joined, pregnant: preg, foetuses: foet });
    }
    // The marking count: lambs alive, and ram lambs marked.
    if (
      join.lambingStart >= 0 &&
      join.marked < 0 &&
      day - join.lambingStart >= LAMBING_TIMES.markDays
    ) {
      let lambsAlive = 0;
      for (const s of m.sheep) {
        if (s.dead || s.weaned) continue;
        lambsAlive++;
        if (s.sex === 'M') s.sex = 'W';
      }
      join.marked = lambsAlive;
      notes.push({ type: 'marked', lambs: lambsAlive, ewesJoined: join.joined });
    }
  }

  const st: SheepMobDay = {
    n,
    lambs: nLambs,
    wt: n ? sumWt / n : 0,
    cs: n ? sumCs / n : 0,
    adg: n ? sumAdg / n : 0,
    me,
    cp: diet.cp,
    intake: n ? sumInt / n : 0,
    pct: sumPot ? sumInt / sumPot : 0,
    f,
    mass: diet.mass,
    green: diet.green,
    demand,
    dist: diet.dist,
    dse: dseNow,
  };
  m.st = st;
  if (f < 0.7 && m.lastShort < day - 14) {
    m.lastShort = day;
    notes.push({ type: 'shortOfFeed', f });
  }
  m.lossDays = n && st.adg < -0.02 ? m.lossDays + 1 : 0;
  if (m.lossDays === 10) notes.push({ type: 'losingWeight', me, cp: diet.cp });
  if (n && st.cs < 2 && m.lastThin < day - 30) {
    m.lastThin = day;
    notes.push({ type: 'lowCondition', cs: st.cs });
  }
  return { st, deaths, births, notes, plantingGrazes };
}

/**
 * A ewe lambs: her risk of dying at lambing is drawn first (her lambs are
 * born and die with her), then each lamb's sex and fate. Returns true if
 * lambs were born.
 */
function lambEwe(
  s: Sheep,
  m: SheepMob,
  inp: SimFlockInputs,
  births: Sheep[],
  deaths: SheepDeath[],
): boolean {
  const { rng } = inp;
  const litter = s.litter;
  const join = m.join;
  const csLost = s.csScan > 0 ? s.csScan - s.cond : 0;
  const dies = rng.deaths.chance(lambingRisk(s.cond, litter, s.breed, csLost));
  const sire = join ? { breed: join.sireBreed, srw: join.sireSrw } : { breed: s.breed, srw: s.srw };
  const survival = lambSurvival(s.cond, litter, s.breed);
  for (let i = 0; i < litter; i++) {
    const lamb = newLamb(inp.ids, s, sire, litter, rng.breeding.chance(0.5));
    const fate = lambFate(survival, rng.breeding);
    lamb.doomed = fate.doomed;
    lamb.lambRisk = fate.risk;
    m.sheep.push(lamb);
    births.push(lamb);
    if (dies) {
      lamb.dead = true;
      deaths.push({ sheep: lamb, cause: 'lambing' });
    }
  }
  if (join) {
    join.born += litter;
    join.ewesLambed++;
  }
  s.preg = -1;
  s.litter = 0;
  s.csJoin = 0;
  s.csScan = 0;
  s.parity++;
  s.lact = 0;
  s.reared = litter;
  if (dies) {
    s.dead = true;
    deaths.push({ sheep: s, cause: 'lambing' });
  }
  return litter > 0;
}

/** Wean one lamb: it keeps its weight and age at weaning, for the weaner death risk. */
export function weanSheep(s: Sheep): void {
  s.weaned = true;
  s.wwt = s.wt;
  s.wage = s.age;
}

/** True when the mob's lambs are due to be weaned: 14 weeks from the start of lambing (S17). */
export function sheepWeaningDue(m: SheepMob, day: number): boolean {
  const j = m.join;
  return (
    j !== null &&
    j.lambingStart >= 0 &&
    j.weaned < 0 &&
    day - j.lambingStart >= LAMBING_TIMES.weanDays
  );
}

/**
 * Wean every lamb at foot in the mob and dry off their ewes. Returns the
 * weaners (still in the mob: the farm moves them). Counts them on the
 * joining.
 */
export function weanLambs(m: SheepMob): Sheep[] {
  const out: Sheep[] = [];
  for (const s of m.sheep) {
    if (s.dead || s.weaned) continue;
    weanSheep(s);
    out.push(s);
  }
  for (const s of m.sheep) {
    if (s.lact >= 0) {
      s.lact = -1;
      s.reared = 0;
      s.milk = 0;
    }
  }
  if (m.join && m.join.weaned < 0) m.join.weaned = out.length;
  return out;
}

/**
 * The end of the day, after every sheep mob has had its day: take the dead
 * out, and dry off a ewe whose last lamb died.
 */
export function settleSheepDeaths(
  mobs: readonly SheepMob[],
  deaths: readonly SheepDeath[],
  byId: ReadonlyMap<number, Sheep>,
): void {
  if (!deaths.length) return;
  for (const m of mobs) m.sheep = m.sheep.filter((s) => !s.dead);
  for (const { sheep: s } of deaths) {
    if (s.weaned || !s.dam) continue;
    const dam = byId.get(s.dam);
    if (!dam || dam.dead || dam.lact < 0) continue;
    const left = mobs.some((m) => m.sheep.some((x) => x.dam === dam.id && !x.weaned));
    if (!left) {
      dam.lact = -1;
      dam.reared = 0;
      dam.milk = 0;
    }
  }
}

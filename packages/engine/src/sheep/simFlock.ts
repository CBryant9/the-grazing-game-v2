/**
 * One day for one sheep mob: it eats, gains or loses, breeds, grows wool
 * and may die (docs/MODEL.md, the sheep section). The cattle step's shape
 * (cattle/simMob.ts) with sheep figures. Returns what happened as data.
 *
 * Sheep are worked as records, each standing for `n` like animals (see
 * `Sheep`). A record's figures are each animal's; deaths, conceptions,
 * litters, lamb fates and strikes are drawn as counts (`counts.ts`) from the
 * sheep's own streams in a fixed order, so a farm is repeatable from its
 * seed: breeding (heat groups, conception, litters, lamb sex and fates),
 * deaths (lambing, orphans, daily deaths), flies.
 */

import type { PlantingGraze } from '../cattle/graze';
import type { AnimalIds, GrazingArea, GrazingLand } from '../cattle/types';
import type { CalendarDate } from '../calendar';
import {
  ADULT_DAILY,
  BIRTH_KG,
  CYCLE_DAYS,
  DSE_PER_AE,
  FLYSTRIKE,
  GAIN_CAP,
  GESTATION_DAYS,
  JOIN_DAYS,
  LAMBING_TIMES,
  LAMB_LATE_DAILY,
  LATE_PREGNANCY_DAY,
  LOSS_CAP,
  LOSS_MJ,
  MARK_DAYS,
  MILK,
  NO_WATER,
  ORPHAN,
  SHEEP_RATION,
  STARVED,
  THIN_DEATHS,
  WEANER_DEATHS,
  WETHER_DAILY,
  WOOL,
  YOUNG_FRAME_DAYS,
} from '../data/sheep';
import { FEED_COST, LICK } from '../data/feed';
import { GRAIN_PER_KG } from '../data/sheepMarket';
import { clamp } from '../num';
import { meFromDmd } from '../pasture/quality';
import type { Rng } from '../rng';
import {
  canJoin,
  cycleConception,
  lambFates,
  lambSurvival,
  lambingRisk,
  litterMean,
  litterShares,
  newLamb,
  onHeat,
  ramCover,
  ramsNeeded,
} from './breeding';
import { binomial, multinomial } from './counts';
import {
  appetiteShare,
  dseOf,
  gainMJPerKg,
  isAdultRam,
  kgPerCs,
  maintMJ,
  milkPotentialMJ,
  milkSpendMJ,
  normalKg,
  pregnancyMJ,
  qualityFactor,
  walkFactor,
} from './energy';
import { sheepDietOf, sheepGrazeAlloc, type SheepDiet, type SheepDietResult } from './graze';
import type { SheepDeathCause, SheepLossReason, SheepNote } from './notes';
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
  /** Every sheep record on the farm by its number, built at the start of the day. */
  byId: ReadonlyMap<number, Sheep>;
  ids: AnimalIds;
  rng: SheepRngs;
}

/** `count` head of a record died today of `cause`. */
export interface SheepDeath {
  sheep: Sheep;
  count: number;
  cause: SheepDeathCause;
}

export interface FlockDayResult {
  st: SheepMobDay;
  deaths: SheepDeath[];
  /** Lamb records born today (each with its head count). */
  births: Sheep[];
  notes: SheepNote[];
  plantingGrazes: PlantingGraze[];
  /** Dollars of grain, hay or lick fed today. Take it off cash. */
  feedCost: number;
  /** Pasture the mob ate today, kg DM (for the year's totals, as the cattle's). */
  eatenKg: number;
  /** Live weight the mob gained today, kg, birth weights of lambs born included (as the cattle's). */
  gainKg: number;
}

/** The flystrike note comes at most once in this many days a mob. */
export const FLY_NOTE_DAYS = 7;

/** The losing-weight and low-condition notes come at most once in this many days a mob. */
export const LOSS_NOTE_DAYS = 7;

/** Live lambs at foot, by the record of their dams. */
export function lambsByDam(sheep: readonly Sheep[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of sheep) {
    if (!s.weaned && !s.dead && s.dam && s.n > 0) out.set(s.dam, (out.get(s.dam) ?? 0) + s.n);
  }
  return out;
}

/** Lambs at foot a ewe on the record (it can be part of a lamb). */
export function lambsPerEwe(s: Sheep, lambsOf: ReadonlyMap<number, number>): number {
  return s.n > 0 ? (lambsOf.get(s.id) ?? 0) / s.n : 0;
}

/** A weaner in its first year after weaning. */
const inWeanerYear = (s: Sheep): boolean =>
  s.weaned && s.wage > 0 && s.age - s.wage < WEANER_DEATHS.days;

/**
 * The weight a sheep is measured against for `STARVED`, kg: a lamb at foot
 * against the normal weight for its age (from a triplet's birth weight, the
 * lightest normal start); a weaned sheep against the normal weight at
 * weaning, so a weaner that grows slowly is stunted, not starved (SB-46's
 * weaners losing 10 g a day live on at about 18 kg).
 */
export function starvedRefKg(s: Pick<Sheep, 'srw' | 'age' | 'weaned'>): number {
  const age = s.weaned ? Math.min(s.age, LAMBING_TIMES.weanDays) : s.age;
  return normalKg(s.srw, age, BIRTH_KG.triplet);
}

/** The daily death risk outside lambing, before no water and flystrike. */
export function dailyDeathRisk(s: Sheep): number {
  let p: number;
  if (!s.weaned) {
    p = s.age >= MARK_DAYS ? LAMB_LATE_DAILY : s.age >= 3 ? s.lambRisk : 0;
  } else if (inWeanerYear(s)) {
    p = weanerDailyRisk(s.adg * 1000, s.wwt / s.srw);
  } else {
    p = s.sex === 'W' ? WETHER_DAILY : ADULT_DAILY;
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

/** A copy of a record with `n` head and a new number (a part split off it). */
export function splitOff(s: Sheep, n: number, ids: AnimalIds): Sheep {
  return { ...s, id: ids.next++, n };
}

/** The 7-day death risk of a struck sheep, as a daily risk. */
const STRUCK_DAILY = 1 - Math.pow(1 - FLYSTRIKE.dieShare, 1 / FLYSTRIKE.dieWithin);

/** Run one sheep mob's day. Changes the mob, its sheep and the pasture in place. */
export function simFlock(m: SheepMob, inp: SimFlockInputs): FlockDayResult {
  const { place, land, day, byId, rng, ids } = inp;
  const notes: SheepNote[] = [];
  const deaths: SheepDeath[] = [];
  const births: Sheep[] = [];
  const plantingGrazes: PlantingGraze[] = [];

  // Water.
  const hasWater = place.kind === 'held' ? place.hasWater !== false : place.area.hasWater;
  m.dry = hasWater ? 0 : m.dry + 1;
  if (m.dry === 1) notes.push({ type: 'noWater', days: 1 });
  if (m.dry === 3) notes.push({ type: 'noWater', days: 3 });

  // Joining: starts on the mob's date each year, for 5 weeks. Each joining
  // ewe record is shared out by the day of her cycle she is on (one draw a
  // record), so heat days follow the 17-day cycle.
  const lambsOf = lambsByDam(m.sheep);
  const joinToday = inp.date.month === m.joinOn.month && inp.date.date === m.joinOn.date;
  if (joinToday) startJoining(m, day, lambsOf, ids, rng.breeding, notes);
  const join = m.join;
  const into = join ? day - join.start : -1;
  const joining = join !== null && into >= 0 && into < JOIN_DAYS;
  if (join && into === JOIN_DAYS) {
    for (const s of m.sheep) s.oes = -1;
    notes.push({ type: 'joiningEnded', ewes: join.joined });
  }

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

  // Lambs go last, so each ewe's milk today is known first.
  const order: Sheep[] = [];
  for (const s of m.sheep) if (s.weaned) order.push(s);
  for (const s of m.sheep) if (!s.weaned) order.push(s);
  const wants = new Float64Array(order.length);
  const lpe = new Float64Array(order.length);
  let demand = 0;
  let dseNow = 0;
  for (let k = 0; k < order.length; k++) {
    const s = order[k]!;
    if (s.dead || s.n <= 0) continue;
    const l = lambsPerEwe(s, lambsOf);
    lpe[k] = l;
    let w = s.wt * appetiteShare(s, l) * qf * diet.avail;
    // Too little protein and the rumen slows (the cattle rule, no lick for sheep yet).
    if (m.feed === 'lick') {
      // The cattle lick's rule: more dry feed eaten when protein is short, and no protein penalty.
      w *= diet.cp < 7 ? LICK.liftUnder7 : diet.cp < 9 ? LICK.liftUnder9 : 1;
    } else if (diet.cp < 7) w *= 1 - (7 - diet.cp) * 0.05;
    wants[k] = w;
    demand += w * s.n;
    if (s.weaned) dseNow += dseOf(s, l) * s.n;
  }
  let f = 1;
  let eatenKg = 0;
  if (place.kind === 'held') f = place.f ?? 1;
  else if (demand > 0) {
    const got = sheepGrazeAlloc(
      land!,
      place.area,
      res!,
      demand,
      dseNow / DSE_PER_AE,
      day,
      plantingGrazes,
    );
    f = got / demand;
    eatenKg = got;
  }

  let rams = 0;
  if (joining) for (const s of order) if (isAdultRam(s) && !s.dead) rams += s.n;
  const cover = joining ? ramCover(rams, join.joined) : 0;
  const lambing = join !== null && join.lambingStart !== null && join.marked < 0;

  const added: Sheep[] = [];
  let feedCost = 0;
  let gainKg = 0;
  let sumWt = 0;
  let sumCs = 0;
  let sumAdg = 0;
  let sumInt = 0;
  let sumPot = 0;
  let n = 0;
  let nLambs = 0;
  let struckToday = 0;
  let milkingEwes = 0;
  let latePregnant = 0;
  for (let k = 0; k < order.length; k++) {
    const s = order[k]!;
    if (s.dead || s.n <= 0) continue;
    const past = wants[k]! * f;
    let mei = past * me;
    // Grain or hay fills the gap between the pasture and what the sheep needs, up to the
    // full ration (SHEEP_RATION). Lambs at foot are not hand fed.
    let fed = 0;
    if (s.weaned && (m.feed === 'grain' || m.feed === 'hay')) {
      const R = SHEEP_RATION[m.feed];
      const full =
        maintMJ(s, walk) +
        pregnancyMJ(s.preg, s.litter) +
        milkPotentialMJ(s, lpe[k]!) +
        (s.age < 365 ? SHEEP_RATION.youngGrowthKg * gainMJPerKg(s) : 0);
      const gap = full - mei;
      if (gap > 0) {
        const stage =
          s.lact >= 0 && lpe[k]! > 0
            ? R.kgDay.lactating
            : s.preg >= SHEEP_RATION.latePregDay
              ? R.kgDay.latePreg
              : R.kgDay.dry;
        const cap =
          stage * (1 + SHEEP_RATION.perFiveKg * Math.max(0, (s.wt - SHEEP_RATION.refKg) / 5));
        fed = Math.min(cap, gap / R.me);
        mei += fed * R.me;
        feedCost += fed * s.n * (m.feed === 'grain' ? GRAIN_PER_KG : FEED_COST.hayKg);
      }
    }
    if (m.feed === 'lick' && s.weaned) {
      feedCost += ((FEED_COST.lick * (diet.cp < 9 ? 1 : LICK.greenFeedShare)) / DSE_PER_AE) * s.n;
    }
    let milkIn = 0;
    const l = lpe[k]!;
    let req = maintMJ(s, walk) + pregnancyMJ(s.preg, s.litter);
    const milking = s.lact >= 0 && l > 0;
    if (milking) {
      s.milk = milkSpendMJ(milkPotentialMJ(s, l), s.cond, me, mei, req);
      req += s.milk;
      milkingEwes += s.n;
    } else s.milk = 0;
    if (s.preg >= LATE_PREGNANCY_DAY) latePregnant += s.n;
    if (!s.weaned) {
      const dam = byId.get(s.dam);
      if (dam && !dam.dead && dam.milk > 0 && dam.n > 0) {
        // The dams' milk shared by their lambs: a ewe's milk ÷ lambs a ewe. Under one lamb a
        // ewe, a ewe's milk is already scaled to the share of ewes milking (`milkPotentialMJ`).
        const each = (lambsOf.get(dam.id) ?? 0) / dam.n;
        milkIn = each > 0 ? (dam.milk * MILK.efficiency) / each : 0;
        mei += milkIn;
      }
    }
    const bal = mei - req;
    let gain = bal > 0 ? bal / gainMJPerKg(s) : bal / LOSS_MJ;
    gain = clamp(gain, -LOSS_CAP, GAIN_CAP);
    if (m.dry > 0) gain = -s.wt * NO_WATER.lossShare;
    const was = s.wt;
    s.wt = Math.max(1.5, s.wt + gain);
    gainKg += (s.wt - was) * s.n;
    // Young growing sheep put most of a gain into frame, not condition.
    const young = s.age < YOUNG_FRAME_DAYS;
    s.cond = clamp(s.cond + (gain / kgPerCs(s)) * (gain > 0 && young ? 0.3 : 1), 1, 5);
    s.adg = s.adg * 0.93 + gain * 0.07;
    s.age++;

    // Wool.
    growWool(s, woolGrowthG(s, past + fed + milkIn * WOOL.milkKgPerMj, gain, milking));

    // Breeding.
    if (s.sex === 'F' && s.weaned) {
      if (s.preg >= 0) {
        s.preg++;
        if (s.preg === LAMBING_TIMES.scanDays) s.csScan = s.cond;
        if (s.preg >= GESTATION_DAYS) {
          const lit = s.litter;
          lambRecord(s, m, inp, added, births, deaths);
          if (join && join.lambingStart === null && day >= join.start && lit > 0) {
            join.lambingStart = day;
            notes.push({ type: 'lambingStarted' });
          }
          if (s.n <= 0) continue;
        }
      } else if (joining && s.oes >= 0 && l === 0 && onHeat(into, s.oes)) {
        const got = binomial(s.n, cycleConception(s.cond, s.breed) * cover, rng.breeding);
        if (got > 0) {
          const sh = litterShares(litterMean(s.cond, s.breed));
          const byLitter = multinomial(got, [sh[1], sh[2], sh[3]], rng.breeding);
          for (let lit = 1; lit <= 3; lit++) {
            const c = byLitter[lit - 1]!;
            if (c <= 0) continue;
            const p = splitOff(s, c, ids);
            p.preg = 0;
            p.litter = lit;
            p.csJoin = s.cond;
            p.oes = -1;
            added.push(p);
            join.pregnant += c;
            join.foetuses += c * lit;
          }
          s.n -= got;
          if (s.n <= 0) {
            s.dead = true;
            continue;
          }
        }
      }
      if (s.lact >= 0) s.lact++;
    }

    // Lambs: early deaths drawn at birth, and lambs with no dam to suckle.
    if (!s.weaned) {
      const early = s.age === 1 ? s.doomed : s.age === 2 ? s.doomed2 : 0;
      if (early > 0) {
        const c = Math.min(s.n, early);
        s.n -= c;
        deaths.push({ sheep: s, count: c, cause: 'newborn' });
        if (s.age === 1) s.doomed = 0;
        else s.doomed2 = 0;
        if (s.n <= 0) {
          s.dead = true;
          continue;
        }
      }
      const dam = byId.get(s.dam);
      if (!dam || dam.dead || dam.n <= 0) {
        s.dam = 0;
        if (s.age >= ORPHAN.weanDays) weanSheep(s);
        else {
          const c = binomial(s.n, ORPHAN.daily, rng.deaths);
          if (c > 0) {
            s.n -= c;
            deaths.push({ sheep: s, count: c, cause: 'orphaned' });
            if (s.n <= 0) {
              s.dead = true;
              continue;
            }
          }
        }
      }
    }

    // Deaths.
    let pd = dailyDeathRisk(s);
    if (s.struck >= 0) pd += STRUCK_DAILY;
    if (m.dry >= NO_WATER.dieOnDay) pd = 1;
    // A sheep under half its normal weight for its age is dead (STARVED).
    const starved = s.wt < STARVED.share * starvedRefKg(s);
    if (starved) pd = 1;
    const died = binomial(s.n, pd, rng.deaths);
    if (died > 0) {
      s.n -= died;
      deaths.push({
        sheep: s,
        count: died,
        cause:
          m.dry > 2
            ? 'noWater'
            : starved
              ? 'starved'
              : s.cond < 1.6
                ? 'poorCondition'
                : s.struck >= 0
                  ? 'flystrike'
                  : !s.weaned && s.age < MARK_DAYS
                    ? 'newborn'
                    : inWeanerYear(s)
                      ? 'weaner'
                      : 'natural',
      });
      if (s.n <= 0) {
        s.dead = true;
        continue;
      }
    }

    // Flystrike (call C21: Merinos unmulesed). The struck are split off.
    if (s.struck >= 0) s.struck = s.struck + 1 >= FLYSTRIKE.dieWithin ? -1 : s.struck + 1;
    if (s.weaned) {
      if (s.flyCover > 0) s.flyCover--;
      else if (s.struck < 0) {
        const c = binomial(s.n, FLYSTRIKE.daily[s.breed], rng.flies);
        if (c > 0) {
          const p = splitOff(s, c, ids);
          p.struck = 0;
          p.wt = Math.max(1.5, p.wt - FLYSTRIKE.kg[s.breed]);
          p.cond = clamp(p.cond - FLYSTRIKE.cs, 1, 5);
          added.push(p);
          s.n -= c;
          struckToday += c;
          if (s.n <= 0) {
            s.dead = true;
            continue;
          }
        }
      }
    }

    s.di = past;
    if (s.weaned) {
      n += s.n;
      sumWt += s.wt * s.n;
      sumCs += s.cond * s.n;
      sumAdg += s.adg * s.n;
      sumInt += past * s.n;
      sumPot += s.wt * appetiteShare(s, l) * 1.05 * s.n;
    } else nLambs += s.n;
  }
  // Parts split off today (pregnant ewes, the struck) count in today's figures.
  for (const p of added) {
    if (p.weaned && !p.dead && p.n > 0) {
      n += p.n;
      sumWt += p.wt * p.n;
      sumCs += p.cond * p.n;
      sumAdg += p.adg * p.n;
      sumInt += (p.di ?? 0) * p.n;
      sumPot += p.wt * appetiteShare(p, 0) * 1.05 * p.n;
    }
  }
  for (const p of added) m.sheep.push(p);
  // Strikes are told at most once a week a mob, with the count since the last note.
  m.flyCount += struckToday;
  if (m.flyCount > 0 && day - m.flyNoted >= FLY_NOTE_DAYS) {
    notes.push({ type: 'flystrike', count: m.flyCount });
    m.flyCount = 0;
    m.flyNoted = day;
  }

  if (join) {
    if (lambing) {
      for (const d of deaths) {
        if (d.sheep.sex === 'F' && d.sheep.weaned && d.sheep.parity > 0) {
          join.eweDeathsLambing += d.count;
        }
      }
    }
    // The scanning count.
    if (!join.scanned && into === LAMBING_TIMES.scanDays) {
      join.scanned = true;
      let preg = 0;
      let foet = 0;
      for (const s of m.sheep) {
        if (!s.dead && s.preg >= 0) {
          preg += s.n;
          foet += s.litter * s.n;
        }
      }
      join.pregnant = preg;
      join.foetuses = foet;
      notes.push({ type: 'scanned', ewes: join.joined, pregnant: preg, foetuses: foet });
    }
    // The marking count: lambs alive, and ram lambs marked.
    if (
      join.lambingStart !== null &&
      join.marked < 0 &&
      day - join.lambingStart >= LAMBING_TIMES.markDays
    ) {
      let lambsAlive = 0;
      for (const s of m.sheep) {
        if (s.dead || s.weaned) continue;
        lambsAlive += s.n;
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
  // Told on the 10th day of losses, then once a week while the slide carries on (review of the
  // third pass: a mob could lose a third of its weight with one note).
  if (m.lossDays >= 10 && (m.lossDays - 10) % LOSS_NOTE_DAYS === 0) {
    const why: SheepLossReason[] = [];
    if (f < 0.85 || diet.avail < 0.75) why.push('lowFeed');
    if (me < 8) why.push('lowEnergy');
    if (diet.cp < 7) why.push('lowProtein');
    if (milkingEwes > 0) why.push('milking');
    if (latePregnant > 0) why.push('latePregnancy');
    notes.push({ type: 'losingWeight', me, cp: diet.cp, why });
  }
  if (n && st.cs < 2 && m.lastThin <= day - LOSS_NOTE_DAYS) {
    m.lastThin = day;
    notes.push({ type: 'lowCondition', cs: st.cs });
  }
  let born = 0;
  for (const b of births) born += b.wt * b.n;
  return { st, deaths, births, notes, plantingGrazes, feedCost, eatenKg, gainKg: gainKg + born };
}

/** Start the year's joining: count the ewes and rams, and share each ewe record out by cycle day. */
function startJoining(
  m: SheepMob,
  day: number,
  lambsOf: ReadonlyMap<number, number>,
  ids: AnimalIds,
  rng: Rng,
  notes: SheepNote[],
): void {
  const ewes = m.sheep.filter((s) => canJoin(s, lambsPerEwe(s, lambsOf)));
  if (!ewes.length) return;
  let joined = 0;
  let rams = 0;
  let ramSrw = 0;
  let xbRams = false;
  for (const s of m.sheep) {
    if (isAdultRam(s) && !s.dead) {
      rams += s.n;
      ramSrw += s.srw * s.n;
      if (s.breed === 'xb') xbRams = true;
    }
  }
  const eweSrw = ewes.reduce((t, s) => t + s.srw * s.n, 0);
  for (const s of ewes) joined += s.n;
  m.join = {
    start: day,
    joined,
    rams,
    sireBreed: xbRams ? 'xb' : 'merino',
    // With no rams there are no lambs; the ewes' own SRW is kept so the record is whole.
    sireSrw: rams ? ramSrw / rams : eweSrw / joined,
    pregnant: 0,
    foetuses: 0,
    scanned: false,
    lambingStart: null,
    born: 0,
    ewesLambed: 0,
    marked: -1,
    weaned: -1,
    eweDeathsLambing: 0,
  };
  const even = new Array<number>(CYCLE_DAYS).fill(1 / CYCLE_DAYS);
  for (const s of ewes) {
    const byDay = multinomial(s.n, even, rng);
    let first = true;
    for (let d = 0; d < CYCLE_DAYS; d++) {
      const c = byDay[d]!;
      if (c <= 0) continue;
      if (first) {
        // The record itself takes the first cycle day that has ewes.
        s.oes = d;
        s.n = c;
        first = false;
      } else {
        const p = splitOff(s, c, ids);
        p.oes = d;
        m.sheep.push(p);
      }
    }
  }
  notes.push({ type: 'joiningStarted', ewes: joined, rams, ramsNeeded: ramsNeeded(joined) });
}

/**
 * A pregnant ewe record lambs. How many ewes die at lambing is drawn first
 * (their lambs are born and die with them); the rest lamb, and their lambs
 * come as a ewe-lamb record and a ram-lamb record, with their early deaths
 * drawn now. The ewe record becomes the milking record.
 */
function lambRecord(
  s: Sheep,
  m: SheepMob,
  inp: SimFlockInputs,
  added: Sheep[],
  births: Sheep[],
  deaths: SheepDeath[],
): void {
  const { rng, ids } = inp;
  const litter = s.litter;
  const join = m.join;
  const csLost = s.csScan > 0 ? s.csScan - s.cond : 0;
  const died = binomial(s.n, lambingRisk(s.cond, litter, s.breed, csLost), rng.deaths);
  const sire = join ? { breed: join.sireBreed, srw: join.sireSrw } : { breed: s.breed, srw: s.srw };
  const survival = lambSurvival(s.cond, litter, s.breed);
  const live = s.n - died;
  if (died > 0) {
    // Lambs of the ewes that died, born and lost with them.
    const lost = newLamb(ids, s, sire, litter, true, died * litter);
    lost.dead = true;
    lost.dam = 0;
    births.push(lost);
    deaths.push({ sheep: s, count: died, cause: 'lambing' });
    deaths.push({ sheep: lost, count: died * litter, cause: 'lambing' });
  }
  if (join) {
    join.born += s.n * litter;
    join.ewesLambed += s.n;
  }
  s.n = live;
  s.preg = -1;
  s.litter = 0;
  s.csJoin = 0;
  s.csScan = 0;
  s.parity++;
  if (live <= 0) {
    s.dead = true;
    return;
  }
  s.lact = 0;
  s.reared = litter;
  const total = live * litter;
  const ewesLambs = binomial(total, 0.5, rng.breeding);
  for (const [female, c] of [
    [true, ewesLambs],
    [false, total - ewesLambs],
  ] as const) {
    if (c <= 0) continue;
    const lamb = newLamb(ids, s, sire, litter, female, c);
    const fate = lambFates(c, survival, rng.breeding);
    lamb.doomed = fate.doomed;
    lamb.doomed2 = fate.doomed2;
    lamb.lambRisk = fate.risk;
    added.push(lamb);
    births.push(lamb);
  }
}

/** Wean a lamb record: it keeps its weight and age at weaning, for the weaner death risk. */
export function weanSheep(s: Sheep): void {
  s.weaned = true;
  s.dam = 0;
  s.wwt = s.wt;
  s.wage = s.age;
}

/**
 * True when the mob's lambs are due to be weaned: 14 weeks from the start of
 * lambing (S17), or as soon as any lamb at foot reaches
 * `LAMBING_TIMES.weanByAge` days old (lambs with no joining record, or born
 * after the mob's weaning day).
 */
export function sheepWeaningDue(m: SheepMob, day: number): boolean {
  const j = m.join;
  if (
    j !== null &&
    j.lambingStart !== null &&
    j.weaned < 0 &&
    day - j.lambingStart >= LAMBING_TIMES.weanDays
  )
    return true;
  return m.sheep.some((s) => !s.weaned && !s.dead && s.n > 0 && s.age >= LAMBING_TIMES.weanByAge);
}

/**
 * Wean every lamb at foot in the mob and dry off their ewes. Returns the
 * weaner records (still in the mob: the farm moves them). Counts them on the
 * joining.
 */
export function weanLambs(m: SheepMob): Sheep[] {
  const out: Sheep[] = [];
  let head = 0;
  for (const s of m.sheep) {
    if (s.dead || s.weaned || s.n <= 0) continue;
    weanSheep(s);
    out.push(s);
    head += s.n;
  }
  for (const s of m.sheep) {
    if (s.lact >= 0) {
      s.lact = -1;
      s.reared = 0;
      s.milk = 0;
    }
  }
  if (m.join && m.join.weaned < 0) m.join.weaned = head;
  return out;
}

/** Head in a list of sheep records. */
export const headOf = (sheep: readonly Sheep[]): number =>
  sheep.reduce((t, s) => t + (s.dead ? 0 : s.n), 0);

/**
 * The end of the day, after every sheep mob has had its day:
 * - the lambs of ewes that died are orphaned in proportion (drawn as counts);
 * - records with no head left are taken out;
 * - a milking record whose lambs are all gone is dried off;
 * - like records are joined (`mergeLikeRecords`).
 */
export function settleSheepDeaths(
  mobs: readonly SheepMob[],
  deaths: readonly SheepDeath[],
  byId: ReadonlyMap<number, Sheep>,
  ids: AnimalIds,
  rng: Rng,
): void {
  // Ewes that died off milking records: their share of the lambs lose their dam.
  const eweLoss = new Map<number, number>();
  for (const d of deaths) {
    // A ewe that died lambing had no lambs made for her, so only later deaths orphan lambs.
    if (d.sheep.weaned && d.sheep.lact >= 0 && d.cause !== 'lambing') {
      eweLoss.set(d.sheep.id, (eweLoss.get(d.sheep.id) ?? 0) + d.count);
    }
  }
  for (const m of mobs) {
    if (eweLoss.size) {
      const orphans: Sheep[] = [];
      for (const s of m.sheep) {
        if (s.weaned || !s.dam || s.dead || s.n <= 0) continue;
        const lost = eweLoss.get(s.dam);
        if (!lost) continue;
        const dam = byId.get(s.dam);
        const before = (dam && !dam.dead ? dam.n : 0) + lost;
        const c = before > 0 ? binomial(s.n, lost / before, rng) : s.n;
        if (c <= 0) continue;
        if (c >= s.n) {
          s.dam = 0;
          continue;
        }
        const o = splitOff(s, c, ids);
        o.dam = 0;
        s.n -= c;
        orphans.push(o);
      }
      for (const o of orphans) m.sheep.push(o);
    }
    m.sheep = m.sheep.filter((s) => !s.dead && s.n > 0);
    const lambsOf = lambsByDam(m.sheep);
    for (const s of m.sheep) {
      if (s.lact >= 0 && !lambsOf.has(s.id)) {
        s.lact = -1;
        s.reared = 0;
        s.milk = 0;
      }
    }
    mergeLikeRecords(m);
  }
}

/** The fields two records must share to be joined into one. */
function likeKey(s: Sheep): string {
  return [
    s.sex,
    s.breed,
    s.srw,
    s.weaned ? 1 : 0,
    s.preg,
    s.litter,
    s.reared,
    s.parity,
    s.oes,
    s.struck,
    s.age,
    s.wage,
    s.woolDays,
    s.flyCover,
  ].join('|');
}

/**
 * Join records that stand for like animals: same sex, breed, SRW, age,
 * pregnancy, litter (and the litter a lamb was born in), joining day,
 * strike, weaning age and wool count. Their
 * weights and other figures are averaged by head. Records with lambs at
 * foot and lambs at foot are never joined (their link is by record).
 */
export function mergeLikeRecords(m: SheepMob): void {
  if (m.sheep.length < 2) return;
  const lambsOf = lambsByDam(m.sheep);
  const byKey = new Map<string, Sheep>();
  const keep: Sheep[] = [];
  for (const s of m.sheep) {
    if (!s.weaned || s.lact >= 0 || lambsOf.has(s.id)) {
      keep.push(s);
      continue;
    }
    const key = likeKey(s);
    const t = byKey.get(key);
    if (!t) {
      byKey.set(key, s);
      keep.push(s);
      continue;
    }
    const N = t.n + s.n;
    const av = (a: number, b: number): number => (a * t.n + b * s.n) / N;
    t.wt = av(t.wt, s.wt);
    t.cond = av(t.cond, s.cond);
    t.adg = av(t.adg, s.adg);
    t.fleece = av(t.fleece, s.fleece);
    t.micronKg = av(t.micronKg, s.micronKg);
    t.wwt = av(t.wwt, s.wwt);
    t.csJoin = av(t.csJoin, s.csJoin);
    t.csScan = av(t.csScan, s.csScan);
    t.paid = av(t.paid, s.paid);
    t.cost = av(t.cost, s.cost);
    t.n = N;
  }
  m.sheep = keep;
}

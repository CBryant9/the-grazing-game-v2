import 'server-only';
import {
  CLASS_LABELS,
  DISTRICTS,
  GROUPS,
  SUPPLEMENTS,
  WEAN_MIN_AGE,
  areaIdOf,
  classOf,
  dietOf,
  groupKey,
  intakeOf,
  mobSummaries,
  plantingsNow,
  predictGains,
  surveyOf,
  type Animal,
  type CattleClassId,
  type FarmMob,
  type FarmState,
  type GainForecast,
  type GrazingArea,
  type GrazingLand,
  type MarketView,
  type MobSummary,
  type SourceEnv,
  type Survey,
} from '@gg/engine';
import type {
  DateParts,
  MobClassWire,
  MobWire,
  SellGroupId,
  SellGroupWire,
  SuppId,
  SuppOptionWire,
} from '../../lib/game/types';
import { SUPP_LABEL, REASON, joiningWord, mobWhy } from './mobwords';

const round = (n: number, places = 0): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

const avg = (list: readonly Animal[], f: (a: Animal) => number): number =>
  list.reduce((n, a) => n + f(a), 0) / list.length;

const CALF_CLASSES = new Set<string>(['heiferCalf', 'bullCalf', 'steerCalf']);
const SELL_GROUPS: SellGroupId[] = ['steer', 'heifer', 'heiferP', 'cowP', 'cowE', 'bull'];

/** The farm's country as the cattle formulas see it, from the engine's own reads. */
function landOf(farm: FarmState, survey: Survey, env: SourceEnv): GrazingLand {
  return {
    pasture: farm.pasture,
    district: DISTRICTS[farm.district],
    plantings: plantingsNow(farm, env),
    haPerSquare: farm.layout.scale.haPerSquare,
    sideM: farm.layout.scale.sideM,
    distToWater: survey.points.dist,
  };
}

function areaOf(survey: Survey, areaId: number): GrazingArea {
  const a = survey.topology.areas[areaId]!;
  return { cells: a.cells, ha: a.ha, hasWater: survey.points.areaTroughs[areaId]!.length > 0 };
}

function classRows(animals: readonly Animal[]): MobClassWire[] {
  const by = new Map<CattleClassId, Animal[]>();
  for (const a of animals) {
    const c = classOf(a);
    const list = by.get(c);
    if (list) list.push(a);
    else by.set(c, [a]);
  }
  return [...by].map(([id, list]) => ({
    id,
    label: CLASS_LABELS[id],
    head: list.length,
    weightKg: round(list.reduce((s, a) => s + a.wt, 0) / list.length),
    cs: round(list.reduce((s, a) => s + a.cond, 0) / list.length, 1),
    calf: CALF_CLASSES.has(id),
  }));
}

/**
 * Every mob as the mob card needs it: the engine's own figures, the reasons
 * it gives for a mob not gaining, and what each husbandry button can do.
 * Plain numbers and ready-made words only.
 */
export function buildMobs(farm: FarmState, env: SourceEnv, market: MarketView): MobWire[] {
  const survey = surveyOf(farm);
  const land = landOf(farm, survey, env);
  const byId = new Map<number, FarmMob>(farm.mobs.map((m) => [m.id, m]));
  return mobSummaries(farm).map((s) => mobWire(farm, byId.get(s.id)!, s, survey, land, market));
}

function mobWire(
  farm: FarmState,
  m: FarmMob,
  s: MobSummary,
  survey: Survey,
  land: GrazingLand,
  market: MarketView,
): MobWire {
  const areaId = areaIdOf(survey, m);
  const onPasture = m.where.kind === 'paddock' && areaId >= 0;
  const area = onPasture ? areaOf(survey, areaId) : null;
  const diet = area ? dietOf(land, area).diet : null;

  // The engine's own reasons, for a mob that is not gaining or is short of feed.
  let forecasts: GainForecast[] = [];
  if (area && m.st && (m.st.adg < 0.05 || m.st.f < 0.9)) {
    forecasts = predictGains(m, land, area).filter((g) => g.why.length > 0);
  }
  const why = mobWhy({
    name: s.name,
    area: s.area,
    where: s.where.kind,
    hasWater: s.hasWater,
    dryDays: s.dryDays,
    adg: m.st ? m.st.adg : null,
    fed: area && m.st ? m.st.f : null,
    forecasts,
  });

  const suppOptions: SuppOptionWire[] = diet
    ? SUPPLEMENTS.map((id) => ({
        id: id as SuppId,
        label: SUPP_LABEL[id],
        perDay: round(
          m.animals.reduce((n, a) => n + intakeOf(a, diet, id, false).cost, 0),
          2,
        ),
      }))
    : [];

  const marked = m.animals.filter((a) => a.sex === 'M' && (a.kind === 'calf' || a.young)).length;
  const weanable = m.animals.filter((a) => a.kind === 'calf' && a.age >= WEAN_MIN_AGE).length;

  const mine = new Set(m.animals.map((a) => a.id));
  const sale = market.booked.find((b) => b.animalIds.some((id) => mine.has(id)));
  const bookedIds = new Set<number>();
  for (const b of market.booked) for (const id of b.animalIds) bookedIds.add(id);
  const sellGroups: SellGroupWire[] = SELL_GROUPS.map((id) => ({
    id,
    name: GROUPS[id].name,
    head: m.animals.filter((a) => a.kind !== 'calf' && groupKey(a) === id && !bookedIds.has(a.id))
      .length,
  })).filter((g) => g.head > 0);

  const adults = m.animals.filter((a) => a.kind !== 'calf');
  const females = m.animals.filter((a) => a.kind === 'cow' || a.kind === 'heifer');
  const join = m.join;
  const bookedDate: DateParts | null = sale
    ? { year: sale.date.year, month: sale.date.month, date: sale.date.date }
    : null;

  return {
    id: s.id,
    name: s.name,
    where: s.where.kind,
    area: s.area,
    hasWater: s.hasWater,
    head: s.head,
    calves: s.calves,
    ae: round(s.ae, 1),
    dse: round(s.dse),
    dryDays: s.dryDays,
    // Before the mob's first day, the average of the animals themselves.
    weightKg: s.day ? round(s.day.wt) : adults.length ? round(avg(adults, (a) => a.wt)) : null,
    cs: s.day
      ? round(s.day.cs, 1)
      : adults.length
        ? round(
            avg(adults, (a) => a.cond),
            1,
          )
        : null,
    adgKg: s.day ? round(s.day.adg, 2) : null,
    me: s.day ? round(s.day.me, 1) : null,
    cp: s.day ? round(s.day.cp, 1) : null,
    intakeKg: s.day ? round(s.day.intake, 1) : null,
    intakePct: s.day && s.day.wt > 0 ? round((s.day.intake / s.day.wt) * 100, 1) : null,
    classes: classRows(m.animals),
    why,
    ptic: females.filter((a) => a.preg >= 0).length,
    joining: join
      ? joiningWord(Math.floor((farm.day - join.start) / 7) + 1, join.conc, join.elig)
      : null,
    supp: m.supp as SuppId,
    suppOptions,
    suppReason:
      s.where.kind === 'paddock'
        ? null
        : s.where.kind === 'yards'
          ? REASON.noSuppYards
          : REASON.noSuppLot,
    booked: s.booked,
    bookedDate,
    markCount: marked,
    markReason: marked > 0 ? null : REASON.noCalvesToMark,
    weanCount: weanable,
    weanReason: weanable > 0 ? null : REASON.noCalvesToWean,
    sellGroups,
    sellReason: sellGroups.length > 0 ? null : REASON.nothingToSell,
  };
}

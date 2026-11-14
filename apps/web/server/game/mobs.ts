import 'server-only';
import {
  CLASS_LABELS,
  DISTRICTS,
  JOINING_DAYS,
  SUPPLEMENTS,
  areaIdOf,
  areaWatered,
  breedingReports,
  dateOn,
  husbandryNow,
  recordClassOf,
  recordGroupOf,
  mobSummaries,
  plantingsNow,
  predictGains,
  supplementCosts,
  surveyOf,
  type Animal,
  type CattleClassId,
  type FarmMob,
  type FarmState,
  type GainForecast,
  type GrazingArea,
  type GrazingLand,
  type MarketView,
  type MobBreedingReport,
  type MobHusbandry,
  type MobSummary,
  type SourceEnv,
  type SupplementCost,
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
import { GROUP_NAME, SUPP_LABEL, REASON, breedingLines, mobWhy, pticWords } from './mobwords';

const round = (n: number, places = 0): number => {
  const k = 10 ** places;
  return Math.round(n * k) / k;
};

const avg = (list: readonly Animal[], f: (a: Animal) => number): number =>
  list.reduce((n, a) => n + f(a), 0) / list.length;

const CALF_CLASSES = new Set<string>(['heiferCalf', 'bullCalf', 'steerCalf']);
const SELL_GROUPS: SellGroupId[] = ['steer', 'heifer', 'heiferP', 'cowP', 'cowE', 'bull'];

/**
 * The farm's country and a grazing area as `predictGains` takes them. The
 * engine builds these inside the tick and does not export them, so they are
 * put together here from the engine's own reads (water from `areaWatered`).
 */
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
  return { cells: a.cells, ha: a.ha, hasWater: areaWatered(survey.points, areaId) };
}

/**
 * The class rows on the mob card, on the record: a female counts as PTIC
 * only from PTIC_DAYS in calf (the engine's one rule, CLAUDE.md rule 14).
 */
function classRows(animals: readonly Animal[]): MobClassWire[] {
  const by = new Map<CattleClassId, Animal[]>();
  for (const a of animals) {
    const c = recordClassOf(a);
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

const dateParts = (d: { year: number; month: number; date: number }): DateParts => ({
  year: d.year,
  month: d.month,
  date: d.date,
});

/** What the farm reads once for every mob card. */
interface MobReads {
  survey: Survey;
  land: GrazingLand;
  market: MarketView;
  reports: Map<number, MobBreedingReport>;
  husbandry: Map<number, MobHusbandry>;
  supp: Map<number, SupplementCost>;
}

/**
 * Every mob as the mob card needs it: the engine's own figures, the reasons
 * it gives for a mob not gaining, what each husbandry button can do, and the
 * breeding on the record (PTIC from PTIC_DAYS in calf). Plain numbers and ready-made
 * words only.
 */
export function buildMobs(farm: FarmState, env: SourceEnv, market: MarketView): MobWire[] {
  const survey = surveyOf(farm);
  const reads: MobReads = {
    survey,
    land: landOf(farm, survey, env),
    market,
    reports: new Map(breedingReports(farm).map((r) => [r.mob, r])),
    husbandry: new Map(husbandryNow(farm, env).map((h) => [h.mob, h])),
    supp: new Map(supplementCosts(farm, env).map((c) => [c.mob, c])),
  };
  const byId = new Map<number, FarmMob>(farm.mobs.map((m) => [m.id, m]));
  return mobSummaries(farm).map((s) => mobWire(farm, byId.get(s.id)!, s, reads));
}

/** What each supplement costs a mob a day, dollars, as today's tick charges it. Null for a mob not on pasture. */
export function suppPerDay(
  farm: FarmState,
  env: SourceEnv,
  mob: number,
  supp: SuppId,
): number | null {
  const c = supplementCosts(farm, env).find((x) => x.mob === mob);
  return c ? round(c.perDay[supp], 2) : null;
}

function mobWire(farm: FarmState, m: FarmMob, s: MobSummary, r: MobReads): MobWire {
  const areaId = areaIdOf(r.survey, m);
  const onPasture = m.where.kind === 'paddock' && areaId >= 0;
  const area = onPasture ? areaOf(r.survey, areaId) : null;

  // The engine's own reasons, for a mob that is not gaining or is short of feed.
  let forecasts: GainForecast[] = [];
  if (area && m.st && (m.st.adg < 0.05 || m.st.f < 0.9)) {
    // Grouped by the record, so the lines never move on the day a cow conceives.
    forecasts = predictGains(m, r.land, area, recordClassOf).filter((g) => g.why.length > 0);
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

  const cost = r.supp.get(m.id);
  const suppOptions: SuppOptionWire[] =
    onPasture && cost
      ? SUPPLEMENTS.map((id) => ({
          id: id as SuppId,
          label: SUPP_LABEL[id],
          perDay: round(cost.perDay[id], 2),
        }))
      : [];

  const hus = r.husbandry.get(m.id);
  const mark = hus?.mark ?? { count: 0, canDo: false };
  const wean = hus?.wean ?? { count: 0, canDo: false };

  const mine = new Set(m.animals.map((a) => a.id));
  const sale = r.market.booked.find((b) => b.animalIds.some((id) => mine.has(id)));
  const bookedIds = new Set<number>();
  for (const b of r.market.booked) for (const id of b.animalIds) bookedIds.add(id);
  const sellGroups: SellGroupWire[] = SELL_GROUPS.map((id) => ({
    id,
    name: GROUP_NAME[id],
    head: m.animals.filter(
      (a) => a.kind !== 'calf' && recordGroupOf(a) === id && !bookedIds.has(a.id),
    ).length,
  })).filter((g) => g.head > 0);

  const adults = m.animals.filter((a) => a.kind !== 'calf');
  const report = r.reports.get(m.id);
  const join = m.join;
  const bookedDate: DateParts | null = sale ? dateParts(sale.date) : null;

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
    ptic: report ? report.ptic.cows + report.ptic.heifers : 0,
    pticText: report ? pticWords(report.ptic, report.months) : null,
    breeding: breedingLines({
      joining: join
        ? {
            start: dateParts(dateOn(farm, join.start)),
            end: dateParts(dateOn(farm, join.start + JOINING_DAYS)),
            days: JOINING_DAYS,
            ended: farm.day >= join.start + JOINING_DAYS,
          }
        : null,
      ptic: report ? pticWords(report.ptic, report.months) : null,
    }),
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
    markCount: mark.count,
    markReason: mark.canDo ? null : (mark.why?.message ?? REASON.noCalvesToMark),
    weanCount: wean.count,
    weanReason: wean.canDo ? null : (wean.why?.message ?? REASON.noCalvesToWean),
    sellGroups,
    sellReason: sellGroups.length > 0 ? null : REASON.nothingToSell,
  };
}

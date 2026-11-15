import 'server-only';
import {
  GRID_N,
  SUPPLEMENTS,
  feedForecast,
  supplementCosts,
  type FarmState,
  type FeedForecast,
  type SourceEnv,
  type SupplementAdds,
} from '@gg/engine';
import type { FeedMobWire, FeedPointWire, FeedWire, MobWire, SuppId } from '../../lib/game/types';
import { SUPP_LABEL } from './mobwords';

/**
 * The Feed panel (REQUIREMENTS, "A feed graph forecasts the rest of the year,
 * with crops showing as spikes"; mockup E). The forecast is the engine's own
 * (`feedForecast`): growth at the district's long-term average from today,
 * never the real weather to come. It is sent as tonnes to draw, never the
 * growth curves (CLAUDE.md rule 14). The supplements table shows each mob's
 * supplement at its daily price with what it adds (supplements are switched
 * on at a daily price: REQUIREMENTS, 14 Nov 2026).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const DAYS_A_MONTH = 30.4;

const t1 = (kg: number): number => Math.round(kg / 100) / 10;
const tText = (t: number): string =>
  t >= 100 ? Math.round(t).toLocaleString('en-AU') : t.toLocaleString('en-AU');

/** "early October", "mid March", "late June". */
export function partOfMonth(d: { month: number; date: number }): string {
  const part = d.date <= 10 ? 'early' : d.date <= 20 ? 'mid' : 'late';
  return `${part} ${MONTH_NAMES[d.month]}`;
}

/** The forecast note: it is an average season, not this year's weather. */
export const FORECAST_NOTE =
  'Average-season forecast: grass grows at the district’s long-term average from today. It is not a forecast of this year’s rain. The stock are the stock on hand, with nothing bought, sold, born or moved.';

/** The forecast's facts, for the card under the chart. */
export function forecastLines(f: FeedForecast): string[] {
  const lines: string[] = [];
  const month = t1(f.eatKgDay * DAYS_A_MONTH);
  if (f.head > 0 && f.eatKgDay > 0) {
    lines.push(
      `At ${f.head.toLocaleString('en-AU')} head the stock eat about ${tText(month)} t DM a month.`,
    );
  } else {
    lines.push('No stock are grazing, so nothing is eaten in this forecast.');
  }
  if (f.pastureHa > 0) {
    if (f.underFloor && f.underFloor.day === f.points[0]!.day) {
      lines.push('Feed on offer is under the ground cover floor now.');
    } else if (f.underFloor) {
      lines.push(
        `In an average season, feed on offer falls under the ground cover floor in ${partOfMonth(f.underFloor.date)}.`,
      );
    } else {
      lines.push(
        'In an average season, feed on offer stays above the ground cover floor for the next 12 months.',
      );
    }
  }
  let top: FeedForecast['points'][number] | null = null;
  for (const p of f.points) if (p.cropKg > 0 && (!top || p.cropKg > top.cropKg)) top = p;
  if (top && t1(top.cropKg) > 0) {
    lines.push(
      `Crops add the most feed in ${MONTH_NAMES[top.date.month]}: about ${tText(t1(top.cropKg))} t DM.`,
    );
  }
  return lines;
}

/** The chart in one sentence, for a screen reader. */
export function forecastSummary(points: readonly FeedPointWire[], floorT: number): string {
  if (!points.length) return 'No forecast.';
  const low = points.reduce((a, b) => (b.pastureT < a.pastureT ? b : a));
  const high = points.reduce((a, b) => (b.pastureT > a.pastureT ? b : a));
  return `Feed on offer, tonnes of dry matter by month from ${points[0]!.label}: lowest ${tText(low.pastureT)} t in ${low.label}, highest ${tText(high.pastureT)} t in ${high.label}. The ground cover floor is ${tText(floorT)} t.`;
}

/** What a supplement adds, as a fact. Empty for none. */
export function addsText(id: SuppId, a: SupplementAdds): string {
  if (id === 'none') return '';
  if (id === 'lick') {
    return a.pastureKg > 0.05
      ? `Lifts pasture eaten by about ${a.pastureKg.toFixed(1)} kg DM a head a day on this feed.`
      : 'No lift in pasture eaten on this feed.';
  }
  const fed = `${a.kg.toFixed(1)} kg DM a head a day at ME ${a.me.toFixed(1)} MJ/kg, CP ${Math.round(a.cp)}%`;
  return a.pastureKg < -0.05
    ? `${fed}. They eat about ${Math.abs(a.pastureKg).toFixed(1)} kg less pasture.`
    : `${fed}.`;
}

/** Plain facts about supplements in Fast Farm. */
export const SUPP_NOTES = [
  'A supplement is switched on for a mob at a daily price. The cost comes off cash each day it is on.',
  'The price a day is for the mob as it is today, on today’s feed.',
];

// The forecast takes about a tenth of a second (a year of the grass model). It changes only with
// the pasture, the crops and the stock, so the last few are kept and reused.
const kept = new Map<string, FeedForecast>();
const KEEP = 32;

function forecastKey(farm: FarmState): string {
  const p = farm.pasture;
  let mass = 0;
  let land = 0;
  for (let i = 0; i < GRID_N; i++) {
    mass += p.G[i]! + p.D[i]!;
    land += p.land[i]! * ((i % 7) + 1);
  }
  let eat = 0;
  let head = 0;
  for (const m of farm.mobs) {
    head += m.animals.length * (m.where.kind === 'lot' ? -1 : 1);
    eat += m.st?.demand ?? 0;
  }
  for (const m of farm.sheep?.mobs ?? []) eat += m.st?.demand ?? 0;
  const fields = farm.crops.fields.map((f) => `${f.id}:${f.sp}`).join(',');
  return [
    farm.seed,
    farm.district,
    farm.day,
    mass.toFixed(3),
    land,
    head,
    eat.toFixed(3),
    fields,
  ].join('|');
}

function forecastFor(farm: FarmState, env: SourceEnv): FeedForecast {
  const key = forecastKey(farm);
  const hit = kept.get(key);
  if (hit) return hit;
  const f = feedForecast(farm, env);
  kept.set(key, f);
  if (kept.size > KEEP) kept.delete(kept.keys().next().value!);
  return f;
}

/** The Feed panel's figures and words. `mobs` are the snapshot's mob rows, for names and places. */
export function feedWire(farm: FarmState, env: SourceEnv, mobs: readonly MobWire[]): FeedWire {
  const f = forecastFor(farm, env);
  const points: FeedPointWire[] = f.points.map((p) => ({
    month: p.date.month,
    label: MONTHS[p.date.month]!,
    pastureT: t1(p.pastureKg),
    cropT: t1(p.cropKg),
  }));
  const floorT = t1(f.floorKgHa * f.pastureHa);
  const costs = new Map(supplementCosts(farm, env).map((c) => [c.mob, c]));
  const supplements: FeedMobWire[] = [];
  for (const m of mobs) {
    if (m.species !== 'cattle') continue;
    const c = costs.get(m.id);
    const options = c
      ? SUPPLEMENTS.map((id) => ({
          id: id as SuppId,
          label: SUPP_LABEL[id],
          perDay: Math.round(c.perDay[id] * 100) / 100,
          adds: addsText(id as SuppId, c.adds[id]),
        }))
      : [];
    const on = options.find((o) => o.id === m.supp);
    supplements.push({
      mob: m.id,
      mobName: m.name,
      area: m.area,
      head: m.head,
      supp: m.supp,
      suppLabel: SUPP_LABEL[m.supp],
      perDay: on?.perDay ?? 0,
      adds: on?.adds ?? '',
      // The feedlot prices every option at its ration, so only pasture mobs get the choice.
      options: m.where === 'paddock' ? options : [],
      reason: m.suppReason,
    });
  }
  return {
    points,
    floorT,
    floorKgHa: f.floorKgHa,
    pastureHa: Math.round(f.pastureHa),
    eatTMonth: t1(f.eatKgDay * DAYS_A_MONTH),
    head: f.head,
    lines: forecastLines(f),
    note: FORECAST_NOTE,
    summary: forecastSummary(points, floorT),
    supplements,
    suppNotes: SUPP_NOTES,
  };
}

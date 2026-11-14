import 'server-only';
import {
  MARKET_CLASSES,
  MAX_BUY,
  SALE_CLASSES,
  centsPerKg,
  dateOn,
  estimateBuy,
  marketClass,
  pricesOf,
  type FarmState,
  type MarketClassId,
  type MarketView,
  type SaleClassId,
} from '@gg/engine';
import type {
  BuyClassWire,
  DateParts,
  MarketWire,
  PriceChartWire,
  PriceRowWire,
  SellClassWire,
} from '../../lib/game/types';
import { MLA_CREDIT, buyReason, saleLine, sellNote, weightText } from './marketwords';

const dateParts = (d: { year: number; month: number; date: number }): DateParts => ({
  year: d.year,
  month: d.month,
  date: d.date,
});

/** The classes in the order the price list and the chart show them. */
const ORDER = Object.keys(MARKET_CLASSES) as MarketClassId[];

/**
 * The sale class whose weight range stands for a market class. A typical
 * beast is the middle of that range. Heavy steers and calves have no sale
 * class: heavy steers start at the weight the engine sorts them at, and calves
 * use the farm's own calves.
 */
const TYPICAL_SALE_CLASS: Partial<Record<MarketClassId, SaleClassId>> = {
  wean: 'weanerSteer',
  feed: 'yearSteer',
  wheif: 'weanerHeifer',
  heifer: 'joinHeifer',
  cow: 'dryCow',
  bull: 'bull',
};

const mid = (r: readonly [number, number]): number => Math.round((r[0] + r[1]) / 2);

/** The lightest weight the engine sells a steer as heavy, found from its own rule. */
function heavyFromKg(): number {
  for (let wt = 280; wt <= 800; wt++) {
    if (marketClass({ kind: 'steer', wt }) === 'heavy') return wt;
  }
  return 450;
}

function typicalKg(farm: FarmState, id: MarketClassId): number | null {
  const sale = TYPICAL_SALE_CLASS[id];
  if (sale) return mid(SALE_CLASSES[sale].wt);
  if (id === 'heavy') return heavyFromKg();
  // Calves: the farm's own, if it has any.
  let n = 0;
  let kg = 0;
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      if (a.kind === 'calf') {
        n++;
        kg += a.wt;
      }
    }
  }
  return n ? Math.round(kg / n) : null;
}

/** The last month of prices the farm has lived, with today's on the end. Never a future day. */
export function priceChart(farm: FarmState): PriceChartWire {
  const prices = pricesOf(farm).classes;
  const days = farm.priceHistory.filter((p) => p.day <= farm.day);
  const last = days[days.length - 1];
  const series = last && last.day === farm.day ? days : [...days, { day: farm.day, c: prices }];
  return {
    from: series.length ? dateParts(dateOn(farm, series[0]!.day)) : null,
    to: series.length ? dateParts(dateOn(farm, series[series.length - 1]!.day)) : null,
    classes: ORDER.map((id) => ({
      id,
      label: MARKET_CLASSES[id],
      points: series.map((p) => Math.round(p.c[id])),
    })),
  };
}

export function priceRows(farm: FarmState, chart: PriceChartWire): PriceRowWire[] {
  const prices = pricesOf(farm).classes;
  return ORDER.map((id) => {
    const cKg = Math.round(prices[id]);
    const kg = typicalKg(farm, id);
    const points = chart.classes.find((c) => c.id === id)?.points ?? [];
    const first = points[0];
    return {
      id,
      label: MARKET_CLASSES[id],
      cKg,
      typicalKg: kg,
      perHead: kg === null ? null : Math.round((kg * prices[id]) / 100),
      changeCKg: points.length > 1 && first !== undefined ? cKg - first : null,
      changeDays: Math.max(0, points.length - 1),
    };
  });
}

function buyClasses(farm: FarmState): BuyClassWire[] {
  const prices = pricesOf(farm);
  return (Object.keys(SALE_CLASSES) as SaleClassId[]).map((id) => {
    const c = SALE_CLASSES[id];
    const wt = c.wt as readonly [number, number];
    const typical = {
      kind: c.kind,
      wt: mid(wt),
      cond: 3,
      preg: 'preg' in c ? 150 : -1,
    } as const;
    return {
      id,
      label: c.label,
      weightText: weightText(wt),
      // Bulls are priced by the head, not by weight.
      cKg: c.kind === 'bull' ? null : Math.round(centsPerKg(typical, prices)),
      perHead: Math.round(estimateBuy(id, 1, prices)),
    };
  });
}

/** Head on the farm that are free to sell, by class: not calves, not already booked. */
function sellClasses(farm: FarmState): SellClassWire[] {
  const booked = new Set<number>();
  for (const b of farm.saleBookings) for (const id of b.animalIds) booked.add(id);
  const prices = pricesOf(farm).classes;
  const head = new Map<MarketClassId, number>();
  for (const m of farm.mobs) {
    for (const a of m.animals) {
      if (a.kind === 'calf' || booked.has(a.id)) continue;
      const c = marketClass(a);
      head.set(c, (head.get(c) ?? 0) + 1);
    }
  }
  return ORDER.filter((id) => (head.get(id) ?? 0) > 0).map((id) => ({
    id,
    label: MARKET_CLASSES[id],
    head: head.get(id)!,
    cKg: Math.round(prices[id]),
  }));
}

/** The Market tab's figures: what the farm can see of the saleyard, and nothing about days to come. */
export function marketWire(farm: FarmState, view: MarketView): MarketWire {
  const nextSale = view.nextSale
    ? { date: dateParts(view.nextSale.date), daysAway: view.nextSale.daysAway }
    : null;
  const chart = priceChart(farm);
  return {
    isSaleDay: view.isSaleDay,
    nextSale,
    booked: view.booked.map((b) => ({
      date: dateParts(b.date),
      daysAway: b.daysAway,
      head: b.head,
    })),
    onTheWay: view.onTheWay.map((a) => ({
      date: dateParts(a.date),
      daysAway: a.daysAway,
      cls: SALE_CLASSES[a.cls]?.label ?? 'Cattle',
      head: a.head,
    })),
    saleLine: saleLine(view.isSaleDay, nextSale),
    credit: farm.seasons.kind === 'real' ? MLA_CREDIT : null,
    prices: priceRows(farm, chart),
    chart,
    buy: {
      classes: buyClasses(farm),
      maxQty: MAX_BUY,
      reason: buyReason(view.isSaleDay, nextSale),
    },
    sell: { classes: sellClasses(farm), note: sellNote(view.isSaleDay, nextSale) },
  };
}

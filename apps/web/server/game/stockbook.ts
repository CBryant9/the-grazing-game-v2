import 'server-only';
import {
  CLASS_LABELS,
  animalLookup,
  netSaleValue,
  originOf,
  pricesOf,
  stockBook,
  type Animal,
  type FarmState,
  type StockOrigin,
} from '@gg/engine';
import type {
  SellMoneyWire,
  StockBookWire,
  StockOriginId,
  StockRowWire,
} from '../../lib/game/types';

/**
 * The stock book and the money lines on the Sell rows (REQUIREMENTS, "Profit
 * is shown per animal, and you can see which cattle are making money. The
 * stock book is in Herd", and "Your own cattle and their profit sit beside
 * it for selling"). The figures are the engine's own (`stockBook`): whole
 * dollars to show, no prices table and no formula.
 */

const round = (n: number): number => Math.round(n);

/** The stock book's words for where an animal came from. */
export const ORIGIN_TEXT: Record<StockOriginId, string> = {
  bought: 'Bought',
  start: 'Taken over',
  bred: 'Bred here',
  boughtOrStart: 'Bought or taken over',
};

/** The Sell line's words before the price, by where the cattle came from. */
const PAID_TEXT: Record<StockOrigin, string> = {
  bought: 'Bought for',
  start: 'Taken over at',
  bred: 'Bred here',
  boughtOrStart: 'Bought or taken over at',
};

/** What the stock book says about its own figures. Facts, no advice. */
export const STOCK_BOOK_NOTES = [
  'Bought is the price paid with the head fee and freight. Taken over is the value on the day the farm was taken over. Bred here starts at $0.',
  'Spent is what has gone on the animal since: supplement or feedlot ration, health, and marking. The cow carries the cost of her own feed, not her calf.',
  'Value now is what it would put in the bank sold today: its weight at today’s price for its class, less 5% commission and $30 a head.',
  'Profit is value now less bought and spent.',
];

/** The stock book for Herd: every head of cattle, whole dollars and kg. */
export function stockBookWire(farm: FarmState): StockBookWire {
  const book = stockBook(farm);
  const rows: StockRowWire[] = book.map((r) => ({
    id: r.id,
    mob: r.mob,
    cls: r.cls,
    ageDays: r.ageDays,
    kg: round(r.wt),
    cs: Math.round(r.cs * 10) / 10,
    ptic: r.ptic,
    origin: r.origin,
    paid: round(r.paid),
    spent: round(r.spent),
    value: round(r.value),
    profit: round(r.profit),
    booked: r.booked,
  }));
  const seen = new Set<string>();
  const classes: StockBookWire['classes'] = [];
  for (const r of book) {
    if (seen.has(r.cls)) continue;
    seen.add(r.cls);
    classes.push({ id: r.cls, label: CLASS_LABELS[r.cls] });
  }
  const mobs = farm.mobs
    .filter((m) => m.animals.length > 0)
    .map((m) => ({ id: m.id, name: m.name, head: m.animals.length }));
  const totals = { head: book.length, paid: 0, spent: 0, value: 0, profit: 0 };
  for (const r of book) {
    totals.paid += r.paid;
    totals.spent += r.spent;
    totals.value += r.value;
    totals.profit += r.profit;
  }
  return {
    rows,
    classes,
    mobs,
    originText: ORIGIN_TEXT,
    totals: {
      head: totals.head,
      paid: round(totals.paid),
      spent: round(totals.spent),
      value: round(totals.value),
      profit: round(totals.profit),
    },
    notes: STOCK_BOOK_NOTES,
  };
}

/**
 * What a draft costs and would fetch today, a head, for a Sell row. A cow's
 * calf at foot goes with her, so its value and costs are in her figures, as
 * the saleyard counts them when she is sold. Null for an empty draft.
 */
export function sellMoney(
  farm: FarmState,
  draft: readonly Animal[],
  all: ReadonlyMap<number, Animal> = animalLookup(farm.mobs),
): SellMoneyWire | null {
  if (!draft.length) return null;
  const prices = pricesOf(farm);
  let paid = 0;
  let spent = 0;
  let value = 0;
  const origins = new Set<StockOrigin>();
  for (const a of draft) {
    const list = [a];
    const calf = a.calf ? all.get(a.calf) : undefined;
    if (calf) list.push(calf);
    for (const x of list) {
      paid += x.paid || 0;
      spent += (x.cost || 0) - (x.paid || 0);
      value += Math.max(0, netSaleValue(x, prices));
    }
    origins.add(originOf(farm, a.id, a.paid || 0));
  }
  const n = draft.length;
  const only = origins.size === 1 ? [...origins][0]! : null;
  return {
    head: n,
    paidText: only ? PAID_TEXT[only] : 'Cost in at',
    paidPerHead: round(paid / n),
    spentPerHead: round(spent / n),
    valuePerHead: round(value / n),
    profitPerHead: round((value - paid - spent) / n),
  };
}

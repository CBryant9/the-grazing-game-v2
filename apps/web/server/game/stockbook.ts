import 'server-only';
import {
  CLASS_LABELS,
  HEAD_FEE,
  SELL_COMMISSION,
  animalLookup,
  costIn,
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

const commission = `${Math.round(SELL_COMMISSION * 1000) / 10}%`;
const headFee = `$${HEAD_FEE.toLocaleString('en-AU')}`;

/**
 * What the stock book says about its own figures. Facts, no advice. The commission and the head
 * fee are the engine's own figures, so the sentence can not drift from the sum.
 */
export const STOCK_BOOK_NOTES = [
  'Bought is the price paid with the head fee and freight. Taken over is what it would have put in the bank sold on the day the farm was taken over, after selling costs, so the book starts at $0 profit. Bred here starts at $0.',
  'Spent is what has gone on the animal since: supplement or feedlot ration, health, and marking. Each head carries its own costs. A calf at foot has its own health and supplement costs, and they are not added to its mother.',
  `Value now is what it would put in the bank sold today: its weight at today’s price for its class, adjusted for condition score, plus the in-calf premium for a PTIC cow or heifer, less ${commission} commission and ${headFee} a head.`,
  'Profit is value now less bought and spent.',
  'Bulls are bought for breeding and sell by weight, so a bull shows as a loss if sold.',
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
  // Head counts every row, calves at foot included; `calves` says how many of them are calves,
  // so the stock book and the herd's head total (calves left out) each say what they count.
  const calvesIn = (list: readonly Animal[]): number =>
    list.filter((a) => a.kind === 'calf' && !a.dead).length;
  const mobs = farm.mobs
    .filter((m) => m.animals.length > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      head: m.animals.filter((a) => !a.dead).length,
      calves: calvesIn(m.animals),
    }));
  const totals = {
    head: book.length,
    calves: mobs.reduce((n, m) => n + m.calves, 0),
    paid: 0,
    spent: 0,
    value: 0,
    profit: 0,
  };
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
      calves: totals.calves,
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
      paid += costIn(farm, x);
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

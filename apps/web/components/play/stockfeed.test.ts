import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { FeedWire, SellMoneyWire, StockBookWire, StockRowWire } from '@/lib/game/types';
import { FeedPanel, feedGeometry, niceTop } from './FeedPanel';
import { SellProfitLine } from './SellProfitLine';
import { STOCK_PAGE, StockBook, ageText, profitText, sortStock } from './StockBook';

/* The stock book, the Sell money line and the Feed panel render from the wire alone. */

const row = (id: number, over: Partial<StockRowWire> = {}): StockRowWire => ({
  id,
  mob: 1,
  cls: 'yearlingSteer',
  ageDays: 520,
  kg: 368,
  cs: 3.5,
  ptic: false,
  origin: 'bought',
  paid: 1060,
  spent: 40,
  value: 1462,
  profit: 362,
  booked: false,
  ...over,
});

const book = (rows: StockRowWire[]): StockBookWire => ({
  rows,
  classes: [
    { id: 'yearlingSteer', label: 'Yearling steer' },
    { id: 'pticCow', label: 'PTIC cow' },
  ],
  mobs: [
    { id: 1, name: 'Steers A', head: 2 },
    { id: 2, name: 'Breeders', head: 1 },
  ],
  originText: {
    bought: 'Bought',
    start: 'Taken over',
    bred: 'Bred here',
    boughtOrStart: 'Bought or taken over',
  },
  totals: { head: rows.length, paid: 0, spent: 0, value: 0, profit: 0 },
  notes: ['Profit is value now less bought and spent.'],
});

describe('the stock book', () => {
  const rows = [
    row(412),
    row(107, { kg: 296, cs: 2.5, value: 1186, paid: 1250, spent: 0, profit: -64 }),
    row(21, { mob: 2, cls: 'pticCow', ptic: true, origin: 'start', ageDays: 2200, profit: 250 }),
    row(900, {
      mob: 2,
      cls: 'pticCow',
      origin: 'bred',
      paid: 0,
      spent: 80,
      value: 300,
      profit: 220,
      ageDays: 40,
    }),
  ];

  it('lists every head with tag, class, weight, CS and profit, highest profit first', () => {
    const html = renderToStaticMarkup(createElement(StockBook, { book: book(rows) }));
    expect(html).toContain('Yearling steer');
    expect(html).toContain('PTIC cow');
    expect(html).toContain('+$362');
    expect(html).toContain('−$64');
    expect(html.indexOf('>412<')).toBeLessThan(html.indexOf('>107<'));
    expect(html).toContain('aria-sort="descending"');
    expect(html).toContain('Taken over');
    expect(html).toContain('Bred here');
    expect(html).toContain('Steers A');
    expect(html).toContain('How the figures are worked out');
  });

  it('sorts by any column and filters by mob', () => {
    expect(sortStock(rows, 'profit', 'desc', null).map((r) => r.id)).toEqual([412, 21, 900, 107]);
    expect(sortStock(rows, 'kg', 'asc', null)[0]!.id).toBe(107);
    expect(sortStock(rows, 'tag', 'asc', 2).map((r) => r.id)).toEqual([21, 900]);
  });

  it('shows a page of rows and a Show more button on a big herd', () => {
    const many = Array.from({ length: STOCK_PAGE + 7 }, (_, i) => row(i + 1));
    const html = renderToStaticMarkup(createElement(StockBook, { book: book(many) }));
    expect(html).toContain('Show more (7 left)');
  });

  it('says so with no cattle', () => {
    const html = renderToStaticMarkup(createElement(StockBook, { book: book([]) }));
    expect(html).toContain('No cattle on the farm');
  });

  it('words ages and profits plainly', () => {
    expect(ageText(40)).toBe('40 days');
    expect(ageText(540)).toBe('17 mo');
    expect(ageText(2200)).toBe('6 yr');
    expect(profitText(402)).toBe('+$402');
    expect(profitText(-64)).toBe('−$64');
    expect(profitText(0)).toBe('$0');
  });
});

describe('the Sell money line', () => {
  const m: SellMoneyWire = {
    head: 60,
    paidText: 'Bought for',
    paidPerHead: 1050,
    spentPerHead: 40,
    valuePerHead: 1356,
    profitPerHead: 266,
  };

  it('says what they cost, what was spent since and the profit a head', () => {
    const html = renderToStaticMarkup(createElement(SellProfitLine, { money: m }));
    expect(html).toContain('Bought for $1,050, $40 spent since');
    expect(html).toContain('+$266');
    expect(html).toContain('/head');
  });

  it('bred here has no price, and nothing shows with no money', () => {
    const html = renderToStaticMarkup(
      createElement(SellProfitLine, {
        money: { ...m, paidText: 'Bred here', paidPerHead: 0, spentPerHead: 0 },
      }),
    );
    expect(html).toContain('Bred here');
    expect(html).not.toContain('$0,');
    expect(renderToStaticMarkup(createElement(SellProfitLine, { money: null }))).toBe('');
  });
});

describe('the Feed panel', () => {
  const feed: FeedWire = {
    points: [
      { month: 10, label: 'Nov', pastureT: 820, cropT: 0 },
      { month: 11, label: 'Dec', pastureT: 900, cropT: 0 },
      { month: 0, label: 'Jan', pastureT: 1080, cropT: 90 },
      { month: 1, label: 'Feb', pastureT: 600, cropT: 0 },
    ],
    floorT: 620,
    floorKgHa: 800,
    pastureHa: 775,
    eatTMonth: 165,
    head: 612,
    lines: ['At 612 head the stock eat about 165 t DM a month.'],
    note: 'Average-season forecast: grass grows at the district’s long-term average from today.',
    summary: 'Feed on offer, tonnes of dry matter by month from Nov.',
    supplements: [
      {
        mob: 3,
        mobName: 'Steers B',
        area: 'Paddock 9',
        head: 150,
        supp: 'lick',
        suppLabel: 'Lick',
        perDay: 22.5,
        adds: 'Lifts pasture eaten by about 0.6 kg DM a head a day on this feed.',
        options: [
          { id: 'none', label: 'None', perDay: 0, adds: '' },
          { id: 'lick', label: 'Lick', perDay: 22.5, adds: 'Lifts pasture eaten.' },
          { id: 'hay', label: 'Hay', perDay: 105, adds: '2.0 kg DM a head a day.' },
          { id: 'pellet', label: 'Pellets', perDay: 160, adds: '1.5 kg DM a head a day.' },
        ],
        reason: null,
      },
      {
        mob: 4,
        mobName: 'Weaners',
        area: null,
        head: 40,
        supp: 'none',
        suppLabel: 'None',
        perDay: 0,
        adds: '',
        options: [],
        reason: 'Supplements are for mobs in a paddock. This mob is in the stock yards.',
      },
    ],
    suppNotes: ['A supplement is switched on for a mob at a daily price.'],
  };

  it('draws the chart as an image with its summary, the floor and the crop spike, and says it is an average season', () => {
    const html = renderToStaticMarkup(createElement(FeedPanel, { feed }));
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Feed on offer, tonnes of dry matter by month from Nov."');
    expect(html).toContain('Ground cover floor (800 kg DM/ha)');
    expect(html).toContain('Crops');
    expect(html).toContain('<rect');
    expect(html).toContain('Average-season forecast');
    expect(html).toContain('At 612 head the stock eat about 165 t DM a month.');
    expect(html).toContain('Forecast figures');
    expect(html).toContain('Jan');
  });

  it('lists each mob with its supplement, its cost a day and what it adds, with the switch or why not', () => {
    const html = renderToStaticMarkup(createElement(FeedPanel, { feed, onPick: () => undefined }));
    expect(html).toContain('Steers B');
    expect(html).toContain('On lick: <b>$23 a day</b>');
    expect(html).toContain('Lifts pasture eaten by about 0.6 kg');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('$105/day');
    expect(html).toContain('This mob is in the stock yards.');
  });

  it('places the chart from the tonnes: a round top, the floor and the bars', () => {
    expect(niceTop(1134)).toBe(2000);
    expect(niceTop(420)).toBe(500);
    const g = feedGeometry(feed.points, feed.floorT);
    expect(g.bars).toHaveLength(1);
    expect(g.floorY).toBeLessThan(g.base);
    expect(g.area.startsWith('M')).toBe(true);
  });
});

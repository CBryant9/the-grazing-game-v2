import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { MARKET_CLASSES, type MarketClassId } from '../data/cattle';
import { DISTRICT_YARDS } from '../data/yards';
import { loadRealData } from '../server';
import { dateOfSerial, daySerial, isoDate } from '../season/weatherTable';
import { latestPriceRow, parsePriceTable, priceRowOn, type PriceTable } from './priceTable';
import {
  CATTLE_INDICATORS,
  CLASS_INDICATORS,
  HEADLINE_INDICATOR,
  REAL_PRICE_RULES,
  buildDistrictPrices,
  buildNationalPrices,
  type CattleIndicatorId,
  type IndicatorTables,
} from './realPrices';

// These read the real tables. Give them room when the whole suite is running beside them.
vi.setConfig({ testTimeout: 120_000 });

const day = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return daySerial({ year: y!, month: m! - 1, date: d! });
};
const date = (iso: string) => dateOfSerial(day(iso));

/** A made-up table: a row for every day from one date to another, with a price and head worked out per day. */
function series(
  from: string,
  to: string,
  value: (serial: number) => number | null,
  head: (serial: number) => number = () => 500,
): PriceTable {
  const rows: string[] = [];
  for (let s = day(from); s <= day(to); s++) {
    const v = value(s);
    if (v !== null) rows.push(`${isoDate(dateOfSerial(s))},${v},${head(s)}`);
  }
  return parsePriceTable(['date,value,head', ...rows, ''].join('\n'));
}

/** National tables: every indicator a flat price from 1996, the two feeder ones from 16 June 2003. */
function nationalTables(
  over: Partial<Record<CattleIndicatorId, PriceTable>> = {},
): IndicatorTables {
  const flat = (from: string, v: number): PriceTable => series(from, '2026-06-30', () => v);
  return {
    'restocker-yearling-steer': flat('1996-11-01', 200),
    'restocker-yearling-heifer': flat('1996-12-02', 180),
    'feeder-steer': flat('2003-06-16', 190),
    'feeder-heifer': flat('2003-06-16', 170),
    'heavy-steer': flat('1996-07-12', 160),
    'processor-cow': flat('1996-07-12', 120),
    ...over,
  };
}

/** Yard tables: every indicator a long series at a set multiple of the national figure. */
function yardTables(
  multiple: number,
  over: Partial<Record<CattleIndicatorId, PriceTable>> = {},
): IndicatorTables {
  const nat = nationalTables();
  const out = {} as Record<CattleIndicatorId, PriceTable>;
  for (const id of CATTLE_INDICATORS) {
    const from = id.startsWith('feeder') ? '2003-06-16' : '1997-01-01';
    out[id] = series(from, '2025-12-31', (s) => priceRowOn(nat[id], s)!.value * multiple);
  }
  return { ...out, ...over };
}

describe('the game classes, each read off one MLA indicator (proposed, for Claudia)', () => {
  it('uses the mapping written in docs/DATA.md', () => {
    expect(CLASS_INDICATORS).toEqual({
      wean: { indicator: 'restocker-yearling-steer', times: 1.08 },
      feed: { indicator: 'feeder-steer', times: 1 },
      heavy: { indicator: 'heavy-steer', times: 1 },
      wheif: { indicator: 'restocker-yearling-heifer', times: 1.08 },
      heifer: { indicator: 'feeder-heifer', times: 1 },
      cow: { indicator: 'processor-cow', times: 1 },
      bull: { indicator: 'processor-cow', times: 0.906 },
      calf: { indicator: 'restocker-yearling-steer', times: 1.1 },
    });
    expect(HEADLINE_INDICATOR).toBe('restocker-yearling-steer');
    expect(Object.keys(CLASS_INDICATORS).sort()).toEqual(Object.keys(MARKET_CLASSES).sort());
  });

  it('prices each class from its indicator on the day', () => {
    const p = buildDistrictPrices('DUB', buildNationalPrices(nationalTables()), yardTables(1));
    const got = p.pricesOn(date('2010-05-05'));
    expect(got.indicator).toBe(200);
    expect(got.classes.wean).toBeCloseTo(200 * 1.08, 10);
    expect(got.classes.feed).toBe(190);
    expect(got.classes.heavy).toBe(160);
    expect(got.classes.wheif).toBeCloseTo(180 * 1.08, 10);
    expect(got.classes.heifer).toBe(170);
    expect(got.classes.cow).toBe(120);
    expect(got.classes.bull).toBeCloseTo(120 * 0.906, 10);
    expect(got.classes.calf).toBeCloseTo(200 * 1.1, 10);
  });
});

describe("the district yard's own figure, where it has one", () => {
  const national = buildNationalPrices(nationalTables());

  it("uses the yard's row on the day", () => {
    const p = buildDistrictPrices('DUB', national, yardTables(1.1));
    expect(p.indicatorOn('heavy-steer', date('2010-05-05'))).toEqual({
      value: 160 * 1.1,
      origin: 'yard',
    });
  });

  it("holds the yard's last figure for 14 days after its date, then goes to the national figure times the premium", () => {
    // The yard runs at 1.1 times the national figure. Its rows stop on 1 March 2010 at 250.
    const heavy = series('1997-01-01', '2010-03-01', (s) => (s === day('2010-03-01') ? 250 : 176));
    const p = buildDistrictPrices('DUB', national, yardTables(1.1, { 'heavy-steer': heavy }));
    expect(p.indicatorOn('heavy-steer', date('2010-03-01'))).toEqual({
      value: 250,
      origin: 'yard',
    });
    expect(p.indicatorOn('heavy-steer', date('2010-03-02'))).toEqual({
      value: 250,
      origin: 'yard-held',
    });
    expect(p.indicatorOn('heavy-steer', date('2010-03-15'))).toEqual({
      value: 250,
      origin: 'yard-held',
    });
    const after = p.indicatorOn('heavy-steer', date('2010-03-16'));
    expect(after.origin).toBe('national');
    // The premium is the average of yard over national across the yard's rows: 1.1 on all but one day.
    expect(after.value).toBeCloseTo(160 * p.premiums['heavy-steer']!, 10);
    expect(p.premiums['heavy-steer']).toBeGreaterThan(1.1);
    expect(p.premiums['heavy-steer']).toBeLessThan(1.1001);
  });

  it('passes over a yard row with under 20 head behind it', () => {
    // One sale week at 19 head and a wild price, the next at 20 head.
    const thinFrom = day('2010-03-01');
    const heavy = series(
      '1997-01-01',
      '2025-12-31',
      (s) =>
        s >= thinFrom && s < thinFrom + 7 ? 90 : s >= thinFrom + 7 && s < thinFrom + 14 ? 150 : 176,
      (s) =>
        s >= thinFrom && s < thinFrom + 7 ? 19 : s >= thinFrom + 7 && s < thinFrom + 14 ? 20 : 300,
    );
    const p = buildDistrictPrices('DUB', national, yardTables(1.1, { 'heavy-steer': heavy }));
    // In the thin week the last good row, from the day before, is held.
    expect(p.indicatorOn('heavy-steer', date('2010-03-03'))).toEqual({
      value: 176,
      origin: 'yard-held',
    });
    // A row with 20 head is used.
    expect(p.indicatorOn('heavy-steer', date('2010-03-09'))).toEqual({
      value: 150,
      origin: 'yard',
    });
  });

  it('works the premium out over 1997 to 2025 only, from the days both have a usable row', () => {
    // The yard runs at 0.9 to the end of 2025 and at 2.0 after. Thin rows run at 0.5.
    const cow = series(
      '1997-01-01',
      '2026-06-30',
      (s) => (s > day('2025-12-31') ? 240 : s % 10 === 0 ? 60 : 108),
      (s) => (s <= day('2025-12-31') && s % 10 === 0 ? 5 : 200),
    );
    const p = buildDistrictPrices('DUB', national, yardTables(1, { 'processor-cow': cow }));
    expect(p.premiums['processor-cow']).toBeCloseTo(0.9, 12);
  });

  it('uses the national figure as it is when the yard has under 730 usable days', () => {
    const short = (days: number): PriceTable =>
      series('2018-01-01', isoDate(dateOfSerial(day('2018-01-01') + days - 1)), () => 100);
    const with729 = buildDistrictPrices(
      'MTL',
      national,
      yardTables(1, { 'restocker-yearling-steer': short(729) }),
    );
    expect(with729.premiums['restocker-yearling-steer']).toBeNull();
    // Even on a day the yard has a row, the national figure is used, with no premium.
    expect(with729.indicatorOn('restocker-yearling-steer', date('2018-06-01'))).toEqual({
      value: 200,
      origin: 'national',
    });
    const with730 = buildDistrictPrices(
      'MTL',
      national,
      yardTables(1, { 'restocker-yearling-steer': short(730) }),
    );
    expect(with730.premiums['restocker-yearling-steer']).toBeCloseTo(0.5, 12);
    expect(with730.indicatorOn('restocker-yearling-steer', date('2018-06-01'))).toEqual({
      value: 100,
      origin: 'yard',
    });
    expect(with730.indicatorOn('restocker-yearling-steer', date('2005-06-01'))).toEqual({
      value: 100,
      origin: 'national',
    });
  });
});

describe('the national figure', () => {
  it('passes over a row with under 20 head behind it, and takes the newest row that has 20', () => {
    const thinDay = day('2005-12-27');
    const cow = series(
      '1996-07-12',
      '2026-06-30',
      (s) => (s === thinDay ? 60 : 120),
      (s) => (s === thinDay ? 19 : 500),
    );
    const national = buildNationalPrices(nationalTables({ 'processor-cow': cow }));
    expect(national.on('processor-cow', thinDay)).toEqual({ value: 120, standIn: false });
    const justEnough = series(
      '1996-07-12',
      '2026-06-30',
      (s) => (s === thinDay ? 60 : 120),
      (s) => (s === thinDay ? 20 : 500),
    );
    expect(
      buildNationalPrices(nationalTables({ 'processor-cow': justEnough })).on(
        'processor-cow',
        thinDay,
      ),
    ).toEqual({ value: 60, standIn: false });
  });

  it('stands across a break of up to 21 days, and is refused past that', () => {
    const gap = day('2005-12-20');
    const cow = series('1996-07-12', '2026-06-30', (s) => (s > gap && s <= gap + 30 ? null : 120));
    const national = buildNationalPrices(nationalTables({ 'processor-cow': cow }));
    expect(national.on('processor-cow', gap + 21)).toEqual({ value: 120, standIn: false });
    expect(() => national.on('processor-cow', gap + 22)).toThrow(
      /no national processor-cow figure for 2006-01-11/,
    );
  });

  it('is refused before an indicator starts, unless it is a feeder indicator', () => {
    const national = buildNationalPrices(nationalTables());
    expect(() => national.on('restocker-yearling-heifer', day('1996-11-01'))).toThrow(
      /no national restocker-yearling-heifer figure/,
    );
  });
});

describe('the feeder indicators before 16 June 2003', () => {
  it('stand in at a multiple of the geometric mean of two indicators that run from 1997', () => {
    // Feeder steers run at exactly 1.05 times the mean of restocker steers (200) and heavy steers (160).
    const mean = Math.sqrt(200 * 160);
    const national = buildNationalPrices(
      nationalTables({ 'feeder-steer': series('2003-06-16', '2026-06-30', () => 1.05 * mean) }),
    );
    expect(national.standInTimes['feeder-steer']).toBeCloseTo(1.05, 12);
    expect(national.on('feeder-steer', day('2003-06-15'))).toEqual({
      value: national.standInTimes['feeder-steer']! * mean,
      standIn: true,
    });
    expect(national.on('feeder-steer', day('2003-06-16'))).toEqual({
      value: 1.05 * mean,
      standIn: false,
    });
    // Feeder heifers: 170 over the mean of restocker heifers (180) and heavy steers (160).
    expect(national.standInTimes['feeder-heifer']).toBeCloseTo(170 / Math.sqrt(180 * 160), 12);
    expect(Object.keys(national.standInTimes).sort()).toEqual(['feeder-heifer', 'feeder-steer']);
  });

  it('follow the two indicators day by day, and take the yard premium', () => {
    const steers = series('1996-11-01', '2026-06-30', (s) => (s < day('2000-01-01') ? 100 : 200));
    const national = buildNationalPrices(nationalTables({ 'restocker-yearling-steer': steers }));
    const times = national.standInTimes['feeder-steer']!;
    expect(national.on('feeder-steer', day('1999-06-01')).value).toBeCloseTo(
      times * Math.sqrt(100 * 160),
      10,
    );
    expect(national.on('feeder-steer', day('2001-06-01')).value).toBeCloseTo(
      times * Math.sqrt(200 * 160),
      10,
    );
    const p = buildDistrictPrices('GME', national, yardTables(0.9));
    const fig = p.indicatorOn('feeder-steer', date('1999-06-01'));
    expect(fig.origin).toBe('stand-in');
    expect(fig.value).toBeCloseTo(times * Math.sqrt(100 * 160) * p.premiums['feeder-steer']!, 10);
  });

  it('are worked out only from days up to the end of 2025', () => {
    const feeder = series('2003-06-16', '2026-06-30', (s) =>
      s > day('2025-12-31') ? 999 : Math.sqrt(200 * 160),
    );
    const national = buildNationalPrices(nationalTables({ 'feeder-steer': feeder }));
    expect(national.standInTimes['feeder-steer']).toBeCloseTo(1, 12);
  });
});

describe('the real tables', () => {
  const data = loadRealData();

  it('give these stand-in multiples for the feeder indicators', () => {
    const t = data.district('cw').prices.national.standInTimes;
    expect(t['feeder-steer']).toBeCloseTo(1.0169, 4);
    expect(t['feeder-heifer']).toBeCloseTo(0.999, 4);
  });

  it('never take a national price from a row with under 20 head behind it', () => {
    // Restocker steers read 147 c/kg on 1 head from 29 December 2004, and
    // 183.4 c/kg on 290 head four days before. The thin row is passed over.
    const national = data.district('cw').prices.national;
    const table = national.tables['restocker-yearling-steer'];
    const thin = priceRowOn(table, day('2004-12-29'))!;
    expect(thin.head).toBe(1);
    expect(thin.value).toBeCloseTo(147, 0);
    const used = national.on('restocker-yearling-steer', day('2004-12-29'));
    expect(used.value).toBeGreaterThan(165);
    // Every national figure from 1997 to 2025 comes from a row with 20 head or more.
    for (const id of CATTLE_INDICATORS) {
      const t = national.tables[id];
      for (let s = Math.max(day('1997-01-01'), t.firstSerial); s <= day('2025-12-31'); s++) {
        const row = latestPriceRow(t, s, REAL_PRICE_RULES.nationalMaxGapDays, 20)!;
        expect(row.head, `${id} ${isoDate(dateOfSerial(s))}`).toBeGreaterThanOrEqual(20);
        expect(national.on(id, s).value).toBe(row.value);
      }
    }
  });

  it('give each yard these premiums over the national figures (docs/DATA.md)', () => {
    const premiums = Object.fromEntries(
      DISTRICT_IDS.map((id) => {
        const p = data.district(id).prices;
        return [
          p.yard,
          CATTLE_INDICATORS.map((i) =>
            p.premiums[i] === null ? null : +p.premiums[i]!.toFixed(3),
          ),
        ];
      }),
    );
    // Restocker steers, restocker heifers, feeder steers, feeder heifers, heavy steers, cows.
    expect(premiums).toEqual({
      GME: [0.944, 0.933, 0.922, 0.909, 0.945, 0.997],
      ARM: [1.017, 1.03, 0.976, 0.98, 0.994, 1.004],
      DUB: [0.978, 0.989, 1.012, 1.013, 1.008, 1.024],
      // Mortlake's restocker steers and heifers are too thin to use.
      MTL: [null, null, 0.923, 0.986, 1.008, 1.034],
    });
  });

  it('have no blank, zero or negative figure in any cattle table', () => {
    for (const id of DISTRICT_IDS) {
      const p = data.district(id).prices;
      for (const i of CATTLE_INDICATORS) {
        expect(p.national.tables[i].dropped, `national ${i}`).toBe(0);
      }
    }
  });

  it.each(DISTRICT_IDS)(
    '%s: every class has a price above 0 on every day from 1997 to 2025',
    (id) => {
      const p = data.district(id).prices;
      const origins: Record<string, number> = {};
      let lowest = Infinity;
      let highest = 0;
      for (let s = day('1997-01-01'); s <= day('2025-12-31'); s++) {
        const d = dateOfSerial(s);
        const prices = p.pricesOn(d);
        for (const k of Object.keys(prices.classes) as MarketClassId[]) {
          const v = prices.classes[k];
          if (!(v > 0) || !Number.isFinite(v)) throw new Error(`${id} ${k} on ${isoDate(d)}: ${v}`);
          lowest = Math.min(lowest, v);
          highest = Math.max(highest, v);
        }
        expect(prices.indicator).toBe(p.indicatorOn(HEADLINE_INDICATOR, d).value);
        for (const i of CATTLE_INDICATORS) {
          const o = p.indicatorOn(i, d).origin;
          origins[o] = (origins[o] ?? 0) + 1;
        }
      }
      // c/kg live weight in the dollars of the day: from the lows of 1997 to the peak of 2022.
      expect(lowest).toBeGreaterThan(25);
      expect(highest).toBeLessThan(1000);
      // The feeder stand-in covers 1 January 1997 to 15 June 2003, two indicators.
      const standInDays = (day('2003-06-15') - day('1997-01-01') + 1) * 2;
      const yard = DISTRICT_YARDS[id].cattle;
      if (yard === 'ARM' || yard === 'DUB') {
        // Both yards have feeder rows only from June 2003, so every day before is the stand-in.
        expect(origins['stand-in']).toBe(standInDays);
        expect(origins.yard).toBeGreaterThan(origins.national!);
      } else {
        expect(origins['stand-in']).toBe(standInDays);
        // Gracemere from 2014 and Mortlake from 2018: most days are the national figure.
        expect(origins.national).toBeGreaterThan(origins.yard!);
      }
    },
  );

  it('reads the same as the MLA table on a day the yard has a good row', () => {
    // Dubbo heavy steers, 3 June 2015: the row in mla/yards/DUB/heavy-steer.csv.
    const p = data.district('cw').prices;
    const fig = p.indicatorOn('heavy-steer', date('2015-06-03'));
    expect(fig.origin).toBe('yard');
    const national = p.national.on('heavy-steer', day('2015-06-03')).value;
    expect(fig.value).not.toBe(national);
    expect(fig.value / national).toBeGreaterThan(0.8);
    expect(fig.value / national).toBeLessThan(1.2);
  });

  it("gives Central Queensland the national figure times Gracemere's premium before the yard's rows start", () => {
    const p = data.district('cq').prices;
    for (const i of ['restocker-yearling-steer', 'processor-cow'] as const) {
      const fig = p.indicatorOn(i, date('1998-07-15'));
      expect(fig.origin).toBe('national');
      expect(fig.value).toBeCloseTo(p.national.on(i, day('1998-07-15')).value * p.premiums[i]!, 10);
    }
  });

  it('gives Western Victoria the national restocker figures as they are', () => {
    const p = data.district('wv').prices;
    for (const iso of ['2001-03-03', '2019-08-20', '2024-02-02']) {
      const fig = p.indicatorOn('restocker-yearling-steer', date(iso));
      expect(fig).toEqual({
        value: p.national.on('restocker-yearling-steer', day(iso)).value,
        origin: 'national',
      });
    }
  });
});

import { DISTRICT_IDS } from '@gg/shared';
import { describe, expect, it, vi } from 'vitest';
import { loadRealData, loadWeatherGrowth, readRawTable } from '../server';
import { weatherYears } from '../season/weatherSeasons';
import { RAW_TABLE_PATHS, buildRealData, districtTablePaths, tablesVersion } from './realData';

// Building a district reads and works through about 3 MB of tables. Give the
// tests room when the whole suite is running beside them.
vi.setConfig({ testTimeout: 120_000 });

describe('the real data bundle', () => {
  it("reads nothing until a district is asked for, then only that district's tables, each once", () => {
    const read: string[] = [];
    const data = buildRealData((path) => {
      read.push(path);
      return readRawTable(path);
    });
    expect(read).toEqual([]);
    data.district('cw');
    expect([...read].sort()).toEqual(districtTablePaths('cw').sort());
    expect(new Set(read).size).toBe(read.length);
    // Asking again reads nothing more.
    const before = read.length;
    expect(data.district('cw')).toBe(data.district('cw'));
    expect(read.length).toBe(before);
    // A second district reads its own weather and yard tables. The national and CPI tables are shared.
    data.district('wv');
    const more = read.slice(before);
    expect(more.sort()).toEqual(
      districtTablePaths('wv')
        .filter((p) => !districtTablePaths('cw').includes(p))
        .sort(),
    );
    expect(more.some((p) => p.startsWith('mla/national/'))).toBe(false);
    expect(more).not.toContain(RAW_TABLE_PATHS.cpi);
  });

  it('reads 15 tables for a district: weather, six national and six yard indicators, yardings and the CPI', () => {
    expect(districtTablePaths('cq')).toEqual([
      'silo/cq.csv',
      'mla/national/restocker-yearling-steer.csv',
      'mla/national/restocker-yearling-heifer.csv',
      'mla/national/feeder-steer.csv',
      'mla/national/feeder-heifer.csv',
      'mla/national/heavy-steer.csv',
      'mla/national/processor-cow.csv',
      'mla/yards/GME/restocker-yearling-steer.csv',
      'mla/yards/GME/restocker-yearling-heifer.csv',
      'mla/yards/GME/feeder-steer.csv',
      'mla/yards/GME/feeder-heifer.csv',
      'mla/yards/GME/heavy-steer.csv',
      'mla/yards/GME/processor-cow.csv',
      'mla/yardings/GME-cattle.csv',
      'abs/cpi-all-groups.csv',
    ]);
    // The sheep tables, the yards not agreed and the other districts' tables are not read.
    for (const id of DISTRICT_IDS) {
      for (const path of districtTablePaths(id)) {
        expect(path).not.toMatch(/lamb|mutton|sheep|HAM|EME|INV|BAL/);
      }
    }
  });

  it('puts each district at its own yard, with its weather, prices, sale days and the CPI', () => {
    const data = loadRealData();
    expect(DISTRICT_IDS.map((id) => data.district(id).yard)).toEqual(['GME', 'ARM', 'DUB', 'MTL']);
    for (const id of DISTRICT_IDS) {
      const d = data.district(id);
      expect(d.district).toBe(id);
      expect(d.weather.district.id).toBe(id);
      expect(d.prices.yard).toBe(d.yard);
      expect(d.cattleSales.yard).toBe(d.yard);
      expect(d.cattleSales.species).toBe('cattle');
      expect(d.cpi).toBe(data.district('cq').cpi);
      expect(d.prices.national).toBe(data.district('cq').prices.national);
    }
  });

  it('builds the same growth factors as the weather table on its own', () => {
    const data = loadRealData();
    for (const id of DISTRICT_IDS) {
      expect(data.district(id).weather.scaling).toEqual(loadWeatherGrowth(id).scaling);
    }
  });

  it('is made once and shared', () => {
    expect(loadRealData()).toBe(loadRealData());
  });

  it('refuses a district that does not exist, and a table that cannot be read', () => {
    expect(() => loadRealData().district('nt' as 'cq')).toThrow(/No district "nt"/);
    const broken = buildRealData((path) => {
      if (path === 'mla/yards/DUB/heavy-steer.csv') throw new Error('gone');
      return readRawTable(path);
    });
    expect(() => broken.district('cw')).toThrow(/gone/);
    expect(() => readRawTable('../package.json')).toThrow(/not a raw data table/);
    expect(() => readRawTable('silo/nowhere.csv')).toThrow(/could not be read/);
  });

  it('refuses a cattle table with a row that holds no price', () => {
    const path = 'mla/yards/DUB/heavy-steer.csv';
    const odd = buildRealData((p) => {
      const text = readRawTable(p);
      return p === path ? text.replace('\n2010-06-15,', '\n2010-06-15,-') : text;
    });
    expect(() => odd.district('cw')).toThrow(
      /mla\/yards\/DUB\/heavy-steer.csv has 1 rows with no usable price/,
    );
  });
});

describe('the playable years', () => {
  const data = loadRealData();

  it.each(DISTRICT_IDS)('%s: 1997 to 2025 for a start in any month but December', (id) => {
    const d = data.district(id);
    for (let month = 0; month < 11; month++) {
      const years = d.years(month);
      expect(years[0], `month ${month}`).toBe(1997);
      expect(years.at(-1), `month ${month}`).toBe(2025);
      expect(years.length).toBe(29);
    }
    // A December start in 2025 would run to 30 November 2026, past the tables as pulled.
    expect(d.years(11).at(-1)).toBe(2024);
    expect(d.years(11)[0]).toBe(1997);
  });

  it('are never more than the weather allows, and stop where the prices and sale days stop', () => {
    for (const id of DISTRICT_IDS) {
      const d = data.district(id);
      for (let month = 0; month < 12; month++) {
        const weather = weatherYears(d.weather, month);
        const years = d.years(month);
        expect(weather.slice(0, years.length)).toEqual(years);
      }
    }
    // With the national price tables cut off at the end of January 2011, the last year a
    // January start can play is 2010, and a July start 2009.
    const cut = buildRealData((p) => {
      const text = readRawTable(p);
      if (!p.startsWith('mla/national/')) return text;
      return text
        .split('\n')
        .filter((l) => l === '' || l.startsWith('date') || l < '2011-02-01')
        .join('\n');
    });
    expect(cut.district('cw').years(0).at(-1)).toBe(2010);
    expect(cut.district('cw').years(6).at(-1)).toBe(2009);
  });

  it('hands out a fresh list each time', () => {
    const d = data.district('cw');
    const a = d.years(0);
    a.length = 0;
    expect(d.years(0).length).toBe(29);
  });
});

describe('the data version', () => {
  const data = loadRealData();

  it('is 16 hex digits, the same every time, and different for each district', () => {
    const versions = DISTRICT_IDS.map((id) => data.district(id).version);
    for (const v of versions) expect(v).toMatch(/^[0-9a-f]{16}$/);
    expect(new Set(versions).size).toBe(4);
    const again = buildRealData(readRawTable);
    expect(DISTRICT_IDS.map((id) => again.district(id).version)).toEqual(versions);
  });

  it('changes when any figure in any table the district reads changes', () => {
    const base = data.district('cw').version;
    const paths = districtTablePaths('cw');
    const tables = paths.map((path) => ({ path, text: readRawTable(path) }));
    // The version is worked from exactly these tables, in this order.
    expect(tablesVersion(tables)).toBe(base);
    const seen = new Set([base]);
    for (const path of paths) {
      const version = tablesVersion(
        tables.map((t) => {
          if (t.path !== path) return t;
          // Change the last digit of the last figure in the table.
          const last = t.text.at(-2)!;
          return { path, text: t.text.slice(0, -2) + (last === '1' ? '2' : '1') + '\n' };
        }),
      );
      expect(seen.has(version), path).toBe(false);
      seen.add(version);
    }
    expect(seen.size).toBe(16);
    // And through the bundle itself, for one table: a single figure in the CPI.
    const changed = buildRealData((p) =>
      p === RAW_TABLE_PATHS.cpi
        ? readRawTable(p).replace('1997-Q1,46.58', '1997-Q1,46.59')
        : readRawTable(p),
    );
    expect(changed.district('cw').version).not.toBe(base);
  });

  it('does not change when a table the district does not read changes', () => {
    const other = buildRealData((p) =>
      p.startsWith('mla/yards/GME/') || p === 'silo/cq.csv'
        ? readRawTable(p) + 'x'
        : readRawTable(p),
    );
    expect(other.district('cw').version).toBe(data.district('cw').version);
  });

  it('tells apart the same text under another path, and text moved from one table to the next', () => {
    const a = tablesVersion([
      { path: 'a.csv', text: 'one\n' },
      { path: 'b.csv', text: 'two\n' },
    ]);
    expect(
      tablesVersion([
        { path: 'a.csv', text: 'one\n' },
        { path: 'b.csv', text: 'two\n' },
      ]),
    ).toBe(a);
    expect(
      tablesVersion([
        { path: 'a.csv', text: 'one\n' },
        { path: 'c.csv', text: 'two\n' },
      ]),
    ).not.toBe(a);
    expect(
      tablesVersion([
        { path: 'a.csv', text: 'one\nt' },
        { path: 'b.csv', text: 'wo\n' },
      ]),
    ).not.toBe(a);
    expect(
      tablesVersion([
        { path: 'b.csv', text: 'two\n' },
        { path: 'a.csv', text: 'one\n' },
      ]),
    ).not.toBe(a);
  });
});

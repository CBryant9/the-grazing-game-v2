/// <reference types="node" />
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Checks the real price and weather tables that scripts/data pulled and committed.
 * The tables are server-side engine data. Nothing here may be imported by browser code.
 */

const RAW_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/raw');

type Kind = 'indicator' | 'yardings' | 'sales' | 'weather';

interface ManifestFile {
  path: string;
  source: 'mla' | 'silo';
  kind: Kind;
  url: string;
  columns: string[];
  units: Record<string, string>;
  first: string;
  last: string;
  rows: number;
  pulled: string;
}

interface Manifest {
  sources: Record<string, { credit: string; note: string; licence?: string }>;
  files: ManifestFile[];
}

const manifest = JSON.parse(readFileSync(join(RAW_DIR, 'manifest.json'), 'utf8')) as Manifest;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function readTable(path: string): { header: string[]; rows: string[][]; text: string } {
  const text = readFileSync(join(RAW_DIR, path), 'utf8');
  const lines = text.split('\n');
  // The file ends with one line feed, so the last piece is empty.
  expect(lines.pop(), `${path} ends with a line feed`).toBe('');
  const [head, ...rest] = lines;
  return { header: (head ?? '').split(','), rows: rest.map((l) => l.split(',')), text };
}

function listCsv(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCsv(full));
    else if (entry.name.endsWith('.csv')) out.push(relative(RAW_DIR, full).replaceAll('\\', '/'));
  }
  return out;
}

/** The widest range a real figure could sit in. Anything outside is a broken pull, not a market. */
function valueRange(unit: string): [number, number] {
  if (unit === 'c/kg lwt') return [20, 1500];
  if (unit === 'c/kg cwt') return [20, 3000];
  throw new Error(`No range set for unit "${unit}"`);
}

/**
 * Price rows outside the sane range, as MLA served them. All are thin
 * Hamilton sheep figures from late 2006. One is negative. Whatever reads
 * these tables must allow for them (docs/DATA.md).
 */
const ODD_PRICES: Record<string, string[]> = {
  'mla/yards/HAM/merino-lamb.csv': [
    '2006-11-27 11.95',
    '2006-11-28 11.95',
    '2006-12-06 -6.67',
    '2006-12-07 -6.67',
    '2006-12-08 -6.67',
    '2006-12-09 -6.67',
    '2006-12-10 -6.67',
    '2006-12-11 -6.67',
    '2006-12-12 -6.67',
  ],
  'mla/yards/HAM/mutton.csv': [
    '2006-10-18 12.82',
    '2006-10-19 12.82',
    '2006-10-20 12.82',
    '2006-10-21 12.82',
    '2006-10-22 12.82',
    '2006-10-23 12.82',
    '2006-10-24 12.82',
  ],
};

/** Yardings rows with no head: Hamilton sale days with lambs and no sheep. */
const EMPTY_YARDINGS: Record<string, number> = { 'mla/yardings/HAM-sheep.csv': 502 };

const WEATHER_RANGES: Record<string, [number, number]> = {
  rain: [0, 600],
  tmax: [-15, 55],
  tmin: [-25, 40],
  rad: [0, 45],
  evap: [0, 30],
  et0: [0, 20],
};

describe('real data tables', () => {
  it('records both sources with their credit lines', () => {
    expect(manifest.sources.mla?.credit).toBe(
      'Reproduced courtesy of Meat & Livestock Australia Limited – www.mla.com.au',
    );
    expect(manifest.sources.silo?.credit).toContain('SILO, Queensland Government');
    expect(manifest.sources.silo?.credit).toContain('CC BY 4.0');
    expect(manifest.sources.silo?.note).toContain('Reformatted');
    expect(manifest.sources.mla?.note).toContain('Reformatted');
  });

  it('lists every table on disk, and every listed table exists', () => {
    const listed = manifest.files.map((f) => f.path).sort();
    expect(new Set(listed).size).toBe(listed.length);
    for (const path of listed) expect(existsSync(join(RAW_DIR, path)), path).toBe(true);
    expect(listCsv(RAW_DIR).sort()).toEqual(listed);
  });

  it('has the weather table for each of the four districts', () => {
    for (const district of ['cq', 'nsw', 'cw', 'wv']) {
      expect(
        manifest.files.some((f) => f.path === `silo/${district}.csv`),
        district,
      ).toBe(true);
    }
  });

  it('has the national restocker yearling steer indicator from 1996', () => {
    const steer = manifest.files.find(
      (f) => f.path === 'mla/national/restocker-yearling-steer.csv',
    );
    expect(steer).toBeDefined();
    expect(steer?.first.slice(0, 4)).toBe('1996');
  });

  it('holds no contact details', () => {
    expect(readFileSync(join(RAW_DIR, 'manifest.json'), 'utf8')).not.toContain('@');
    for (const f of manifest.files)
      expect(readFileSync(join(RAW_DIR, f.path), 'utf8'), f.path).not.toContain('@');
  });

  describe.each(manifest.files.map((f) => [f.path, f] as const))('%s', (_path, file) => {
    const table = readTable(file.path);

    it('matches the manifest: header, row count, first and last date', () => {
      expect(table.header).toEqual(file.columns);
      expect(table.rows.length).toBe(file.rows);
      expect(table.rows.length).toBeGreaterThan(0);
      expect(table.rows[0]?.[0]).toBe(file.first);
      expect(table.rows.at(-1)?.[0]).toBe(file.last);
      expect(file.pulled).toMatch(ISO_DATE);
      expect(file.url).toMatch(/^https:\/\//);
      expect(table.text).not.toContain('\r');
    });

    it('has real dates in order, with no repeats', () => {
      let prev = '';
      let bad = 0;
      for (const row of table.rows) {
        // A yardings table can hold two sale types on one day, so its key is date plus type.
        const key = file.kind === 'yardings' ? `${row[0]}|${row[1]}` : (row[0] ?? '');
        const date = row[0] ?? '';
        const real =
          ISO_DATE.test(date) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
        if (!real || row.length !== file.columns.length || key <= prev) bad++;
        prev = key;
      }
      expect(bad).toBe(0);
    });

    if (file.kind === 'indicator') {
      it('has prices and head counts in a sane range', () => {
        const [lo, hi] = valueRange(file.units.value ?? '');
        const odd: string[] = [];
        let bad = 0;
        for (const [date, value, head] of table.rows) {
          const v = Number(value);
          const h = Number(head);
          if (value === '' || !(v >= lo && v <= hi)) odd.push(`${date} ${value}`);
          if (head === '' || !Number.isInteger(h) || h < 0 || h > 2_000_000) bad++;
        }
        // The tables are as served. The odd prices that are known are
        // listed, so a new one fails here (docs/DATA.md).
        expect(odd).toEqual(ODD_PRICES[file.path] ?? []);
        expect(bad).toBe(0);
      });
    }

    if (file.kind === 'yardings' || file.kind === 'sales') {
      it('has whole head counts in a sane range', () => {
        let bad = 0;
        let none = 0;
        for (const row of table.rows) {
          const h = Number(row.at(-1));
          if (row.at(-1) === '' || !Number.isInteger(h) || h < 0 || h > 200_000) bad++;
          if (h === 0) none++;
        }
        expect(bad).toBe(0);
        // A sale day always has stock. A yardings row can be 0: the day's
        // sale had none of that kind (lambs but no sheep, at Hamilton).
        expect(none).toBe(file.kind === 'sales' ? 0 : (EMPTY_YARDINGS[file.path] ?? 0));
      });
    }

    if (file.kind === 'weather') {
      it('has every day once, with no gaps', () => {
        let gaps = 0;
        for (let i = 1; i < table.rows.length; i++) {
          const a = Date.parse(`${table.rows[i - 1]?.[0]}T00:00:00Z`);
          const b = Date.parse(`${table.rows[i]?.[0]}T00:00:00Z`);
          if (b - a !== DAY_MS) gaps++;
        }
        expect(gaps).toBe(0);
        expect(file.first).toBe('1990-01-01');
      });

      it('has weather figures in a sane range, and days no colder than nights', () => {
        let bad = 0;
        const col = (name: string) => file.columns.indexOf(name);
        for (const row of table.rows) {
          for (const [name, [lo, hi]] of Object.entries(WEATHER_RANGES)) {
            const cell = row[col(name)];
            const n = Number(cell);
            if (cell === undefined || cell === '' || !(n >= lo && n <= hi)) bad++;
          }
          if (Number(row[col('tmax')]) < Number(row[col('tmin')])) bad++;
        }
        expect(bad).toBe(0);
      });
    }
  });
});

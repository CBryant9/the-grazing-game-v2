import type { PGlite } from '@electric-sql/pglite';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFarm, saveFarm, type SavedFarm } from '@gg/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freshDb } from '../../../../packages/db/src/harness';
import type { SetupChoices } from '../../lib/game/types';
import { DbFarmStore, toUuid } from '../db/dbstore';
import { pgliteSql } from '../test-support/pgliteSql';
import { GameServer, farmKey } from './game';
import { FileFarmStore, type FarmStore, type StoredFarm } from './store';

/*
 * Old data after the m6 join (engine 0.18.0, save format 13, stored format 3). A stored farm from
 * the web line before the engine join (engine 0.13.0, save format 9), and one from each later
 * engine format, loads and plays a day, through the file store and the database store. The engine
 * saves are the real ones the old code made (packages/engine/test-support/fixtures); the format 12
 * one is today's save stamped 12, the same shape a 0.17.0 engine wrote (format 13 only added
 * optional fields). The web's stored format has been 3 since the diary (m1.7g); a stored format 2
 * farm (before the diary) is walked too.
 */

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const fixture = (name: string): SavedFarm =>
  JSON.parse(
    readFileSync(join(ROOT, 'packages/engine/test-support/fixtures', name), 'utf8'),
  ) as SavedFarm;

const format12 = (): SavedFarm => ({
  ...saveFarm(
    createFarm({
      seed: 7,
      district: 'cw',
      size: 'small',
      start: { year: 2024, month: 3 },
      startType: 'running',
      difficulty: 'medium',
      stock: 'mix',
    }),
  ),
  saveFormat: 12,
  engineVersion: '0.17.0',
});

const CASES: { label: string; saved: () => SavedFarm; storedFormat: number }[] = [
  {
    label: 'engine 0.13.0, save format 9 (the web line before the join)',
    saved: () => fixture('save-format-9.json'),
    storedFormat: 3,
  },
  {
    label: 'engine 0.14.0, save format 10',
    saved: () => fixture('save-format-10.json'),
    storedFormat: 3,
  },
  {
    label: 'engine 0.16.0, save format 11',
    saved: () => fixture('save-format-11.json'),
    storedFormat: 3,
  },
  {
    label: 'engine 0.16.0, save format 11 with lambs',
    saved: () => fixture('save-format-11-lambs.json'),
    storedFormat: 3,
  },
  { label: 'engine 0.17.0 shape, save format 12', saved: format12, storedFormat: 3 },
  {
    label: 'stored format 2 (no diary), save format 9',
    saved: () => fixture('save-format-9.json'),
    storedFormat: 2,
  },
];

function storedOf(saved: SavedFarm, storedFormat: number): Record<string, unknown> {
  const district = (saved as { district?: string }).district as SetupChoices['district'];
  const setup: SetupChoices = {
    district,
    size: 'small',
    enterprise: (saved as { mixed?: boolean }).mixed ? 'mixed' : 'grazing',
    years: 'random',
    startType: 'running',
    difficulty: 'medium',
    name: 'Old farm',
  };
  const out: Record<string, unknown> = {
    format: storedFormat,
    name: 'Old farm',
    setup,
    saved,
    version: 'old-version',
    done: [],
  };
  if (storedFormat >= 3) out.diary = [];
  return out;
}

let n = 0;
const newId = (): string => (++n).toString(16).padStart(32, 'a');

async function playsADay(store: FarmStore, id: string, before: number): Promise<void> {
  const game = new GameServer({
    store,
    seed: () => 3,
    saveRetryMs: [0, 0],
    sheepOn: async () => true,
    hooks: null,
  });
  const key = farmKey(id);
  const snap = (await game.snapshot(key))!;
  expect(snap.day).toBe(before);
  expect(snap.over).toBeNull();
  const next = await game.endDay(key);
  expect(next.snapshot.day).toBe(before + 1);
  // Saved again in today's format, and it opens again on a fresh server.
  const again = new GameServer({ store, seed: () => 3, saveRetryMs: [0, 0], hooks: null });
  expect((await again.snapshot(key))!.day).toBe(before + 1);
  const raw = (await store.get(id)) as StoredFarm;
  expect(raw.saved.saveFormat).toBe(13);
  expect(raw.saved.engineVersion).toBe('0.18.0');
}

describe('old farms through the file store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gg-old-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  for (const c of CASES) {
    it(`${c.label} loads and plays a day`, async () => {
      const saved = c.saved();
      const id = newId();
      writeFileSync(join(dir, `${id}.json`), JSON.stringify(storedOf(saved, c.storedFormat)));
      await playsADay(new FileFarmStore(dir), id, (saved as unknown as { day: number }).day);
    }, 120_000);
  }
});

describe('old farms through the database store', () => {
  let db: PGlite;
  const USER = '00000000-0000-4000-8000-0000000000e9';
  beforeAll(async () => {
    db = await freshDb({ seed: false });
    await db.query('insert into auth.users (id, email) values ($1, $2)', [
      USER,
      'old@example.test',
    ]);
    // Room for every case: the limits are not what this tests.
    await db.query(`update public.farm_limits set max_active = 50`);
  }, 120_000);
  afterAll(async () => {
    await db?.close();
  });
  for (const c of CASES) {
    it(`${c.label} loads and plays a day`, async () => {
      const saved = c.saved();
      const id = newId();
      const day = (saved as unknown as { day: number }).day;
      const store = new DbFarmStore(pgliteSql(db));
      const stored = storedOf(saved, c.storedFormat);
      await store.create(id, { kind: 'user', id: USER }, stored as unknown as StoredFarm, {
        name: 'Old farm',
        district: stored.setup ? (stored.setup as SetupChoices).district : 'nsw',
        districtName: 'Old district',
        size: 'small',
        sizeHa: 260,
        enterprise: 'grazing',
        startType: 'running',
        difficulty: 'medium',
        years: 'random',
        engineVersion: saved.engineVersion,
        day,
        date: { year: 2024, month: 0, date: 1 },
        over: null,
      });
      // The stored row keeps the old format as written.
      const row = await db.query<{ stored_format: number; save_format: number }>(
        'select stored_format, save_format from public.farm_saves where farm_id = $1',
        [toUuid(id)],
      );
      expect(row.rows[0]).toEqual({ stored_format: c.storedFormat, save_format: saved.saveFormat });
      await playsADay(store, id, day);
    }, 120_000);
  }
});

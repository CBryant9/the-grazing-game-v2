import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { SetupChoices } from '../../lib/game/types';
import { GameServer, farmIdFor } from './game';
import { FileFarmStore } from './store';
import { EXPORT_FORMAT, FarmImportError, exportFarms, importFarms } from './farmexport';

/*
 * File-store farms out and back in (milestone 5.5, docs/RUNBOOK.md): farms made and played
 * through the real game server, exported, imported into an empty folder, then opened and played
 * a day there with the same result as in the old folder.
 */

const dirs: string[] = [];
const folder = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'gg-export-'));
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

const choices = (name: string): SetupChoices => ({
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name,
});
const session = (n: number): string => `e${n.toString(16).padStart(31, '0')}`;

/** A snapshot without its version, which is made fresh on every change. */
const plain = (s: unknown): unknown =>
  JSON.parse(JSON.stringify(s), (k, v) => (k === 'farmVersion' ? undefined : v));

describe('file-store farms out and back in', () => {
  it('moves every farm and its past days, and they play on the same', async () => {
    const from = folder();
    const old = new GameServer({ store: new FileFarmStore(from), seed: () => 7 });
    await old.create(session(1), choices('Export One'));
    await old.create(session(2), choices('Export Two'));
    await old.endDay(session(1));
    await old.endDay(session(1));
    await old.endDay(session(2));
    // A broken farm set aside is not a farm, and is left behind.
    writeFileSync(join(from, `${'f'.repeat(32)}.broken-1.json`), '{}');

    const bundle = await exportFarms(from);
    expect(bundle.format).toBe(EXPORT_FORMAT);
    expect(bundle.farms.map((f) => f.id).sort()).toEqual(
      [farmIdFor(session(1)), farmIdFor(session(2))].sort(),
    );
    expect(Object.keys(bundle.farms.find((f) => f.id === farmIdFor(session(1)))!.past).length).toBe(
      2,
    );

    // Through a file, as the command line does it.
    const to = folder();
    const text = JSON.stringify(bundle);
    expect(await importFarms(to, JSON.parse(text))).toEqual({ imported: 2, replaced: 0 });
    expect(readdirSync(to).some((n) => n.includes('broken'))).toBe(false);

    const moved = new GameServer({ store: new FileFarmStore(to), seed: () => 7 });
    for (const s of [session(1), session(2)]) {
      // The same cookie finds the farm in the new folder, as it was.
      expect(plain(await moved.snapshot(s))).toEqual(plain(await old.snapshot(s)));
    }
    expect(await moved.pastDays(session(1))).toEqual(await old.pastDays(session(1)));
    // And the next day comes out the same in both places.
    const a = await old.endDay(session(1));
    const b = await moved.endDay(session(1));
    expect(plain(b)).toEqual(plain(a));
  }, 120_000);

  it('refuses a changed export, a newer one and a bad id, and writes nothing', async () => {
    const from = folder();
    const game = new GameServer({ store: new FileFarmStore(from), seed: () => 7 });
    await game.create(session(3), choices('Checked'));
    const bundle = await exportFarms(from);

    const to = folder();
    const changed = structuredClone(bundle);
    changed.farms[0]!.farm = changed.farms[0]!.farm.replace('Checked', 'Changed');
    await expect(importFarms(to, changed)).rejects.toThrow(/checksum does not match/);
    await expect(importFarms(to, { ...bundle, format: EXPORT_FORMAT + 1 })).rejects.toThrow(
      /newer game/,
    );
    const badId = structuredClone(bundle);
    badId.farms[0]!.id = '../../outside';
    await expect(importFarms(to, badId)).rejects.toThrow(FarmImportError);
    const badDay = structuredClone(bundle);
    badDay.farms[0]!.past = { '../x': '{}' };
    await expect(importFarms(to, badDay)).rejects.toThrow(/bad past day/);
    await expect(importFarms(to, { kind: 'something else' })).rejects.toThrow(/not a farm export/);
    expect(readdirSync(to)).toEqual([]);
  }, 60_000);

  it('never writes over a farm that is there unless told to', async () => {
    const from = folder();
    const game = new GameServer({ store: new FileFarmStore(from), seed: () => 7 });
    await game.create(session(4), choices('First'));
    const bundle = await exportFarms(from);
    await game.endDay(session(4));

    // Importing back into the folder it came from: the farm is there, so it is refused.
    await expect(importFarms(from, bundle)).rejects.toThrow(/already in the folder/);
    const fresh = new GameServer({ store: new FileFarmStore(from), seed: () => 7 });
    expect((await fresh.snapshot(session(4)))!.day).toBe(1);
    // Told to, it puts the exported farm back (day 0).
    expect(await importFarms(from, bundle, { overwrite: true })).toEqual({
      imported: 0,
      replaced: 1,
    });
    const after = new GameServer({ store: new FileFarmStore(from), seed: () => 7 });
    expect((await after.snapshot(session(4)))!.day).toBe(0);
  }, 60_000);
});

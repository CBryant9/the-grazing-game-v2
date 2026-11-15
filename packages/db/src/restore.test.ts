import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { EXTRA_ROWS_SQL, checksums, compare, restoreData, runDrill } from './restore';
import { freshDb } from './harness';

/*
 * The restore drill (milestone 5.5, docs/RUNBOOK.md). A database built from every migration and
 * the seed is copied two ways (a data dump, and the whole data folder), restored into a fresh
 * one, and compared table by table. `pnpm test:restore` runs the same drill and prints the table.
 */
describe('the restore drill', () => {
  it('restores every table with the same rows, both ways', async () => {
    const r = await runDrill();
    // The drill must have something to compare: the seed's accounts, farms, posts and switches.
    expect(r.tables.length).toBeGreaterThan(40);
    const filled = r.tables.filter((t) => t.rows > 0).map((t) => t.table);
    for (const t of [
      'auth.users',
      'public.profiles',
      'public.farms',
      'public.posts',
      'public.feature_switches',
      'public.admin_audit_log',
    ]) {
      expect(filled, t).toContain(t);
    }
    expect(r.dataDiffs).toEqual([]);
    expect(r.folderDiffs).toEqual([]);
  }, 180_000);

  it('notices a row that went missing or changed', async () => {
    // The comparison itself is what is under test here, so one database is changed after it is measured.
    const db = await freshDb();
    try {
      const before = await checksums(db);
      expect(compare(before, await checksums(db))).toEqual([]);
      await db.exec(`delete from public.feature_switches where key = 'community'`);
      await db.exec(EXTRA_ROWS_SQL);
      const diffs = compare(before, await checksums(db)).map((d) => d.table);
      expect(diffs).toEqual(['public.admin_audit_log', 'public.feature_switches']);
    } finally {
      await db.close();
    }
  }, 180_000);

  it('refuses a dump into a database that lacks one of its tables', async () => {
    const target = await PGlite.create();
    try {
      await expect(
        restoreData(target, {
          format: 1,
          tables: [{ schema: 'public', table: 'farms', copy: '' }],
          sequences: [],
        }),
      ).rejects.toThrow(/no table public\.farms/);
    } finally {
      await target.close();
    }
  });
});

// The restore drill (milestone 5.5, docs/RUNBOOK.md).
//
//   pnpm test:restore
//
// Builds a database on PGlite from every migration and supabase/seed.sql,
// copies it two ways (a data dump of every table and sequence, and the whole
// data folder), restores each copy into a fresh database, and compares every
// table: row count and an md5 over the sorted rows. Prints one line a table
// and exits 1 if any table differs. The logic is in packages/db/src/restore.ts,
// which packages/db/src/restore.test.ts also runs inside `pnpm test`.
//
// No outside service is called. pg_dump is not used (see restore.ts).

import './lib/ts-load.mjs';

const started = Date.now();
const { runDrill } = await import('../packages/db/src/restore.ts');
const r = await runDrill();

const width = Math.max(...r.tables.map((t) => t.table.length));
console.log(
  `${'table'.padEnd(width)}  ${'rows'.padStart(6)}  checksum                          data  folder`,
);
const bad = (diffs, table) => diffs.some((d) => d.table === table);
for (const t of r.tables) {
  console.log(
    `${t.table.padEnd(width)}  ${String(t.rows).padStart(6)}  ${t.sum}  ${bad(r.dataDiffs, t.table) ? 'DIFF' : 'same'}  ${bad(r.folderDiffs, t.table) ? 'DIFF' : 'same'}`,
  );
}
const rows = r.tables.reduce((s, t) => s + t.rows, 0);
console.log(
  `\n${r.tables.length} tables, ${rows} rows. Data dump ${(r.dumpBytes / 1024).toFixed(0)} KB, data folder ${(r.folderBytes / 1024).toFixed(0)} KB gzipped. ${((Date.now() - started) / 1000).toFixed(1)} s.`,
);
const diffs = [...r.dataDiffs.map((d) => ['data', d]), ...r.folderDiffs.map((d) => ['folder', d])];
if (diffs.length) {
  for (const [kind, d] of diffs) {
    console.log(
      `DIFF (${kind}) ${d.table}: before ${d.before ? `${d.before.rows} rows` : 'missing'}, after ${d.after ? `${d.after.rows} rows` : 'missing'}`,
    );
  }
  console.log('The restore drill FAILED.');
  process.exit(1);
}
console.log('The restore drill passed: every table came back with the same rows, both ways.');

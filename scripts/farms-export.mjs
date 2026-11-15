// Export and import farms kept in files (milestone 5.5, docs/RUNBOOK.md).
//
//   pnpm farms:export -- --dir apps/web/.farms --out farms-export.json
//   pnpm farms:import -- --dir apps/web/.farms --in farms-export.json [--overwrite]
//
// --dir is the file store folder (GG_FARMS_DIR, or apps/web/.farms when that
// is not set). An export holds every farm and its past days, with a checksum.
// An import checks the whole file first and writes nothing if any check fails,
// and never writes over a farm already in the folder unless --overwrite is given.
// Stop the server before an import, so it is not holding an old copy in memory.
//
// The work is in apps/web/server/game/farmexport.ts (tested in farmexport.test.ts).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import './lib/ts-load.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const dir = resolve(arg('--dir') ?? process.env.GG_FARMS_DIR ?? join(ROOT, 'apps/web/.farms'));
const { exportFarms, importFarms, FarmImportError } =
  await import('../apps/web/server/game/farmexport.ts');

try {
  if (mode === 'export') {
    const out = arg('--out');
    if (!out) throw new FarmImportError('Say where to write the export: --out <file>.');
    const bundle = await exportFarms(dir);
    writeFileSync(resolve(out), JSON.stringify(bundle), 'utf8');
    console.log(`Exported ${bundle.farms.length} farms from ${dir} to ${resolve(out)}.`);
    console.log(`Checksum (SHA-256): ${bundle.sha256}`);
  } else if (mode === 'import') {
    const input = arg('--in');
    if (!input) throw new FarmImportError('Say which export to read: --in <file>.');
    let raw;
    try {
      raw = JSON.parse(readFileSync(resolve(input), 'utf8'));
    } catch {
      throw new FarmImportError('That file could not be read as JSON.');
    }
    const r = await importFarms(dir, raw, { overwrite: process.argv.includes('--overwrite') });
    console.log(`Imported ${r.imported} farms into ${dir}, replaced ${r.replaced}.`);
  } else {
    console.log(
      'Use: farms-export.mjs export --out <file> | import --in <file> [--overwrite] [--dir <folder>]',
    );
    process.exit(2);
  }
} catch (e) {
  if (e instanceof FarmImportError) {
    console.error(e.message);
    process.exit(1);
  }
  throw e;
}

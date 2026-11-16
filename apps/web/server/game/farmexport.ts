import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Export and import for farms kept in files (milestone 5.5, docs/RUNBOOK.md).
 *
 * The file store (server/game/store.ts) keeps one `<id>.json` for each farm and a `<id>.past`
 * folder of past-day pictures. An export is one JSON file holding every farm's file text and its
 * pictures exactly as they were on disk, with a format number and a SHA-256 over the farms. An
 * import checks all of it first and writes nothing unless every check passes. It never writes
 * over a farm that is already there unless told to.
 *
 * A farm's id is a hash of the guest's cookie, so a guest whose farm was moved to a new folder
 * finds it there with the same cookie.
 *
 * This file uses Node only (no `server-only`), so the command line script can load it:
 * `pnpm farms:export` and `pnpm farms:import` (scripts/farms-export.mjs).
 */

export const EXPORT_KIND = 'gg-farms-export';
export const EXPORT_FORMAT = 1;

export interface ExportedFarm {
  /** The farm's id, 32 hex characters. */
  id: string;
  /** The farm file's text, as it was on disk. */
  farm: string;
  /** Past-day pictures by farm day, each as its file text. */
  past: Record<string, string>;
}

export interface FarmExport {
  kind: typeof EXPORT_KIND;
  format: number;
  /** When it was made, ISO 8601. */
  made: string;
  /** SHA-256 (hex) of `JSON.stringify(farms)`. */
  sha256: string;
  farms: ExportedFarm[];
}

const ID = /^[0-9a-f]{32}$/;
const FARM_FILE = /^([0-9a-f]{32})\.json$/;
const PAST_FILE = /^(\d{1,7})\.json$/;

export class FarmImportError extends Error {}

const digest = (farms: ExportedFarm[]): string =>
  createHash('sha256').update(JSON.stringify(farms)).digest('hex');

async function namesIn(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

/**
 * Every farm in a file store folder, with its pictures. Farms set aside as broken
 * (`<id>.broken-<time>.json`) and half-written temp files are left out.
 */
export async function exportFarms(dir: string, now: Date = new Date()): Promise<FarmExport> {
  const farms: ExportedFarm[] = [];
  for (const name of await namesIn(dir)) {
    const m = FARM_FILE.exec(name);
    if (!m) continue;
    const id = m[1]!;
    const farm = await readFile(join(dir, name), 'utf8');
    const past: Record<string, string> = {};
    for (const p of await namesIn(join(dir, `${id}.past`))) {
      const d = PAST_FILE.exec(p);
      if (d) past[String(Number(d[1]))] = await readFile(join(dir, `${id}.past`, p), 'utf8');
    }
    farms.push({ id, farm, past });
  }
  return {
    kind: EXPORT_KIND,
    format: EXPORT_FORMAT,
    made: now.toISOString(),
    sha256: digest(farms),
    farms,
  };
}

/** Check an export without writing anything. Throws `FarmImportError` with a plain reason. */
export function checkExport(raw: unknown): FarmExport {
  if (typeof raw !== 'object' || raw === null) throw new FarmImportError('That is not an export.');
  const x = raw as Partial<FarmExport>;
  if (x.kind !== EXPORT_KIND) throw new FarmImportError('That is not a farm export.');
  if (typeof x.format !== 'number' || !Number.isInteger(x.format) || x.format < 1) {
    throw new FarmImportError('The export has no format number.');
  }
  if (x.format > EXPORT_FORMAT) throw new FarmImportError('The export is from a newer game.');
  if (!Array.isArray(x.farms) || typeof x.sha256 !== 'string') {
    throw new FarmImportError('The export is missing its farms or its checksum.');
  }
  const seen = new Set<string>();
  for (const f of x.farms as unknown[]) {
    const e = f as Partial<ExportedFarm>;
    if (typeof e?.id !== 'string' || !ID.test(e.id)) {
      throw new FarmImportError('A farm in the export has a bad id.');
    }
    if (seen.has(e.id)) throw new FarmImportError(`Farm ${e.id} is in the export twice.`);
    seen.add(e.id);
    if (typeof e.farm !== 'string') throw new FarmImportError(`Farm ${e.id} has no farm file.`);
    try {
      JSON.parse(e.farm);
    } catch {
      throw new FarmImportError(`Farm ${e.id} is not JSON.`);
    }
    if (typeof e.past !== 'object' || e.past === null || Array.isArray(e.past)) {
      throw new FarmImportError(`Farm ${e.id} has no past days list.`);
    }
    for (const [day, text] of Object.entries(e.past)) {
      if (!/^\d{1,7}$/.test(day) || typeof text !== 'string') {
        throw new FarmImportError(`Farm ${e.id} has a bad past day.`);
      }
    }
  }
  if (digest(x.farms) !== x.sha256) {
    throw new FarmImportError('The checksum does not match: the export was changed or cut short.');
  }
  return x as FarmExport;
}

export interface ImportResult {
  imported: number;
  replaced: number;
}

/**
 * Write an export's farms into a file store folder. Everything is checked first. A farm already
 * in the folder is refused (and nothing is written) unless `overwrite` is set.
 */
export async function importFarms(
  dir: string,
  raw: unknown,
  options: { overwrite?: boolean } = {},
): Promise<ImportResult> {
  const x = checkExport(raw);
  const there = new Set(
    (await namesIn(dir)).flatMap((n) => {
      const m = FARM_FILE.exec(n);
      return m ? [m[1]!] : [];
    }),
  );
  const clash = x.farms.filter((f) => there.has(f.id));
  if (clash.length && !options.overwrite) {
    throw new FarmImportError(
      `${clash.length} farm${clash.length === 1 ? ' is' : 's are'} already in the folder. Nothing was written.`,
    );
  }
  await mkdir(dir, { recursive: true });
  for (const f of x.farms) {
    const pastDir = join(dir, `${f.id}.past`);
    const days = Object.entries(f.past);
    if (days.length) await mkdir(pastDir, { recursive: true });
    for (const [day, text] of days) await writeAtomic(join(pastDir, `${Number(day)}.json`), text);
    // The farm file last, so a farm is only there once its pictures are.
    await writeAtomic(join(dir, `${f.id}.json`), f.farm);
  }
  return { imported: x.farms.length - clash.length, replaced: clash.length };
}

/** Write beside it, then rename, so a stop part-way never leaves half a file. */
async function writeAtomic(file: string, text: string): Promise<void> {
  const temp = `${file}.${process.pid}.import.tmp`;
  await writeFile(temp, text, 'utf8');
  await rename(temp, file);
}

/// <reference types="node" />
/**
 * Server only: the real data bundle, read from the tables on disk.
 *
 * Build it once and pass it in the `env` of `createFarm`, `stepDay` and
 * `applyAction` for every real-year farm. The model code in the rest of
 * `src` takes the bundle as data and never reads a file. Import this from
 * server code and tests only, as `@gg/engine/server`. Browser code must
 * never import it or the tables it reads (CLAUDE.md, rule 14).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRealData, type RawTableReader, type RealData } from '../real/realData';

const RAW_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/raw');

/** A table path is plain names and slashes, ending in `.csv`. Nothing that could climb out of the folder. */
const SAFE_PATH = /^[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)*\.csv$/;

/** Read one raw table as text. A missing or broken file is an error. */
export const readRawTable: RawTableReader = (path) => {
  if (!SAFE_PATH.test(path)) throw new Error(`"${path}" is not a raw data table.`);
  const file = join(RAW_DIR, path);
  try {
    return readFileSync(file, 'utf8');
  } catch (cause) {
    throw new Error(`The data table ${path} could not be read from ${file}.`, { cause });
  }
};

let loaded: RealData | undefined;

/**
 * The real data bundle for the tables in `packages/engine/data/raw/`.
 * Made once and shared by every farm. Each district's tables are read the
 * first time that district is asked for.
 */
export function loadRealData(): RealData {
  loaded ??= buildRealData(readRawTable);
  return loaded;
}

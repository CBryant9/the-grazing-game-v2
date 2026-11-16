/// <reference types="node" />
/**
 * Server only: reads the SILO weather tables from disk.
 *
 * This is the one place the engine package touches a file. The model code
 * in the rest of `src` takes the weather as data and never reads a file, so
 * it stays repeatable and testable. Import this from server code and tests
 * only, as `@gg/engine/server`. Browser code must never import it or the
 * tables it reads (CLAUDE.md, rule 14).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DistrictId } from '@gg/shared';
import { DISTRICTS } from '../data/districts';
import { buildWeatherGrowth, type WeatherGrowth } from '../season/weatherGrowth';
import { parseWeatherTable, type WeatherTable } from '../season/weatherTable';

const SILO_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../data/raw/silo');

/** Read a district's SILO weather table. A missing or broken file is an error. */
export function loadWeatherTable(district: DistrictId): WeatherTable {
  if (!Object.hasOwn(DISTRICTS, district)) throw new Error(`No district "${district}".`);
  const path = join(SILO_DIR, `${district}.csv`);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`The weather table for ${district} could not be read from ${path}.`, { cause });
  }
  return parseWeatherTable(text);
}

const built = new Map<DistrictId, WeatherGrowth>();

/**
 * A district's growth factors from its weather table. Read and worked out
 * once, then shared by every farm in the district.
 */
export function loadWeatherGrowth(district: DistrictId): WeatherGrowth {
  let growth = built.get(district);
  if (!growth) {
    growth = buildWeatherGrowth(DISTRICTS[district], loadWeatherTable(district));
    built.set(district, growth);
  }
  return growth;
}

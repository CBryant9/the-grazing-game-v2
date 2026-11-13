import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Builders' pages under /dev are for looking at work in progress. They are
 * never part of the live site: in a production build they return 404 unless
 * GG_DEV_PAGES is set to 1.
 */
export function devPagesOn(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.GG_DEV_PAGES === '1';
}

export interface MapFixtureInfo {
  name: string;
  title: string;
  note: string;
  district: string;
  farmHa: number;
  head: number;
  calves: number;
  mobs: number;
  paddocks: number;
  bytes: number;
}

/** Fixture names are lower-case words joined by hyphens. Nothing else reaches the file system. */
const FIXTURE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const fixtureDir = (): string => join(process.cwd(), 'dev-fixtures', 'map');

/** The map fixtures on disk, or an empty list if the script has not been run. */
export function mapFixtures(): MapFixtureInfo[] {
  try {
    return JSON.parse(readFileSync(join(fixtureDir(), 'index.json'), 'utf8')) as MapFixtureInfo[];
  } catch {
    return [];
  }
}

/** One fixture's farm view as JSON text, or null if there is no such fixture. */
export function mapFixtureText(name: string): string | null {
  if (!FIXTURE_NAME.test(name)) return null;
  try {
    return readFileSync(join(fixtureDir(), name + '.json'), 'utf8');
  } catch {
    return null;
  }
}

import 'server-only';
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedFarm } from '@gg/engine';
import type { JobCardWire, SetupChoices } from '../../lib/game/types';

/**
 * The version of what is kept for a farm. 1 had no `format` (milestone
 * 1.6). 2 added `format`, `version` and `done` (milestone 1.7f). An older
 * farm is brought up to date when it is read (`upgradeStored`).
 */
export const STORED_FORMAT = 2;

/** Act requests the server remembers for each farm, so a repeat gets the same answer. */
export const DONE_KEPT = 12;

/** What an act request did, kept so the same request id never runs twice. */
export interface DoneRequest {
  id: string;
  ok: boolean;
  reason?: string;
  message: string;
  card: JobCardWire | null;
}

/** What is kept for one farm: the engine's save, and what the player chose. */
export interface StoredFarm {
  format: number;
  name: string;
  setup: SetupChoices;
  saved: SavedFarm;
  /**
   * Changes with every change to the farm. The browser sends back the one it
   * was looking at, so a job shown on an older farm is never done on a newer
   * one.
   */
  version: string;
  /** The last few act requests, newest last. */
  done: DoneRequest[];
  /** The newest inbox message the player has seen. Left out until the inbox is first opened. */
  inboxRead?: number;
}

/** A stored farm that could not be read: bad JSON, or not a farm at all. */
export class BrokenFarmError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Bring a stored farm from any older format up to this one, with defaults
 * for what it lacks. Anything that is not a stored farm throws
 * `BrokenFarmError`. `version` is the one to give a farm that has none.
 */
export function upgradeStored(raw: unknown, version: () => string): StoredFarm {
  if (!isObject(raw)) throw new BrokenFarmError('The farm is not a record.');
  const format = typeof raw.format === 'number' ? raw.format : 1;
  if (format > STORED_FORMAT) throw new BrokenFarmError('The farm is from a newer game.');
  if (typeof raw.name !== 'string' || !isObject(raw.setup) || !isObject(raw.saved)) {
    throw new BrokenFarmError('The farm is missing its name, setup or save.');
  }
  return {
    format: STORED_FORMAT,
    name: raw.name,
    setup: raw.setup as unknown as SetupChoices,
    saved: raw.saved as unknown as SavedFarm,
    version: typeof raw.version === 'string' && raw.version ? raw.version : version(),
    done: Array.isArray(raw.done) ? (raw.done as DoneRequest[]).slice(-DONE_KEPT) : [],
    ...(typeof raw.inboxRead === 'number' ? { inboxRead: raw.inboxRead } : {}),
  };
}

/**
 * Where farms are kept. Files for now; a database replaces this later by
 * implementing the same calls. The key is the farm's id, never a session id.
 */
export interface FarmStore {
  /** The farm as it was kept (not yet upgraded), or null if there is none. Throws `BrokenFarmError` if it can't be read. */
  get(farmId: string): Promise<unknown>;
  put(farmId: string, farm: StoredFarm): Promise<void>;
  delete(farmId: string): Promise<void>;
  /** Move a farm that can't be read out of the way, kept under another name. */
  setAside(farmId: string): Promise<void>;
  /** Mark a farm as used now, so it is not removed as stale. */
  touch(farmId: string): Promise<void>;
  /** How many farms there are. */
  count(): Promise<number>;
  /** Remove every farm (and every farm set aside) last used before `before`, ms. Returns how many went. */
  prune(before: number): Promise<number>;
}

const ID = /^[0-9a-f]{32}$/;
const FARM_FILE = /^[0-9a-f]{32}\.json$/;
const ASIDE_FILE = /^[0-9a-f]{32}\.broken-\d+\.json$/;

function checkId(farmId: string): void {
  if (!ID.test(farmId)) throw new Error('That is not a farm id.');
}

/** One JSON file for each farm, in a folder that git ignores. */
export class FileFarmStore implements FarmStore {
  constructor(private readonly dir: string) {}

  private file(farmId: string): string {
    checkId(farmId);
    return join(this.dir, `${farmId}.json`);
  }

  async get(farmId: string): Promise<unknown> {
    let text: string;
    try {
      text = await readFile(this.file(farmId), 'utf8');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new BrokenFarmError('The farm file is not JSON.');
    }
  }

  async put(farmId: string, farm: StoredFarm): Promise<void> {
    const file = this.file(farmId);
    await mkdir(this.dir, { recursive: true });
    // Write beside it, then rename, so a crash never leaves half a farm.
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(farm), 'utf8');
    await rename(temp, file);
  }

  async delete(farmId: string): Promise<void> {
    await rm(this.file(farmId), { force: true });
  }

  async setAside(farmId: string): Promise<void> {
    const file = this.file(farmId);
    try {
      await rename(file, join(this.dir, `${farmId}.broken-${Date.now()}.json`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  async touch(farmId: string): Promise<void> {
    const now = new Date();
    try {
      await utimes(this.file(farmId), now, now);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }

  private async names(): Promise<string[]> {
    try {
      return await readdir(this.dir);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw e;
    }
  }

  async count(): Promise<number> {
    return (await this.names()).filter((f) => FARM_FILE.test(f)).length;
  }

  async prune(before: number): Promise<number> {
    let gone = 0;
    for (const f of await this.names()) {
      if (!FARM_FILE.test(f) && !ASIDE_FILE.test(f)) continue;
      const path = join(this.dir, f);
      try {
        if ((await stat(path)).mtimeMs < before) {
          await rm(path, { force: true });
          gone++;
        }
      } catch {
        // Gone already, or in use: leave it for the next time.
      }
    }
    return gone;
  }
}

/** Farms in memory only. For tests. */
export class MemoryFarmStore implements FarmStore {
  private readonly farms = new Map<string, { text: string; used: number }>();
  private readonly aside: { text: string; used: number }[] = [];
  /** The clock this store reads, so a test can move it. */
  now: () => number = () => Date.now();

  async get(farmId: string): Promise<unknown> {
    checkId(farmId);
    const f = this.farms.get(farmId);
    if (f === undefined) return null;
    try {
      return JSON.parse(f.text) as unknown;
    } catch {
      throw new BrokenFarmError('The farm is not JSON.');
    }
  }

  async put(farmId: string, farm: StoredFarm): Promise<void> {
    checkId(farmId);
    this.farms.set(farmId, { text: JSON.stringify(farm), used: this.now() });
  }

  /** For tests: keep this text as the farm, as if the file had been damaged. */
  putRaw(farmId: string, text: string): void {
    checkId(farmId);
    this.farms.set(farmId, { text, used: this.now() });
  }

  async delete(farmId: string): Promise<void> {
    checkId(farmId);
    this.farms.delete(farmId);
  }

  async setAside(farmId: string): Promise<void> {
    checkId(farmId);
    const f = this.farms.get(farmId);
    if (f) this.aside.push(f);
    this.farms.delete(farmId);
  }

  /** For tests: how many farms were set aside. */
  setAsideCount(): number {
    return this.aside.length;
  }

  async touch(farmId: string): Promise<void> {
    checkId(farmId);
    const f = this.farms.get(farmId);
    if (f) f.used = this.now();
  }

  async count(): Promise<number> {
    return this.farms.size;
  }

  async prune(before: number): Promise<number> {
    let gone = 0;
    for (const [id, f] of this.farms) {
      if (f.used < before) {
        this.farms.delete(id);
        gone++;
      }
    }
    return gone;
  }
}

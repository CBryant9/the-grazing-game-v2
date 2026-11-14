import 'server-only';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedFarm } from '@gg/engine';
import type { SetupChoices } from '../../lib/game/types';

/** What is kept for one farm: the engine's save, and what the player chose. */
export interface StoredFarm {
  name: string;
  setup: SetupChoices;
  saved: SavedFarm;
  /** The newest inbox message the player has seen. Left out until the inbox is first opened. */
  inboxRead?: number;
}

/**
 * Where farms are kept. Files for now; a database replaces this later by
 * implementing the same three calls. The key is the farm's id, never a
 * session id.
 */
export interface FarmStore {
  get(farmId: string): Promise<StoredFarm | null>;
  put(farmId: string, farm: StoredFarm): Promise<void>;
  delete(farmId: string): Promise<void>;
}

const ID = /^[0-9a-f]{32}$/;

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

  async get(farmId: string): Promise<StoredFarm | null> {
    try {
      return JSON.parse(await readFile(this.file(farmId), 'utf8')) as StoredFarm;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
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
}

/** Farms in memory only. For tests. */
export class MemoryFarmStore implements FarmStore {
  private readonly farms = new Map<string, string>();

  async get(farmId: string): Promise<StoredFarm | null> {
    checkId(farmId);
    const text = this.farms.get(farmId);
    return text === undefined ? null : (JSON.parse(text) as StoredFarm);
  }

  async put(farmId: string, farm: StoredFarm): Promise<void> {
    checkId(farmId);
    this.farms.set(farmId, JSON.stringify(farm));
  }

  async delete(farmId: string): Promise<void> {
    checkId(farmId);
    this.farms.delete(farmId);
  }
}

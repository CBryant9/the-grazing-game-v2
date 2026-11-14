import 'server-only';
import { mkdir, readFile, readdir, rename, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SavedFarm } from '@gg/engine';
import type {
  DateParts,
  FarmListItem,
  JobCardWire,
  PastDayWire,
  SetupChoices,
} from '../../lib/game/types';
import { DIARY_DAYS, type StoredDiaryDay } from './diary';
import { cleanDaily, type DailyStored } from '../daily/state';

/**
 * The version of what is kept for a farm. 1 had no `format` (milestone
 * 1.6). 2 added `format`, `version` and `done` (milestone 1.7f). 3 added the
 * `diary` (milestone 1.7g). An older farm is brought up to date when it is
 * read (`upgradeStored`), with an empty diary.
 */
export const STORED_FORMAT = 3;

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
  /** The days lived, oldest first, at most `DIARY_DAYS` of them. */
  diary: StoredDiaryDay[];
  /**
   * The farm days a pay day was missed (milestone 2.2), for the Workforce
   * panel's "Wages missed once in the last year." Left out until the first
   * one. Only days from the last year are kept.
   */
  missedWages?: number[];
  /** What only a Daily Farm keeps (milestone 3.3). Left out for a Fast Farm. */
  daily?: DailyStored;
}

/** A stored farm that could not be read: bad JSON, or not a farm at all. */
export class BrokenFarmError extends Error {}
/** Someone else's save got in first: the version this write expected is not the farm's now. */
export class SaveConflictError extends Error {}
/** The account has no room for another farm (the database's farm limit). */
export class FarmLimitError extends Error {}
/** The store could not do it right now (a lost connection, a timeout). Worth trying again. */
export class StoreUnavailableError extends Error {}

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
    ...(Array.isArray(raw.missedWages)
      ? {
          missedWages: (raw.missedWages as unknown[]).filter(
            (d) => typeof d === 'number',
          ) as number[],
        }
      : {}),
    ...(cleanDaily(raw.daily) ? { daily: cleanDaily(raw.daily)! } : {}),
    // A farm from before the diary has none. It is not broken: the diary starts now.
    diary: Array.isArray(raw.diary) ? (raw.diary as StoredDiaryDay[]).slice(-DIARY_DAYS) : [],
  };
}

/** Who a farm belongs to: a guest's session (the browser's secret), or an account. */
export type Owner = { kind: 'guest'; session: string } | { kind: 'user'; id: string };

/** What the store needs to know about a farm beyond the save: the facts the lists and the database keep. */
export interface FarmFacts {
  name: string;
  district: string;
  districtName: string;
  size: string;
  sizeHa: number;
  enterprise: string;
  startType: string;
  difficulty: string;
  years: string;
  engineVersion: string;
  day: number;
  date: DateParts;
  /** Why the game ended, or null while it is going. */
  over: string | null;
  /** A Daily Farm (milestone 3.3): its mode, time zone and the last local date simulated. Left out for a Fast Farm. */
  daily?: { timezone: string; simThrough: string };
}

/** One job or skip, for the action log (PRD 14.5). The file store does not keep it. */
export interface ActionLogEntry {
  day: number;
  requestId?: string;
  action: unknown;
  ok: boolean;
  reason?: string;
}

export interface PutOptions {
  /**
   * The version the farm had when it was loaded. Required: the write only goes ahead if that
   * is still the farm's version, so two tabs can not both win, and a caller can not forget
   * to ask. Making a farm is its own call (`create`). The file store, which has one process,
   * does not check it.
   */
  expect: string;
  facts?: FarmFacts;
  /** The days whose diary lines changed, so a database writes only those. */
  diaryDays?: number[];
  action?: ActionLogEntry;
  /** The farm on its new day, kept for "see the farm on a past day". */
  past?: PastDayWire;
  /**
   * A Daily Farm simulated through this local date (milestone 3.3). The database store moves
   * the farm's clock (`daily_finish`) in the same transaction as the save, with the server's
   * time in `at` (ms). `daily_finish` refuses a day that is not over in the farm's time zone.
   */
  dailyThrough?: { date: string; at: number };
}

/** Farms with days owed, found for the rollover (database only). */
export interface DailyClaim {
  farmId: string;
  daysOwed: number;
  localToday: string;
}

/**
 * Past days kept for each farm. The database keeps every day for the last 14, then one a week
 * back to 182 days (26 weeks): at most 14 + 24 = 38 pictures. The file store keeps the last 14
 * days only: it is for one machine. The cap is there because each picture is the whole map. It
 * is 45 to 48 KB as JSON and 3.5 to 4.7 KB gzipped (measured on every district, size and
 * enterprise, 15 Nov 2026), so a full farm holds at most about 180 KB, and 1,000 farms at most
 * about 180 MB. (The first design, 90 days then weekly to 400, was 134 pictures: 630 MB for
 * 1,000 farms gzipped, 6 GB raw, too much for a small database.)
 */
export const PAST_FILE_DAYS = 14;
export const PAST_DAILY_DAYS = 14;
export const PAST_MAX_DAYS = 182;

/** Is the picture of `day` kept, when `newest` is the farm's latest day? */
export function pastKept(day: number, newest: number, mode: 'file' | 'db' = 'db'): boolean {
  const age = newest - day;
  if (age < 0) return false;
  if (mode === 'file') return age < PAST_FILE_DAYS;
  if (age < PAST_DAILY_DAYS) return true;
  return age < PAST_MAX_DAYS && day % 7 === 0;
}

/**
 * Where farms are kept: files (the default, and what a machine with no
 * database keys uses) or the database. The key is the farm's id, never a
 * session id.
 */
export interface FarmStore {
  readonly kind: 'file' | 'db';
  /** The farm as it was kept (not yet upgraded), or null if there is none. Throws `BrokenFarmError` if it can't be read. */
  get(farmId: string): Promise<unknown>;
  /** Make a farm for an owner. Throws `FarmLimitError` when the account has no room. */
  create(farmId: string, owner: Owner, farm: StoredFarm, facts: FarmFacts): Promise<void>;
  /** Keep a changed farm. Throws `SaveConflictError` when `options.expect` is not its version now. */
  put(farmId: string, farm: StoredFarm, options: PutOptions): Promise<void>;
  delete(farmId: string): Promise<void>;
  /** Move a farm that can't be read out of the way, kept under another name. */
  setAside(farmId: string): Promise<void>;
  /** Mark a farm as used now, so it is not removed as stale. */
  touch(farmId: string): Promise<void>;
  /** How many farms there are. */
  count(): Promise<number>;
  /** Remove stale farms. The file store removes those last used before `before` (ms); the database applies its own 30 days for guests. Returns how many went. */
  prune(before: number): Promise<number>;
  /**
   * May this guest session reach this farm? `free`: there is no such farm. `ok`: the farm is
   * still owned by this guest session, which has not been moved into an account. `denied`:
   * the farm exists and is not this session's (an account's now, or another guest's), or the
   * session was converted. A guest key reads, writes and deletes only on `ok` or `free`. Only a
   * store that records owners has it (the file store has none to keep apart).
   */
  guestAccess?(farmId: string, session: string): Promise<'ok' | 'free' | 'denied'>;
  /** The farm's version now, cheaply. A store shared between servers has it, so a cached copy can be checked. */
  version?(farmId: string): Promise<string | null>;
  /** An owner's farms, most recently played first. */
  list(owner: Owner): Promise<FarmListItem[]>;
  /** Who owns a farm, or null if there is no such farm (or the store does not know). */
  ownerOf(farmId: string): Promise<Owner | null>;
  /** The farm on a past day, or null. */
  past(farmId: string, day: number): Promise<PastDayWire | null>;
  /** The days that have a picture kept, newest first. */
  pastDays(farmId: string): Promise<number[]>;
  /** The rollover (milestone 3.3, database only): claim up to `batch` Daily Farms with days owed at `at` (ms). */
  dailyClaim?(batch: number, at: number): Promise<DailyClaim[]>;
  /** Give up a claim, so the next run picks the farm up at once. */
  dailyRelease?(farmId: string): Promise<void>;
}

const ID = /^[0-9a-f]{32}$/;
const FARM_FILE = /^[0-9a-f]{32}\.json$/;
const ASIDE_FILE = /^[0-9a-f]{32}\.broken-\d+\.json$/;
const PAST_DIR = /^[0-9a-f]{32}\.past$/;

function checkId(farmId: string): void {
  if (!ID.test(farmId)) throw new Error('That is not a farm id.');
}

/** One JSON file for each farm, in a folder that git ignores. */
export class FileFarmStore implements FarmStore {
  readonly kind = 'file' as const;
  constructor(private readonly dir: string) {}

  private file(farmId: string): string {
    checkId(farmId);
    return join(this.dir, `${farmId}.json`);
  }

  private pastDir(farmId: string): string {
    checkId(farmId);
    return join(this.dir, `${farmId}.past`);
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

  private async write(farmId: string, farm: StoredFarm): Promise<void> {
    const file = this.file(farmId);
    await mkdir(this.dir, { recursive: true });
    // Write beside it, then rename, so a crash never leaves half a farm.
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(farm), 'utf8');
    await rename(temp, file);
  }

  async create(farmId: string, _owner: Owner, farm: StoredFarm): Promise<void> {
    await this.write(farmId, farm);
  }

  async put(farmId: string, farm: StoredFarm, options: PutOptions): Promise<void> {
    await this.write(farmId, farm);
    if (options.past) await this.keepPast(farmId, options.past);
  }

  private async keepPast(farmId: string, past: PastDayWire): Promise<void> {
    const dir = this.pastDir(farmId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${past.day}.json`), JSON.stringify(past), 'utf8');
    for (const name of await readdir(dir)) {
      const m = /^(\d+)\.json$/.exec(name);
      if (m && !pastKept(Number(m[1]), past.day, 'file')) {
        await rm(join(dir, name), { force: true });
      }
    }
  }

  async delete(farmId: string): Promise<void> {
    await rm(this.file(farmId), { force: true });
    await rm(this.pastDir(farmId), { recursive: true, force: true });
  }

  async setAside(farmId: string): Promise<void> {
    const file = this.file(farmId);
    try {
      await rename(file, join(this.dir, `${farmId}.broken-${Date.now()}.json`));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
    await rm(this.pastDir(farmId), { recursive: true, force: true });
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
          if (FARM_FILE.test(f)) {
            await rm(join(this.dir, `${f.slice(0, 32)}.past`), { recursive: true, force: true });
            gone++;
          } else gone++;
        }
      } catch {
        // Gone already, or in use: leave it for the next time.
      }
    }
    // Pictures whose farm is gone.
    const names = new Set(await this.names());
    for (const f of names) {
      if (PAST_DIR.test(f) && !names.has(`${f.slice(0, 32)}.json`)) {
        await rm(join(this.dir, f), { recursive: true, force: true });
      }
    }
    return gone;
  }

  /** Files hold no accounts: the file store is for guests, so a list is the one farm there is, found by the caller. */
  async list(): Promise<FarmListItem[]> {
    return [];
  }

  async ownerOf(): Promise<Owner | null> {
    return null;
  }

  async past(farmId: string, day: number): Promise<PastDayWire | null> {
    if (!Number.isInteger(day) || day < 0) return null;
    try {
      return JSON.parse(
        await readFile(join(this.pastDir(farmId), `${day}.json`), 'utf8'),
      ) as PastDayWire;
    } catch {
      return null;
    }
  }

  async pastDays(farmId: string): Promise<number[]> {
    try {
      return (await readdir(this.pastDir(farmId)))
        .map((n) => /^(\d+)\.json$/.exec(n))
        .flatMap((m) => (m ? [Number(m[1])] : []))
        .sort((a, b) => b - a);
    } catch {
      return [];
    }
  }
}

interface Kept {
  text: string;
  used: number;
  owner: Owner | null;
  name: string;
  districtName: string;
  day: number;
  version: string;
}

/** Farms in memory only. For tests. */
export class MemoryFarmStore implements FarmStore {
  readonly kind: 'file' | 'db' = 'file';
  private readonly farms = new Map<string, Kept>();
  private readonly aside: Kept[] = [];
  private readonly pasts = new Map<string, Map<number, PastDayWire>>();
  /** The clock this store reads, so a test can move it. */
  now: () => number = () => Date.now();
  /** For tests: refuse a write whose expected version is not the farm's, as the database store does. Off, as the file store is. */
  enforceVersions = false;
  /** For tests: make the next `put` calls fail this way. */
  failPuts: { times: number; error: Error } | null = null;
  /** For tests: how many writes were made. */
  writes = 0;

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

  private keep(farmId: string, farm: StoredFarm, owner: Owner | null, facts?: FarmFacts): void {
    const before = this.farms.get(farmId);
    this.farms.set(farmId, {
      text: JSON.stringify(farm),
      used: this.now(),
      owner: owner ?? before?.owner ?? null,
      name: farm.name,
      districtName: facts?.districtName ?? before?.districtName ?? '',
      day: facts?.day ?? before?.day ?? 0,
      version: farm.version,
    });
  }

  async create(farmId: string, owner: Owner, farm: StoredFarm, facts: FarmFacts): Promise<void> {
    checkId(farmId);
    this.keep(farmId, farm, owner, facts);
  }

  async put(farmId: string, farm: StoredFarm, options: PutOptions): Promise<void> {
    checkId(farmId);
    if (this.failPuts && this.failPuts.times > 0) {
      this.failPuts.times--;
      throw this.failPuts.error;
    }
    const there = this.farms.get(farmId);
    if (this.enforceVersions && there?.version !== options.expect) {
      throw new SaveConflictError('The farm changed.');
    }
    this.writes++;
    this.keep(farmId, farm, null, options.facts);
    if (options.past) {
      const m = this.pasts.get(farmId) ?? new Map();
      m.set(options.past.day, options.past);
      for (const d of m.keys()) if (!pastKept(d, options.past.day, 'file')) m.delete(d);
      this.pasts.set(farmId, m);
    }
  }

  /** For tests: keep this text as the farm, as if the file had been damaged. */
  putRaw(farmId: string, text: string): void {
    checkId(farmId);
    this.farms.set(farmId, {
      text,
      used: this.now(),
      owner: null,
      name: '',
      districtName: '',
      day: 0,
      version: '',
    });
  }

  async delete(farmId: string): Promise<void> {
    checkId(farmId);
    this.farms.delete(farmId);
    this.pasts.delete(farmId);
  }

  async setAside(farmId: string): Promise<void> {
    checkId(farmId);
    const f = this.farms.get(farmId);
    if (f) this.aside.push(f);
    this.farms.delete(farmId);
    this.pasts.delete(farmId);
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
        this.pasts.delete(id);
        gone++;
      }
    }
    return gone;
  }

  async list(owner: Owner): Promise<FarmListItem[]> {
    const same = (o: Owner | null): boolean =>
      o !== null &&
      o.kind === owner.kind &&
      (o.kind === 'guest'
        ? o.session === (owner as { session: string }).session
        : o.id === (owner as { id: string }).id);
    return [...this.farms.entries()]
      .filter(([, f]) => same(f.owner))
      .map(([id, f]) => ({
        id,
        name: f.name,
        mode: 'fast' as const,
        date: null,
        work: null,
        districtName: f.districtName,
        day: f.day,
        lastPlayed: f.used,
        current: false,
      }))
      .sort((a, b) => b.lastPlayed - a.lastPlayed);
  }

  async ownerOf(farmId: string): Promise<Owner | null> {
    return this.farms.get(farmId)?.owner ?? null;
  }

  async past(farmId: string, day: number): Promise<PastDayWire | null> {
    return this.pasts.get(farmId)?.get(day) ?? null;
  }

  async pastDays(farmId: string): Promise<number[]> {
    return [...(this.pasts.get(farmId)?.keys() ?? [])].sort((a, b) => b - a);
  }
}

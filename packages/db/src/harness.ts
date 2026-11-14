/**
 * Test harness for the Supabase database, run on PGlite (Postgres in WASM).
 *
 * It loads the test-only stand-ins for what Supabase supplies
 * (stand-ins/supabase.sql), then every migration in supabase/migrations in
 * order, then supabase/seed.sql. Each check runs inside a transaction that
 * is rolled back, so one check never changes what the next one sees.
 *
 * What this proves: the rules on Postgres semantics (grants, row level
 * security, triggers, functions). What it does not: Supabase's own services
 * (Auth, PostgREST, Storage). One run against a real Supabase project is
 * still owed before launch (docs/DATABASE.md).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '../../..');
export const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
export const SEED_FILE = join(ROOT, 'supabase', 'seed.sql');
export const STAND_INS_FILE = join(here, 'stand-ins', 'supabase.sql');

/** The migration files, in the order Supabase applies them (by name). */
export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f))
    .sort();
}

/** The seed accounts, farms and rows the tests use (supabase/seed.sql). */
export const ID = {
  admin: '00000000-0000-4000-8000-00000000000a',
  a: '00000000-0000-4000-8000-000000000001',
  b: '00000000-0000-4000-8000-000000000002',
  u16: '00000000-0000-4000-8000-000000000003',
  /** cara_cropper, an adult Ben has blocked. */
  c: '00000000-0000-4000-8000-000000000004',
  /** An auth user with no profile yet, made by the tests that need one. */
  fresh: '00000000-0000-4000-8000-000000000009',
  guest: '00000000-0000-4000-8000-0000000000e1',
  farmA: 'f0000000-0000-4000-8000-0000000000a1',
  dailyA: 'f0000000-0000-4000-8000-0000000000a2',
  farmB: 'f0000000-0000-4000-8000-0000000000b1',
  farmU16: 'f0000000-0000-4000-8000-0000000000c1',
  farmGuest: 'f0000000-0000-4000-8000-0000000000d1',
  group: '00000000-0000-4000-8000-0000000000f1',
  postA: '00000000-0000-4000-8000-0000000001a1',
  dayCardA: '00000000-0000-4000-8000-0000000001a2',
  groupPostA: '00000000-0000-4000-8000-0000000001a3',
  postB: '00000000-0000-4000-8000-0000000002a1',
  photoApproved: '00000000-0000-4000-8000-0000000003a1',
  photoPending: '00000000-0000-4000-8000-0000000003a2',
  commentB: '00000000-0000-4000-8000-0000000004b1',
  replyA: '00000000-0000-4000-8000-0000000004a1',
  reportB: '00000000-0000-4000-8000-0000000005b1',
  challengePublic: '00000000-0000-4000-8000-0000000006a1',
  challengeGroup: '00000000-0000-4000-8000-0000000006a2',
  purchaseB: '00000000-0000-4000-8000-0000000000c1',
} as const;

/** Who a check runs as. */
export type Who = 'anon' | 'a' | 'b' | 'u16' | 'admin' | 'service';
export const EVERYONE: readonly Who[] = ['anon', 'a', 'b', 'u16', 'admin', 'service'];

/** The account id each one acts for. A visitor has none; its id slot is used to try to act as A. */
export const ME: Record<Who, string> = {
  anon: ID.a,
  a: ID.a,
  b: ID.b,
  u16: ID.u16,
  admin: ID.admin,
  service: ID.a,
};

/** The SQL that makes the rest of a transaction run as one of them, with their token's claims. */
export function becomeSql(who: Who): string {
  if (who === 'anon') {
    return `set local role anon; select set_config('request.jwt.claims', '{"role":"anon"}', true);`;
  }
  if (who === 'service') {
    return `set local role service_role; select set_config('request.jwt.claims', '{"role":"service_role"}', true);`;
  }
  const claims = JSON.stringify({ sub: ME[who], role: 'authenticated', aud: 'authenticated' });
  return `set local role authenticated; select set_config('request.jwt.claims', '${claims}', true);`;
}

export type Outcome =
  | { ok: true; rows: Record<string, unknown>[]; affected: number }
  | { ok: false; error: string; code: string | undefined };

/** Did it work and touch at least one row? RLS refuses some writes by touching none. */
export const passed = (o: Outcome): boolean =>
  o.ok && (o.rows.length > 0 || o.affected > 0);

function failure(e: unknown): Outcome {
  const err = e as { message?: string; code?: string };
  return { ok: false, error: err.message ?? String(e), code: err.code };
}

/** A fresh database: stand-ins, every migration, and (by default) the seed. */
export async function freshDb(options: { seed?: boolean } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(readFileSync(STAND_INS_FILE, 'utf8'));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  if (options.seed !== false) {
    try {
      await db.exec(readFileSync(SEED_FILE, 'utf8'));
    } catch (e) {
      throw new Error(`seed.sql failed: ${(e as Error).message}`);
    }
  }
  return db;
}

/**
 * Run statements as someone, in one transaction that is always rolled back.
 * `prep` runs first as the database owner (to set the scene). Returns the
 * outcome of each statement; once one fails the rest are not run.
 */
export async function asMany(
  db: PGlite,
  who: Who,
  statements: readonly string[],
  prep?: string,
): Promise<Outcome[]> {
  const out: Outcome[] = [];
  await db.exec('begin');
  try {
    if (prep) await db.exec(prep);
    await db.exec(becomeSql(who));
    for (const sql of statements) {
      try {
        const r = await db.query<Record<string, unknown>>(sql);
        out.push({ ok: true, rows: r.rows, affected: r.affectedRows ?? 0 });
      } catch (e) {
        out.push(failure(e));
        break;
      }
    }
  } finally {
    await db.exec('rollback');
  }
  return out;
}

/** Run one statement as someone, rolled back afterwards. */
export async function as(db: PGlite, who: Who, sql: string, prep?: string): Promise<Outcome> {
  const [o] = await asMany(db, who, [sql], prep);
  if (!o) throw new Error('No outcome: the prep or the role change failed.');
  return o;
}

/** Rows of a query run as the database owner. */
export async function rows<T = Record<string, unknown>>(db: PGlite, sql: string): Promise<T[]> {
  return (await db.query<T>(sql)).rows;
}

/** The switches the community checks need. */
export const COMMUNITY_SWITCHES = [
  'community',
  'feed_posts',
  'groups',
  'activity_ticker',
  'farm_viewing',
  'leaderboards',
] as const;

export const switchesSql = (keys: readonly string[], on: boolean): string =>
  `update public.feature_switches set enabled = ${on} where key in (${keys
    .map((k) => `'${k}'`)
    .join(', ')});`;

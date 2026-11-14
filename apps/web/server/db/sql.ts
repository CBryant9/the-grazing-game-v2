import 'server-only';

/**
 * A small SQL client, so the database store and the account code do not care
 * what runs the SQL. The tests run it on PGlite (packages/db). The site runs
 * it on a Postgres connection pool (`pg`) to the Supabase database, opened
 * from SUPABASE_DB_POOLER_URL with the secret that only the server has.
 *
 * Parameters are values only, never SQL text. Objects go in as JSON text
 * with a cast (`$1::jsonb`), so every driver treats them the same.
 */

export interface SqlResult<T> {
  rows: T[];
  /** Rows changed or returned. */
  rowCount: number;
}

export interface SqlRunner {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<SqlResult<T>>;
}

export interface SqlClient extends SqlRunner {
  /** Run several statements as one: all happen or none do. */
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

/** The environment variable holding the pooled connection string. Server only. */
export const DB_URL_ENV = 'SUPABASE_DB_POOLER_URL';

declare global {
  var __ggSql: SqlClient | undefined;
}

/** The database client for this process, or null when no connection string is set. */
export function sqlFromEnv(): SqlClient | null {
  const url = process.env[DB_URL_ENV]?.trim();
  if (!url) return null;
  globalThis.__ggSql ??= pgClient(url);
  return globalThis.__ggSql;
}

/** True when the database is configured. Everything database-shaped asks this first. */
export const databaseOn = (): boolean => Boolean(process.env[DB_URL_ENV]?.trim());

interface PgLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  connect(): Promise<{
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
    release(error?: boolean): void;
  }>;
}

/** A pool of a few connections (a serverless function needs very few). Opened on first use. */
function pgClient(url: string): SqlClient {
  let pool: PgLike | null = null;
  const get = async (): Promise<PgLike> => {
    if (!pool) {
      const { Pool } = await import('pg');
      pool = new Pool({
        connectionString: url,
        max: 4,
        idleTimeoutMillis: 10_000,
        connectionTimeoutMillis: 5_000,
        statement_timeout: 10_000,
      }) as unknown as PgLike;
    }
    return pool;
  };
  const run = (c: PgLike | Awaited<ReturnType<PgLike['connect']>>): SqlRunner => ({
    async query<T>(text: string, params?: unknown[]) {
      const r = await c.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
    },
  });
  return {
    async query<T>(text: string, params?: unknown[]) {
      return run(await get()).query<T>(text, params);
    },
    async transaction<T>(fn: (tx: SqlRunner) => Promise<T>) {
      const client = await (await get()).connect();
      let broken = false;
      try {
        await client.query('begin');
        const out = await fn(run(client));
        await client.query('commit');
        return out;
      } catch (e) {
        try {
          await client.query('rollback');
        } catch {
          broken = true;
        }
        throw e;
      } finally {
        client.release(broken);
      }
    },
  };
}

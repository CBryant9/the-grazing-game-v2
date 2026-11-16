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

interface Conn {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  release(error?: boolean): void;
}
export interface PgLike {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
  connect(): Promise<Conn>;
}

/** The role every statement runs as. The pooler connects as an owner; the server drops to this. */
export const SERVER_ROLE = 'service_role';

/**
 * A client on a pool. Every statement, even a single one, runs inside a transaction that begins
 * with `set local role service_role`, so the server has the rights of Supabase's service role
 * and no more (it is not the database owner), and the tests, which also run as `service_role`,
 * match it. `set local` lasts to the end of the transaction, so a pooled connection is never
 * left in another role for the next caller.
 */
export function clientOnPool(pool: PgLike): SqlClient {
  const run = (c: Conn): SqlRunner => ({
    async query<T>(text: string, params?: unknown[]) {
      const r = await c.query(text, params);
      return { rows: r.rows as T[], rowCount: r.rowCount ?? r.rows.length };
    },
  });
  const client: SqlClient = {
    query: (text, params) => client.transaction((tx) => tx.query(text, params)),
    async transaction<T>(fn: (tx: SqlRunner) => Promise<T>) {
      const conn = await pool.connect();
      let broken = false;
      try {
        await conn.query('begin');
        await conn.query(`set local role ${SERVER_ROLE}`);
        const out = await fn(run(conn));
        await conn.query('commit');
        return out;
      } catch (e) {
        try {
          await conn.query('rollback');
        } catch {
          broken = true;
        }
        throw e;
      } finally {
        conn.release(broken);
      }
    },
  };
  return client;
}

/** A pool of a few connections (a serverless function needs very few). Opened on first use. */
function pgClient(url: string): SqlClient {
  let pool: PgLike | null = null;
  const lazy: PgLike = {
    async query(text, params) {
      return (await open()).query(text, params);
    },
    async connect() {
      return (await open()).connect();
    },
  };
  async function open(): Promise<PgLike> {
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
  }
  return clientOnPool(lazy);
}

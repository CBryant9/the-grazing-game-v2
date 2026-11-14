import type { PGlite } from '@electric-sql/pglite';
import type { SqlClient, SqlRunner } from '../db/sql';

/**
 * The SQL client the tests give the database store: PGlite (real Postgres in WASM, with the
 * migrations applied by packages/db/src/harness.ts). Every statement runs as `service_role`, as
 * the server does on Supabase, so a store that needs a privilege the server lacks fails here.
 * PGlite has one connection, so two writes at once queue: the version check is what the race
 * tests prove, not parallel commits.
 */
export function pgliteSql(db: PGlite, role: string | null = 'service_role'): SqlClient {
  const runner = (exec: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
  }): SqlRunner => ({
    async query<T>(text: string, params?: unknown[]) {
      const r = await exec.query(text, params);
      return { rows: r.rows as T[], rowCount: r.affectedRows || r.rows.length };
    },
  });
  const client: SqlClient = {
    query: (text, params) => client.transaction((tx) => tx.query(text, params)),
    transaction: (fn) =>
      db.transaction(async (tx) => {
        if (role) await tx.exec(`set local role ${role}`);
        return fn(runner(tx));
      }),
  };
  return client;
}

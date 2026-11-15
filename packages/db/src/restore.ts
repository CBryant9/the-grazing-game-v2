/**
 * The restore drill (milestone 5.5): proves, on PGlite, that what is in the database can be
 * taken out and put back without losing or changing a row.
 *
 * Two kinds of copy are made of a database built from every migration and the seed:
 *
 * 1. A data dump. Every table in every schema the migrations make is written out with
 *    `COPY ... TO`, with each sequence's value. It is put back into a fresh database built from
 *    the migrations alone, with triggers held off while the rows go in (as `pg_dump --data-only
 *    --disable-triggers` does). This is the shape of a restore into a new Supabase project:
 *    schema from the migrations, data from the backup.
 * 2. A copy of the whole data folder (`dumpDataDir`), loaded into a new PGlite. This is the
 *    shape of Supabase's own daily backup, which restores the whole database as it was.
 *
 * Each copy is then compared with the original table by table: the row count and an md5 over
 * every row's text, sorted. `pg_dump` itself is not used: it is not installed on this PC, and
 * PGlite runs inside Node with no server for it to connect to.
 *
 * What this does not prove: Supabase's own backup and restore (that is in its dashboard), the
 * Storage files (photos), or the Auth service's state beyond the `auth` tables.
 */
import { PGlite } from '@electric-sql/pglite';
import { freshDb } from './harness';

/** Schemas the drill leaves out: Postgres's own. */
const SYSTEM_SCHEMAS = ['pg_catalog', 'information_schema', 'pg_toast'];

export interface TableCheck {
  table: string;
  rows: number;
  sum: string;
}

export interface TableDiff {
  table: string;
  before: TableCheck | null;
  after: TableCheck | null;
}

const quoteIdent = (s: string): string => `"${s.replace(/"/g, '""')}"`;
const qualified = (schema: string, table: string): string =>
  `${quoteIdent(schema)}.${quoteIdent(table)}`;

/** Every ordinary table outside Postgres's own schemas, as `schema.table`, sorted. */
export async function tablesOf(db: PGlite): Promise<{ schema: string; table: string }[]> {
  const r = await db.query<{ schema: string; table: string }>(
    `select schemaname as schema, tablename as table from pg_tables
      where schemaname <> all($1::text[]) order by 1, 2`,
    [SYSTEM_SCHEMAS],
  );
  return r.rows;
}

/** The row count and a checksum of every table. Rows are sorted by their text first, so order on disk does not matter. */
export async function checksums(db: PGlite): Promise<TableCheck[]> {
  const out: TableCheck[] = [];
  for (const { schema, table } of await tablesOf(db)) {
    const r = await db.query<{ n: number; sum: string }>(
      `select count(*)::int as n,
              md5(coalesce(string_agg(t::text, E'\\n' order by t::text), '')) as sum
         from ${qualified(schema, table)} t`,
    );
    out.push({ table: `${schema}.${table}`, rows: r.rows[0]!.n, sum: r.rows[0]!.sum });
  }
  return out;
}

/** Tables whose count or checksum differ, or that are on one side only. */
export function compare(before: TableCheck[], after: TableCheck[]): TableDiff[] {
  const a = new Map(before.map((c) => [c.table, c]));
  const b = new Map(after.map((c) => [c.table, c]));
  const names = [...new Set([...a.keys(), ...b.keys()])].sort();
  return names.flatMap((table) => {
    const x = a.get(table) ?? null;
    const y = b.get(table) ?? null;
    return x && y && x.rows === y.rows && x.sum === y.sum ? [] : [{ table, before: x, after: y }];
  });
}

/** A data dump: each table's rows in Postgres's COPY text form, and each sequence's value. */
export interface DataDump {
  format: 1;
  tables: { schema: string; table: string; copy: string }[];
  sequences: { schema: string; name: string; value: string; called: boolean }[];
}

/** Write every table and sequence out. */
export async function dumpData(db: PGlite): Promise<DataDump> {
  const tables: DataDump['tables'] = [];
  for (const { schema, table } of await tablesOf(db)) {
    const r = await db.query(`copy ${qualified(schema, table)} to '/dev/blob'`);
    const blob = r.blob;
    tables.push({ schema, table, copy: blob ? await blob.text() : '' });
  }
  const seqs = await db.query<{ schema: string; name: string }>(
    `select schemaname as schema, sequencename as name from pg_sequences
      where schemaname <> all($1::text[]) order by 1, 2`,
    [SYSTEM_SCHEMAS],
  );
  const sequences: DataDump['sequences'] = [];
  for (const { schema, name } of seqs.rows) {
    const v = await db.query<{ last_value: string; is_called: boolean }>(
      `select last_value::text, is_called from ${qualified(schema, name)}`,
    );
    sequences.push({
      schema,
      name,
      value: v.rows[0]!.last_value,
      called: v.rows[0]!.is_called,
    });
  }
  return { format: 1, tables, sequences };
}

/**
 * Put a data dump into a database built from the same migrations. Rows the migrations put in
 * (switches, reference data) are cleared first, so the dump's rows are the only ones. Triggers,
 * including the foreign key checks, are held off while the rows go in, as `pg_dump
 * --disable-triggers` does, so the order of tables does not matter.
 */
export async function restoreData(db: PGlite, dump: DataDump): Promise<void> {
  if (dump.format !== 1) throw new Error('That dump is from a newer drill.');
  const have = new Set((await tablesOf(db)).map((t) => `${t.schema}.${t.table}`));
  for (const t of dump.tables) {
    if (!have.has(`${t.schema}.${t.table}`)) {
      throw new Error(`The new database has no table ${t.schema}.${t.table}.`);
    }
  }
  await db.exec('begin');
  try {
    await db.exec(`set local session_replication_role = replica`);
    const all = dump.tables.map((t) => qualified(t.schema, t.table)).join(', ');
    if (all) await db.exec(`truncate ${all}`);
    for (const t of dump.tables) {
      if (!t.copy) continue;
      await db.query(`copy ${qualified(t.schema, t.table)} from '/dev/blob'`, [], {
        blob: new Blob([t.copy]),
      });
    }
    for (const s of dump.sequences) {
      await db.query(`select setval($1::regclass, $2::bigint, $3)`, [
        qualified(s.schema, s.name),
        s.value,
        s.called,
      ]);
    }
    await db.exec('commit');
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}

/** Rows the drill adds so every kind of row a player makes is in the copy, beyond the seed. */
export const EXTRA_ROWS_SQL = `
  insert into public.admin_audit_log (admin_id, action, target_type, target_id)
    values ('00000000-0000-4000-8000-00000000000a', 'restore_drill', 'drill', 'drill_1');
`;

export interface DrillResult {
  tables: TableCheck[];
  dataDiffs: TableDiff[];
  folderDiffs: TableDiff[];
  dumpBytes: number;
  folderBytes: number;
}

/** Build, copy both ways, restore and compare. */
export async function runDrill(): Promise<DrillResult> {
  const source = await freshDb();
  try {
    await source.exec(EXTRA_ROWS_SQL);
    const tables = await checksums(source);

    const dump = await dumpData(source);
    const target = await freshDb({ seed: false });
    let dataDiffs: TableDiff[];
    try {
      await restoreData(target, dump);
      dataDiffs = compare(tables, await checksums(target));
    } finally {
      await target.close();
    }

    const folder = await source.dumpDataDir('gzip');
    const copy = await PGlite.create({ loadDataDir: folder });
    let folderDiffs: TableDiff[];
    try {
      folderDiffs = compare(tables, await checksums(copy));
    } finally {
      await copy.close();
    }

    return {
      tables,
      dataDiffs,
      folderDiffs,
      dumpBytes: Buffer.byteLength(JSON.stringify(dump)),
      folderBytes: folder.size,
    };
  } finally {
    await source.close();
  }
}

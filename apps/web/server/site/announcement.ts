import { checkAnnouncement } from '@/lib/announcement';

/*
 * Read by the home page at build time (pages router, `getStaticProps`). A pages-router page can
 * not load a module marked `server-only`, so this file is not marked and does not use the
 * server's SQL client (`server/db/sql.ts`). It runs only inside `getStaticProps`, which never
 * reaches the browser, and the home page sends no script at all. It reads one public setting.
 */

/** The home page's announcement bar: one line, and an optional link (PRD 11.8). */
export interface Announcement {
  text: string;
  /** A page on this site (starting with /) or an https address, or none. */
  link: string | null;
}

/** Runs one query and gives the rows. The tests pass a stand-in. */
export type ReadRows = (text: string) => Promise<{ value: unknown }[]>;

/** The same variable and role as the server's SQL client (`server/db/sql.ts`). */
const DB_URL_ENV = 'SUPABASE_DB_POOLER_URL';
const SERVER_ROLE = 'service_role';

/** True when a database is configured. */
export const announcementDbOn = (): boolean => Boolean(process.env[DB_URL_ENV]?.trim());

/** One short connection, as the server's role, for a build or a rebuild. */
const readFromDb: ReadRows = async (text) => {
  const { Client } = await import('pg');
  const client = new Client({
    connectionString: process.env[DB_URL_ENV]!.trim(),
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  await client.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${SERVER_ROLE}`);
    const r = await client.query<{ value: unknown }>(text);
    await client.query('commit');
    return r.rows;
  } finally {
    await client.end().catch(() => undefined);
  }
};

/**
 * The admin's announcement, or null when there is none. The stored value is checked again with
 * the same rules the admin's form uses, so nothing that would be refused there reaches the page.
 * No database, or a database fault, gives null: the home page is still built, without the bar.
 */
export async function readAnnouncement(
  read: ReadRows | null = announcementDbOn() ? readFromDb : null,
): Promise<Announcement | null> {
  if (!read) return null;
  try {
    const rows = await read(`select value from public.site_settings where key = 'announcement'`);
    const r = checkAnnouncement(rows[0]?.value ?? null);
    if (!r.ok || !r.value.text) return null;
    return { text: r.value.text, link: r.value.link };
  } catch {
    return null;
  }
}

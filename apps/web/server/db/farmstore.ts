import 'server-only';
import { join } from 'node:path';
import { FileFarmStore, type FarmStore } from '../game/store';
import { DbFarmStore } from './dbstore';
import { sqlFromEnv } from './sql';

/**
 * The store the game uses. With a database connection set (SUPABASE_DB_POOLER_URL)
 * farms live in the database. With none set, farms are files under
 * GG_FARMS_DIR (or `.farms`), exactly as before accounts existed.
 */
export function configuredStore(): FarmStore {
  const sql = sqlFromEnv();
  if (sql) return new DbFarmStore(sql);
  return new FileFarmStore(process.env.GG_FARMS_DIR ?? join(process.cwd(), '.farms'));
}

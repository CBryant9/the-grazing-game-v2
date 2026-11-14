import 'server-only';
import { databaseOn } from '../db/sql';

/** Where farms are kept right now: `db` when a database connection is set, `file` otherwise. */
export const gameStoreKind = (): 'file' | 'db' => (databaseOn() ? 'db' : 'file');

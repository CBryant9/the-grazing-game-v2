import 'server-only';
import { featureSwitches } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { sqlFromEnv, type SqlClient } from '../db/sql';
import { logFailure } from '../logging';
import { activeAdmin } from './gate';
import {
  DEFAULT_MAINTENANCE_WORDING,
  MAINTENANCE_SETTING,
  MAINTENANCE_WORDINGS,
} from './info';

/**
 * Maintenance mode for the game routes. While the `maintenance_mode` switch is on, every game
 * request from anyone but an admin in good standing is refused with a 503, the code
 * `maintenance`, and one of a fixed set of plain wordings (info.ts). No free text from the
 * admin ever reaches a player: the setting holds only the id of a wording, and an id that is
 * not on the list gives the default.
 *
 * What this means for a save:
 * - A request already past this check finishes. A save is one database transaction with a
 *   version check, so it is stored whole or not at all.
 * - A request that arrives after is refused before it touches the farm, so nothing is half done
 *   and the farm is exactly as the player last saw it.
 *
 * The switch is read through `featureSwitches`, cached for 30 seconds on each server, so a
 * change shows within 30 seconds everywhere and at once on the server the admin used.
 * If the database can not be read the switch falls back to its default (off): the game is never
 * taken down by a database fault.
 */

export const MAINTENANCE_CODE = 'maintenance';

/** The wording for an id, or the default. */
export function wordingText(id: unknown): string {
  return (
    MAINTENANCE_WORDINGS.find((w) => w.id === id)?.text ??
    MAINTENANCE_WORDINGS.find((w) => w.id === DEFAULT_MAINTENANCE_WORDING)!.text
  );
}

/** The message a player sees, or null when the game is open to this caller. */
export async function maintenanceNotice(
  userId: string | null,
  sql: SqlClient | null = authDeps()?.sql ?? sqlFromEnv(),
): Promise<string | null> {
  if (!sql) return null;
  const switches = await featureSwitches(sql);
  if (!switches.maintenance_mode) return null;
  try {
    if (userId && (await activeAdmin(sql, userId))) return null;
    const r = await sql.query<{ value: { id?: unknown } | null }>(
      'select value from public.site_settings where key = $1',
      [MAINTENANCE_SETTING],
    );
    return wordingText(r.rows[0]?.value?.id);
  } catch (e) {
    logFailure({ route: 'game-maintenance', reason: 'maintenance_read_failed' }, e);
    return wordingText(null);
  }
}

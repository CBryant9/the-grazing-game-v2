import 'server-only';
import { featureSwitches } from '../auth/accounts';
import { authDeps } from '../auth/deps';
import { sqlFromEnv } from '../db/sql';

/**
 * The game's own switches (milestone 2.8): sheep, for now.
 *
 * With the database the admin switches are read (`featureSwitches`, cached 30 seconds). With no
 * database (farm files, local play and tests of the browser) the shared defaults apply, which
 * have sheep off; `GG_SWITCHES_ON` turns game switches on there for a local check only:
 *
 *   GG_SWITCHES_ON=sheep
 *
 * It is never read while a database is set, so it can not override the admin.
 */
export const LOCAL_SWITCHES_ENV = 'GG_SWITCHES_ON';

export async function sheepSwitchOn(): Promise<boolean> {
  const sql = authDeps()?.sql ?? sqlFromEnv();
  if (!sql) {
    return (process.env[LOCAL_SWITCHES_ENV] ?? '')
      .split(',')
      .map((s) => s.trim())
      .includes('sheep');
  }
  return (await featureSwitches(sql)).sheep;
}

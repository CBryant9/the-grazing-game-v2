import 'server-only';
import type { SqlRunner } from '../db/sql';
import {
  DEFAULT_ZONE,
  localDate,
  minutesOfDay,
  parseClock,
  safeZone,
} from './clock';
import type { NotifyDeps } from './deps';
import { queueEvent } from './queue';

/**
 * The morning reminder and the one later reminder for Daily Farm (PRD 13, 5.15).
 *
 * The rules, all in the farm's own (locked) time zone:
 *  - the morning reminder goes at the time the player picked (default 7 am) and is made only
 *    within 3 hours after that time, so a scheduler that was down never sends a stale one;
 *  - the later reminder goes 6 hours after the morning time, within the same 3 hour window, and
 *    only if the player turned it on; a morning time after 5 pm has no later reminder that day;
 *  - neither goes if the player has already opened the farm that local day;
 *  - each is made once per farm per local day (the dedupe key), so nothing is ever sent twice, and
 *    nothing is sent for a day that was missed: yesterday is never caught up;
 *  - quiet hours are applied by the queue, which drops a reminder inside them;
 *  - nothing else, ever. There is no third reminder and no reminder about a missed day.
 *
 * It reads Daily Farm state through `DailyFarmReader`, so the Daily Farm code can supply its own
 * (with the count of things to check). `sqlDailyFarmReader` is the default: it reads the farms
 * table and knows no count, so the line is then "First light at Kooringa." without one.
 * Tests give a fake.
 */

export interface ReminderFarm {
  userId: string;
  farmId: string;
  farmName: string;
  /** The farm's locked time zone. */
  timezone: string;
  /** When the player last opened this farm, or null. */
  lastOpenedAt: Date | null;
  /** How many things need a look, or null when not known. */
  toCheck: number | null;
}

export interface DailyFarmReader {
  /** Active Daily Farms whose owners may want a reminder. */
  farms(): Promise<ReminderFarm[]>;
}

/** The default reader: every active Daily Farm of an account that has turned a reminder on. */
export function sqlDailyFarmReader(sql: SqlRunner, limit = 5000): DailyFarmReader {
  return {
    async farms() {
      const r = await sql.query<{
        user_id: string;
        id: string;
        name: string;
        timezone: string;
        last_opened_at: string | null;
      }>(
        `select f.owner_id as user_id, f.id, f.name, f.timezone, f.last_opened_at
           from public.farms f
          where f.mode = 'daily' and f.status = 'active' and f.owner_id is not null
            and exists (select 1 from public.notification_prefs p
                         where p.user_id = f.owner_id and p.kind in ('morning_reminder', 'later_nudge')
                           and (p.push or p.email))
          order by f.id
          limit $1`,
        [limit],
      );
      return r.rows.map((x) => ({
        userId: x.user_id,
        farmId: x.id,
        farmName: x.name,
        timezone: x.timezone,
        lastOpenedAt: x.last_opened_at ? new Date(x.last_opened_at) : null,
        toCheck: null,
      }));
    },
  };
}

let readerOverride: DailyFarmReader | undefined;

/**
 * For the Daily Farm code (and tests): the reader the scheduler uses instead of the default.
 * Call it once at start-up with a reader that also knows how many things need a look.
 */
export function setDailyFarmReader(reader: DailyFarmReader | undefined): void {
  readerOverride = reader;
}

export const dailyFarmReader = (sql: SqlRunner): DailyFarmReader =>
  readerOverride ?? sqlDailyFarmReader(sql);

export const REMINDER_WINDOW_MIN = 180;
export const NUDGE_AFTER_MIN = 360;
export const DEFAULT_REMINDER = '07:00';

export interface ReminderReport {
  looked: number;
  morning: number;
  nudge: number;
  skipped: number;
}

export async function runReminders(
  nd0: NotifyDeps,
  reader: DailyFarmReader,
  nowMs: number = nd0.integrations.now(),
): Promise<ReminderReport> {
  // Everything queued here is judged at this moment, so the quiet hours it applies are this moment's.
  const nd: NotifyDeps = { ...nd0, integrations: { ...nd0.integrations, now: () => nowMs } };
  const report: ReminderReport = { looked: 0, morning: 0, nudge: 0, skipped: 0 };
  const farms = await reader.farms();
  report.looked = farms.length;
  if (farms.length === 0) return report;
  const ids = [...new Set(farms.map((f) => f.userId))];
  const settings = await nd.sql.query<{
    user_id: string;
    reminder_time: string;
    later_nudge: boolean;
  }>(
    `select user_id, reminder_time::text, later_nudge from public.notification_settings
      where user_id = any($1::uuid[])`,
    [ids],
  );
  const by = new Map(settings.rows.map((s) => [s.user_id, s]));
  for (const f of farms) {
    const s = by.get(f.userId);
    const rt = parseClock(s?.reminder_time ?? DEFAULT_REMINDER) ?? 7 * 60;
    const zone = safeZone(f.timezone ?? DEFAULT_ZONE);
    const today = localDate(nowMs, zone);
    // Opened today: no reminder of either kind.
    if (f.lastOpenedAt && localDate(f.lastOpenedAt, zone) === today) {
      report.skipped++;
      continue;
    }
    const minute = minutesOfDay(nowMs, zone);
    try {
      if (minute >= rt && minute < rt + REMINDER_WINDOW_MIN) {
        const r = await queueEvent(
          nd,
          f.userId,
          { type: 'morning_reminder', farm: f.farmName, toCheck: f.toCheck },
          { farmId: f.farmId, dedupeKey: `morning:${f.farmId}:${today}` },
        );
        if (r.status === 'queued') report.morning++;
        else report.skipped++;
      } else if (
        (s?.later_nudge ?? true) &&
        rt + NUDGE_AFTER_MIN < 24 * 60 &&
        minute >= rt + NUDGE_AFTER_MIN &&
        minute < rt + NUDGE_AFTER_MIN + REMINDER_WINDOW_MIN
      ) {
        const r = await queueEvent(
          nd,
          f.userId,
          { type: 'later_nudge', farm: f.farmName, toCheck: f.toCheck },
          { farmId: f.farmId, dedupeKey: `nudge:${f.farmId}:${today}` },
        );
        if (r.status === 'queued') report.nudge++;
        else report.skipped++;
      }
    } catch {
      // One farm failing never stops the others.
      report.skipped++;
    }
  }
  return report;
}

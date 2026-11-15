import 'server-only';
import type { FarmEvent } from '@gg/engine';
import { fromUuid, toUuid } from '../db/dbstore';
import type { SqlRunner } from '../db/sql';
import { logFailure } from '../logging';
import type { NotifyDeps } from '../notify/deps';
import { queueEvent } from '../notify/queue';
import { sqlDailyFarmReader, type DailyFarmReader } from '../notify/reminders';
import type { NotifyEvent } from '../notify/wording';

/*
 * Daily Farm and notifications, joined (m6).
 *
 * 1. After a night is saved, its farm events become notifications through the one entry point,
 *    `queueEvent` (server/notify/queue.ts). Only facts the engine reported that night: a trough low
 *    or empty, a mob with no water, a mob through the tape, the first calf of a calving, deaths.
 *    Each has a dedupe key for the farm, the night and the event, so a night run twice (a conflict,
 *    two servers) queues it once. Only the night that brings the farm up to today is told: a farm
 *    caught up after days with no rollover does not send a pile of old news.
 * 2. The reminder reader (`setDailyFarmReader`) is Daily Farm's own: "opened today" is the Daily
 *    Farm's record of the player opening it (`openedOn`), not `farms.last_opened_at`, which the
 *    rollover itself moves when it loads a farm at midnight. And it knows the "things to check"
 *    count: the farm's own list of things to do and plan moves due.
 *
 * Nothing here ever stops a night: a notification that can not be queued is logged and dropped.
 */

/** What the game server tells Daily Farm after a night is saved. */
export interface NightNews {
  farmId: string;
  farmName: string;
  /** The game date the night ended (YYYY-MM-DD). */
  date: string;
  events: readonly FarmEvent[];
}

const CAUSE: Record<string, string> = {
  noWater: 'no water',
  starved: 'starved',
  poorCondition: 'poor condition',
  lambing: 'lambing',
  newborn: 'newborn losses',
  orphaned: 'orphaned',
  flystrike: 'flystrike',
  weaner: 'weaner losses',
  natural: 'natural causes',
};
const causeWords = (c: string): string => CAUSE[c] ?? c.replace(/([A-Z])/g, ' $1').toLowerCase();

export interface Notice {
  event: NotifyEvent;
  /** Unique within one night. */
  key: string;
}

/** The notifications one night's events make, in order. Pure: the tests read it directly. */
export function nightNotices(farm: string, events: readonly FarmEvent[]): Notice[] {
  const out: Notice[] = [];
  const seen = new Set<string>();
  const add = (key: string, event: NotifyEvent): void => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, event });
  };
  // Deaths are added up for each mob and cause, so a night gives one line for each.
  const deaths = new Map<string, { mob: string; cause: string; count: number }>();
  for (const e of events) {
    switch (e.type) {
      case 'water':
        if (e.event.type === 'portable-empty') {
          add(`trough-empty:${e.event.portId}`, { type: 'trough_empty', farm, paddock: e.paddock });
        } else {
          add(`trough-low:${e.event.portId}`, { type: 'trough_low', farm, paddock: e.paddock });
        }
        break;
      case 'cattle':
      case 'sheep':
        if (e.note.type === 'noWater') {
          add(`no-water:${e.mob}`, { type: 'no_water', farm, mob: e.mobName, days: e.note.days });
        } else if (e.type === 'cattle' && e.note.type === 'calvingStarted') {
          add(`calving:${e.mob}`, { type: 'calving_started', farm, mob: e.mobName });
        }
        break;
      case 'breakout':
      case 'sheep-breakout':
        add(`tape:${e.type}:${e.mob}`, { type: 'through_tape', farm, mob: e.mobName });
        break;
      case 'deaths':
      case 'sheep-deaths': {
        const k = `${e.type}:${e.mob}:${e.cause}`;
        const d = deaths.get(k) ?? { mob: e.mobName, cause: causeWords(e.cause), count: 0 };
        d.count += e.count;
        deaths.set(k, d);
        break;
      }
      default:
        break;
    }
  }
  for (const [k, d] of deaths) {
    if (d.count > 0) add(`deaths:${k}`, { type: 'deaths', farm, ...d });
  }
  return out;
}

/**
 * The hook the game server calls after a night (`DailyRuntime.notify`). `deps` gives the
 * notification dependencies, or null when accounts are not set up (then nothing is queued).
 */
export function dailyNotifier(deps: () => NotifyDeps | null): (news: NightNews) => Promise<void> {
  return async (news) => {
    const notices = nightNotices(news.farmName, news.events);
    if (notices.length === 0) return;
    const nd = deps();
    if (!nd) return;
    try {
      // The game server names a farm by 32 hex digits; the database by its uuid.
      const farmId = /^[0-9a-f]{32}$/.test(news.farmId) ? toUuid(news.farmId) : news.farmId;
      const r = await nd.sql.query<{ owner_id: string | null }>(
        'select owner_id from public.farms where id = $1',
        [farmId],
      );
      const owner = r.rows[0]?.owner_id;
      if (!owner) return;
      for (const n of notices) {
        await queueEvent(nd, owner, n.event, {
          farmId,
          dedupeKey: `night:${farmId}:${news.date}:${n.key}`,
        });
      }
    } catch (e) {
      logFailure({ route: 'daily-notify', reason: 'queue_failed' }, e);
    }
  };
}

/**
 * Daily Farm's reminder reader. The farms come from the default reader (an active Daily Farm of
 * an account that turned a reminder on); "opened" is the Daily Farm's own `openedOn`, and the
 * count comes from `toCheck` (the game server's, read without marking the farm opened). `toCheck`
 * is given the game server's farm id (32 hex digits).
 */
export function dailyReminderReader(
  sql: SqlRunner,
  toCheck: (farmId: string) => Promise<number | null>,
): DailyFarmReader {
  const base = sqlDailyFarmReader(sql);
  return {
    async farms() {
      const farms = await base.farms();
      if (farms.length === 0) return farms;
      const r = await sql.query<{ farm_id: string; opened_on: string | null }>(
        `select farm_id, daily->>'openedOn' as opened_on from public.farm_saves
          where farm_id = any($1::uuid[])`,
        [farms.map((f) => f.farmId)],
      );
      const opened = new Map(r.rows.map((x) => [x.farm_id, x.opened_on]));
      const out = [];
      for (const f of farms) {
        const on = opened.get(f.farmId) ?? null;
        out.push({
          ...f,
          // The reminder compares the local date of this moment with today in the farm's zone.
          // 06:00 UTC on the date the player opened the farm is that same date in every zone Daily
          // Farm runs on (SUPPORTED_ZONES, UTC+8 to UTC+13), so the comparison holds.
          lastOpenedAt: on && /^\d{4}-\d{2}-\d{2}$/.test(on) ? new Date(`${on}T06:00:00Z`) : null,
          toCheck: await toCheck(fromUuid(f.farmId)).catch(() => null),
        });
      }
      return out;
    },
  };
}

import { afterAll, describe, expect, it } from 'vitest';
import { newFarm } from '../player';
import { OWNER, at, choices, database, keepThrough, rig } from './testrig';

afterAll(async () => {
  await (await database()).close();
});

/*
 * Two servers holding the same farm (milestone 3.3, second pass). A write that kept the farm's
 * version let a second server trust an old copy and write it back over what the player did on
 * the first. Every write to a stored farm now changes a revision, and a cached copy is checked
 * against it.
 */

describe('a second server never writes back an old copy', () => {
  it('a Daily Farm: the player opens, acknowledges and reads on one server, the night runs on the other', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const cron = r.game;
    const player = r.another();
    const farm = newFarm();
    await cron.create(farm.key, choices(), OWNER);
    // Two nights pass with the player away. The cron server runs them and holds the farm.
    r.clock.now = at('2026-11-15', '00:20:00');
    await r.roll({ feed: false });
    // The player opens on the other server, sees the catch-up, acknowledges it, reads the inbox.
    r.clock.now = at('2026-11-15', '10:00:00');
    const seen = (await player.snapshot(farm.key))!;
    expect(seen.daily!.catchUp!.days).toHaveLength(1);
    await player.dailyAck(farm.key);
    await player.markRead(farm.key, 999);
    const before = await r.db.query<{
      daily: { openedOn: string; away: unknown[]; seenSeq: number };
      inbox_read: number;
    }>('select daily, inbox_read from public.farm_saves');
    expect(before.rows[0]!.daily.openedOn).toBe('2026-11-15');
    expect(before.rows[0]!.daily.away).toEqual([]);
    expect(before.rows[0]!.inbox_read).toBeGreaterThan(0);
    // The next night runs on the cron server, which still holds the farm from the night before.
    r.clock.now = at('2026-11-16', '00:20:00');
    const run = await r.roll({ feed: false });
    expect(run.failed).toBe(0);
    const after = await r.db.query<{
      daily: { openedOn: string; away: unknown[]; seenSeq: number };
      inbox_read: number;
    }>('select daily, inbox_read from public.farm_saves');
    const d = after.rows[0]!.daily;
    expect(d.openedOn).toBe('2026-11-15');
    // The 15th was opened, so it is not a missed day, and the catch-up the player dismissed stays dismissed.
    expect(d.away).toEqual([]);
    expect(d.seenSeq).toBe(before.rows[0]!.daily.seenSeq);
    expect(after.rows[0]!.inbox_read).toBe(before.rows[0]!.inbox_read);
    await keepThrough(r, '2026-11-16');
  }, 300_000);

  it('a Fast Farm: an inbox read on one server survives a day run on the other', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const a = r.game;
    const b = r.another();
    const farm = newFarm();
    await a.create(
      farm.key,
      choices({ mode: 'fast', years: 'random', timezone: undefined }),
      OWNER,
    );
    // Server a holds the farm. Server b reads the inbox.
    await b.snapshot(farm.key);
    await b.markRead(farm.key, 999);
    const read = (await r.db.query<{ n: number }>('select inbox_read as n from public.farm_saves'))
      .rows[0]!.n;
    expect(read).toBeGreaterThan(0);
    // Server a runs a day on what it holds. It must not write the unread mark back.
    await a.endDay(farm.key);
    const now = (await r.db.query<{ n: number }>('select inbox_read as n from public.farm_saves'))
      .rows[0]!.n;
    expect(now).toBe(read);
  }, 300_000);
});

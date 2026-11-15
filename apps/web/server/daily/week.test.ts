import { afterAll, describe, expect, it } from 'vitest';
import type { Snapshot } from '../../lib/game/types';
import type { GameServer } from '../game/game';
import { newFarm } from '../player';
import { addDays } from './clock';
import { OWNER, at, choices, database, keepThrough, rig, type Rig } from './testrig';

afterAll(async () => {
  await (await database()).close();
});

let n = 0;
/** One job: move the first mob on pasture to another paddock that has water. */
async function aJob(game: GameServer, key: string, snap: Snapshot): Promise<Snapshot> {
  const mob = snap.mobs.find((m) => m.where === 'paddock');
  if (!mob) throw new Error('no mob to move');
  const here = snap.paddocks.find((p) => p.mobs.includes(mob.id));
  const there = snap.paddocks.find((p) => p !== here && p.water !== 'none' && p.mobs.length === 0);
  if (!there) throw new Error('no paddock to move to');
  const res = await game.act(
    key,
    { action: { type: 'moveMob', mob: mob.id, cell: there.cell } },
    { version: snap.farmVersion, requestId: `week-job-${++n}` },
  );
  if (!res.ok) throw new Error(`job refused: ${res.message}`);
  return res.snapshot;
}

const saveOf = async (r: Rig): Promise<unknown> =>
  (await r.db.query<{ save: unknown }>('select save from public.farm_saves')).rows[0]!.save;

/**
 * Seven real days, 13 to 19 November 2026. The player opens the farm and works on the 13th, 14th,
 * 17th, 18th and 19th, and misses the 15th and 16th. `cron` runs the rollover every night after
 * midnight; `open` never runs it, so each night is run when the player opens the farm.
 */
async function week(how: 'cron' | 'open') {
  const r = await rig({ date: '2026-11-13', time: '10:00:00' });
  await keepThrough(r, '2026-11-19');
  const farm = newFarm();
  let snap = await r.game.create(farm.key, choices(), OWNER);
  snap = await aJob(r.game, farm.key, snap);
  const seen: { date: string; catchUp: number | null; work: string }[] = [];
  for (const date of [
    '2026-11-14',
    '2026-11-15',
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
  ]) {
    r.clock.now = at(date, '00:20:00');
    if (how === 'cron') await r.roll({ feed: false });
    r.clock.now = at(date, '10:00:00');
    if (['2026-11-15', '2026-11-16'].includes(date)) continue;
    snap = (await r.game.snapshot(farm.key))!;
    seen.push({ date, catchUp: snap.daily!.catchUp?.days.length ?? null, work: snap.daily!.work });
    snap = await aJob(r.game, farm.key, snap);
    if (snap.daily!.catchUp) snap = await r.game.dailyAck(farm.key);
  }
  r.clock.now = at('2026-11-19', '12:00:00');
  const last = (await r.game.snapshot(farm.key))!;
  return { r, farm, last, seen, save: await saveOf(r) };
}

describe('a Daily Farm over seven real days with two missed', () => {
  it('runs each night, shows the missed days once, and comes out the same whether cron or opening ran them', async () => {
    const cron = await week('cron');
    const lastCron = cron.last;
    const saveCron = cron.save;
    const diaryCron = await cron.r.game.record(cron.farm.key);
    expect(cron.seen[1]).toMatchObject({ date: '2026-11-17', catchUp: 2 });
    expect(cron.seen.filter((s) => s.catchUp !== null)).toHaveLength(1);
    // Each day's start, and the work is a fact: started after a job, not started before.
    expect(cron.seen[0]).toMatchObject({ date: '2026-11-14', work: 'not-started' });
    expect(lastCron.date).toEqual({ year: 2026, month: 10, date: 19 });
    expect(lastCron.daily!.work).toBe('started');
    const owed = await cron.r.db.query<{ sim: string }>(
      "select to_char(sim_through,'YYYY-MM-DD') as sim from public.farms",
    );
    expect(owed.rows[0]!.sim).toBe('2026-11-18');
    // The diary has every day from the start to yesterday, each once, in order.
    const days = diaryCron.diary.map((d) => d.day).reverse();
    expect(new Set(days).size).toBe(days.length);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    // The action log has the server's time for every night and job.
    const log = await cron.r.db.query<{ action: { at?: string; type?: string } }>(
      'select action from public.farm_actions order by seq',
    );
    expect(log.rows.every((x) => typeof x.action.at === 'string')).toBe(true);
    expect(log.rows.filter((x) => x.action.type === 'rollover')).toHaveLength(6);

    const open = await week('open');
    expect(open.save).toEqual(saveCron);
    expect(open.last.day).toBe(lastCron.day);
    expect(open.last.totals).toEqual(lastCron.totals);
    expect(open.seen).toEqual(cron.seen);
  }, 300_000);

  it('gives the missed days as facts, and clears them once seen', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await keepThrough(r, '2026-11-17');
    const farm = newFarm();
    await r.game.create(farm.key, choices(), OWNER);
    r.clock.now = at('2026-11-16', '08:00:00');
    const snap = (await r.game.snapshot(farm.key))!;
    const away = snap.daily!.catchUp!;
    // Nights of the 13th, 14th and 15th passed. The player opened only on the 13th, so the 14th and 15th were missed.
    expect(away.days.map((d) => d.date.date)).toEqual([14, 15]);
    // The number of days away is the true number, and the lines shown are at most the last 60.
    expect(away.daysAway).toBe(2);
    for (const d of away.days)
      for (const line of d.lines) expect(line).not.toMatch(/should|must|overgraz|—/i);
    expect(snap.date.date).toBe(16);
    const cleared = await r.game.dailyAck(farm.key);
    expect(cleared.daily!.catchUp).toBeNull();
    expect((await r.game.snapshot(farm.key))!.daily!.catchUp).toBeNull();
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  }, 120_000);
});

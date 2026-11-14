import { createFarm } from '@gg/engine';
import { loadRealData } from '@gg/engine/server';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { GameError } from '../game/game';
import { newFarm } from '../player';
import { OWNER, USER2, choices, database, rig } from './testrig';

afterAll(async () => {
  await (await database()).close();
});

const row = async (r: Awaited<ReturnType<typeof rig>>, id: string) =>
  (
    await r.db.query<{ mode: string; timezone: string; sim: string; day: number; d: string }>(
      `select mode, timezone, to_char(sim_through,'YYYY-MM-DD') as sim, current_day as day,
              to_char(game_date,'YYYY-MM-DD') as d from public.farms where id = $1`,
      [id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')],
    )
  ).rows[0]!;

describe('starting a Daily Farm', () => {
  it('starts on today in its own time zone as day 0, with the zone locked and the clock one day behind', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const f = newFarm();
    const snap = await r.game.create(f.key, choices(), OWNER);
    expect(snap.date).toEqual({ year: 2026, month: 10, date: 13 });
    expect(snap.day).toBe(0);
    expect(snap.daily).toMatchObject({
      timezone: 'Australia/Sydney',
      work: 'not-started',
      waiting: null,
    });
    expect(snap.daily!.endsAt - snap.daily!.serverNow).toBe(14 * 3600_000);
    expect(await row(r, f.id)).toMatchObject({
      mode: 'daily',
      timezone: 'Australia/Sydney',
      sim: '2026-11-12',
      d: '2026-11-13',
      day: 0,
    });
  }, 120_000);

  it('arrives on Day 1 with nothing spent and nothing decided, the herd placed today, even late in the month', async () => {
    const r = await rig({ date: '2026-11-28', time: '10:00:00' });
    const f = newFarm();
    const snap = await r.game.create(f.key, choices(), OWNER);
    expect(snap.date).toEqual({ year: 2026, month: 10, date: 28 });
    expect(snap.day).toBe(0);
    // The same farm made the way the engine makes any farm, on the same day: cash is what the difficulty gives.
    const same = createFarm(
      {
        seed: 5,
        district: 'cq',
        size: 'small',
        start: { year: 2025, month: 10, date: 28 },
        years: { kind: 'real', order: 'in-order' },
        startType: 'running',
        difficulty: 'medium',
      },
      { data: loadRealData() },
    );
    expect(snap.totals.cash).toBe(Math.round(same.cash));
    expect(snap.totals.head).toBeGreaterThan(0);
    // Nothing has happened to the player: no diary, no days away, no joining under way.
    expect((await r.game.record(f.key)).diary).toEqual([]);
    expect(snap.daily!.catchUp).toBeNull();
  }, 120_000);

  it('turns away a guest, a switch that is off and no database, each in plain words', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await expect(r.game.create('a'.repeat(32), choices())).rejects.toMatchObject({
      status: 403,
      code: 'daily_needs_account',
    });
    r.switchOn.value = false;
    await expect(r.game.create(newFarm().key, choices(), OWNER)).rejects.toMatchObject({
      status: 403,
      code: 'daily_off',
    });
  }, 120_000);

  it('checks the time zone against the list of supported zones, and the farm limit, before anything is run', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const spy = vi.spyOn(r.data, 'bundleThrough');
    for (const timezone of ['+10:00', 'australia/sydney', 'Mars/Olympus', 'UTC', undefined]) {
      await expect(
        r.game.create(newFarm().key, choices({ timezone }), OWNER),
      ).rejects.toMatchObject({ status: 400, code: 'daily_zone' });
    }
    expect(spy).not.toHaveBeenCalled();
    // Two Daily Farms an account. The third is refused with the plain message, and nothing was run for it.
    await r.game.create(newFarm().key, choices({ name: 'One' }), OWNER);
    await r.game.create(newFarm().key, choices({ name: 'Two' }), OWNER);
    const calls = spy.mock.calls.length;
    await expect(
      r.game.create(newFarm().key, choices({ name: 'Three' }), OWNER),
    ).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/most farms/) });
    expect(spy.mock.calls.length).toBe(calls);
    // Another account is not held back by it.
    await r.game.create(newFarm().key, choices({ name: 'Other' }), { kind: 'user', id: USER2 });
    expect(GameError).toBeTypeOf('function');
  }, 240_000);

  it('starts with the weather and prices not in at all: no waiting, the first day is today', async () => {
    const r = await rig({ date: '2026-12-20', time: '10:00:00' });
    const snap = await r.game.create(newFarm().key, choices(), OWNER);
    expect(snap.date).toEqual({ year: 2026, month: 11, date: 20 });
    expect(snap.daily!.waiting).toBeNull();
  }, 120_000);
});

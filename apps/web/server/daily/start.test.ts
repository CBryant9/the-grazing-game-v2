import { afterAll, describe, expect, it } from 'vitest';
import { GameError, farmKey } from '../game/game';
import { newFarm } from '../player';
import { OWNER, choices, database, rig, serveThrough } from './testrig';

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
  it('starts on today in its own time zone, with the zone locked and the clock one day behind', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const f = newFarm();
    const snap = await r.game.create(f.key, choices(), OWNER);
    expect(snap.date).toEqual({ year: 2026, month: 10, date: 13 });
    expect(snap.daily).toMatchObject({ timezone: 'Australia/Sydney', work: 'not-started', waiting: null });
    expect(snap.daily!.endsAt - snap.daily!.serverNow).toBe(14 * 3600_000);
    expect(await row(r, f.id)).toMatchObject({ mode: 'daily', timezone: 'Australia/Sydney', sim: '2026-11-12', d: '2026-11-13' });
  }, 120_000);

  it('turns away a guest, a switch that is off, no database and a made-up time zone, each in plain words', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    await expect(r.game.create('a'.repeat(32), choices())).rejects.toMatchObject({ status: 403, code: 'daily_needs_account' });
    r.switchOn.value = false;
    await expect(r.game.create(newFarm().key, choices(), OWNER)).rejects.toMatchObject({ status: 403, code: 'daily_off' });
    r.switchOn.value = true;
    await expect(r.game.create(newFarm().key, choices({ timezone: 'Mars/Olympus' }), OWNER)).rejects.toBeInstanceOf(GameError);
  }, 120_000);

  it('waits to start when yesterday is not in yet, and starts once it is', async () => {
    const r = await rig({ date: '2026-11-15', time: '10:00:00' });
    await expect(r.game.create(newFarm().key, choices(), OWNER)).rejects.toMatchObject({ status: 409, code: 'daily_data_late' });
    serveThrough(r, '2026-11-14');
    const rolled = await r.roll();
    expect(rolled.fetched).toHaveLength(8);
    const snap = await r.game.create(newFarm().key, choices(), OWNER);
    expect(snap.date).toEqual({ year: 2026, month: 10, date: 15 });
    expect(farmKey).toBeTypeOf('function');
  }, 120_000);
});

import { afterAll, describe, expect, it } from 'vitest';
import { newFarm } from '../player';
import { OWNER, at, choices, database, rig } from './testrig';

/*
 * Security review, m5.5 (finding 8). Someone else's look at a farm (the read-only farm view) ran
 * the owner's missed nights and saved them, so a viewer could move the owner's farm on, and every
 * save also set `last_opened_at`. A view now shows the farm as it stands in the store and writes
 * nothing.
 */

afterAll(async () => {
  await (await database()).close();
});

const uuid = (id: string) => id.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

describe('the read-only farm view', () => {
  it('never runs missed nights and never touches the stored farm', async () => {
    const r = await rig({ date: '2026-11-13', time: '10:00:00' });
    const f = newFarm();
    await r.game.create(f.key, choices({ name: 'Looked At' }), OWNER);
    await r.db.query(
      `update public.farms set last_opened_at = timestamptz '2026-11-01T00:00:00Z' where id = $1`,
      [uuid(f.id)],
    );
    const stored = async () =>
      (
        await r.db.query<{
          v: string;
          rev: number;
          opened: string;
          day: number;
          sim: string;
          actions: number;
        }>(
          `select s.farm_version as v, s.rev, f.last_opened_at::text as opened, f.current_day as day,
                  to_char(f.sim_through, 'YYYY-MM-DD') as sim,
                  (select count(*)::int from public.farm_actions a where a.farm_id = f.id) as actions
             from public.farms f join public.farm_saves s on s.farm_id = f.id where f.id = $1`,
          [uuid(f.id)],
        )
      ).rows[0]!;
    const before = await stored();
    expect(before.day).toBe(0);

    // Two nights later, with the owner away. A viewer on another server (nothing cached) looks.
    r.clock.now = at('2026-11-15', '10:00:00');
    const viewer = r.another();
    const snap = await viewer.viewSnapshot(f.id);
    expect(snap).not.toBeNull();
    // Shown as it stands: still day 0, the nights not run.
    expect(snap!.day).toBe(0);
    expect(snap!.farm.name).toBe('Looked At');
    expect(await stored()).toEqual(before);

    // Looked at again, now from the cached copy: still nothing written.
    await viewer.viewSnapshot(f.id);
    expect(await stored()).toEqual(before);

    // The owner's own load is what brings the farm up to today.
    const own = await r.game.snapshot(f.key);
    expect(own!.day).toBe(2);
    expect((await stored()).day).toBe(2);
  }, 180_000);
});

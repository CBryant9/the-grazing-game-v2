import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { PLENTY, openFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, work } from '../../test-support/workingDay';
import type { Action } from '../actions/types';
import { GRID_N } from '../grid';
import * as engine from '../index';
import { LAND } from '../pasture/state';
import { farmHash } from '../save/save';
import { createFarm } from '../sim/create';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { applyAction } from './act';

/*
 * The instant path: the one way to act without the farm clock. It is for
 * calibration and tests, so their farms are set up all at once as they
 * were before jobs took time. Nothing a player can reach uses it.
 */

vi.setConfig({ testTimeout: 600_000 });

const REPO = fileURLToPath(new URL('../../../../', import.meta.url));

/** Every source file in the repo's own code, as paths from the repo's top. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.next' || name === 'dist' || name.startsWith('.')) {
        continue;
      }
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|mts|mjs|js)$/.test(name))
        out.push(relative(REPO, full).split(sep).join('/'));
    }
  };
  for (const top of ['apps', 'packages', 'scripts']) walk(join(REPO, top));
  return out;
}

describe('acting without the clock', () => {
  it('does the whole action at once and leaves the clock, the jobs and the bookings alone', () => {
    const farm = openFarm('nsw');
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    const done = applyInstantly(farm, job);
    if (!done.ok) throw new Error(done.message);
    // 1,800 m of permanent fence, up at once: on the clock it is four days.
    expect(done.farm.year.infra).toBe(12600);
    expect(done.farm.clock).toEqual(farm.clock);
    expect(done.farm.jobs).toEqual([]);
    expect(done.job).toBeUndefined();
    expect(done.events.map((e) => e.type)).toEqual(['layout-job']);
    // Nothing is stamped with a time of day.
    expect(done.farm.actionLog.at(-1)).toEqual({ day: 0, action: job });
    expect(done.farm.inbox.at(-1)!.at).toBeUndefined();
    // On the clock, the same action is a day's work and a job in progress.
    expect(work(farm, job).job.outcome).toBe('part');
  });

  it('works after last light, and any number of times in a day', () => {
    const b = busyFarm();
    let farm = b.farm;
    farm.clock.used = farm.clock.lastLight - farm.clock.firstLight;
    for (let i = 0; i < 12; i++) {
      const done = applyInstantly(farm, {
        type: 'buildFence',
        edges: across(8 + i, 2, 30),
        fence: 'electric',
      });
      if (!done.ok) throw new Error(done.message);
      farm = done.farm;
    }
    expect(farm.jobs).toEqual([]);
  });

  it('sows and harvests on the spot, with no contractor', () => {
    const farm = createFarm({
      seed: 4,
      district: 'cw',
      size: 'small',
      start: { year: 2022, month: 5 },
      startType: 'scratch',
      mixed: { arablePct: 40, croppedPct: 50 },
      difficulty: 'easy',
      money: { ...PLENTY },
    });
    const fallow: number[] = [];
    for (let i = 0; i < GRID_N; i++) if (farm.pasture.land[i] === LAND.fallow) fallow.push(i);
    const done = applyInstantly(farm, { type: 'sow', species: 'barley', cells: fallow });
    if (!done.ok) throw new Error(done.message);
    expect(done.farm.crops.fields.length).toBe(farm.crops.fields.length + 1);
    expect(done.farm.bookings).toEqual([]);
    expect(done.farm.cash).toBeLessThan(farm.cash);
  });

  it('a farm driven without the clock runs as it did before there was one', () => {
    // The tick does not read the clock: two farms that differ only in how
    // much of the day is used, and where the player is, have the same day.
    const b = busyFarm();
    const late: FarmState = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const early = applyInstantly(b.farm, { type: 'refillPortable', port: b.port });
    if (!early.ok) throw new Error(early.message);
    expect(late.clock.used).toBeGreaterThan(0);
    for (let d = 0; d < 20; d++) {
      stepDay(late);
      stepDay(early.farm);
    }
    // The action logs and inboxes differ (one has times of day). Everything the model reads is the same.
    const model = (f: FarmState): string =>
      farmHash({ ...f, actionLog: [], inbox: [], inboxSeq: 0 } as FarmState);
    expect(model(late)).toBe(model(early.farm));
  });

  it('jobs in progress and bookings can only be worked on the clock', () => {
    const farm = openFarm('nsw');
    const no = applyInstantly(farm, { type: 'continueJob', job: 1 });
    expect(no.ok).toBe(false);
    expect(!no.ok && no.reason).toBe('no-such-job');
    expect(applyInstantly(farm, { type: 'cancelBooking', booking: 1 })).toMatchObject({
      ok: false,
      reason: 'no-such-booking',
    });
  });
});

describe('nothing a player can reach uses it', () => {
  it('the flag is set in one file, in test support', () => {
    // Any file that sets `instant` to true in an env. Reading the flag is
    // fine: setting it is what switches the clock off.
    const setsIt = /\binstant\s*:\s*true\b/;
    const found = sourceFiles().filter((path) => {
      if (path === 'packages/engine/src/day/instantPath.test.ts') return false;
      return setsIt.test(readFileSync(join(REPO, path), 'utf8'));
    });
    expect(found).toEqual(['packages/engine/test-support/instant.ts']);
  });

  it('nothing outside the engine names the instant path at all', () => {
    const names = /applyInstant|tryAction|\binstant\b/;
    const outside = sourceFiles().filter(
      (path) =>
        !path.startsWith('packages/engine/') && names.test(readFileSync(join(REPO, path), 'utf8')),
    );
    expect(outside).toEqual([]);
  });

  it('the engine does not export the instant functions, only the action on the clock', () => {
    const exported = Object.keys(engine);
    expect(exported).toContain('applyAction');
    expect(exported).toContain('previewAction');
    expect(exported).not.toContain('applyInstant');
    expect(exported).not.toContain('applyInstantly');
    expect(exported).not.toContain('tryAction');
    expect(exported).not.toContain('recordAction');
    expect(engine.applyAction).toBe(applyAction);
  });

  it('engine code never imports test support', () => {
    const offenders = sourceFiles().filter((path) => {
      if (!path.startsWith('packages/engine/src/')) return false;
      if (/\.(test|timed)\.ts$/.test(path)) return false;
      return /test-support/.test(readFileSync(join(REPO, path), 'utf8'));
    });
    // Comments may name the folder. No import may.
    for (const path of offenders) {
      const text = readFileSync(join(REPO, path), 'utf8');
      expect(/from\s+['"][^'"]*test-support/.test(text), path).toBe(false);
    }
  });

  it('an action can not carry the flag: it is read from the env the server builds', () => {
    const farm = openFarm('nsw');
    const sneaky = {
      type: 'buildFence',
      edges: across(12, 2, 37),
      fence: 'permanent',
      instant: true,
      env: { instant: true },
    } as unknown as Action;
    const done = applyAction(farm, sneaky);
    if (!done.ok) throw new Error(done.message);
    // Still a day's work and a job in progress.
    expect(done.job!.outcome).toBe('part');
    expect(done.farm.jobs.length).toBe(1);
  });
});

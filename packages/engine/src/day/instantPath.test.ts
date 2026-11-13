import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { applyInstantly } from '../../test-support/instant';
import { openFarm } from '../../test-support/wholeFarm';
import { across, busyFarm, work } from '../../test-support/workingDay';
import type { ActionEnv } from '../actions/apply';
import type { Action } from '../actions/types';
import * as engine from '../index';
import { farmHash } from '../save/save';
import type { FarmState } from '../sim/state';
import { stepDay } from '../sim/tick';
import { applyAction, previewAction } from './act';
import { endDay, skipDays } from './days';

/*
 * The instant path: the one way to act without the farm clock. It is for
 * calibration and tests, so their farms are set up all at once as they
 * were before jobs took time. Nothing a player can reach uses it, and the
 * public `applyAction` can not be made instant.
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
      else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) {
        out.push(relative(REPO, full).split(sep).join('/'));
      }
    }
  };
  for (const top of ['apps', 'packages', 'scripts']) walk(join(REPO, top));
  return out;
}

describe('acting without the clock', () => {
  it('does the whole action at once and leaves the clock alone', () => {
    const farm = openFarm('nsw');
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    const done = applyInstantly(farm, job);
    if (!done.ok) throw new Error(done.message);
    // 1,800 m of permanent fence, up at once: on the clock a day builds 500 m of it.
    expect(done.farm.year.infra).toBe(12600);
    expect(done.farm.clock).toEqual(farm.clock);
    expect(done.job).toBeUndefined();
    expect(done.events.map((e) => e.type)).toEqual(['layout-job']);
    // Nothing is stamped with a time of day.
    expect(done.farm.actionLog.at(-1)).toEqual({ day: 0, action: job });
    expect(done.farm.inbox.at(-1)!.at).toBeUndefined();
    expect(work(farm, job).farm.year.infra).toBe(3500);
  });

  it('works after last light, and any number of times in a day', () => {
    const b = busyFarm();
    let farm = b.farm;
    farm.clock.used = farm.clock.lastLight - farm.clock.firstLight;
    for (let i = 0; i < 12; i++) {
      const done = applyInstantly(farm, {
        type: 'buildFence',
        edges: across(8 + i, 2, 30),
        fence: 'permanent',
      });
      if (!done.ok) throw new Error(done.message);
      farm = done.farm;
    }
    expect(farm.clock.used).toBe(b.farm.clock.used);
  });

  it('a farm driven without the clock runs as it did before there was one', () => {
    // The tick does not read the clock: two farms that differ only in how
    // much of the day is used have the same day.
    const b = busyFarm();
    const late: FarmState = work(b.farm, { type: 'refillPortable', port: b.port }).farm;
    const early = applyInstantly(b.farm, { type: 'refillPortable', port: b.port });
    if (!early.ok) throw new Error(early.message);
    expect(late.clock.used).toBe(30);
    expect(early.farm.clock.used).toBe(0);
    for (let d = 0; d < 20; d++) {
      stepDay(late);
      stepDay(early.farm);
    }
    // The action logs and inboxes differ (one has times of day). Everything the model reads is the same.
    const model = (f: FarmState): string =>
      farmHash({ ...f, actionLog: [], inbox: [], inboxSeq: 0 } as FarmState);
    expect(model(late)).toBe(model(early.farm));
  });
});

describe('nothing a player can reach uses it', () => {
  it('the public action can not be made instant: a switch passed in the env is ignored', () => {
    const farm = openFarm('nsw');
    const job: Action = { type: 'buildFence', edges: across(12, 2, 37), fence: 'permanent' };
    // What a server route would pass if it spread a request into the env.
    const spread = { instant: true, clock: 'off', noClock: true } as unknown as ActionEnv;
    const done = applyAction(farm, job, spread);
    if (!done.ok) throw new Error(done.message);
    // Still a day's work: 500 m of the 1,800 m, exactly as with no env at all.
    expect(done.job!.outcome).toBe('part');
    expect(done.farm.year.infra).toBe(3500);
    expect(done.farm.clock.used).toBeGreaterThan(700);
    const plain = applyAction(farm, job);
    expect(plain.ok && farmHash(plain.farm)).toBe(farmHash(done.farm));
    expect(previewAction(farm, job, spread)).toEqual({ ok: true, card: done.job });
    // The same through the engine's index, which is all a server can import.
    const viaIndex = engine.applyAction(farm, job, spread);
    expect(viaIndex.ok && farmHash(viaIndex.farm)).toBe(farmHash(done.farm));
    expect(engine.previewAction(farm, job, spread)).toEqual({ ok: true, card: done.job });
    // Next day and skips take no such switch either: nothing more is built.
    expect(endDay(done.farm, spread).farm.year.infra).toBe(3500);
    expect(skipDays(done.farm, 2, spread).farm.year.infra).toBe(3500);
  });

  it('the env type has no field for it', () => {
    // If `ActionEnv` ever gets an `instant` field again, the type check fails here.
    // @ts-expect-error The env has no switch for the farm clock.
    const env: ActionEnv = { instant: true };
    expect(Object.keys(env)).toEqual(['instant']);
    const typed: engine.ActionEnv = {};
    expect(typed).toEqual({});
  });

  it('the instant function is named in two files: where it is defined, and test support', () => {
    const names = /\bapplyInstant\b/;
    const found = sourceFiles().filter((path) => {
      if (path === 'packages/engine/src/day/instantPath.test.ts') return false;
      return names.test(readFileSync(join(REPO, path), 'utf8'));
    });
    expect(found).toEqual([
      'packages/engine/src/actions/apply.ts',
      'packages/engine/test-support/instant.ts',
    ]);
  });

  it('lint forbids engine and server code from importing it', () => {
    const config = readFileSync(join(REPO, 'eslint.config.mjs'), 'utf8');
    expect(config.match(/importNames: \['applyInstant'\]/g)!.length).toBe(2);
  });

  it('nothing outside the engine names the instant path at all', () => {
    const names = /applyInstant|tryAction/;
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
    expect(engine.previewAction).toBe(previewAction);
  });

  it('engine code never imports test support', () => {
    for (const path of sourceFiles()) {
      if (!path.startsWith('packages/engine/src/')) continue;
      if (/\.(test|timed)\.ts$/.test(path)) continue;
      const text = readFileSync(join(REPO, path), 'utf8');
      // Comments may name the folder. No import may.
      expect(/from\s+['"][^'"]*test-support/.test(text), path).toBe(false);
    }
  });

  it('an action can not carry a switch either', () => {
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
    expect(done.job!.outcome).toBe('part');
    expect(done.farm.year.infra).toBe(3500);
  });
});

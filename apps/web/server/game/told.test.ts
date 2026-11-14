import { describe, expect, it } from 'vitest';
import type { MobWire, SetupChoices, Snapshot } from '../../lib/game/types';
import { GameServer } from './game';
import { MemoryFarmStore } from './store';

/*
 * The player is told only what was reported (CLAUDE.md rule 14). During a
 * joining the mob card must not count cows in calf day by day: the known
 * figures move only on a day a joining report or a preg test is made (or
 * fall, when a known cow calves, dies or is sold).
 */

const A = 'a'.repeat(32);
const choices: SetupChoices = {
  district: 'cw',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'easy',
  name: 'Told',
};

const PTIC = new Set(['pticHeifer', 'pticCow', 'pticCowWithCalf']);
const pticRows = (m: MobWire): number =>
  m.classes.filter((c) => PTIC.has(c.id)).reduce((n, c) => n + c.head, 0);
const reportLines = (m: MobWire): string =>
  m.breeding.filter((l) => /^(Joining report|Preg test)/.test(l)).join('|');

describe('what the mob card says about breeding', () => {
  it('during a joining nothing counts up on a day with no report', async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 5 });
    let snap: Snapshot = await game.create(A, choices);
    // Find a joining under way.
    for (let i = 0; i < 60 && !snap.mobs.some((m) => m.breeding[0]?.startsWith('Joining:')); i++) {
      snap = (await game.skip(A, 'week')).snapshot;
    }
    const joining = snap.mobs.find((m) => m.breeding[0]?.startsWith('Joining:'));
    expect(joining, 'a joining under way').toBeDefined();
    const id = joining!.id;
    // The length is the engine's JOINING_DAYS, never a hard-coded week count.
    expect(joining!.breeding[0]).toMatch(/\(9 weeks\)/);
    expect(joining!.breeding.join(' ')).not.toMatch(/week \d+ of 9/);

    let prev = snap.mobs.find((m) => m.id === id)!;
    let reports = 0;
    let quietDays = 0;
    for (let d = 0; d < 80; d++) {
      snap = (await game.endDay(A)).snapshot;
      const now = snap.mobs.find((m) => m.id === id);
      if (!now) break;
      if (reportLines(now) !== reportLines(prev)) {
        reports++;
      } else {
        quietDays++;
        // No report today: what is known in calf can only stay or fall.
        expect(now.ptic, `day ${snap.day}`).toBeLessThanOrEqual(prev.ptic);
        expect(pticRows(now), `day ${snap.day}`).toBeLessThanOrEqual(pticRows(prev));
      }
      prev = now;
    }
    expect(reports).toBeGreaterThan(0);
    expect(quietDays).toBeGreaterThan(30);
    // The reports carry their dates.
    expect(prev.breeding.join(' ')).toMatch(/\(\d{1,2} [A-Z][a-z]{2} \d{4}\)/);
  }, 180_000);
});

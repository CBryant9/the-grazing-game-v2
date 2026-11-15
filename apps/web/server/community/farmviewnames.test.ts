import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SetupChoices } from '../../lib/game/types';
import { GameServer } from '../game/game';
import { MemoryFarmStore } from '../game/store';
import { farmViewOf } from './farmview';

/*
 * The paddock and mob names on someone else's farm view (security review, m5.5). Players can not
 * name a paddock or a mob: the engine makes every name from a fixed pattern ("Paddock 3",
 * "Mob 2", "Weaners 7", "Sheep 4", "Ewes" for a start flock, "Mob 2 strays", "Mob 2 part", or
 * "Paddocks 1 + 2" where open gates join paddocks). So they need no word filter. The only free text a player types into the
 * engine is a plan's name, and plans are not on the farm view. If a rename is ever added, the
 * first test fails and the names must go through the word filter.
 */

const engine = fileURLToPath(new URL('../../../../packages/engine/src/', import.meta.url));

/** The `name` fields in a source file, with the interface each sits in. */
function nameFields(file: string): string[] {
  const text = readFileSync(`${engine}${file}`, 'utf8');
  const out: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const head = /^export (?:interface|type) (\w+)/.exec(line);
    if (head) current = head[1]!;
    if (/^\s+name\??:/.test(line)) out.push(current);
  }
  return out;
}

const PADDOCK = /^Paddocks? \d+(?: \+ \d+)*$/;
const MOB = /^(?:(?:Mob|Weaners|Sheep) \d+|Ewes)(?: strays| part)*$/;

const choices = (over: Partial<SetupChoices>): SetupChoices => ({
  district: 'wv',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Names Farm',
  ...over,
});

describe('names on the farm view', () => {
  it('no player action carries a name, except a plan', () => {
    expect(nameFields('actions/types.ts')).toEqual(['PlanSpec']);
  });

  it('every paddock and mob name comes from the fixed patterns, after a year of play', async () => {
    const game = new GameServer({
      store: new MemoryFarmStore(),
      seed: () => 11,
      sheepOn: async () => true,
    });
    const setups: Partial<SetupChoices>[] = [
      {},
      { district: 'cq', size: 'medium' },
      { district: 'cw', enterprise: 'mixed', arablePct: 30, croppedPct: 50 },
      { district: 'nsw', stock: 'sheep' },
    ];
    let n = 0;
    for (const over of setups) {
      const session = `a${(++n).toString(16).padStart(31, '0')}`;
      await game.create(session, choices(over));
      await game.skip(session, 'year', true);
      const snap = (await game.snapshot(session))!;
      const view = farmViewOf(snap, 'fast', 'owner', snap.farm.name);
      expect(view.paddocks.length).toBeGreaterThan(0);
      for (const p of view.paddocks) {
        expect(p.name, JSON.stringify(over)).toMatch(PADDOCK);
        for (const m of p.mobs) expect(m.name, JSON.stringify(over)).toMatch(MOB);
      }
      for (const m of snap.mobs) expect(m.name).toMatch(MOB);
    }
  }, 300_000);
});

import { describe, expect, it } from 'vitest';
import { createFarm, endDay, husbandryNow, supplementCosts } from '@gg/engine';
import type { SetupChoices, Snapshot } from '../../lib/game/types';
import { GameError, GameServer, parseAction } from './game';
import { buildSnapshot } from './snapshot';
import { MemoryFarmStore } from './store';

const A = 'a'.repeat(32);

const choices = (over: Partial<SetupChoices> = {}): SetupChoices => ({
  district: 'cw',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Wattle Flat',
  ...over,
});

const server = (seed = 7): GameServer =>
  new GameServer({ store: new MemoryFarmStore(), seed: () => seed });

/** Every string in a value, with its path. */
function strings(value: unknown, path = '', out: { path: string; text: string }[] = []) {
  if (typeof value === 'string') out.push({ path, text: value });
  else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, path ? `${path}.${k}` : k, out);
  }
  return out;
}

/** A farm that has had a day, so its mobs have figures. */
async function farmWithAFewDays(game: GameServer): Promise<Snapshot> {
  await game.create(A, choices());
  return (await game.skip(A, 'week')).snapshot;
}

describe('the mob wire', () => {
  it('carries what the mob card shows, from the engine', async () => {
    const game = server();
    const s = await farmWithAFewDays(game);
    const mob = s.mobs.find((m) => m.where === 'paddock')!;
    expect(mob.classes.length).toBeGreaterThan(0);
    expect(mob.classes.reduce((n, c) => n + c.head, 0)).toBe(mob.head + mob.calves);
    for (const c of mob.classes) {
      expect(c.label).toMatch(/^[A-Z]/);
      expect(c.weightKg).toBeGreaterThan(0);
      expect(c.cs).toBeGreaterThanOrEqual(1);
      expect(c.cs).toBeLessThanOrEqual(5);
    }
    expect(mob.intakeKg).toBeGreaterThan(0);
    expect(mob.intakePct).toBeGreaterThan(0);
    expect(mob.intakePct).toBeLessThan(6);
    expect(mob.me).not.toBeNull();
    expect(mob.cp).not.toBeNull();
    expect(mob.why).toBeInstanceOf(Array);
  }, 60_000);

  it('gives average weight and CS before the mob has had a day, from its animals', async () => {
    const s = await server().create(A, choices());
    for (const m of s.mobs) {
      expect(m.weightKg).toBeGreaterThan(100);
      expect(m.cs).toBeGreaterThanOrEqual(1);
      expect(m.cs).toBeLessThanOrEqual(5);
    }
  });

  it('gives the four supplements with a daily price for this mob', async () => {
    const s = await farmWithAFewDays(server());
    const mob = s.mobs.find((m) => m.where === 'paddock')!;
    expect(mob.suppOptions.map((o) => o.id)).toEqual(['none', 'lick', 'hay', 'pellet']);
    const price = Object.fromEntries(mob.suppOptions.map((o) => [o.id, o.perDay]));
    expect(price.none).toBe(0);
    expect(price.lick).toBeGreaterThan(0);
    expect(price.hay).toBeGreaterThan(price.lick!);
    expect(mob.suppReason).toBeNull();
  }, 60_000);

  it('says why a husbandry button is off, in the words the job itself gives', async () => {
    const s = await server().create(A, choices({ startType: 'scratch' }));
    expect(s.mobs).toEqual([]);
    const farm = createFarm({
      seed: 7,
      district: 'cw',
      size: 'small',
      start: { year: 2026, month: 8 },
      startType: 'running',
      difficulty: 'medium',
    });
    const snap = buildSnapshot(farm, { name: 'X', setup: choices(), version: 'v1' }, {});
    const hus = husbandryNow(farm, {});
    let off = 0;
    for (const m of snap.mobs) {
      const h = hus.find((x) => x.mob === m.id)!;
      expect(m.markReason).toBe(h.mark.canDo ? null : h.mark.why!.message);
      expect(m.weanReason).toBe(h.wean.canDo ? null : h.wean.why!.message);
      if (!h.mark.canDo) off++;
      if (!h.wean.canDo) off++;
    }
    expect(off).toBeGreaterThan(0);
  });
});

describe('the paddock wire', () => {
  it('names a square inside the paddock and gives stocking in AE and DSE', async () => {
    const s = await server().create(A, choices());
    for (const p of s.paddocks) {
      expect(s.view.squares.paddock[p.cell]).toBe(p.id);
      expect(p.dse).toBeCloseTo(p.ae * 8, 0);
      expect(p.carryingDsePerHa).toBeGreaterThan(0);
    }
  });
});

describe('the job card for the new buttons', () => {
  it('shows a supplement as a daily price and takes none of the day', async () => {
    const game = server();
    const s = await farmWithAFewDays(game);
    const mob = s.mobs.find((m) => m.where === 'paddock')!;
    const lick = mob.suppOptions.find((o) => o.id === 'lick')!;
    const preview = await game.preview(A, {
      action: { type: 'setSupplement', mob: mob.id, supp: 'lick' },
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.card.outcome).toBe('free');
    expect(preview.card.perDay).toBe(lick.perDay);
    const done = await game.act(A, {
      action: { type: 'setSupplement', mob: mob.id, supp: 'lick' },
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/is on lick/);
    expect(done.snapshot.mobs.find((m) => m.id === mob.id)!.supp).toBe('lick');
    // Looking at it again does not change the clock.
    expect(done.snapshot.clock.usedMin).toBe(s.clock.usedMin);
  }, 60_000);

  it('says a move joins two mobs, before the player confirms', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const grazing = s.mobs.filter((m) => m.where === 'paddock');
    expect(grazing.length).toBeGreaterThanOrEqual(2);
    const [a, b] = grazing;
    const target = s.paddocks.find((p) => p.mobs.includes(b!.id))!;
    const preview = await game.preview(A, {
      action: { type: 'moveMob', mob: a!.id, cell: target.cell },
    });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.card.notes.join(' ')).toContain(`${b!.name} (`);
      expect(preview.card.notes.join(' ')).toContain('The two mobs will join.');
    }
  });

  it('moves a mob into a paddock that holds another, and says they joined', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const [one, two] = s.mobs;
    const target = s.paddocks.find((p) => p.mobs.includes(one!.id))!;
    const action = { type: 'moveMob' as const, mob: two!.id, cell: target.cell };
    const preview = await game.preview(A, { action });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(preview.card.workMin).toBeGreaterThan(0);
      expect(preview.card.notes.join(' ')).toContain('The two mobs will join.');
    }
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.message).toMatch(/moved/);
      expect(done.message).toMatch(/joined/);
      expect(done.snapshot.mobs).toHaveLength(1);
      expect(done.snapshot.paddocks.find((p) => p.id === target.id)!.head).toBe(s.totals.head);
    }
  });

  it('refuses to move a mob to where it already is, with its reason', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const mob = s.mobs[0]!;
    const here = s.paddocks.find((p) => p.mobs.includes(mob.id))!;
    const r = await game.act(A, { action: { type: 'moveMob', mob: mob.id, cell: here.cell } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('already-there');
  });

  it('moves part of a mob by class and number', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const [one, two] = s.mobs;
    const cls = two!.classes.find((c) => !c.calf && c.head >= 2)!;
    const target = s.paddocks.find((p) => p.mobs.includes(one!.id))!;
    const action = {
      type: 'moveCattle' as const,
      picks: [{ mob: two!.id, cls: cls.id, qty: 1 }],
      cell: target.cell,
    };
    const preview = await game.preview(A, { action });
    expect(preview.ok).toBe(true);
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (done.ok) {
      expect(done.snapshot.totals.head).toBe(s.totals.head);
      const after = done.snapshot.mobs.find((m) => m.id === one!.id)!;
      expect(after.head).toBe(one!.head + 1);
      expect(done.snapshot.mobs.find((m) => m.id === two!.id)!.head).toBe(two!.head - 1);
    }
  });

  it('on a day with no sale, books stock onto the next sale, then cancels it', async () => {
    const game = server();
    let s = await game.create(A, choices());
    for (let i = 0; i < 40 && s.market.isSaleDay; i++) s = (await game.endDay(A)).snapshot;
    expect(s.market.isSaleDay).toBe(false);
    const mob = s.mobs.find((m) => m.where === 'paddock' && m.sellGroups.length > 0)!;
    const group = mob.sellGroups[0]!;
    const action = { type: 'sellGroup' as const, mob: mob.id, group: group.id, qty: 1 };
    const preview = await game.preview(A, { action });
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      const text = [...(preview.card.summary ?? []), ...preview.card.notes].join(' ');
      expect(text).toMatch(/go down for the next sale on \w+day \d+ \w+, (tomorrow|in \d+ days)\./);
      expect(text).toContain('Nothing is paid now.');
      expect(text).toContain('The price is set on the day of the sale.');
    }
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/booked onto the sale/);
    const booked = done.snapshot.mobs.find((m) => m.id === mob.id)!;
    expect(booked.booked).toBeGreaterThanOrEqual(1);
    expect(booked.bookedDate).not.toBeNull();
    expect(done.snapshot.totals.cash).toBe(s.totals.cash);
    // The head booked are not offered to sell again.
    const left = booked.sellGroups.find((g) => g.id === group.id)?.head ?? 0;
    expect(left).toBe(group.head - 1);

    const cancel = await game.act(A, { action: { type: 'cancelSale', mob: mob.id } });
    expect(cancel.ok).toBe(true);
    if (cancel.ok) {
      expect(cancel.message).toMatch(/taken off the sale/);
      expect(cancel.snapshot.mobs.find((m) => m.id === mob.id)!.booked).toBe(0);
    }
  }, 60_000);

  it('refuses to cancel a sale when nothing from the mob is booked', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const mob = s.mobs[0]!;
    await expect(game.act(A, { action: { type: 'cancelSale', mob: mob.id } })).rejects.toThrow(
      GameError,
    );
    await expect(game.act(A, { action: { type: 'cancelSale', mob: mob.id } })).rejects.toThrow(
      /Nothing from this mob is booked/,
    );
  });

  it('refuses marking when there is nothing to mark, with its plain reason', async () => {
    const game = server();
    const s = await game.create(A, choices());
    const mob = s.mobs.find((m) => m.markCount === 0);
    if (!mob) return;
    const r = await game.act(A, { action: { type: 'markCalves', mob: mob.id } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('nothing-to-mark');
      expect(r.message).toMatch(/^[A-Z]/);
    }
  });
});

describe('parseAction for the new jobs', () => {
  it('takes whole numbers and known names only', () => {
    expect(parseAction({ type: 'sellGroup', mob: 2, group: 'steer', qty: 5 })).toEqual({
      type: 'sellGroup',
      mob: 2,
      group: 'steer',
      qty: 5,
    });
    expect(parseAction({ type: 'setSupplement', mob: 2, supp: 'pellet' })).toEqual({
      type: 'setSupplement',
      mob: 2,
      supp: 'pellet',
    });
    expect(
      parseAction({
        type: 'moveCattle',
        picks: [{ mob: 1, cls: 'weanerSteer', qty: 3 }],
        cell: 12,
      }),
    ).toEqual({
      type: 'moveCattle',
      picks: [{ mob: 1, cls: 'weanerSteer', qty: 3 }],
      to: { cell: 12 },
    });
    for (const bad of [
      { type: 'sellGroup', mob: 2, group: 'calf', qty: 5 },
      { type: 'sellGroup', mob: 2, group: 'steer', qty: 0 },
      { type: 'sellGroup', mob: 2, group: 'steer', qty: 2.5 },
      { type: 'sellGroup', mob: 2, group: 'steer', qty: 1e9 },
      { type: 'setSupplement', mob: 2, supp: 'grain' },
      { type: 'moveCattle', picks: [], cell: 1 },
      { type: 'moveCattle', picks: [{ mob: 1, cls: 'dragon', qty: 1 }], cell: 1 },
      { type: 'moveCattle', picks: [{ mob: 1, cls: 'bull', qty: -1 }], cell: 1 },
      { type: 'moveCattle', picks: [{ mob: 1, cls: 'bull', qty: 1 }], cell: 99999 },
      { type: 'moveCattle', picks: Array(30).fill({ mob: 1, cls: 'bull', qty: 1 }), cell: 1 },
      { type: 'cancelSale', mob: 2 },
    ]) {
      expect(parseAction(bad)).toBeNull();
    }
  });
});

describe('the words on screen', () => {
  it('state facts: no should, no overgrazed, no em dashes, in every string the snapshot holds', async () => {
    const game = server();
    let s = await farmWithAFewDays(game);
    const all = [...strings(s)];
    s = (await game.skip(A, 'month')).snapshot;
    all.push(...strings(s));
    for (const { path, text } of all) {
      if (path.startsWith('view.')) continue;
      expect(text, path).not.toMatch(/\bshould\b|overgraz|—|–/i);
    }
  }, 120_000);
});

describe('the mob card reads the engine, never a copy of it', () => {
  it('supplement prices and marking and weaning come from supplementCosts and husbandryNow', () => {
    let farm = createFarm({
      seed: 3,
      district: 'cw',
      size: 'small',
      start: { year: 2025, month: 8 },
      startType: 'running',
      difficulty: 'medium',
    });
    for (let i = 0; i < 40; i++) farm = endDay(farm).farm;
    const snap = buildSnapshot(farm, { name: 'X', setup: choices(), version: 'v1' }, {});
    const costs = supplementCosts(farm, {});
    const hus = husbandryNow(farm, {});
    let priced = 0;
    for (const m of snap.mobs) {
      const c = costs.find((x) => x.mob === m.id)!;
      for (const o of m.suppOptions) {
        expect(o.perDay).toBeCloseTo(c.perDay[o.id], 2);
        priced++;
      }
      const h = hus.find((x) => x.mob === m.id)!;
      expect(m.markCount).toBe(h.mark.count);
      expect(m.weanCount).toBe(h.wean.count);
      expect(m.markReason).toBe(h.mark.canDo ? null : h.mark.why!.message);
      expect(m.weanReason).toBe(h.wean.canDo ? null : h.wean.why!.message);
    }
    expect(priced).toBeGreaterThan(0);
  });
});

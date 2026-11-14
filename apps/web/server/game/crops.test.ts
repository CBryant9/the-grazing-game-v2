import { describe, expect, it } from 'vitest';
import type { FieldProgress } from '@gg/engine';
import type { SetupChoices, Snapshot } from '../../lib/game/types';
import { GameServer } from './game';
import { parseSow } from './crops';
import {
  aboutLine,
  harvestLines,
  kindText,
  monthRange,
  outOfWindow,
  sowLines,
  stageWord,
} from './cropwords';
import { MemoryFarmStore } from './store';

const A = 'a'.repeat(32);
const BANNED = /\bshould\b|\bmust\b|overgraz|\bbad\b|\bgood\b|—|–/i;

const mixed = (
  district: SetupChoices['district'],
  over: Partial<SetupChoices> = {},
): SetupChoices => ({
  district,
  size: 'medium',
  enterprise: 'mixed',
  arablePct: { cq: 25, nsw: 20, cw: 40, wv: 20 }[district],
  croppedPct: 50,
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Wattle Flat',
  ...over,
});

const server = (seed = 7): GameServer =>
  new GameServer({ store: new MemoryFarmStore(), seed: () => seed });

describe('the words for crops', () => {
  it('writes a sowing window as a range of months', () => {
    expect(monthRange([3, 4, 5])).toBe('Apr to Jun');
    expect(monthRange([10, 11, 0])).toBe('Nov to Jan');
    expect(monthRange([4])).toBe('May');
    expect(monthRange([2, 3, 8, 9])).toBe('Mar to Apr and Sep to Oct');
  });

  it('says why a species is not open, naming the window and the month', () => {
    expect(outOfWindow('Wheat', [3, 4, 5], 10)).toBe(
      'Wheat is sown in Apr to Jun. It is November now.',
    );
  });

  it('says each kind of planting and where it is up to, with no countdown', () => {
    expect(kindText({ type: 'pasture' })).toBe('Pasture');
    expect(kindText({ type: 'annual' })).toBe('Forage crop');
    expect(kindText({ type: 'crop', graze: false })).toBe('Grain crop');
    expect(kindText({ type: 'crop' })).toBe('Grain crop, can be grazed early');
    const stages: FieldProgress[] = [
      { code: 'pasture-establishing', day: 3 },
      { code: 'pasture-established', ageDays: 90, thinning: false },
      { code: 'pasture-established', ageDays: 900, thinning: true },
      { code: 'establishing-keep-off', day: 3 },
      { code: 'establishing', day: 3 },
      { code: 'growing-keep-off', day: 3 },
      { code: 'vegetative', day: 3 },
      { code: 'locked-up', day: 3 },
      { code: 'heading', day: 3 },
      { code: 'ready-to-harvest' },
      { code: 'finished' },
      { code: 'grazing', day: 3 },
      { code: 'going-to-head', day: 3 },
      { code: 'finished-for-season' },
      { code: 'not-sown' },
    ];
    for (const s of stages) {
      const w = stageWord(s);
      expect(w).toMatch(/^[A-Z].*\.$/);
      expect(w).not.toMatch(BANNED);
      expect(w).not.toMatch(/\d/);
    }
    expect(stageWord({ code: 'ready-to-harvest' })).toBe('Ready to harvest.');
  });

  it('gives every species a line on what it is for', () => {
    for (const id of [
      'buffel',
      'leucaena',
      'stylo',
      'phal',
      'rye',
      'lucerne',
      'multi',
      'oats',
      'wheat',
      'barley',
      'grsorg',
      'forsorg',
      'millet',
      'annrye',
      'brass',
    ]) {
      const line = aboutLine(id);
      expect(line.length).toBeGreaterThan(10);
      expect(line).not.toMatch(BANNED);
    }
  });

  it('writes the sow card and the harvest card from the engine figures', () => {
    const sow = sowLines({
      name: 'wheat',
      ha: 24,
      cost: 7_200,
      convHa: 6,
      convCost: 900,
      skipped: 2,
      crop: true,
      cashBefore: 30_000,
    });
    expect(sow).toEqual([
      'Sow wheat on 24.0 ha.',
      'Costs $7,200 for seed, fertiliser, spraying and sowing.',
      'That includes $900 to turn 6.0 ha of pasture into cropping country.',
      '2 squares can not take it. A crop only goes on arable land with no crop in the ground.',
      'Sowing happens at once and takes none of the day.',
      'That leaves $22,800 in the bank.',
    ]);
    const h = harvestLines({
      name: 'wheat',
      ha: 24,
      t: 52.8,
      tha: 2.2,
      value: 14_000,
      cost: 1_200,
      cashBefore: 10_000,
    });
    expect(h[0]).toBe('Harvest wheat on 24.0 ha: about 52.8 t of grain, 2.2 t/ha.');
    expect(h[1]).toBe('Worth about $14,000. Harvesting costs $1,200.');
    expect(h[2]).toBe('That brings the bank to $22,800.');
    for (const line of [...sow, ...h]) expect(line).not.toMatch(BANNED);
  });
});

describe('checking a sow request', () => {
  it('takes known species and squares on the farm, and nothing else', () => {
    expect(parseSow({ type: 'sow', species: 'wheat', cells: [1, 2, 3] })).toEqual({
      type: 'sow',
      species: 'wheat',
      cells: [1, 2, 3],
    });
    for (const bad of [
      { species: 'moon', cells: [1] },
      { species: 'wheat', cells: [] },
      { species: 'wheat', cells: 'x' },
      { species: 'wheat', cells: [-1] },
      { species: 'wheat', cells: [1040] },
      { species: 'wheat', cells: [1.5] },
      { species: 'wheat', cells: Array.from({ length: 1041 }, (_, i) => i % 1040) },
      { species: 7, cells: [1] },
      { species: '__proto__', cells: [1] },
    ]) {
      expect(parseSow(bad)).toBeNull();
    }
  });
});

describe('crops in the snapshot', () => {
  it('shows nothing about crops on a farm that is not mixed', async () => {
    const s = await server().create(A, mixed('cw', { enterprise: 'grazing' }));
    expect(s.cropping).toBeNull();
    expect(s.paddocks.every((p) => p.arableHa === 0)).toBe(true);
  });

  it('lists what the district grows, with cost, window and the reason when it is closed', async () => {
    const s = await server().create(A, mixed('cw'));
    const c = s.cropping!;
    expect(c.options.map((o) => o.id)).toEqual([
      'lucerne',
      'phal',
      'multi',
      'wheat',
      'barley',
      'oats',
      'forsorg',
    ]);
    const wheat = c.options.find((o) => o.id === 'wheat')!;
    expect(wheat.costPerHa).toBeGreaterThan(50);
    expect(wheat.window).toMatch(/^[A-Z][a-z]{2}( to [A-Z][a-z]{2})?$/);
    expect(wheat.open).toBe(false);
    expect(wheat.reason).toMatch(/^Wheat is sown in .+\. It is September now\.$/);
    expect(c.options.find((o) => o.id === 'phal')!.open).toBe(true);
    expect(c.options.find((o) => o.id === 'phal')!.reason).toBeNull();
    // A mixed farm starts with crops in the ground, in plain words.
    expect(c.fields.length).toBeGreaterThan(0);
    expect(c.fields[0]!.stage).toMatch(/\.$/);
    expect(s.paddocks.some((p) => p.arableHa > 0)).toBe(true);
  });

  it('sows in the window: the card says hectares, cost and what is left, then it is in the ground', async () => {
    const game = server();
    const s = await game.create(A, mixed('cw'));
    const pad = s.paddocks.find((p) => p.arableHa > 0)!;
    const cells: number[] = [];
    s.view.squares.arable.forEach((a, i) => {
      if (a === 1 && s.view.squares.paddock[i] === pad.id) cells.push(i);
    });
    const action = { type: 'sow', species: 'phal', cells } as const;
    const p = await game.preview(A, { action });
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    const text = p.card.summary!.join(' ');
    expect(text).toMatch(/^Sow phalaris on [\d,.]+ ha\./i);
    expect(text).toMatch(/Costs \$[\d,]+ for seed, fertiliser, spraying and sowing\./);
    expect(text).toContain('Sowing happens at once and takes none of the day.');
    expect(text).toMatch(/That leaves -?\$[\d,]+ in the bank\./);
    expect(p.card.outcome).toBe('free');
    const done = await game.act(A, { action });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/^Sowed phalaris on [\d.]+ ha\. It cost \$[\d,]+\.$/i);
    expect(done.snapshot.totals.cash).toBeLessThan(s.totals.cash);
    expect(done.snapshot.cropping!.fields.length).toBe(s.cropping!.fields.length + 1);
  }, 60_000);

  it('refuses a crop outside its window with the engine reason', async () => {
    const game = server();
    const s = await game.create(A, mixed('cw'));
    const cells: number[] = [];
    s.view.squares.arable.forEach((a, i) => {
      if (a === 1) cells.push(i);
    });
    const r = await game.preview(A, { action: { type: 'sow', species: 'wheat', cells } });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('out-of-window');
      expect(r.message).toMatch(/can't be sown at this time of year/);
    }
  }, 60_000);

  it('harvest: a crop that is ready shows tonnes and money, and the things to do opens the same card', async () => {
    const game = server();
    await game.create(A, mixed('cw'));
    // Skip until a crop is ready: a skip stops there.
    let snap: Snapshot = (await game.snapshot(A))!;
    for (let i = 0; i < 12 && !snap.todo.some((t) => t.key.startsWith('crop-ready:')); i++) {
      snap = (await game.skip(A, 'month')).snapshot;
    }
    const item = snap.todo.find((t) => t.key.startsWith('crop-ready:'))!;
    expect(item).toBeDefined();
    expect(item.button).toBe('Harvest');
    const field = snap.cropping!.fields.find((f) => f.ready)!;
    expect(field.stage).toBe('Ready to harvest.');
    // The card from the paddock sheet and from the things to do are the same card.
    const fromSheet = await game.preview(A, { action: { type: 'harvest', field: field.id } });
    const fromTodo = await game.preview(A, { todo: item.key });
    expect(fromSheet.ok && fromTodo.ok).toBe(true);
    if (!fromSheet.ok || !fromTodo.ok) return;
    expect(fromTodo.card.summary).toEqual(fromSheet.card.summary);
    expect(fromSheet.card.summary![0]).toMatch(
      /^Harvest .+ on [\d.]+ ha: about [\d.]+ t of grain, [\d.]+ t\/ha\.$/,
    );
    expect(fromSheet.card.summary![1]).toMatch(
      /^Worth about \$[\d,]+\. Harvesting costs \$[\d,]+\.$/,
    );
    expect(fromSheet.card.outcome).toBe('free');
    const done = await game.act(A, { action: { type: 'harvest', field: field.id } });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.message).toMatch(/^Harvested [\d.]+ t of .+, worth \$[\d,]+\.$/);
    expect(done.snapshot.cropping!.fields.some((f) => f.id === field.id)).toBe(false);
    expect(done.snapshot.inbox.some((m) => m.kind === 'crop' && /^Harvested/.test(m.text))).toBe(
      true,
    );
  }, 120_000);
});

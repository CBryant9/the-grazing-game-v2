import { describe, expect, it } from 'vitest';
import { COSTS, COST_PER_M, type FarmEvent } from '@gg/engine';
import { buildWire, fenceOptions, gateNotes, layoutWord, lineWords, perMetre } from './buildwords';

type Layout = Extract<FarmEvent, { type: 'layout-job' }>;
const job = (j: string, cost: number, detail: Layout['detail'] = {}): Layout => ({
  type: 'layout-job',
  job: j,
  cost,
  detail,
});

/** Sentences must be plain: no em dash, no "should", no praise. */
const PLAIN = (text: string): void => {
  expect(text).not.toMatch(/—|–/);
  expect(text).not.toMatch(/\bshould\b/i);
  expect(text).not.toMatch(/\b(great|good|bad|well done|oops|mistake|wrong)\b/i);
};

describe('the tool bar words', () => {
  it('prices a metre of each fence from the engine, whole dollars or cents', () => {
    expect(perMetre(7)).toBe('$7 a metre');
    expect(perMetre(3.6)).toBe('$3.60 a metre');
    expect(perMetre(0.9)).toBe('$0.90 a metre');
    const f = fenceOptions();
    expect(f.map((x) => x.id)).toEqual(['permanent', 'electric', 'tape']);
    expect(f.map((x) => x.perM)).toEqual([
      COST_PER_M.permanent,
      COST_PER_M.electric,
      COST_PER_M.tape,
    ]);
    expect(f[1]!.price).toBe('$3.60 a metre');
  });

  it('has a short help line and a price for every tool', () => {
    const w = buildWire();
    expect(w.tools.map((t) => t.id)).toEqual([
      'fence',
      'gate',
      'pipe',
      'trough',
      'portable',
      'hub',
      'remove',
    ]);
    for (const t of w.tools) {
      expect(t.help.length).toBeGreaterThan(10);
      expect(t.help.length).toBeLessThan(130);
      PLAIN(t.help);
      expect(t.price).toMatch(/\$|card/);
    }
    expect(w.tools.find((t) => t.id === 'fence')!.help).toBe(
      'Drag along the paddock lines to draw a fence.',
    );
    expect(w.tools.find((t) => t.id === 'gate')!.price).toBe(`$${COSTS.gate} a gate`);
    for (const f of w.fences) PLAIN(f.text);
  });
});

describe('a line that does not all fit today', () => {
  it('says nothing when all of it fits', () => {
    expect(lineWords(600, 0)).toEqual([]);
  });

  it("opens with the owner's sentence, then the metres that fit and the metres that do not", () => {
    const w = lineWords(400, 300);
    expect(w[0]).toBe("You don't have enough time to do this today.");
    expect(w[1]).toBe(
      '400 m fits today. 300 m does not, so it is not built. Draw it again another day.',
    );
    w.forEach(PLAIN);
  });

  it('says so plainly when none of it fits', () => {
    expect(lineWords(0, 1200)[1]).toBe(
      'None of it fits today. 1,200 m is not built. Draw it again another day.',
    );
  });
});

describe('what a gate does', () => {
  it('opening names both paddocks and that the mobs join if both hold stock', () => {
    const [n] = gateNotes('open', 'Paddock 1', 'Paddock 2', false);
    expect(n).toContain('Paddock 1 and Paddock 2');
    expect(n).toContain('will join if both hold stock');
    expect(n).not.toContain('Both hold stock now');
    PLAIN(n!);
  });
  it('says so when both hold stock now', () => {
    expect(gateNotes('open', 'A', 'B', true)[0]).toContain('Both hold stock now.');
  });
  it('shutting keeps them apart, and a new gate goes in shut', () => {
    expect(gateNotes('shut', 'A', 'B', false)[0]).toBe('Shutting it keeps A and B apart.');
    expect(gateNotes('place', 'A', 'B', false)[0]).toContain('put in shut');
  });
  it('has nothing to say when nothing changes or both sides are one paddock', () => {
    expect(gateNotes('none', 'A', 'B', false)).toEqual([]);
    expect(gateNotes('open', 'A', 'A', false)).toEqual([]);
  });
});

describe('what a done job reports', () => {
  it('fence: what was built and what it cost', () => {
    expect(
      layoutWord(
        job('buildFence', 2340, { fence: 'electric', metres: 650, energiserBought: false }),
      ),
    ).toBe('Built 650 m of electric fence. It cost $2,340.');
    const tape = layoutWord(
      job('buildFence', 90, { fence: 'tape', metres: 300, tapeFromRollM: 200, tapeNewM: 100 }),
    );
    expect(tape).toBe('Built 300 m of tape. It cost $90. 200 m came off the roll.');
  });
  it('mentions the energiser when it was bought with the fence', () => {
    expect(
      layoutWord(
        job('buildFence', 1260, { fence: 'electric', metres: 100, energiserBought: true }),
      ),
    ).toContain('solar energiser');
  });
  it('removing, rolling up and gates', () => {
    expect(layoutWord(job('removeFence', 0, { metres: 100 }))).toBe('Took down 100 m of fence.');
    expect(layoutWord(job('rollUpTape', 10, { tapeToRollM: 400 }))).toBe(
      'Rolled up 400 m of tape. It cost $10.',
    );
    expect(layoutWord(job('placeGate', 450))).toBe('Put in a gate. It cost $450.');
    expect(layoutWord(job('setGate', 0, { open: true }))).toBe('The gate is open.');
    expect(layoutWord(job('setGate', 0, { open: false }))).toBe('The gate is shut.');
    expect(layoutWord(job('fixFence', 25))).toBe('Put the fence back up. It cost $25.');
  });
  it('pipe, troughs and hubs', () => {
    expect(layoutWord(job('layPipe', 480, { metres: 100, connected: true }))).toBe(
      'Laid 100 m of pipe. It cost $480.',
    );
    expect(layoutWord(job('layPipe', 480, { metres: 100, connected: false }))).toContain(
      'not joined to water',
    );
    expect(layoutWord(job('placeTrough', 1500))).toBe('Put in a trough. It cost $1,500.');
    expect(layoutWord(job('removePortable', -300))).toBe('Sold the portable trough back for $300.');
    expect(layoutWord(job('placeFenceHub', 2000))).toContain('water hub');
  });
  it('is null for a job it has no words for', () => {
    expect(layoutWord(job('somethingElse', 0))).toBeNull();
  });
});

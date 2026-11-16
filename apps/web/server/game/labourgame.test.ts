import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createFarm,
  endDay,
  jobSeekers,
  previewAction,
  workforceView,
  type FarmState,
  type JobCard,
  type LabourEvent,
} from '@gg/engine';
import type { SetupChoices, Snapshot, SummaryWire } from '../../lib/game/types';
import { GameServer, missedDays, parseAction } from './game';
import { inboxMessage } from './inboxwords';
import {
  contractsWire,
  daysText,
  handsNotes,
  isLabourEvent,
  labourMessage,
  owedTodo,
  workforceWire,
} from './labourwords';
import { buildSnapshot } from './snapshot';
import { MemoryFarmStore } from './store';
import { growthLine } from './years';

/*
 * The screens for farm hands and contractor fencing (milestone 2.2): the
 * words say facts, never judge a worker, and every workforce event has a
 * message. The rules behind them (pay, injury, the list) are the engine's.
 */

const A = 'e'.repeat(32);
const W = 40;

const choices: SetupChoices = {
  district: 'cw',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Wattle Flat',
};

/** Words that judge a person. None may appear anywhere a worker is described. */
const JUDGING =
  /reliable|unreliable|lazy|good worker|bad worker|hard.?working|excellent|poor worker|best|worst|skilled worker|\bgood\b|\bbad\b|—|–/i;

const dateOf = (day: number) => {
  const d = new Date(Date.UTC(2026, 8, 1) + day * 86_400_000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate() };
};

/** One of each workforce event. A new event type in the engine fails this type until it has one here. */
const ONE_OF_EACH: Record<LabourEvent['type'], LabourEvent[]> = {
  'hand-hired': [
    {
      type: 'hand-hired',
      hand: 1,
      name: 'Sam Brown',
      kind: 'casual',
      rate: 322,
      startDay: 3,
      endDay: null,
    },
    {
      type: 'hand-hired',
      hand: 2,
      name: 'Jo Lee',
      kind: 'contract',
      rate: 300,
      startDay: 3,
      endDay: 94,
    },
    {
      type: 'hand-hired',
      hand: 3,
      name: 'Al Wu',
      kind: 'salaried',
      rate: 1202,
      startDay: 3,
      endDay: null,
    },
  ],
  'hand-left': [
    { type: 'hand-left', hand: 1, name: 'Sam Brown', why: 'let-go', paid: 640, stillOwed: 0 },
    {
      type: 'hand-left',
      hand: 1,
      name: 'Sam Brown',
      why: 'contract-finished',
      paid: 640,
      stillOwed: 0,
    },
    { type: 'hand-left', hand: 1, name: 'Sam Brown', why: 'not-paid', paid: 0, stillOwed: 1200 },
  ],
  'wages-paid': [{ type: 'wages-paid', hands: 2, wages: 3000, superannuation: 360, total: 3360 }],
  'wages-owed-paid': [{ type: 'wages-owed-paid', amount: 1200 }],
  'wages-missed': [
    {
      type: 'wages-missed',
      hand: 1,
      name: 'Sam Brown',
      owed: 1200,
      standingBefore: 80,
      standingAfter: 60,
    },
  ],
  'hand-injured': [
    {
      type: 'hand-injured',
      hand: 1,
      name: 'Sam Brown',
      day: 10,
      fencing: true,
      backDay: 55,
      cost: 1202,
      paidNow: true,
    },
    {
      type: 'hand-injured',
      hand: 1,
      name: 'Sam Brown',
      day: 10,
      fencing: false,
      backDay: 55,
      cost: 1202,
      paidNow: false,
    },
  ],
  'hand-back': [{ type: 'hand-back', hand: 1, name: 'Sam Brown' }],
  'hand-duty': [
    {
      type: 'hand-duty',
      hand: 1,
      name: 'Sam Brown',
      duty: { type: 'refill-trough', port: 1, cell: 5, cost: 12 },
    },
    {
      type: 'hand-duty',
      hand: 1,
      name: 'Sam Brown',
      duty: { type: 'fix-fence', edge: { line: 'h', index: 3 }, cost: 40 },
    },
  ],
  'contract-ordered': [
    {
      type: 'contract-ordered',
      run: 1,
      team: 1,
      handsHelp: true,
      metres: 1200,
      materials: 8400,
      labour: 6000,
      cost: 14400,
      ratePerM: 5,
      startDay: 4,
      doneDay: 7,
    },
  ],
  'contract-built': [
    {
      type: 'contract-built',
      run: 1,
      metres: 500,
      byHandsM: 0,
      metresLeft: 700,
      cost: 6000,
      doneDay: 7,
    },
    {
      type: 'contract-built',
      run: 1,
      metres: 800,
      byHandsM: 300,
      metresLeft: 0,
      cost: 9600,
      doneDay: 7,
    },
  ],
  'contract-finished': [{ type: 'contract-finished', run: 1, metres: 1200, spent: 14400 }],
  'contract-stopped': [
    {
      type: 'contract-stopped',
      run: 1,
      why: 'no-money',
      metresBuilt: 400,
      metresLeft: 800,
      spent: 4800,
    },
    {
      type: 'contract-stopped',
      run: 1,
      why: 'line-changed',
      metresBuilt: 400,
      metresLeft: 800,
      spent: 4800,
    },
  ],
  'contract-cancelled': [
    { type: 'contract-cancelled', run: 1, metresBuilt: 400, metresLeft: 800, spent: 4800 },
  ],
};

describe('every workforce event has words in the inbox', () => {
  const all = Object.values(ONE_OF_EACH).flat();

  it.each(all.map((e, i) => [`${e.type} ${i}`, e] as const))('says %s as a fact', (_n, e) => {
    expect(isLabourEvent(e)).toBe(true);
    const m = inboxMessage(e, dateOf);
    expect(m).not.toBeNull();
    expect(m!.kind).toBe('work');
    expect(m!.text.length).toBeGreaterThan(10);
    expect(m!.text).toBe(labourMessage(e, dateOf));
    expect(m!.text).not.toMatch(JUDGING);
  });

  it('says the day, the pay and why, in plain Australian English', () => {
    const text = (e: LabourEvent): string => labourMessage(e, dateOf);
    expect(text(ONE_OF_EACH['hand-hired'][0]!)).toBe(
      'Sam Brown was hired as a casual hand at $322 a day worked. They start on Friday 4 September.',
    );
    expect(text(ONE_OF_EACH['hand-hired'][2]!)).toContain('on a salary of $1,202 a week');
    expect(text(ONE_OF_EACH['hand-left'][2]!)).toContain('their wages could not be paid');
    expect(text(ONE_OF_EACH['wages-paid'][0]!)).toBe(
      'Pay day: 2 hands paid. Wages $3,000, super $360, $3,360 in all.',
    );
    expect(text(ONE_OF_EACH['contract-stopped'][0]!)).toContain('the bank would not cover');
    expect(text(ONE_OF_EACH['contract-stopped'][1]!)).toContain('a different fence');
    expect(text(ONE_OF_EACH['contract-cancelled'][0]!)).toContain('nothing more is owed');
  });
});

describe('the growth line on a skip', () => {
  it('says tonnes grown and eaten, with one rounding for both and kilograms under a tonne', () => {
    expect(growthLine(182_400, 176_300)).toBe('182 t DM of pasture grew. The cattle ate 176 t DM.');
    // A flat "Feed A to A" week still reads sensibly.
    expect(growthLine(3_400, 3_350, true)).toBe(
      '3.4 t DM of pasture grew. The cattle ate 3.4 t DM.',
    );
    // Both figures use the same rounding: never "12 t ... 9.8 t" or "0.0 t".
    expect(growthLine(12_000, 9_800, true)).toBe(
      '12 t DM of pasture grew. The cattle ate 10 t DM.',
    );
    expect(growthLine(24_000, 2_000, true)).toBe('24 t DM of pasture grew. The cattle ate 2 t DM.');
    expect(growthLine(9_800, 12_000, true)).toBe(
      '10 t DM of pasture grew. The cattle ate 12 t DM.',
    );
    // Under a tonne, kilograms.
    expect(growthLine(40, 25, true)).toBe('40 kg DM of pasture grew. The cattle ate 25 kg DM.');
    expect(growthLine(0, 0, true)).toBe('0 kg DM of pasture grew. The cattle ate 0 kg DM.');
    expect(growthLine(840, 910, true)).toBe('840 kg DM of pasture grew. The cattle ate 910 kg DM.');
  });
});

describe('the days people work', () => {
  it('says them as a run, or as a list', () => {
    expect(daysText([1, 2, 3, 4, 5])).toBe('Works Monday to Friday');
    expect(daysText([0, 3, 4, 5, 6])).toBe('Works Wednesday to Sunday');
    expect(daysText([1, 3, 5])).toBe('Works Monday, Wednesday and Friday');
    expect(daysText([0, 1, 2, 3, 4, 5, 6])).toBe('Works every day');
  });
});

/** A farm a few days old with a person to hire. */
function farmWithSeekers(): FarmState {
  let farm = createFarm({
    seed: 3,
    district: 'nsw',
    size: 'small',
    start: { year: 2026, month: 8 },
    startType: 'running',
    difficulty: 'easy',
  });
  for (let i = 0; i < 14 && jobSeekers(farm).length === 0; i++) {
    // The list changes with the week: step a day at a time through the engine.
    farm = { ...farm, day: farm.day + 1 };
  }
  return farm;
}

describe('the Workforce panel', () => {
  it('says each person as facts: skills as plain numbers, days, pay and dogs', () => {
    const farm = farmWithSeekers();
    const w = workforceWire(farm, []);
    expect(w.seekers.length).toBeGreaterThan(0);
    for (const p of w.seekers) {
      expect(p.skills.map((s) => s.text)).toEqual([
        expect.stringMatching(/^Fencing [1-5] of 5$/),
        expect.stringMatching(/^Stock work [1-5] of 5$/),
        expect.stringMatching(/^Water and pipe [1-5] of 5$/),
      ]);
      expect(p.daysText).toMatch(/^Works /);
      expect(p.rateText).toMatch(/^\$[\d,]+ a (day worked|week)$/);
      expect(p.payText).toMatch(/^About \$[\d,]+ each pay day, with super/);
      expect(p.dogsText).toMatch(/^(No dogs\.|Has a team of dogs\.)/);
      expect(JSON.stringify(p)).not.toMatch(JUDGING);
    }
    expect(w.seekersText).toMatch(/looking for work/);
    expect(w.hands).toEqual([]);
    expect(w.payText).toBeNull();
    expect(w.owedText).toBeNull();
  });

  it('describes the standing and the fact behind it, and never a number', () => {
    const farm = farmWithSeekers();
    const none = workforceWire(farm, []).standing;
    expect(none.fact).toBe('No wages missed in the last year.');
    expect(workforceWire(farm, [farm.day - 10]).standing.fact).toBe(
      'Wages missed once in the last year.',
    );
    expect(workforceWire(farm, [farm.day - 10, farm.day - 40]).standing.fact).toBe(
      'Wages missed 2 times in the last year.',
    );
    // A miss more than a year ago is not counted.
    expect(workforceWire(farm, [farm.day - 400]).standing.fact).toBe(
      'No wages missed in the last year.',
    );
    expect(`${none.level} ${none.effect}`).not.toMatch(/\d/);
    expect(JSON.stringify(none)).not.toMatch(JUDGING);
  });

  it('says wages owed from before as a fact, what happens, and offers a to-do line', () => {
    const farm = farmWithSeekers();
    const hired = applyAction(farm, { type: 'hireHand', person: jobSeekers(farm)[0]!.id });
    expect(hired.ok).toBe(true);
    if (!hired.ok) return;
    const owing: FarmState = {
      ...hired.farm,
      labour: { ...hired.farm.labour!, wagesOwed: 1500 },
    };
    expect(workforceWire(owing, []).owedText).toBe(
      'The farm owes $1,500 in wages from before. It is paid by itself as soon as the bank can cover it all.',
    );
    expect(owedTodo(owing)).toContain('$1,500');
    expect(owedTodo(hired.farm)).toBeNull();
    const snap = buildSnapshot(
      owing,
      { name: 'x', setup: { ...choices, district: 'nsw' }, version: 'v' },
      {},
    );
    const line = snap.todo.find((t) => t.key === 'wages-owed')!;
    expect(line.opens).toBe('workforce');
    expect(line.button).toBe('See workforce');
    expect(line.text).not.toMatch(JUDGING);
  });

  it('lists the hand with their status, pay and when the next pay day is', () => {
    const farm = farmWithSeekers();
    const hired = applyAction(farm, { type: 'hireHand', person: jobSeekers(farm)[0]!.id });
    if (!hired.ok) throw new Error(hired.message);
    const w = workforceWire(hired.farm, []);
    expect(w.hands).toHaveLength(1);
    expect(w.hands[0]!.statusText).toMatch(/^Starts [A-Z][a-z]+day \d+ [A-Z][a-z]+$/);
    expect(w.hands[0]!.owedText).toBe('Nothing owed since the last pay day.');
    expect(w.payText).toMatch(/^Pay day is [A-Z][a-z]+day \d+ [A-Z][a-z]+, then every 14 days\./);
    expect(contractsWire(hired.farm)).toEqual([]);
  });
});

describe("pay days missed are dated from the run's own first-light events", () => {
  const miss = { type: 'wages-missed' } as never;
  const paid = { type: 'wages-paid' } as never;

  it('dates each miss by the pay day it fell on, not by the inbox or the last day of a skip', () => {
    const farm = { ...farmWithSeekers(), day: 100 };
    expect(missedDays(farm, 14, [])).toEqual([]);
    // Three hands unpaid on the first pay day: the same day three times (one pay day).
    expect(missedDays(farm, 14, [miss, miss, miss])).toEqual([14, 14, 14]);
    // A pay day that paid, then one that missed: the second pay day, a cycle later.
    expect(missedDays(farm, 14, [paid, miss])).toEqual([28]);
    expect(missedDays(farm, 14, [paid, paid, miss, miss])).toEqual([42, 42]);
    // Never after the day the skip ended.
    expect(missedDays({ ...farm, day: 20 }, 14, [paid, paid, miss])).toEqual([20]);
    // No pay day known: the farm's day.
    expect(missedDays(farm, null, [miss])).toEqual([100]);
  });

  it('counts a pay day once, however many hands it left unpaid', () => {
    const farm = farmWithSeekers();
    const fact = (days: number[]) => workforceWire(farm, days).standing.fact;
    expect(fact([farm.day - 5, farm.day - 5, farm.day - 5])).toBe(
      'Wages missed once in the last year.',
    );
    expect(fact([farm.day - 5, farm.day - 5, farm.day - 40])).toBe(
      'Wages missed 2 times in the last year.',
    );
  });
});

describe("the hand's share on a job card", () => {
  const sizes = ['small', 'medium', 'large'] as const;

  /** A farm of this size with one hand of this fencing skill who is at work today. */
  function withHand(size: (typeof sizes)[number], skill: number): FarmState {
    let farm = createFarm({
      seed: 3,
      // The largest size is the Central Queensland station, where a piece of fence is longest.
      district: size === 'large' ? 'cq' : 'cw',
      size,
      start: { year: 2026, month: 8 },
      startType: 'running',
      difficulty: 'easy',
    });
    for (let i = 0; i < 20 && jobSeekers(farm).length === 0; i++) farm = endDay(farm).farm;
    const hired = applyAction(farm, { type: 'hireHand', person: jobSeekers(farm)[0]!.id });
    if (!hired.ok) throw new Error(hired.message);
    farm = hired.farm;
    farm.labour!.hands[0]!.skills.fencing = skill;
    for (let i = 0; i < 9 && workforceView(farm).hands[0]!.status !== 'working'; i++) {
      farm = endDay(farm).farm;
    }
    expect(workforceView(farm).hands[0]!.status).toBe('working');
    return farm;
  }

  const line = (n: number, row = 14) =>
    Array.from({ length: n }, (_, i) => ({ line: 'h' as const, index: row * W + 5 + i }));

  /** A line of n pieces in the first row with new fence to build, or null. */
  const freeLine = (farm: FarmState, n: number) => {
    for (let row = 5; row < 25; row++) {
      const edges = line(n, row);
      if (previewAction(farm, { type: 'buildFence', edges, fence: 'permanent' }).ok) return edges;
    }
    return null;
  };

  const noteFor = (farm: FarmState, n: number): { text: string; card: JobCard } | null => {
    const edges = freeLine(farm, n);
    if (!edges) return null;
    const r = previewAction(farm, { type: 'buildFence', edges, fence: 'permanent' });
    if (!r.ok || !r.card.hands) return null;
    return { text: handsNotes(farm, r.card).join(' '), card: r.card };
  };

  /** Which of the three truths a note tells. */
  const kind = (text: string): 'all' | 'metres' | 'time' =>
    /builds all /.test(text)
      ? 'all'
      : /the first [\d,]+ m is the hand's share/.test(text)
        ? 'metres'
        : 'time';

  it('says the metres when the share covers whole pieces, all of it when the line is inside the share, and the time when the share is under a piece: never 0 m', () => {
    const seen = new Set<string>();
    for (const size of sizes) {
      for (const skill of [1, 3, 5]) {
        const farm = withHand(size, skill);
        for (const n of [1, 3, 20]) {
          const got = noteFor(farm, n);
          if (!got) continue;
          const { text, card } = got;
          expect(text, `${size} skill ${skill} ${n} pieces`).not.toMatch(/\b0 m\b/);
          expect(text).toMatch(/uses none of your light|off your day for this line/);
          const k = kind(text);
          seen.add(k);
          const h = card.hands!;
          const fits = card.line!.fits.metres;
          if (h.metres === 0) expect(k).toBe('time');
          else if (h.metres! >= fits) expect(k).toBe('all');
          else expect(k).toBe('metres');
          if (k === 'time')
            expect(text).toMatch(
              /takes about (\d+ h )?(\d+ min|\d+ h) off your day for this line\.$/,
            );
          if (k === 'all') expect(text).toContain(`${Math.round(fits).toLocaleString('en-AU')} m`);
        }
      }
    }
    // The tests reach all three.
    expect([...seen].sort()).toEqual(['all', 'metres', 'time']);
  });

  it('says it in time on the largest farm for a skill-1 hand and a one-piece line', () => {
    const farm = withHand('large', 1);
    const side = farm.layout.scale.sideM;
    expect(side).toBeGreaterThanOrEqual(200);
    const got = noteFor(farm, 1);
    expect(got).not.toBeNull();
    expect(got!.card.hands!.metres).toBe(0);
    expect(got!.text).toMatch(/work takes about .+ off your day for this line\.$/);
    expect(got!.text).not.toMatch(/\b0 m\b/);
  });

  it('a hand who has already used part of the day still gets a true note', () => {
    const farm = withHand('medium', 3);
    const first = applyAction(farm, {
      type: 'buildFence',
      edges: freeLine(farm, 6)!,
      fence: 'permanent',
    });
    if (!first.ok) throw new Error(first.message);
    const got = noteFor(first.farm, 20);
    if (got) {
      expect(got.text).not.toMatch(/\b0 m\b/);
      const h = got.card.hands!;
      expect(kind(got.text)).toBe(
        h.metres === 0 ? 'time' : h.metres! >= got.card.line!.fits.metres ? 'all' : 'metres',
      );
    }
  });
});

describe('hiring, fencing by a team and the worker report, through the game server', () => {
  it('hire, order a team, skip a week, see the report and the progress, cancel, let go', async () => {
    const game = new GameServer({ store: new MemoryFarmStore(), seed: () => 7 });
    let snap: Snapshot = await game.create(A, choices);
    // Days go by until someone is looking for work.
    for (let i = 0; i < 14 && snap.workforce.seekers.length === 0; i++) {
      snap = (await game.endDay(A)).snapshot;
    }
    const person = snap.workforce.seekers[0]!;
    // The id is opaque: the engine's own says which week the person joined the list.
    expect(person.id).toMatch(/^[0-9a-f]{12}$/);
    const stale = await game.act(A, { action: { type: 'hireHand', person: 'deadbeef0000' } });
    expect(stale.ok).toBe(false);
    expect(stale.ok ? '' : stale.message).toMatch(/not on the list/);

    // Hire: the card says the cost per pay and when they start. Nothing is charged yet.
    const hirePreview = await game.preview(A, { action: { type: 'hireHand', person: person.id } });
    if (!hirePreview.ok) throw new Error(hirePreview.message);
    expect(hirePreview.card.summary![0]).toMatch(new RegExp(`^Hire ${person.name} `));
    expect(hirePreview.card.summary!.join(' ')).toMatch(/They start tomorrow, [A-Z]/);
    expect(hirePreview.card.summary!.join(' ')).toMatch(/each pay day, with super/);
    expect(hirePreview.card.summary!.join(' ')).toMatch(/Pay day is /);
    expect(hirePreview.card.summary!.at(-1)).toBe('Nothing is paid today.');
    const cash0 = snap.totals.cash;
    const hired = await game.act(
      A,
      { action: { type: 'hireHand', person: person.id } },
      { version: hirePreview.version, requestId: 'hire-1' },
    );
    if (!hired.ok) throw new Error(hired.message);
    expect(hired.message).toMatch(/was hired/);
    expect(hired.snapshot.workforce.hands.map((h) => h.id)).toEqual([person.id]);
    expect(hired.snapshot.workforce.seekers.some((p) => p.id === person.id)).toBe(false);
    expect(hired.snapshot.totals.cash).toBe(cash0);
    snap = hired.snapshot;

    // A permanent line: the card offers a 1-man and a 2-man team with their prices.
    // Twelve segments: more than a 1-man team builds in a day, so it runs over several.
    const across = Array.from({ length: 12 }, (_, i) => 5 + i);
    const edges = across.map((x) => ({ line: 'h' as const, index: 14 * W + x }));
    const fence = await game.preview(A, {
      action: { type: 'buildFence', edges, fence: 'permanent' },
    });
    if (!fence.ok) throw new Error(fence.message);
    expect(fence.teams?.map((t) => t.label)).toEqual(['1-man team', '2-man team']);
    expect(Object.hasOwn(fence.card, 'teams')).toBe(false);
    for (const t of fence.teams!) {
      expect(t.price).toMatch(/^\$[\d,]+$/);
      expect(t.lines.join(' ')).toMatch(/Materials \$[\d,]+ plus labour \$[\d,]+\./);
      expect(t.lines.join(' ')).toMatch(/Done on [A-Z][a-z]+day \d+ [A-Z][a-z]+\./);
      expect(t.lines).toContain('Uses none of your day.');
    }
    // Tape is not built by a team.
    const tape = await game.preview(A, { action: { type: 'buildFence', edges, fence: 'tape' } });
    if (!tape.ok) throw new Error(tape.message);
    expect(tape.teams).toBeUndefined();

    // Order a team: the card says materials plus labour, the start day and the done day.
    const order = { action: { type: 'orderContractFence' as const, edges, team: 1 as const } };
    const quote = await game.preview(A, order);
    if (!quote.ok) throw new Error(quote.message);
    const lines = quote.card.summary!.join('\n');
    expect(lines).toMatch(/^A 1-man team builds [\d,]+ m of permanent fence\./);
    expect(lines).toMatch(/Materials \$[\d,]+ plus labour \$[\d,]+: \$[\d,]+ in all\./);
    expect(lines).toMatch(/It starts on [A-Z][a-z]+day \d+ [A-Z][a-z]+ and is done on [A-Z]/);
    expect(lines).toContain('It uses none of your day.');
    expect(lines).toContain('Your hands help the team on the days they work');
    expect(lines).toMatch(/That leaves -?\$[\d,]+ in the bank once it is all built\./);
    const ordered = await game.act(A, order, { version: quote.version, requestId: 'order-1' });
    if (!ordered.ok) throw new Error(ordered.message);
    expect(ordered.message).toMatch(/^Contract fencing ordered: a 1-man team will build [\d,]+ m/);
    expect(ordered.snapshot.contracts).toHaveLength(1);
    const run = ordered.snapshot.contracts[0]!;
    expect(run.text).toMatch(
      /^Contract fence: [\d,]+ m left, done on [A-Z][a-z]+day \d+ [A-Z][a-z]+$/,
    );
    expect(run.left).toHaveLength(12);
    expect(run.built).toHaveLength(0);

    // A skip: the run goes on by itself, the report says so, and the growth line is on the summary.
    const week = await game.skip(A, 'week');
    const sum: SummaryWire = week.summary;
    expect(sum.growth).toMatch(/^[\d.,]+ t DM of pasture grew\. The cattle ate [\d.,]+ t DM\.$/);
    const team = sum.report.find((b) => b.who === 'Fencing team');
    expect(team?.text).toMatch(/^Built \d+ m of fence.* It cost \$[\d,]+\./);
    // After a skip of days the report is stepped through; the money leaves with a line of its own.
    expect(sum.reportFirst).toBe(true);
    expect(sum.money.contract).toBeGreaterThan(0);
    expect(sum.money.wages).toBeGreaterThanOrEqual(0);
    const diary = (await game.record(A)).diary.flatMap((d) => d.lines).join('\n');
    expect(diary).toMatch(/Contract fencing: \$[\d,]+/);
    expect(
      week.snapshot.contracts.length + sum.report.filter((b) => /finished/.test(b.text)).length,
    ).toBeGreaterThan(0);
    for (const b of sum.report) expect(`${b.who} ${b.text}`).not.toMatch(JUDGING);
    // And the same things are in the inbox.
    expect(week.snapshot.inbox.some((m) => m.kind === 'work')).toBe(true);
    // A day has no growth line.
    const day = await game.endDay(A);
    expect(day.summary.growth).toBeNull();
    // A day with nothing that needs the eye keeps the report inside the summary, with no step-through.
    expect(day.summary.reportFirst).toBe(false);
    snap = day.snapshot;

    // The whole run is a permanent fence in the end, and nothing is left under way.
    for (let i = 0; i < 4 && snap.contracts.length > 0; i++) {
      snap = (await game.skip(A, 'week')).snapshot;
    }

    // Cancel a second run: the card says what is kept and that nothing more is owed.
    const edges2 = across.map((x) => ({ line: 'h' as const, index: 16 * W + x }));
    const second = await game.act(A, {
      action: { type: 'orderContractFence', edges: edges2, team: 2 },
    });
    if (!second.ok) throw new Error(second.message);
    const runId = second.snapshot.contracts[0]!.id;
    const cancel = await game.preview(A, {
      action: { type: 'cancelContractFence', run: runId },
    });
    if (!cancel.ok) throw new Error(cancel.message);
    expect(cancel.card.summary!.join(' ')).toMatch(
      /Stop the contract fence\. The 0 m already built stays\. [\d,]+ m will not be built\. \$0 has been charged so far and stays paid\. Nothing more is owed\./,
    );
    const cancelled = await game.act(A, { action: { type: 'cancelContractFence', run: runId } });
    if (!cancelled.ok) throw new Error(cancelled.message);
    expect(cancelled.snapshot.contracts).toEqual([]);

    // Let the hand go: the card says what is paid today and what that leaves in the bank.
    const handId = cancelled.snapshot.workforce.hands[0]!.id;
    const go = await game.preview(A, { action: { type: 'letHandGo', hand: handId } });
    if (!go.ok) throw new Error(go.message);
    expect(go.card.summary![0]).toMatch(/^Let .+ go\.$/);
    expect(go.card.summary![1]).toMatch(
      /^They are paid \$[\d,]+ now: the wages and super owed up to the end of today\.$/,
    );
    expect(go.card.summary![2]).toMatch(/^That leaves -?\$[\d,]+ in the bank\.$/);
    const left = await game.act(A, { action: { type: 'letHandGo', hand: handId } });
    if (!left.ok) throw new Error(left.message);
    expect(left.message).toMatch(/was let go, and was paid \$/);
    expect(left.snapshot.workforce.hands).toEqual([]);
  }, 120_000);

  it('does not let a browser say whether hands help, or send a team that is not 1 or 2', () => {
    const edges = [{ line: 'h', index: 14 * W + 5 }];
    expect(parseAction({ type: 'orderContractFence', edges, team: 3 })).toBeNull();
    expect(parseAction({ type: 'orderContractFence', edges, team: 1.5 })).toBeNull();
    expect(parseAction({ type: 'orderContractFence', edges: [], team: 1 })).toBeNull();
    expect(parseAction({ type: 'hireHand', person: 12 })).toBeNull();
    expect(parseAction({ type: 'hireHand', person: 'abc' })).toBeNull();
    expect(parseAction({ type: 'letHandGo', hand: 7 })).toBeNull();
    expect(parseAction({ type: 'cancelContractFence', run: 1e12 })).toBeNull();
    const ok = parseAction({ type: 'orderContractFence', edges, team: 2, handsHelp: true });
    expect(ok).toEqual({ type: 'orderContractFence', edges, team: 2, handsHelp: false });
  });
});

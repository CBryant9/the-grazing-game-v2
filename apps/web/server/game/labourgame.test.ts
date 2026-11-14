import { describe, expect, it } from 'vitest';
import { applyAction, createFarm, jobSeekers, type FarmState, type LabourEvent } from '@gg/engine';
import type { SetupChoices, Snapshot, SummaryWire } from '../../lib/game/types';
import { GameServer, missedDays, parseAction } from './game';
import { inboxMessage } from './inboxwords';
import {
  contractsWire,
  daysText,
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
  it('says tonnes grown and eaten, with a decimal for a short skip and none for a year', () => {
    expect(growthLine(182_400, 176_300)).toBe('182 t DM of pasture grew. The cattle ate 176 t DM.');
    // A flat "Feed A to A" week still reads sensibly.
    expect(growthLine(3_400, 3_350, true)).toBe(
      '3.4 t DM of pasture grew. The cattle ate 3.4 t DM.',
    );
    expect(growthLine(24_000, 2_000, true)).toBe(
      '24 t DM of pasture grew. The cattle ate 2.0 t DM.',
    );
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

describe('pay days missed are counted from first light', () => {
  it('takes the days from the inbox, and the last day for what has rolled off it', () => {
    const farm = farmWithSeekers();
    expect(missedDays(farm, 0, [])).toEqual([]);
    const miss = { type: 'wages-missed' } as const;
    // Nothing in the inbox: the miss counts on the farm's day.
    expect(missedDays(farm, 0, [miss as never])).toEqual([farm.day]);
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
    expect(fence.card.teams?.map((t) => t.label)).toEqual(['1-man team', '2-man team']);
    for (const t of fence.card.teams!) {
      expect(t.price).toMatch(/^\$[\d,]+$/);
      expect(t.lines.join(' ')).toMatch(/Materials \$[\d,]+ plus labour \$[\d,]+\./);
      expect(t.lines.join(' ')).toMatch(/Done on [A-Z][a-z]+day \d+ [A-Z][a-z]+\./);
      expect(t.lines).toContain('Uses none of your day.');
    }
    // Tape is not built by a team.
    const tape = await game.preview(A, { action: { type: 'buildFence', edges, fence: 'tape' } });
    if (!tape.ok) throw new Error(tape.message);
    expect(tape.card.teams).toBeUndefined();

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
    expect(team?.text).toMatch(/^Built \d+ m of fence/);
    expect(
      week.snapshot.contracts.length + sum.report.filter((b) => /finished/.test(b.text)).length,
    ).toBeGreaterThan(0);
    for (const b of sum.report) expect(`${b.who} ${b.text}`).not.toMatch(JUDGING);
    // And the same things are in the inbox.
    expect(week.snapshot.inbox.some((m) => m.kind === 'work')).toBe(true);
    // A day has no growth line.
    const day = await game.endDay(A);
    expect(day.summary.growth).toBeNull();
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
    expect(parseAction({ type: 'hireHand', person: -1 })).toBeNull();
    expect(parseAction({ type: 'letHandGo', hand: 'x' })).toBeNull();
    expect(parseAction({ type: 'cancelContractFence', run: 1e12 })).toBeNull();
    const ok = parseAction({ type: 'orderContractFence', edges, team: 2, handsHelp: true });
    expect(ok).toEqual({ type: 'orderContractFence', edges, team: 2, handsHelp: false });
  });
});

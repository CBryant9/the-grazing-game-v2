import { createFarm, saveFarm } from '@gg/engine';
import { describe, expect, it } from 'vitest';
import type { DateParts, SetupChoices } from '../../lib/game/types';
import {
  DIARY_DAYS,
  DIARY_LINES,
  DIARY_PAGE,
  diaryPage,
  fileLines,
  summaryLines,
  type StoredDiaryDay,
} from './diary';
import { GameError, GameServer, farmIdFor } from './game';
import { MemoryFarmStore, STORED_FORMAT, type StoredFarm } from './store';

const A = 'a'.repeat(32);
const date = (n: number): DateParts => ({ year: 2026, month: 8, date: (n % 28) + 1 });
const filing = (day: number, lines: string[]) => ({ day, date: date(day), lines });

const SETUP: SetupChoices = {
  district: 'cw',
  size: 'small',
  enterprise: 'grazing',
  years: 'random',
  startType: 'running',
  difficulty: 'medium',
  name: 'Diary Test',
};

const server = (store = new MemoryFarmStore()): GameServer =>
  new GameServer({ store, seed: () => 7 });

describe('the diary lists', () => {
  it('keeps the last 400 days and drops the oldest', () => {
    const all = Array.from({ length: DIARY_DAYS + 50 }, (_, i) => filing(i, [`Day ${i}.`]));
    const diary = fileLines([], all);
    expect(diary).toHaveLength(DIARY_DAYS);
    expect(diary[0]!.day).toBe(50);
    expect(diary[diary.length - 1]!.day).toBe(DIARY_DAYS + 49);
    // One more day pushes the oldest out.
    const next = fileLines(diary, [filing(DIARY_DAYS + 50, ['One more.'])]);
    expect(next).toHaveLength(DIARY_DAYS);
    expect(next[0]!.day).toBe(51);
  });

  it('keeps 12 lines for a day and says how many more', () => {
    const lines = Array.from({ length: 15 }, (_, i) => `Line ${i + 1}.`);
    const diary = fileLines([], [filing(3, lines)]);
    expect(diary[0]!.lines).toHaveLength(DIARY_LINES);
    expect(diary[0]!.more).toBe(3);
    const page = diaryPage(diary);
    expect(page.diary[0]!.lines).toHaveLength(DIARY_LINES + 1);
    expect(page.diary[0]!.lines.at(-1)).toBe('and 3 more');
    // More lines on the same day, from another job, still count against the day.
    const later = fileLines(diary, [filing(3, ['Another.'])]);
    expect(later).toHaveLength(1);
    expect(later[0]!.more).toBe(4);
  });

  it('files a day in its place, and adds to a day that is there, without changing the old list', () => {
    const base = fileLines([], [filing(5, ['Five.']), filing(9, ['Nine.'])]);
    const next = fileLines(base, [filing(7, ['Seven.']), filing(9, ['Nine again.'])]);
    expect(next.map((d) => d.day)).toEqual([5, 7, 9]);
    expect(next[2]!.lines).toEqual(['Nine.', 'Nine again.']);
    expect(base.map((d) => d.day)).toEqual([5, 9]);
    expect(base[1]!.lines).toEqual(['Nine.']);
    // A filing with no lines makes no day.
    expect(fileLines(base, [filing(6, [])])).toHaveLength(2);
  });

  it('pages 30 days at a time, newest first, and says where the older ones start', () => {
    const diary: StoredDiaryDay[] = fileLines(
      [],
      Array.from({ length: 70 }, (_, i) => filing(i, [`Day ${i}.`])),
    );
    const first = diaryPage(diary);
    expect(first.diary).toHaveLength(DIARY_PAGE);
    expect(first.diary[0]!.day).toBe(69);
    expect(first.earlier).toBe(40);
    const second = diaryPage(diary, first.earlier!);
    expect(second.diary[0]!.day).toBe(39);
    expect(second.diary).toHaveLength(DIARY_PAGE);
    expect(second.earlier).toBe(10);
    const third = diaryPage(diary, second.earlier!);
    expect(third.diary.map((d) => d.day)).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
    expect(third.earlier).toBeNull();
    // Exactly one page of days has nothing earlier.
    expect(diaryPage(diary.slice(0, DIARY_PAGE)).earlier).toBeNull();
    expect(diaryPage([]).diary).toEqual([]);
  });
});

describe('what a day or skip adds to the diary', () => {
  it('a skip of 30 days files the messages under the days they happened, and the money under the last', async () => {
    const game = server();
    const first = await game.create(A, SETUP);
    const skipped = await game.skip(A, 'month');
    const days = skipped.summary.daysRun;
    expect(days).toBeGreaterThan(1);
    const rec = await game.record(A);
    const kept = rec.diary.map((d) => d.day);
    // Newest first, and every day is one that ran.
    expect([...kept].sort((a, b) => b - a)).toEqual(kept);
    expect(Math.max(...kept)).toBeLessThanOrEqual(first.day + days);
    expect(Math.min(...kept)).toBeGreaterThanOrEqual(first.day);
    // The money lines are under the last day that ran.
    const last = rec.diary.find((d) => d.day === first.day + days - 1);
    expect(last?.lines.some((l) => /^Cash went from/.test(l) || /^Running costs/.test(l))).toBe(
      true,
    );
    expect(last?.lines.some((l) => l.includes(`over ${days} days`))).toBe(true);
    // A date for every day, and no empty days.
    for (const d of rec.diary) {
      expect(d.lines.length).toBeGreaterThan(0);
      expect(d.lines.length).toBeLessThanOrEqual(DIARY_LINES + 1);
      expect(d.date.month).toBeGreaterThanOrEqual(0);
    }
  });

  it('a job the player did is filed with its result line, once', async () => {
    const game = server();
    const snap = await game.create(A, SETUP);
    const done = await game.act(A, { action: { type: 'sellClass', cls: 'cow', qty: 1 } });
    // Whether or not the sale was allowed today, a done job files its message once.
    const rec = await game.record(A);
    const today = rec.diary.find((d) => d.day === snap.day);
    if (done.ok && done.message) {
      expect(today?.lines.filter((l) => l === done.message)).toHaveLength(1);
    } else {
      expect(today).toBeUndefined();
    }
    // The next day does not file the job's inbox message again.
    await game.endDay(A);
    const after = await game.record(A);
    const same = after.diary.find((d) => d.day === snap.day);
    if (done.ok && done.message) {
      expect(same?.lines.filter((l) => l === done.message)).toHaveLength(1);
    }
  });

  it('says nothing for a skip that ran no days', () => {
    expect(
      summaryLines({
        daysRun: 0,
        cash: { before: 1, after: 2 },
        money: { sales: 5, buys: 0, feed: 0, running: 0, interest: 0 },
      } as never),
    ).toEqual([]);
  });

  it('words interest paid and interest earned, and cash that is below zero', () => {
    const base = {
      daysRun: 1,
      cash: { before: 1200, after: -300 },
      money: { sales: 0, buys: 0, feed: 0, running: 0, interest: -40 },
    };
    expect(summaryLines(base as never)).toEqual([
      'Cash went from $1,200 to -$300.',
      'Interest paid: $40.',
    ]);
    expect(summaryLines({ ...base, money: { ...base.money, interest: 25 } } as never)).toContain(
      'Interest earned: $25.',
    );
  });
});

describe('a farm file from before the diary', () => {
  it('loads with an empty diary, is not treated as broken, and starts filling', async () => {
    const store = new MemoryFarmStore();
    const game = server(store);
    await game.create(A, SETUP);
    const id = farmIdFor(A);
    const raw = (await store.get(id)) as Record<string, unknown>;
    expect(raw.format).toBe(STORED_FORMAT);
    delete raw.diary;
    raw.format = 2;
    store.putRaw(id, JSON.stringify(raw));
    // A fresh server has nothing cached, so it reads the old file.
    const fresh = server(store);
    const rec = await fresh.record(A);
    expect(rec.diary).toEqual([]);
    expect(rec.earlier).toBeNull();
    expect(store.setAsideCount()).toBe(0);
    await fresh.endDay(A);
    expect((await fresh.record(A)).diary.length).toBeGreaterThan(0);
    const kept = (await store.get(id)) as StoredFarm;
    expect(kept.format).toBe(STORED_FORMAT);
  });

  it('does not open a farm from a newer game', async () => {
    const store = new MemoryFarmStore();
    const game = server(store);
    await game.create(A, SETUP);
    const id = farmIdFor(A);
    const raw = (await store.get(id)) as Record<string, unknown>;
    raw.format = STORED_FORMAT + 1;
    store.putRaw(id, JSON.stringify(raw));
    await expect(server(store).record(A)).rejects.toBeInstanceOf(GameError);
  });
});

describe('the year end and the end of the game', () => {
  it('a year skip closes the year: its card, its parts and its facts', async () => {
    const game = server();
    await game.create(A, SETUP);
    const r = await game.skip(A, 'year');
    expect(r.yearsClosed).toBe(1);
    const y = r.yearEnd!;
    expect(y.n).toBe(1);
    expect(y.title).toBe('Year 1');
    expect(y.parts.map((p) => p.key)).toEqual(['profit', 'gain', 'util', 'cover', 'death']);
    expect(y.parts.map((p) => p.label)).toEqual([
      'Profit',
      'Weight gain',
      'Pasture use',
      'Ground cover',
      'Deaths',
    ]);
    for (const p of y.parts) expect(Number.isInteger(p.pts)).toBe(true);
    expect(y.facts[0]).toMatch(/^Net worth went from \$[\d,]+ to \$[\d,]+\.$/);
    expect(y.facts.some((f) => /^Cattle gained [\d,]+ kg of live weight/.test(f))).toBe(true);
    expect(y.facts.some((f) => /^[\d,]+ births?\. [\d,]+ deaths?\.$/.test(f))).toBe(true);
    expect(y.facts.some((f) => /^Ground cover averaged \d+%\.$/.test(f))).toBe(true);
    for (const m of y.money) {
      expect(m.dollars).not.toBe(0);
      expect(Number.isInteger(m.dollars)).toBe(true);
    }
    // The record carries the year, newest first, and the year under way starts again.
    const rec = await game.record(A);
    expect(rec.years.map((x) => x.n)).toEqual([1]);
    expect(rec.years[0]!.total).toBe(y.total);
    expect(rec.soFar.n).toBe(2);
    expect(r.snapshot.score.year).toBe(2);
    // A day with no year end says so.
    const d = await game.endDay(A);
    expect(d.yearEnd).toBeNull();
    expect(d.yearsClosed).toBe(0);
  });

  it('a real-years farm names the real year', async () => {
    const game = server();
    await game.create(A, { ...SETUP, years: 'real-in-order' });
    const r = await game.skip(A, 'year');
    expect(r.yearEnd!.title).toMatch(/^Year 1 · \d{4}$/);
  });

  it('refuses a day and a skip once the game is over, and describes the end', async () => {
    const store = new MemoryFarmStore();
    const game = server(store);
    await game.create(A, SETUP);
    const id = farmIdFor(A);
    const raw = (await store.get(id)) as unknown as StoredFarm;
    const farm = createFarm({
      seed: 3,
      district: 'cw',
      size: 'small',
      start: { year: 2026, month: 8 },
      startType: 'running',
      difficulty: 'medium',
    });
    farm.over = { reason: 'bank', day: 42 };
    store.putRaw(id, JSON.stringify({ ...raw, saved: saveFarm(farm) }));
    const over = server(store);
    const snap = (await over.snapshot(A))!;
    expect(snap.over).toMatchObject({ days: 42, text: expect.stringMatching(/bank/) });
    expect(typeof snap.over!.worth).toBe('number');
    expect(snap.over!.total).toBe(snap.over!.years.reduce((a, y) => a + y.total, 0));
    await expect(over.endDay(A)).rejects.toMatchObject({ status: 409 });
    await expect(over.skip(A, 'week')).rejects.toMatchObject({ status: 409 });
  });
});

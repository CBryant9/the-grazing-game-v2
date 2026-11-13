import { describe, expect, it } from 'vitest';
import { loadMvp, seededRandom } from '../../test-support/mvp';
import { dateAt } from '../calendar';
import {
  PLAY_WOBBLE,
  RUN_UP_DAYS,
  RUN_UP_SEASON_FLOOR,
  RUN_UP_WOBBLE,
  SEASON_OUTLOOKS,
  drawSeason,
  monthFactor,
  randomSeasons,
} from './randomSeasons';

/*
 * The MVP drew its seasons from an unseeded source, so a whole farm's
 * seasons can't be matched number for number. What can be matched exactly
 * is the draw itself, given the same random number. The rest is tested by
 * its spread and its limits.
 */

const { mvp, script, setRandom } = loadMvp();

describe('drawing a season', () => {
  it('picks the same season as the MVP for the same random number', () => {
    const random = seededRandom(42);
    const edges = [0, 0.05, 0.1, 0.1000001, 0.24, 0.2400001, 0.44, 0.68, 0.86, 0.99, 0.9999999999];
    const draws = [...edges, ...Array.from({ length: 2000 }, () => random())];
    for (const u of draws) {
      setRandom(() => u);
      const [factor, label, chance] = mvp.drawSeason();
      expect(drawSeason({ next: () => u }), `random number ${u}`).toEqual({
        factor,
        label,
        chance,
      });
    }
  });

  it('has chances that add to 1', () => {
    expect(SEASON_OUTLOOKS.reduce((sum, o) => sum + o.chance, 0)).toBeCloseTo(1, 12);
  });

  it('draws each season about as often as its chance', () => {
    const farms = 20000;
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= farms; seed++) {
      const { seasonF } = randomSeasons({ seed, start: { year: 2022, month: 8 } }).factorsOn(0);
      counts.set(seasonF, (counts.get(seasonF) ?? 0) + 1);
    }
    for (const o of SEASON_OUTLOOKS) {
      // Within 1.2 points of the chance: about four standard errors at 20,000 farms.
      expect(Math.abs((counts.get(o.factor) ?? 0) / farms - o.chance), o.label).toBeLessThan(0.012);
    }
  });
});

describe('the month wobble', () => {
  it('uses the figures in the MVP code', () => {
    // In play, each 1st of the month.
    expect(script).toContain('S.monthF=clamp(S.rainF*rand(.65,1.35),.15,1.9)');
    expect(PLAY_WOBBLE).toEqual({ lo: 0.65, hi: 1.35, min: 0.15, max: 1.9 });
    // In the run-up before the farm starts.
    expect(script).toContain('S.monthF=clamp(S.rainF*rand(.7,1.3),.2,1.8)');
    expect(RUN_UP_WOBBLE).toEqual({ lo: 0.7, hi: 1.3, min: 0.2, max: 1.8 });
    expect(script).toContain('S.rainF=Math.max(.85,s[0])');
    expect(RUN_UP_SEASON_FLOOR).toBe(0.85);
    expect(script).toContain('for(S.day=-540;S.day<0;S.day++)');
    expect(RUN_UP_DAYS).toBe(540);
  });

  it('spans the range and holds the limits', () => {
    const at = (u: number) => ({ range: (lo: number, hi: number) => lo + (hi - lo) * u });
    expect(monthFactor(1, at(0), PLAY_WOBBLE)).toBe(0.65);
    expect(monthFactor(1, at(0.5), PLAY_WOBBLE)).toBeCloseTo(1, 12);
    expect(monthFactor(1, at(1), PLAY_WOBBLE)).toBeCloseTo(1.35, 12);
    expect(monthFactor(0.1, at(0), PLAY_WOBBLE)).toBe(0.15);
    expect(monthFactor(2, at(1), PLAY_WOBBLE)).toBe(1.9);
    expect(monthFactor(1, at(0), RUN_UP_WOBBLE)).toBe(0.7);
    expect(monthFactor(0.1, at(0), RUN_UP_WOBBLE)).toBe(0.2);
    expect(monthFactor(2, at(1), RUN_UP_WOBBLE)).toBe(1.8);
  });

  it('stays within 0.65 to 1.35 of the season in play, averaging 1', () => {
    let sum = 0;
    let n = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const seasons = randomSeasons({ seed, start: { year: 2022, month: 0 } });
      for (let day = 0; day < 365 * 3; day += 30) {
        const { seasonF, monthF } = seasons.factorsOn(day);
        const ratio = monthF / seasonF;
        expect(ratio).toBeGreaterThanOrEqual(0.65 - 1e-12);
        expect(ratio).toBeLessThanOrEqual(1.35 + 1e-12);
        expect(monthF).toBeGreaterThanOrEqual(0.15);
        expect(monthF).toBeLessThanOrEqual(1.9);
        sum += ratio;
        n++;
      }
    }
    expect(Math.abs(sum / n - 1)).toBeLessThan(0.01);
  });
});

describe('seasons through the calendar', () => {
  const start = { year: 2022, month: 3 };

  it('holds the month factor through a month and changes it on the 1st', () => {
    const seasons = randomSeasons({ seed: 9, start });
    let changes = 0;
    for (let day = 1; day < 730; day++) {
      const today = seasons.factorsOn(day);
      const yesterday = seasons.factorsOn(day - 1);
      if (dateAt(start, day).date === 1) {
        if (today.monthF !== yesterday.monthF) changes++;
      } else {
        expect(today.monthF, `day ${day}`).toBe(yesterday.monthF);
      }
    }
    // 23 month starts in the two years after day 0. Two equal draws in a row are next to impossible.
    expect(changes).toBe(23);
  });

  it('holds the season until 1 July, then draws a new one each year', () => {
    // Over many farms: the season never changes on any other day, and it
    // does change on 1 July about as often as two separate draws differ.
    let julys = 0;
    let changedInJuly = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const seasons = randomSeasons({ seed, start });
      for (let day = 1; day < 500; day++) {
        const d = dateAt(start, day);
        const changed = seasons.factorsOn(day).seasonF !== seasons.factorsOn(day - 1).seasonF;
        if (d.month === 6 && d.date === 1) {
          julys++;
          if (changed) changedInJuly++;
        } else expect(changed, `seed ${seed} day ${day}`).toBe(false);
      }
    }
    // 1 July 2022 and 1 July 2023 for each farm.
    expect(julys).toBe(800);
    // Two separate draws differ with a chance of 1 - sum(chance squared), about 0.82.
    const differ = 1 - SEASON_OUTLOOKS.reduce((s, o) => s + o.chance * o.chance, 0);
    expect(Math.abs(changedInJuly / julys - differ)).toBeLessThan(0.06);
  });

  it('a farm that starts on 1 July keeps its starting season for the first year', () => {
    const july = { year: 2022, month: 6 };
    for (let seed = 1; seed <= 50; seed++) {
      const seasons = randomSeasons({ seed, start: july });
      const first = seasons.factorsOn(0);
      expect(seasons.factorsOn(364).seasonF).toBe(first.seasonF);
      expect(seasons.factorsOn(364).label).toBe(first.label);
    }
  });

  it('gives the season its label', () => {
    const seasons = randomSeasons({ seed: 3, start });
    const f = seasons.factorsOn(0);
    expect(SEASON_OUTLOOKS.find((o) => o.factor === f.seasonF)?.label).toBe(f.label);
  });
});

describe('the pasture run-up before the farm starts', () => {
  const start = { year: 2022, month: 8 };

  it('never has a season worse than 0.85', () => {
    let floored = 0;
    const farms = 5000;
    for (let seed = 1; seed <= farms; seed++) {
      const seasons = randomSeasons({ seed, start });
      const { seasonF } = seasons.factorsOn(-200);
      expect(seasonF).toBeGreaterThanOrEqual(0.85);
      expect(seasons.factorsOn(-RUN_UP_DAYS).seasonF).toBe(seasonF);
      expect(seasons.factorsOn(-1).seasonF).toBe(seasonF);
      if (seasonF === 0.85) floored++;
    }
    // Drought, well below and below average (44% together) all become 0.85.
    expect(Math.abs(floored / farms - 0.44)).toBeLessThan(0.03);
  });

  it('wobbles each month by 0.7 to 1.3 once the first month start is reached', () => {
    // Day -540 from 1 September 2022 is 10 March 2021, so the first days have no wobble yet.
    expect(dateAt(start, -RUN_UP_DAYS)).toEqual({ year: 2021, month: 2, date: 10 });
    for (let seed = 1; seed <= 200; seed++) {
      const seasons = randomSeasons({ seed, start });
      const first = seasons.factorsOn(-RUN_UP_DAYS);
      expect(first.monthF).toBe(first.seasonF);
      expect(seasons.factorsOn(-RUN_UP_DAYS + 21).monthF).toBe(first.seasonF);
      for (let day = -RUN_UP_DAYS + 22; day < 0; day += 15) {
        const { seasonF, monthF } = seasons.factorsOn(day);
        expect(monthF / seasonF).toBeGreaterThanOrEqual(0.7 - 1e-12);
        expect(monthF / seasonF).toBeLessThanOrEqual(1.3 + 1e-12);
      }
    }
  });

  it('is drawn separately from the starting season', () => {
    let same = 0;
    const farms = 2000;
    for (let seed = 1; seed <= farms; seed++) {
      const seasons = randomSeasons({ seed, start });
      if (seasons.factorsOn(-1).label === seasons.factorsOn(0).label) same++;
    }
    // Two separate draws match with a chance of sum(chance squared), about 0.18.
    expect(same / farms).toBeGreaterThan(0.12);
    expect(same / farms).toBeLessThan(0.24);
  });
});

describe('repeatable from the seed', () => {
  const start = { year: 2023, month: 1 };

  it('gives the same answers for the same seed, in any order', () => {
    const forwards = randomSeasons({ seed: 77, start });
    const backwards = randomSeasons({ seed: 77, start });
    const days = Array.from({ length: 900 }, (_, k) => k - 540);
    const a = days.map((d) => forwards.factorsOn(d));
    const b = [...days]
      .reverse()
      .map((d) => backwards.factorsOn(d))
      .reverse();
    expect(a).toEqual(b);
  });

  it('gives different seasons to different farms', () => {
    const a = randomSeasons({ seed: 1, start });
    const b = randomSeasons({ seed: 2, start });
    const days = Array.from({ length: 24 }, (_, k) => k * 31);
    expect(days.map((d) => a.factorsOn(d).monthF)).not.toEqual(
      days.map((d) => b.factorsOn(d).monthF),
    );
  });
});

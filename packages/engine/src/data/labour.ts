/**
 * Farm hands and contractor fencing: every figure in one place (PRD 5.11,
 * section 21 rows 13, 15 and 34; docs/DATA.md, "Farm hands and contractor
 * fencing").
 *
 * Each figure says where it came from. `Sourced` figures are from a
 * published source, recorded with its date in docs/DATA.md. `Decided` and
 * `Proposed` are Claudia's (REQUIREMENTS, PRD). `Stand-in` figures could
 * not be found in a published source: they are the builder's, marked for
 * Claudia, and each is one constant here so it is easy to change.
 */

/** Where a figure came from. */
export type LabourFigureSource = 'Sourced' | 'Decided' | 'Proposed' | 'Builder' | 'Stand-in';

interface Figure<T> {
  value: T;
  source: LabourFigureSource;
  note: string;
}

const fig = <T>(value: T, source: LabourFigureSource, note: string): Figure<T> => ({
  value,
  source,
  note,
});

/** Award levels a hand can be on: Farm and livestock hand level 1 to level 8. */
export type AwardLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const LABOUR = {
  /**
   * Minimum weekly rates for a full-time adult farm and livestock hand,
   * levels 1 to 8, dollars a week. Fair Work Ombudsman, "Pay Guide -
   * Pastoral Award [MA000035]", from the first full pay period on or after
   * 1 July 2026 (published 18 Aug 2026).
   */
  awardWeekly: fig(
    [978.1, 1004.9, 1006.8, 1029.1, 1046.9, 1062.9, 1119.1, 1202.5] as const,
    'Sourced',
    'Pastoral Award pay guide, 1 July 2026, levels 1 to 8',
  ),
  /** Ordinary hours a week, full time. Pastoral Award (the weekly rate is 38 times the hourly rate). */
  weekHours: fig(38, 'Sourced', 'Pastoral Award, 38 ordinary hours a week'),
  /** Days in the working week a full-time hand works. 38 hours over 5 days is 7.6 hours a day. */
  daysPerWeek: fig(5, 'Builder', '38 hours over a 5-day week'),
  /** Casual loading on the hourly rate. Pastoral Award pay guide (casual rate is 125% of the hourly rate). */
  casualLoading: fig(0.25, 'Sourced', 'Pastoral Award pay guide, casual rate 125%'),
  /** Superannuation guarantee, paid on top of wages. ATO, 12% from 1 July 2025. */
  superRate: fig(0.12, 'Sourced', 'ATO super guarantee, 12% from 1 July 2025'),
  /**
   * Days between pay days. The award allows weekly or fortnightly pay. The
   * builder chose fortnightly: one pay day every 14 farm days, the first
   * 14 days after the first hand is hired.
   */
  payCycleDays: fig(14, 'Builder', 'Fortnightly; the award allows weekly or fortnightly'),
  /** Length of a short contract, days. PRD 5.11: "a short contract such as 3 months at a day rate". */
  contractDays: fig(91, 'Proposed', 'PRD 5.11, a 3-month contract'),
  /** The most hands on the farm at once. */
  maxHands: fig(6, 'Stand-in', 'A cap so the list stays short'),

  /**
   * An average hand's day, as a share of what the player gets done in a
   * day on their own. REQUIREMENTS: with a hand on, one-man fencing goes
   * "about 800 m a day instead of 500 m", so an average hand adds 300 m:
   * 300 / 500 = 0.6. The PRD's "about 500 m for an average hand" would make
   * it 1,000 m, against Claudia's 800 m; the 800 m is kept.
   */
  handDayShare: fig(0.6, 'Decided', 'REQUIREMENTS: about 800 m a day instead of 500 m'),
  /**
   * A hand's day by skill (1 to 5), as a multiple of an average hand's (3).
   * A skill-1 hand adds 200 m of permanent fence a day, a skill-5 hand 400 m.
   */
  skillFactor: fig(
    [2 / 3, 5 / 6, 1, 7 / 6, 4 / 3] as const,
    'Stand-in',
    'PRD: more or less by skill',
  ),
  /**
   * Stock work with a team of dogs, as a multiple of the same hand without.
   * PRD section 21 row 17: stock walk up to about 2.5 km/h with a hand who
   * has dogs, against 1.5 km/h without.
   */
  dogsFactor: fig(2.5 / 1.5, 'Proposed', 'PRD 21 row 17: 2.5 km/h with dogs against 1.5'),

  /** Contractor fencing, metres a day: a 1-man team and a 2-man team. PRD 5.4 and 5.11. */
  teamMetresPerDay: fig({ 1: 500, 2: 1000 } as const, 'Decided', 'PRD 5.4: 500 m and 1,000 m'),
  /**
   * The contractor's labour charge, dollars a metre, the same for either
   * team (section 21 row 15). No published labour-only rate was found.
   * Installed rural fence is listed at about $8 to $25 a metre by price
   * guides (materials and labour together); the game's permanent fence
   * materials are $7 a metre, so $5 of labour gives $12 a metre in all.
   */
  labourPerMetre: fig(5, 'Stand-in', 'No published labour-only rate found'),
  /** The weekdays contractors work, 0 for Sunday. Monday to Friday. */
  contractorDays: fig([1, 2, 3, 4, 5] as const, 'Builder', 'Monday to Friday'),

  /**
   * Serious workers compensation claims in agriculture, forestry and
   * fishing, per hour worked: 9.6 per million hours (Safe Work Australia,
   * Key WHS Statistics Australia 2026, for 2024-25).
   */
  injuryPerHour: fig(9.6e-6, 'Sourced', 'Safe Work Australia, 9.6 per million hours, 2024-25'),
  /**
   * How much likelier an injury is on a day of fencing than on another day.
   * The PRD says injury is "more likely after long days or risky jobs". No
   * published figure for fencing alone was found.
   */
  fencingRisk: fig(1.5, 'Stand-in', 'PRD: more likely on risky jobs'),
  /**
   * Days off after an injury: the median time lost for a serious claim in
   * agriculture, 6.4 weeks (Safe Work Australia, Key WHS Statistics
   * Australia 2025, for 2023-24), rounded to whole days.
   */
  injuryDaysOff: fig(45, 'Sourced', 'Safe Work Australia, median 6.4 weeks lost, 2023-24'),
  /**
   * What an injury costs the farm, in weeks of the hand's wages. While the
   * hand is off, workers compensation pays them and the farm pays no wages.
   * The employer's share differs by state; one week stands in for it.
   */
  injuryCostWeeks: fig(1, 'Stand-in', "The employer's share of a claim; differs by state"),

  /** The farm's standing with workers, 0 to 100, on a farm that has never hired. */
  standingStart: fig(80, 'Stand-in', 'Start'),
  /** Standing lost for each hand whose wages were not paid. */
  standingMissedPay: fig(20, 'Stand-in', 'Missed wages lower the farm’s standing'),
  /** Standing gained on a pay day when every hand is paid. */
  standingPaidOnTime: fig(5, 'Stand-in', 'Paying on time brings it back'),
  /**
   * Above-award loading people ask at standing 0, falling to none at 100.
   * PRD: with a poor standing "the choice of workers gets worse and dearer".
   */
  dearerAtZero: fig(0.2, 'Stand-in', 'PRD: worse and dearer'),
  /** New people looking for work each week in the district: the fewest and the most. */
  newPerWeek: fig({ lo: 1, hi: 3 } as const, 'Stand-in', 'A short list'),
  /** Days a person stays on the list before they take other work: the fewest and the most. */
  listedDays: fig({ lo: 14, hi: 42 } as const, 'Stand-in', 'People leave the list'),
  /** At standing 0, the share of the list still offered (the most skilled are gone first). At 100, all of it. */
  listShareAtZero: fig(0.4, 'Stand-in', 'PRD: the choice gets worse'),
} as const;

/** The hourly rate at a level, dollars. */
export const awardHourly = (level: AwardLevel): number =>
  LABOUR.awardWeekly.value[level - 1]! / LABOUR.weekHours.value;

/** Hours in a hand's working day. */
export const dayHours = (): number => LABOUR.weekHours.value / LABOUR.daysPerWeek.value;

/** The casual day rate at a level, dollars: the hourly rate with the casual loading, for a day's hours. */
export const casualDayRate = (level: AwardLevel): number =>
  awardHourly(level) * (1 + LABOUR.casualLoading.value) * dayHours();

/** A short list of given names and family names for the people looking for work. Made up. */
export const FIRST_NAMES = [
  'Jack',
  'Tom',
  'Sam',
  'Ben',
  'Josh',
  'Matt',
  'Luke',
  'Ryan',
  'Kate',
  'Emma',
  'Sophie',
  'Grace',
  'Ella',
  'Lucy',
  'Mia',
  'Zoe',
  'Harry',
  'Will',
  'Charlie',
  'Bec',
] as const;

export const FAMILY_NAMES = [
  'Walsh',
  'Murray',
  'Kelly',
  'Hughes',
  'Doyle',
  'Fraser',
  'Barrett',
  'Nolan',
  'Hayes',
  'Burke',
  'Gordon',
  'Price',
  'Sutton',
  'Lane',
  'Bishop',
  'Reid',
] as const;

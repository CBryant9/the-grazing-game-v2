/**
 * Where the pasture model gets its seasons from.
 *
 * The grass formulas need two numbers for each day: the season factor and
 * the month factor. This interface is the only thing they know about where
 * those come from. Milestone 1.4 adds a source built on real weather. Until
 * then the MVP's random seasons sit behind it (randomSeasons.ts).
 */

export interface GrowthFactors {
  /**
   * The season factor. 1 is an average season, 0.5 a drought, 1.35 a wet one.
   * Below 0.8 green feed hays off faster.
   */
  seasonF: number;
  /** The month factor: today's growth as a multiple of the district curve. */
  monthF: number;
  /** The season in words, for the outlook (for example "Below average"). */
  label: string;
}

export interface GrowthFactorSource {
  /**
   * The factors for a farm day. Day 0 is the farm's first day; the pasture
   * run-up before it uses negative days. The same day always gives the same
   * answer, in whatever order days are asked for.
   */
  factorsOn(day: number): GrowthFactors;
}

/**
 * The average year: every day grows at the district curve. Calibration
 * runs are judged against it.
 */
export const averageYear: GrowthFactorSource = {
  factorsOn: () => ({ seasonF: 1, monthF: 1, label: 'Average' }),
};

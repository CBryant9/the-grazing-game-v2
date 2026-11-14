import 'server-only';

/**
 * The score provider (Stage 4, milestone 4.1; PRD 5.8, 9.8).
 *
 * Every board figure is read through here, on the server, from the plain figures of a farm's
 * finished years (`BoardYear`, made by the game server from the year records it already shows on
 * the year end card). Nothing here reaches the browser except the finished numbers on a board.
 *
 * THE HEADLINE IS A STAND-IN. PRD 5.8's Grazier Score has no agreed weights: they are to be set
 * by running calibration farms (good, average and poor management in each district) and then
 * ruled on by Claudia. Until then the headline board ranks on the game's existing year score (the
 * figure on the year end card and the Scores panel), averaged over the farm's finished years.
 * Swap `headline` below when the Grazier Score is agreed; nothing else changes.
 */

export interface BoardYear {
  /** 1 for the farm's first year. */
  n: number;
  /** On a real-year farm, the real year this game year started in. */
  realYear: number | null;
  /** The game's year score, as shown on the year end card. */
  total: number;
  /** Change in net worth over the year, dollars. */
  profit: number;
  /** Live weight gained over the year, kg, summed over every animal. */
  gain: number;
  /** Average ground cover over the year, %. */
  cover: number;
}

export interface BoardFarm {
  /** Days the farm has run (days survived). */
  day: number;
  /** The farm's area, ha. */
  ha: number;
  /** Every finished year, oldest first. */
  years: BoardYear[];
}

/** The boards, as the database names them. */
export const BOARDS = [
  'grazier',
  'profit_per_ha',
  'beef_per_ha',
  'ground_cover',
  'days_survived',
] as const;
export type Board = (typeof BOARDS)[number];
export type AnyBoard = Board | 'real_year';

export const BOARD_LABELS: Record<AnyBoard, { name: string; unit: string }> = {
  grazier: { name: 'Score', unit: 'points' },
  profit_per_ha: { name: 'Profit per ha', unit: '$/ha a year' },
  beef_per_ha: { name: 'Weight gain per ha', unit: 'kg/ha a year' },
  ground_cover: { name: 'Ground cover', unit: '% average' },
  days_survived: { name: 'Days survived', unit: 'days' },
  real_year: { name: 'Real year', unit: '$/ha change over the year' },
};

/** True while the headline is the game's year score and not an agreed Grazier Score. */
export const HEADLINE_IS_STAND_IN = true;

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const two = (n: number): number => Math.round(n * 100) / 100;

/** The headline: the stand-in (the mean year score over the finished years). */
export function headline(f: BoardFarm): number {
  return two(mean(f.years.map((y) => y.total)));
}

/** Each board's figure for a farm, or null when the farm has no finished year yet. */
export function figures(f: BoardFarm): Record<Board, number> | null {
  if (f.years.length === 0 || !(f.ha > 0)) return null;
  return {
    grazier: headline(f),
    profit_per_ha: two(mean(f.years.map((y) => y.profit)) / f.ha),
    beef_per_ha: two(mean(f.years.map((y) => y.gain)) / f.ha),
    ground_cover: two(Math.min(100, Math.max(0, mean(f.years.map((y) => y.cover))))),
    days_survived: f.day,
  };
}

/**
 * A real-year board ranks on the change over that year (BUILD_PLAN 4.1): the change in net worth
 * across the game year that started in that real year, per hectare, so farms of every size compare.
 */
export function realYearChange(y: BoardYear, ha: number): number {
  return ha > 0 ? two(y.profit / ha) : 0;
}
